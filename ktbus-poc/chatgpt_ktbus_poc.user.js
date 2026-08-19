// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      0.7.0
// @description  Guarded ChatGPT browser relay with retryable results, local schedules, and cross-chat dispatch.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @downloadURL  https://amuletmaiden.github.io/ktbus-poc/chatgpt_ktbus_poc.user.js
// @updateURL    https://amuletmaiden.github.io/ktbus-poc/chatgpt_ktbus_poc.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.7.0';
  const REQUEST_RE = /KTBUS_POC_REQUEST\s+({[^\n]+})/g;
  const STATUS_URLS = [
    'http://127.0.0.1:8765/healthz',
    'http://127.0.0.1:8765/api/status',
  ];
  const KEYS = {
    seen: 'ktbus-relay-seen-v4',
    jobs: 'ktbus-relay-jobs-v3',
    chats: 'ktbus-relay-chats-v3',
    cap: 'ktbus-relay-cap-v1',
    results: 'ktbus-relay-results-v1',
  };
  const TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const TICK_MS = 3000;
  const CLAIM_MS = 45000;
  const WAKE_RETRY_MS = 90000;
  const HELPER_LIFETIME_MS = 90000;
  const MAX_MESSAGE_CHARS = 6000;
  const MAX_JOBS = 200;
  const MAX_CHATS = 200;
  const MAX_SEEN = 1000;
  const MAX_RESULTS = 100;
  const MAX_SCAN_MESSAGES = 20;
  const MIN_INTERVAL_MINUTES = 5;
  const MAX_INTERVAL_MINUTES = 1440;
  const MAX_COUNT = 48;

  let sending = false;
  let handling = false;
  const openedTabs = new Map();

  function getValue(key, fallback) {
    try { return GM_getValue(key, fallback); } catch { return fallback; }
  }
  function setValue(key, value) {
    try { GM_setValue(key, value); } catch {}
  }
  function validId(v) {
    return typeof v === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(v);
  }
  function newCap() {
    if (globalThis.crypto?.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    }
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
  }
  function capability() {
    let cap = String(getValue(KEYS.cap, '') || '');
    if (!/^[a-f0-9]{48,128}$/i.test(cap)) {
      cap = newCap();
      setValue(KEYS.cap, cap);
    }
    return cap;
  }

  function normalizeChatUrl(value) {
    try {
      const u = new URL(value, location.origin);
      if (!['chatgpt.com', 'chat.openai.com'].includes(u.hostname)) return null;
      const m = u.pathname.match(/^\/c\/([A-Za-z0-9-]{8,})\/?$/);
      return m ? `${u.origin}/c/${m[1]}` : null;
    } catch { return null; }
  }
  function currentChatUrl() { return normalizeChatUrl(location.href); }
  function chatIdFromUrl(url) {
    const n = normalizeChatUrl(url);
    return n ? n.split('/').pop() : null;
  }
  function chatTitle() {
    return String(document.title || '').replace(/\s*[|\-–—]\s*ChatGPT\s*$/i, '').trim() || 'ChatGPT conversation';
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function generationInProgress() {
    const candidates = [
      ...document.querySelectorAll('button[data-testid="stop-button"]'),
      ...[...document.querySelectorAll('button')].filter(b => /stop generating|stop response/i.test(b.getAttribute('aria-label') || '')),
    ];
    return candidates.some(b => isVisible(b) && !b.disabled && b.getAttribute('aria-hidden') !== 'true');
  }

  function loadSeen() {
    const raw = getValue(KEYS.seen, []);
    return new Set(Array.isArray(raw) ? raw.filter(validId).slice(-MAX_SEEN) : []);
  }
  const seen = loadSeen();
  function saveSeen() { setValue(KEYS.seen, [...seen].slice(-MAX_SEEN)); }

  function loadChats() {
    const raw = getValue(KEYS.chats, []);
    return Array.isArray(raw) ? raw.filter(x => x && normalizeChatUrl(x.url)) : [];
  }
  function saveChats(chats) {
    const byId = new Map();
    for (const item of chats) {
      const url = normalizeChatUrl(item?.url);
      if (!url) continue;
      const id = chatIdFromUrl(url);
      const candidate = {
        id,
        url,
        title: String(item.title || id).trim().slice(0, 180) || id,
        last_seen: Number(item.last_seen) || Date.now(),
      };
      const old = byId.get(id);
      if (!old || candidate.last_seen >= old.last_seen) byId.set(id, candidate);
    }
    setValue(KEYS.chats, [...byId.values()].sort((a, b) => b.last_seen - a.last_seen).slice(0, MAX_CHATS));
  }
  function discoverChats() {
    const now = Date.now();
    const chats = loadChats();
    const here = currentChatUrl();
    if (here) chats.push({url: here, title: chatTitle(), last_seen: now});
    for (const a of document.querySelectorAll('a[href*="/c/"]')) {
      const url = normalizeChatUrl(a.href || a.getAttribute('href'));
      if (!url) continue;
      const title = String(a.innerText || a.textContent || a.getAttribute('aria-label') || '').trim();
      chats.push({url, title: title || chatIdFromUrl(url), last_seen: now - 1});
    }
    saveChats(chats);
  }

  function normalizeJobs(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(j => j && validId(j.id) && normalizeChatUrl(j.target_url) && Number(j.remaining) > 0).slice(-MAX_JOBS);
  }
  function loadJobs() { return normalizeJobs(getValue(KEYS.jobs, [])); }
  function saveJobs(jobs) { setValue(KEYS.jobs, normalizeJobs(jobs)); }

  function loadResults() {
    const raw = getValue(KEYS.results, []);
    return Array.isArray(raw) ? raw.filter(x => x && validId(x.id) && x.payload).slice(-MAX_RESULTS) : [];
  }
  function saveResults(rows) { setValue(KEYS.results, rows.slice(-MAX_RESULTS)); }
  function queueResult(id, payload) {
    const rows = loadResults().filter(x => x.id !== id);
    rows.push({id, payload, created_at: Date.now()});
    saveResults(rows);
  }
  function dropResult(id) { saveResults(loadResults().filter(x => x.id !== id)); }

  function assistantMessages() {
    const direct = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    const all = direct.length ? direct : [...document.querySelectorAll('article')].filter(node =>
      /chatgpt said/i.test(node.innerText || '') || node.querySelector('[data-message-author-role="assistant"]')
    );
    return all.slice(-MAX_SCAN_MESSAGES);
  }
  function composer() {
    return document.querySelector('#prompt-textarea') ||
      document.querySelector('[contenteditable="true"][data-virtualkeyboard="true"]') ||
      document.querySelector('textarea');
  }
  function composerText(node) {
    if (!node) return '';
    return node instanceof HTMLTextAreaElement ? (node.value || '') : (node.innerText || node.textContent || '');
  }
  function setComposerText(node, text) {
    node.focus();
    if (node instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(node, text); else node.value = text;
      node.dispatchEvent(new Event('input', {bubbles: true}));
      return;
    }
    node.textContent = '';
    const p = document.createElement('p');
    p.textContent = text;
    node.appendChild(p);
    node.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: text}));
  }
  function sendButton() {
    const preferred = document.querySelector('button[data-testid="send-button"]');
    if (preferred && isVisible(preferred)) return preferred;
    return [...document.querySelectorAll('button')].find(b => isVisible(b) && /send/i.test(b.getAttribute('aria-label') || '')) || null;
  }
  async function sendText(text, {requireEmpty = true} = {}) {
    if (sending || generationInProgress()) throw new Error('chat busy');
    const box = composer();
    if (!box) throw new Error('composer missing');
    if (requireEmpty && composerText(box).trim()) throw new Error('composer not empty');
    sending = true;
    try {
      setComposerText(box, text);
      await new Promise(r => setTimeout(r, 300));
      const button = sendButton();
      if (!button || button.disabled) throw new Error('send button unavailable');
      button.click();
    } finally { sending = false; }
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('GM_xmlhttpRequest unavailable'));
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 5000,
        headers: {'Cache-Control': 'no-cache'},
        onload: r => {
          let body;
          try { body = JSON.parse(r.responseText); } catch { body = String(r.responseText || '').slice(0, 500); }
          if (r.status < 200 || r.status >= 300) return reject(new Error(`${url} -> HTTP ${r.status}`));
          resolve({url, status: r.status, body});
        },
        onerror: () => reject(new Error(`${url} -> network error`)),
        ontimeout: () => reject(new Error(`${url} -> timeout`)),
      });
    });
  }
  async function probeLocalhost() {
    const errors = [];
    for (const url of STATUS_URLS) {
      try { return await gmGet(url); } catch (e) { errors.push(String(e)); }
    }
    throw new Error(errors.join(' | '));
  }

  function requireCap(request) {
    if (String(request.cap || '') !== capability()) throw new Error('relay capability required');
  }
  function validateMessage(request) {
    const m = String(request.message || '');
    if (!m || m.length > MAX_MESSAGE_CHARS) throw new Error(`message must be 1..${MAX_MESSAGE_CHARS} characters`);
    return m;
  }
  function targetFromRequest(request) {
    if (request.target_chat_id) {
      const id = String(request.target_chat_id);
      if (!/^[A-Za-z0-9-]{8,}$/.test(id)) throw new Error('invalid target_chat_id');
      const found = loadChats().find(c => c.id === id);
      if (!found) throw new Error('target chat has not been discovered');
      return found.url;
    }
    if (request.target_url) {
      const url = normalizeChatUrl(request.target_url);
      if (!url) throw new Error('invalid target_url');
      return url;
    }
    const here = currentChatUrl();
    if (!here) throw new Error('current page is not a ChatGPT conversation');
    return here;
  }
  function addJob(job) {
    const jobs = loadJobs().filter(j => j.id !== job.id);
    jobs.push(job);
    saveJobs(jobs);
    return job;
  }
  function makeBaseJob(id, targetUrl, message) {
    return {id, target_url: targetUrl, message, next_at: Date.now(), remaining: 1, interval_ms: 0, claimed_by: null, claim_until: 0, wake_after: 0, created_at: Date.now()};
  }
  function enqueueSend(request) {
    return addJob(makeBaseJob(`send-${request.id}`.slice(0, 120), targetFromRequest(request), validateMessage(request)));
  }
  function schedule(request) {
    const id = request.schedule_id || request.id;
    if (!validId(id)) throw new Error('invalid schedule id');
    const every = Number(request.every_minutes);
    const delay = request.delay_minutes == null ? every : Number(request.delay_minutes);
    const count = Number(request.count);
    if (!Number.isFinite(every) || every < MIN_INTERVAL_MINUTES || every > MAX_INTERVAL_MINUTES) throw new Error('invalid every_minutes');
    if (!Number.isFinite(delay) || delay < 0 || delay > MAX_INTERVAL_MINUTES) throw new Error('invalid delay_minutes');
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new Error('invalid count');
    const job = makeBaseJob(id, targetFromRequest(request), validateMessage(request));
    job.interval_ms = Math.round(every * 60000);
    job.next_at = Date.now() + Math.round(delay * 60000);
    job.remaining = count;
    return addJob(job);
  }
  function cancel(id) {
    if (!validId(id)) throw new Error('invalid schedule id');
    const jobs = loadJobs();
    const next = jobs.filter(j => j.id !== id);
    saveJobs(next);
    return next.length !== jobs.length;
  }

  async function execute(request) {
    if (request.op === 'hello') {
      const stops = [...document.querySelectorAll('button')].filter(b => /stop generating|stop response/i.test(b.getAttribute('aria-label') || '') || b.dataset.testid === 'stop-button');
      return {id: request.id, op: 'hello', status: 'ok', version: VERSION, cap: capability(), chat: {id: chatIdFromUrl(currentChatUrl()), url: currentChatUrl()}, diagnostics: {stop_candidates: stops.length, visible_stop_candidates: stops.filter(isVisible).length}};
    }
    if (request.op === 'ping') {
      return {id: request.id, op: 'ping', status: 'ok', version: VERSION, pong: true, localhost: await probeLocalhost()};
    }
    requireCap(request);
    if (request.op === 'list_chats') {
      discoverChats();
      return {id: request.id, op: 'list_chats', status: 'ok', version: VERSION, chats: loadChats().slice(0, 30)};
    }
    if (request.op === 'chat_send') {
      const job = enqueueSend(request);
      return {id: request.id, op: 'chat_send', status: 'queued', version: VERSION, dispatch: {id: job.id, target_chat_id: chatIdFromUrl(job.target_url)}};
    }
    if (request.op === 'schedule') {
      const job = schedule(request);
      return {id: request.id, op: 'schedule', status: 'ok', version: VERSION, schedule: {id: job.id, target_chat_id: chatIdFromUrl(job.target_url), next_at: job.next_at, remaining: job.remaining, interval_ms: job.interval_ms}};
    }
    if (request.op === 'cancel_schedule') {
      return {id: request.id, op: 'cancel_schedule', status: 'ok', cancelled: cancel(request.schedule_id), schedule_id: request.schedule_id};
    }
    if (request.op === 'list_schedules') {
      return {id: request.id, op: 'list_schedules', status: 'ok', schedules: loadJobs().map(j => ({id: j.id, target_chat_id: chatIdFromUrl(j.target_url), next_at: j.next_at, remaining: j.remaining, interval_ms: j.interval_ms}))};
    }
    throw new Error('unsupported op');
  }

  async function handle(request) {
    if (handling || !request || !validId(request.id) || seen.has(request.id) || generationInProgress()) return;
    handling = true;
    try {
      let payload;
      try { payload = await execute(request); }
      catch (e) { payload = {id: request.id, op: request.op, status: 'error', error: String(e)}; }
      queueResult(request.id, payload);
    } finally { handling = false; }
    await flushResults();
  }

  async function flushResults() {
    if (sending || generationInProgress()) return;
    const row = loadResults()[0];
    if (!row) return;
    try {
      await sendText(`KTBUS_POC_RESULT ${JSON.stringify(row.payload)}`, {requireEmpty: true});
      dropResult(row.id);
      seen.add(row.id);
      saveSeen();
    } catch {}
  }

  function scan() {
    if (generationInProgress() || sending || handling) return;
    for (const message of assistantMessages()) {
      const text = message.innerText || '';
      REQUEST_RE.lastIndex = 0;
      let match;
      while ((match = REQUEST_RE.exec(text))) {
        try {
          const request = JSON.parse(match[1]);
          if (validId(request?.id) && !seen.has(request.id) && !loadResults().some(r => r.id === request.id)) {
            void handle(request);
            return;
          }
        } catch {}
      }
    }
  }

  function claimLocalJob() {
    const here = currentChatUrl();
    if (!here) return null;
    const now = Date.now();
    const jobs = loadJobs();
    const index = jobs.findIndex(j => j.target_url === here && j.remaining > 0 && Number(j.next_at) <= now && (!j.claimed_by || Number(j.claim_until) <= now || j.claimed_by === TAB_ID));
    if (index < 0) return null;
    jobs[index].claimed_by = TAB_ID;
    jobs[index].claim_until = now + CLAIM_MS;
    saveJobs(jobs);
    const verify = loadJobs().find(j => j.id === jobs[index].id);
    return verify?.claimed_by === TAB_ID ? verify : null;
  }
  function releaseClaim(id) {
    const jobs = loadJobs();
    const job = jobs.find(j => j.id === id);
    if (job?.claimed_by === TAB_ID) {
      job.claimed_by = null;
      job.claim_until = 0;
      saveJobs(jobs);
    }
  }
  async function runLocalJob() {
    if (sending || handling || generationInProgress()) return;
    const job = claimLocalJob();
    if (!job) return;
    const sentAt = Date.now();
    try { await sendText(job.message, {requireEmpty: true}); }
    catch { releaseClaim(job.id); return; }
    const jobs = loadJobs();
    const index = jobs.findIndex(j => j.id === job.id && j.claimed_by === TAB_ID);
    if (index < 0) return;
    jobs[index].remaining -= 1;
    jobs[index].last_sent_at = sentAt;
    jobs[index].claimed_by = null;
    jobs[index].claim_until = 0;
    jobs[index].wake_after = 0;
    if (jobs[index].remaining <= 0) jobs.splice(index, 1);
    else jobs[index].next_at = sentAt + Number(jobs[index].interval_ms);
    saveJobs(jobs);
  }
  function wakeRemoteJob() {
    if (typeof GM_openInTab !== 'function') return;
    const here = currentChatUrl();
    const now = Date.now();
    const jobs = loadJobs();
    const index = jobs.findIndex(j => j.target_url !== here && j.remaining > 0 && Number(j.next_at) <= now && Number(j.wake_after || 0) <= now && Number(j.claim_until || 0) <= now);
    if (index < 0) return;
    const job = jobs[index];
    job.wake_after = now + WAKE_RETRY_MS;
    saveJobs(jobs);
    try {
      const tab = GM_openInTab(job.target_url, {active: false, insert: true, setParent: true});
      if (tab?.close) {
        openedTabs.set(job.id, tab);
        setTimeout(() => {
          const t = openedTabs.get(job.id);
          if (t === tab) {
            try { t.close(); } catch {}
            openedTabs.delete(job.id);
          }
        }, HELPER_LIFETIME_MS);
      }
    } catch (e) { console.error('[KT-Bus relay] background wake failed', e); }
  }

  function tick() {
    discoverChats();
    void flushResults();
    scan();
    void runLocalJob();
    wakeRemoteJob();
  }

  const observer = new MutationObserver(() => setTimeout(tick, 250));
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  setInterval(tick, TICK_MS);
  capability();
  tick();
  console.info(`[KT-Bus relay] v${VERSION} loaded`);
})();
