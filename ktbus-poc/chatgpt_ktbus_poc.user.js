// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      0.6.0
// @description  Guarded ChatGPT browser relay with local schedules and cross-chat dispatch.
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

  const VERSION = '0.6.0';
  const REQUEST_RE = /KTBUS_POC_REQUEST\s+({[^\n]+})/g;
  const STATUS_URLS = [
    'http://127.0.0.1:8765/healthz',
    'http://127.0.0.1:8765/api/status',
  ];
  const KEYS = {
    seen: 'ktbus-relay-seen-v3',
    jobs: 'ktbus-relay-jobs-v2',
    chats: 'ktbus-relay-chats-v2',
    cap: 'ktbus-relay-cap-v1',
  };
  const TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const TICK_MS = 10000;
  const CLAIM_MS = 45000;
  const WAKE_RETRY_MS = 90000;
  const HELPER_LIFETIME_MS = 90000;
  const MIN_INTERVAL_MINUTES = 5;
  const MAX_INTERVAL_MINUTES = 1440;
  const MAX_COUNT = 48;
  const MAX_MESSAGE_CHARS = 6000;
  const MAX_JOBS = 200;
  const MAX_CHATS = 200;
  const MAX_SEEN = 800;
  const MAX_SCAN_MESSAGES = 14;

  let sending = false;
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
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
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
      const url = new URL(value, location.origin);
      if (!['chatgpt.com', 'chat.openai.com'].includes(url.hostname)) return null;
      const match = url.pathname.match(/^\/c\/([A-Za-z0-9-]{8,})\/?$/);
      return match ? `${url.origin}/c/${match[1]}` : null;
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
      const c = {
        id,
        url,
        title: String(item.title || id).trim().slice(0, 180) || id,
        last_seen: Number(item.last_seen) || Date.now(),
      };
      const old = byId.get(id);
      if (!old || c.last_seen >= old.last_seen) byId.set(id, c);
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
    return document.querySelector('button[data-testid="send-button"]') ||
      [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''));
  }
  function generationInProgress() {
    return Boolean(document.querySelector('button[data-testid="stop-button"]')) ||
      [...document.querySelectorAll('button')].some(b => /stop generating|stop response/i.test(b.getAttribute('aria-label') || ''));
  }
  async function sendText(text, {requireEmpty = false} = {}) {
    if (sending || generationInProgress()) throw new Error('chat busy');
    const box = composer();
    if (!box) throw new Error('ChatGPT composer not found');
    if (requireEmpty && composerText(box).trim()) throw new Error('composer not empty');
    sending = true;
    try {
      setComposerText(box, text);
      await new Promise(r => setTimeout(r, 220));
      const button = sendButton();
      if (!button || button.disabled) throw new Error('ChatGPT send button unavailable');
      button.click();
    } finally { sending = false; }
  }
  async function sendResult(payload) {
    await sendText(`KTBUS_POC_RESULT ${JSON.stringify(payload)}`, {requireEmpty: true});
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('GM_xmlhttpRequest unavailable'));
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 5000,
        headers: {'Cache-Control': 'no-cache'},
        onload: r => {
          let body = null;
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
    return {
      id, target_url: targetUrl, message,
      next_at: Date.now(), remaining: 1, interval_ms: 0,
      claimed_by: null, claim_until: 0, wake_after: 0,
      created_at: Date.now(),
    };
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

  async function handle(request) {
    if (!request || !validId(request.id) || seen.has(request.id)) return;
    if (generationInProgress()) return;
    seen.add(request.id);
    saveSeen();
    try {
      if (request.op === 'hello') {
        await sendResult({id: request.id, op: 'hello', status: 'ok', version: VERSION, cap: capability(), chat: {id: chatIdFromUrl(currentChatUrl()), url: currentChatUrl()}});
        return;
      }
      if (request.op === 'ping') {
        const localhost = await probeLocalhost();
        await sendResult({id: request.id, op: 'ping', status: 'ok', version: VERSION, pong: true, localhost});
        return;
      }
      requireCap(request);
      if (request.op === 'list_chats') {
        discoverChats();
        await sendResult({id: request.id, op: 'list_chats', status: 'ok', version: VERSION, chats: loadChats().slice(0, 30)});
      } else if (request.op === 'chat_send') {
        const job = enqueueSend(request);
        await sendResult({id: request.id, op: 'chat_send', status: 'queued', version: VERSION, dispatch: {id: job.id, target_chat_id: chatIdFromUrl(job.target_url)}});
      } else if (request.op === 'schedule') {
        const job = schedule(request);
        await sendResult({id: request.id, op: 'schedule', status: 'ok', version: VERSION, schedule: {id: job.id, target_chat_id: chatIdFromUrl(job.target_url), next_at: job.next_at, remaining: job.remaining, interval_ms: job.interval_ms}});
      } else if (request.op === 'cancel_schedule') {
        await sendResult({id: request.id, op: 'cancel_schedule', status: 'ok', cancelled: cancel(request.schedule_id), schedule_id: request.schedule_id});
      } else if (request.op === 'list_schedules') {
        await sendResult({id: request.id, op: 'list_schedules', status: 'ok', schedules: loadJobs().map(j => ({id: j.id, target_chat_id: chatIdFromUrl(j.target_url), next_at: j.next_at, remaining: j.remaining, interval_ms: j.interval_ms}))});
      } else {
        throw new Error('unsupported op');
      }
    } catch (e) {
      try { await sendResult({id: request.id, op: request.op, status: 'error', error: String(e)}); } catch (sendError) { console.error('[KT-Bus relay] result send failed', sendError); }
    }
  }

  function scan() {
    if (generationInProgress() || sending) return;
    for (const message of assistantMessages()) {
      const text = message.innerText || '';
      REQUEST_RE.lastIndex = 0;
      let match;
      while ((match = REQUEST_RE.exec(text))) {
        try { void handle(JSON.parse(match[1])); } catch {}
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
      job.claimed_by = null; job.claim_until = 0; saveJobs(jobs);
    }
  }
  async function runLocalJob() {
    if (sending || generationInProgress()) return;
    const job = claimLocalJob();
    if (!job) return;
    const sentAt = Date.now();
    try { await sendText(job.message, {requireEmpty: true}); }
    catch (e) { releaseClaim(job.id); return; }
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
          if (t === tab) { try { t.close(); } catch {} openedTabs.delete(job.id); }
        }, HELPER_LIFETIME_MS);
      }
    } catch (e) { console.error('[KT-Bus relay] background wake failed', e); }
  }

  function tick() {
    discoverChats();
    scan();
    void runLocalJob();
    wakeRemoteJob();
  }

  const observer = new MutationObserver(() => queueMicrotask(scan));
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  setInterval(tick, TICK_MS);
  capability();
  tick();
  console.info(`[KT-Bus relay] v${VERSION} loaded`);
})();
