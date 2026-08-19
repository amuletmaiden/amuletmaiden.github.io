// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      0.8.0
// @description  Guarded ChatGPT relay with exactly-once request claims, invisible cross-chat wakes, delivery receipts, and local schedules.
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

  const VERSION = '0.8.0';
  const IS_TOP = window.top === window.self;
  const REQUEST_RE = /KTBUS_POC_REQUEST\s+({[^\n]+})/g;
  const STATUS_URLS = [
    'http://127.0.0.1:8765/healthz',
    'http://127.0.0.1:8765/api/status',
  ];
  const KEYS = {
    seen: 'ktbus-relay-seen-v5',
    claims: 'ktbus-relay-request-claims-v1',
    jobs: 'ktbus-relay-jobs-v4',
    receipts: 'ktbus-relay-receipts-v1',
    notices: 'ktbus-relay-notices-v1',
    chats: 'ktbus-relay-chats-v4',
    cap: 'ktbus-relay-cap-v1',
    results: 'ktbus-relay-results-v2',
  };

  const TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const TICK_MS = 2500;
  const REQUEST_CLAIM_MS = 5 * 60 * 1000;
  const JOB_CLAIM_MS = 90 * 1000;
  const WAKE_RETRY_MS = 45 * 1000;
  const FRAME_LIFETIME_MS = 75 * 1000;
  const MAX_WAKE_ATTEMPTS = 3;
  const MAX_MESSAGE_CHARS = 6000;
  const MAX_JOBS = 200;
  const MAX_CHATS = 200;
  const MAX_SEEN = 1200;
  const MAX_RESULTS = 100;
  const MAX_RECEIPTS = 500;
  const MAX_NOTICES = 100;
  const MAX_CLAIMS = 300;
  const MAX_SCAN_MESSAGES = 20;
  const MIN_INTERVAL_MINUTES = 5;
  const MAX_INTERVAL_MINUTES = 1440;
  const MAX_COUNT = 48;

  let sending = false;
  let handling = false;
  const wakeFrames = new Map();
  const openedTabs = new Map();

  function getValue(key, fallback) {
    try { return GM_getValue(key, fallback); } catch { return fallback; }
  }
  function setValue(key, value) {
    try { GM_setValue(key, value); return true; } catch { return false; }
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
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  function markSeen(id) { if (validId(id)) { seen.add(id); saveSeen(); } }

  function loadClaims() {
    const now = Date.now();
    const raw = getValue(KEYS.claims, []);
    return Array.isArray(raw)
      ? raw.filter(c => c && validId(c.id) && Number(c.until) > now - REQUEST_CLAIM_MS).slice(-MAX_CLAIMS)
      : [];
  }
  function saveClaims(rows) { setValue(KEYS.claims, rows.slice(-MAX_CLAIMS)); }
  function putClaim(id) {
    const rows = loadClaims().filter(c => c.id !== id);
    const claim = {id, owner: TAB_ID, nonce: newCap().slice(0, 24), until: Date.now() + REQUEST_CLAIM_MS, state: 'executing'};
    rows.push(claim);
    saveClaims(rows);
    return claim;
  }
  function getClaim(id) { return loadClaims().find(c => c.id === id) || null; }
  function finishClaim(id, state = 'done') {
    const rows = loadClaims();
    const c = rows.find(x => x.id === id);
    if (c) { c.state = state; c.until = Date.now() + REQUEST_CLAIM_MS; }
    saveClaims(rows);
  }

  async function withOriginLock(name, fn) {
    if (navigator.locks?.request) {
      return navigator.locks.request(`ktbus:${name}`, {mode: 'exclusive'}, fn);
    }
    return fn();
  }

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
      const candidate = {id, url, title: String(item.title || id).trim().slice(0, 180) || id, last_seen: Number(item.last_seen) || Date.now()};
      const old = byId.get(id);
      if (!old || candidate.last_seen >= old.last_seen) byId.set(id, candidate);
    }
    setValue(KEYS.chats, [...byId.values()].sort((a, b) => b.last_seen - a.last_seen).slice(0, MAX_CHATS));
  }
  function discoverChats() {
    if (!IS_TOP) return;
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

  function loadReceipts() {
    const raw = getValue(KEYS.receipts, []);
    return Array.isArray(raw) ? raw.filter(r => r && validId(r.job_id)).slice(-MAX_RECEIPTS) : [];
  }
  function addReceipt(receipt) {
    const rows = loadReceipts();
    rows.push(receipt);
    setValue(KEYS.receipts, rows.slice(-MAX_RECEIPTS));
  }

  function loadNotices() {
    const raw = getValue(KEYS.notices, []);
    return Array.isArray(raw) ? raw.filter(n => n && validId(n.id) && normalizeChatUrl(n.notify_url)).slice(-MAX_NOTICES) : [];
  }
  function saveNotices(rows) { setValue(KEYS.notices, rows.slice(-MAX_NOTICES)); }
  function addNotice(notice) {
    const rows = loadNotices().filter(n => n.id !== notice.id);
    rows.push(notice);
    saveNotices(rows);
  }

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
    if (!IS_TOP) return [];
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
    let prior = null;
    try { prior = window.top?.document?.activeElement || null; } catch {}
    sending = true;
    try {
      box.focus();
      setComposerText(box, text);
      await sleep(300);
      const button = sendButton();
      if (!button || button.disabled) throw new Error('send button unavailable');
      button.click();
    } finally {
      sending = false;
      if (!IS_TOP && prior?.focus) {
        try { setTimeout(() => prior.focus({preventScroll: true}), 0); } catch {}
      }
    }
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
  function makeBaseJob(id, targetUrl, message, notifyUrl = null) {
    return {
      id, target_url: targetUrl, message, notify_url: normalizeChatUrl(notifyUrl),
      next_at: Date.now(), remaining: 1, interval_ms: 0,
      claimed_by: null, claim_until: 0, wake_after: 0, wake_attempts: 0,
      created_at: Date.now(), run_index: 0,
    };
  }
  function enqueueSend(request) {
    const notify = request.notify === false ? null : currentChatUrl();
    return addJob(makeBaseJob(`send-${request.id}`.slice(0, 120), targetFromRequest(request), validateMessage(request), notify));
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
    const job = makeBaseJob(id, targetFromRequest(request), validateMessage(request), request.notify_deliveries ? currentChatUrl() : null);
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

  function jobSnapshot(job) {
    if (!job) return null;
    return {
      id: job.id,
      target_chat_id: chatIdFromUrl(job.target_url),
      next_at: job.next_at,
      remaining: job.remaining,
      interval_ms: job.interval_ms,
      wake_attempts: Number(job.wake_attempts || 0),
      last_sent_at: job.last_sent_at || null,
      last_error: job.last_error || null,
    };
  }

  async function execute(request) {
    if (request.op === 'hello') {
      const stops = [...document.querySelectorAll('button')].filter(b => /stop generating|stop response/i.test(b.getAttribute('aria-label') || '') || b.dataset.testid === 'stop-button');
      return {
        id: request.id, op: 'hello', status: 'ok', version: VERSION, cap: capability(),
        chat: {id: chatIdFromUrl(currentChatUrl()), url: currentChatUrl()},
        diagnostics: {top: IS_TOP, stop_candidates: stops.length, visible_stop_candidates: stops.filter(isVisible).length, web_locks: Boolean(navigator.locks?.request)},
      };
    }
    if (request.op === 'ping') {
      return {id: request.id, op: 'ping', status: 'ok', version: VERSION, pong: true, localhost: await probeLocalhost()};
    }
    requireCap(request);
    if (request.op === 'list_chats') {
      discoverChats();
      return {id: request.id, op: 'list_chats', status: 'ok', version: VERSION, chats: loadChats().slice(0, 40)};
    }
    if (request.op === 'chat_send') {
      const job = enqueueSend(request);
      return {id: request.id, op: 'chat_send', status: 'queued', version: VERSION, dispatch: jobSnapshot(job)};
    }
    if (request.op === 'schedule') {
      const job = schedule(request);
      return {id: request.id, op: 'schedule', status: 'ok', version: VERSION, schedule: jobSnapshot(job)};
    }
    if (request.op === 'cancel_schedule') {
      return {id: request.id, op: 'cancel_schedule', status: 'ok', cancelled: cancel(request.schedule_id), schedule_id: request.schedule_id};
    }
    if (request.op === 'list_schedules') {
      return {id: request.id, op: 'list_schedules', status: 'ok', version: VERSION, schedules: loadJobs().map(jobSnapshot)};
    }
    if (request.op === 'job_status') {
      const id = String(request.job_id || '');
      if (!validId(id)) throw new Error('invalid job_id');
      const job = loadJobs().find(j => j.id === id) || null;
      const receipts = loadReceipts().filter(r => r.job_id === id).slice(-20);
      return {id: request.id, op: 'job_status', status: 'ok', version: VERSION, job: jobSnapshot(job), receipts};
    }
    throw new Error('unsupported op');
  }

  async function handle(request) {
    if (!IS_TOP || handling || !request || !validId(request.id) || seen.has(request.id) || generationInProgress()) return;
    await withOriginLock(`request:${request.id}`, async () => {
      if (seen.has(request.id) || loadResults().some(r => r.id === request.id)) return;
      const existing = getClaim(request.id);
      if (existing && existing.owner !== TAB_ID && existing.state === 'executing' && Number(existing.until) > Date.now()) return;
      const claim = putClaim(request.id);
      await sleep(35);
      const verify = getClaim(request.id);
      if (!verify || verify.owner !== claim.owner || verify.nonce !== claim.nonce) return;
      handling = true;
      try {
        let payload;
        try { payload = await execute(request); }
        catch (e) { payload = {id: request.id, op: request.op, status: 'error', version: VERSION, error: String(e)}; }
        queueResult(request.id, payload);
        markSeen(request.id);
        finishClaim(request.id, 'done');
      } finally { handling = false; }
    });
    await flushResults();
  }

  async function flushResults() {
    if (!IS_TOP || sending || generationInProgress()) return;
    const row = loadResults()[0];
    if (!row) return;
    try {
      await sendText(`KTBUS_POC_RESULT ${JSON.stringify(row.payload)}`, {requireEmpty: true});
      dropResult(row.id);
    } catch {}
  }

  async function flushNotices() {
    if (!IS_TOP || sending || generationInProgress()) return;
    const here = currentChatUrl();
    if (!here) return;
    const notice = loadNotices().find(n => n.notify_url === here);
    if (!notice) return;
    try {
      await sendText(`KTBUS_POC_RESULT ${JSON.stringify(notice.payload)}`, {requireEmpty: true});
      saveNotices(loadNotices().filter(n => n.id !== notice.id));
    } catch {}
  }

  function scan() {
    if (!IS_TOP || generationInProgress() || sending || handling) return;
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

  function selectDueLocalJob() {
    const here = currentChatUrl();
    if (!here) return null;
    const now = Date.now();
    return loadJobs().find(j => j.target_url === here && j.remaining > 0 && Number(j.next_at) <= now) || null;
  }

  async function runLocalJob() {
    if (sending || generationInProgress()) return;
    const candidate = selectDueLocalJob();
    if (!candidate) return;
    await withOriginLock(`job:${candidate.id}`, async () => {
      const here = currentChatUrl();
      const now = Date.now();
      let jobs = loadJobs();
      let index = jobs.findIndex(j => j.id === candidate.id && j.target_url === here && j.remaining > 0 && Number(j.next_at) <= now);
      if (index < 0) return;
      const job = jobs[index];
      if (job.claimed_by && Number(job.claim_until) > now && job.claimed_by !== TAB_ID) return;
      job.claimed_by = TAB_ID;
      job.claim_until = now + JOB_CLAIM_MS;
      saveJobs(jobs);
      const sentAt = Date.now();
      try {
        await sendText(job.message, {requireEmpty: true});
      } catch (e) {
        jobs = loadJobs();
        index = jobs.findIndex(j => j.id === job.id);
        if (index >= 0) {
          jobs[index].claimed_by = null;
          jobs[index].claim_until = 0;
          jobs[index].last_error = String(e);
          saveJobs(jobs);
        }
        return;
      }
      jobs = loadJobs();
      index = jobs.findIndex(j => j.id === job.id);
      if (index < 0) return;
      const current = jobs[index];
      current.remaining -= 1;
      current.run_index = Number(current.run_index || 0) + 1;
      current.last_sent_at = sentAt;
      current.last_error = null;
      current.claimed_by = null;
      current.claim_until = 0;
      current.wake_after = 0;
      current.wake_attempts = 0;
      const remainingAfter = current.remaining;
      const receipt = {
        job_id: current.id,
        run_index: current.run_index,
        target_chat_id: chatIdFromUrl(current.target_url),
        sent_at: sentAt,
        remaining_after: remainingAfter,
      };
      addReceipt(receipt);
      if (current.notify_url) {
        addNotice({
          id: `delivery-${current.id}-${current.run_index}`.slice(0, 120),
          notify_url: current.notify_url,
          payload: {op: 'delivery', status: 'sent', version: VERSION, delivery: receipt},
          created_at: Date.now(),
        });
      }
      if (current.remaining <= 0) jobs.splice(index, 1);
      else current.next_at = sentAt + Number(current.interval_ms);
      saveJobs(jobs);
      if (!IS_TOP) {
        try { window.parent?.postMessage({type: 'KTBUS_RELAY_JOB_DONE', job_id: current.id}, location.origin); } catch {}
      }
    });
  }

  function markWakeFailure(jobId, error) {
    const jobs = loadJobs();
    const index = jobs.findIndex(j => j.id === jobId);
    if (index < 0) return;
    const job = jobs[index];
    job.last_error = String(error);
    job.wake_attempts = Number(job.wake_attempts || 0) + 1;
    job.wake_after = Date.now() + WAKE_RETRY_MS;
    if (job.wake_attempts >= MAX_WAKE_ATTEMPTS) {
      if (job.notify_url) {
        addNotice({
          id: `delivery-failed-${job.id}-${Date.now()}`.slice(0, 120),
          notify_url: job.notify_url,
          payload: {op: 'delivery', status: 'error', version: VERSION, delivery: {job_id: job.id, target_chat_id: chatIdFromUrl(job.target_url), error: job.last_error}},
          created_at: Date.now(),
        });
      }
      if (Number(job.interval_ms) > 0 && job.remaining > 1) {
        job.remaining -= 1;
        job.next_at = Date.now() + Number(job.interval_ms);
        job.wake_attempts = 0;
      } else {
        jobs.splice(index, 1);
      }
    }
    saveJobs(jobs);
  }

  function createInvisibleWake(job) {
    if (!IS_TOP || wakeFrames.has(job.id)) return false;
    try {
      const frame = document.createElement('iframe');
      frame.dataset.ktbusRelayJob = job.id;
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed!important;left:-20000px!important;top:-20000px!important;width:1280px!important;height:800px!important;opacity:0!important;pointer-events:none!important;border:0!important;';
      frame.src = `${job.target_url}#ktbus-relay=${encodeURIComponent(job.id)}`;
      document.documentElement.appendChild(frame);
      wakeFrames.set(job.id, frame);
      const cleanup = () => {
        const current = wakeFrames.get(job.id);
        if (current === frame) wakeFrames.delete(job.id);
        try { frame.remove(); } catch {}
      };
      frame.addEventListener('load', () => {
        setTimeout(() => {
          if (loadJobs().some(j => j.id === job.id && Number(j.next_at) <= Date.now())) {
            markWakeFailure(job.id, 'invisible wake did not complete job');
          }
          cleanup();
        }, FRAME_LIFETIME_MS);
      }, {once: true});
      setTimeout(() => {
        if (wakeFrames.get(job.id) === frame) {
          markWakeFailure(job.id, 'invisible wake timed out');
          cleanup();
        }
      }, FRAME_LIFETIME_MS + 5000);
      return true;
    } catch (e) {
      markWakeFailure(job.id, `invisible wake failed: ${e}`);
      return false;
    }
  }

  function fallbackBackgroundWake(job) {
    if (!IS_TOP || typeof GM_openInTab !== 'function' || openedTabs.has(job.id)) return false;
    try {
      const tab = GM_openInTab(job.target_url, {active: false, insert: true, setParent: true});
      if (!tab) throw new Error('GM_openInTab returned no handle');
      openedTabs.set(job.id, tab);
      setTimeout(() => {
        const t = openedTabs.get(job.id);
        if (t === tab) {
          try { t.close?.(); } catch {}
          openedTabs.delete(job.id);
          if (loadJobs().some(j => j.id === job.id && Number(j.next_at) <= Date.now())) {
            markWakeFailure(job.id, 'background wake did not complete job');
          }
        }
      }, FRAME_LIFETIME_MS);
      return true;
    } catch (e) {
      markWakeFailure(job.id, `background wake failed: ${e}`);
      return false;
    }
  }

  function wakeRemoteJob() {
    if (!IS_TOP) return;
    const here = currentChatUrl();
    const now = Date.now();
    const jobs = loadJobs();
    const job = jobs.find(j => j.target_url !== here && j.remaining > 0 && Number(j.next_at) <= now && Number(j.wake_after || 0) <= now && Number(j.claim_until || 0) <= now);
    if (!job) return;
    const index = jobs.findIndex(j => j.id === job.id);
    jobs[index].wake_after = now + WAKE_RETRY_MS;
    saveJobs(jobs);
    if (Number(job.wake_attempts || 0) === 0) {
      if (!createInvisibleWake(job)) fallbackBackgroundWake(job);
    } else {
      fallbackBackgroundWake(job);
    }
  }

  window.addEventListener('message', event => {
    if (!IS_TOP || event.origin !== location.origin || event.data?.type !== 'KTBUS_RELAY_JOB_DONE') return;
    const id = String(event.data.job_id || '');
    const frame = wakeFrames.get(id);
    if (frame) {
      wakeFrames.delete(id);
      try { frame.remove(); } catch {}
    }
  });

  function tick() {
    if (IS_TOP) {
      discoverChats();
      void flushResults();
      void flushNotices();
      scan();
      wakeRemoteJob();
    }
    void runLocalJob();
  }

  const observer = new MutationObserver(() => setTimeout(tick, 200));
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  setInterval(tick, TICK_MS);
  capability();
  tick();
  console.info(`[KT-Bus relay] v${VERSION} loaded (${IS_TOP ? 'top' : 'frame'})`);
})();
