// KT-Bus ChatGPT relay runtime. Loaded by the stable Tampermonkey bootstrap.
(() => {
  'use strict';

  const VERSION = '0.9.0';
  const PROTOCOL = 'KTBUS2';
  const IS_TOP = window.top === window.self;
  const REQUEST_RE = /KTBUS2_REQUEST\s+({[^\n]+})/g;
  const STATUS_URLS = [
    'http://127.0.0.1:8765/healthz',
    'http://127.0.0.1:8765/api/status',
  ];
  const KEYS = {
    cap: 'ktbus2-cap-v1',
    seen: 'ktbus2-seen-v1',
    claims: 'ktbus2-request-claims-v1',
    jobs: 'ktbus2-jobs-v1',
    receipts: 'ktbus2-receipts-v1',
    results: 'ktbus2-results-v1',
    notices: 'ktbus2-notices-v1',
    chats: 'ktbus2-chats-v1',
  };
  const TAB_ID = `kt2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const TICK_MS = 1800;
  const REQUEST_CLAIM_MS = 5 * 60 * 1000;
  const JOB_CLAIM_MS = 90 * 1000;
  const WAKE_TIMEOUT_MS = 45 * 1000;
  const WAKE_RETRY_MS = 20 * 1000;
  const MAX_WAKE_ATTEMPTS = 3;
  const MAX_MESSAGE_CHARS = 7000;
  const MAX_JOBS = 200;
  const MAX_CHATS = 250;
  const MAX_SEEN = 1500;
  const MAX_CLAIMS = 400;
  const MAX_RESULTS = 100;
  const MAX_RECEIPTS = 600;
  const MAX_NOTICES = 150;
  const MIN_INTERVAL_MINUTES = 5;
  const MAX_INTERVAL_MINUTES = 1440;
  const MAX_COUNT = 48;

  let sending = false;
  let handling = false;
  let stopped = false;
  const wakeFrames = new Map();
  const timers = new Set();

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (!stopped) fn(); }, ms);
    timers.add(id);
    return id;
  }
  function sleep(ms) { return new Promise(resolve => later(resolve, ms)); }
  function getValue(key, fallback) { try { return GM_getValue(key, fallback); } catch { return fallback; } }
  function setValue(key, value) { try { GM_setValue(key, value); return true; } catch { return false; } }
  function validId(v) { return typeof v === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(v); }
  function randomHex(bytes = 32) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }
  function capability() {
    let cap = String(getValue(KEYS.cap, '') || '');
    if (!/^[a-f0-9]{48,128}$/i.test(cap)) {
      cap = randomHex(32);
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
  function chatIdFromUrl(url) { const n = normalizeChatUrl(url); return n ? n.split('/').pop() : null; }
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
    const buttons = [
      ...document.querySelectorAll('button[data-testid="stop-button"]'),
      ...[...document.querySelectorAll('button')].filter(b => /stop generating|stop response/i.test(b.getAttribute('aria-label') || '')),
    ];
    return buttons.some(b => isVisible(b) && !b.disabled && b.getAttribute('aria-hidden') !== 'true');
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
      ? raw.filter(c => c && validId(c.id) && Number(c.until || 0) > now - REQUEST_CLAIM_MS).slice(-MAX_CLAIMS)
      : [];
  }
  function saveClaims(rows) { setValue(KEYS.claims, rows.slice(-MAX_CLAIMS)); }
  async function acquireRequestClaim(id) {
    const attempt = async () => {
      const now = Date.now();
      const existing = loadClaims().find(c => c.id === id);
      if (existing && existing.state === 'done' && Number(existing.until) > now) return null;
      if (existing && existing.state === 'executing' && Number(existing.until) > now && existing.owner !== TAB_ID) return null;
      const claim = {id, owner: TAB_ID, nonce: randomHex(12), state: 'executing', until: now + REQUEST_CLAIM_MS};
      const rows = loadClaims().filter(c => c.id !== id);
      rows.push(claim);
      saveClaims(rows);
      await sleep(45);
      const verify = loadClaims().find(c => c.id === id);
      return verify && verify.owner === claim.owner && verify.nonce === claim.nonce ? claim : null;
    };
    if (navigator.locks?.request) return navigator.locks.request(`ktbus2:req:${id}`, {mode: 'exclusive'}, attempt);
    return attempt();
  }
  function finishRequestClaim(id) {
    const rows = loadClaims();
    const c = rows.find(x => x.id === id && x.owner === TAB_ID);
    if (c) { c.state = 'done'; c.until = Date.now() + REQUEST_CLAIM_MS; }
    saveClaims(rows);
  }

  function loadChats() {
    const raw = getValue(KEYS.chats, []);
    return Array.isArray(raw) ? raw.filter(x => x && normalizeChatUrl(x.url)).slice(-MAX_CHATS) : [];
  }
  function saveChats(rows) {
    const byId = new Map();
    for (const x of rows) {
      const url = normalizeChatUrl(x?.url);
      if (!url) continue;
      const id = chatIdFromUrl(url);
      const row = {id, url, title: String(x.title || id).trim().slice(0, 180) || id, last_seen: Number(x.last_seen) || Date.now()};
      const old = byId.get(id);
      if (!old || row.last_seen >= old.last_seen) byId.set(id, row);
    }
    setValue(KEYS.chats, [...byId.values()].sort((a,b) => b.last_seen - a.last_seen).slice(0, MAX_CHATS));
  }
  function discoverChats() {
    if (!IS_TOP) return;
    const now = Date.now();
    const rows = loadChats();
    const here = currentChatUrl();
    if (here) rows.push({url: here, title: chatTitle(), last_seen: now});
    for (const a of document.querySelectorAll('a[href*="/c/"]')) {
      const url = normalizeChatUrl(a.href || a.getAttribute('href'));
      if (!url) continue;
      const title = String(a.innerText || a.textContent || a.getAttribute('aria-label') || '').trim();
      rows.push({url, title: title || chatIdFromUrl(url), last_seen: now - 1});
    }
    saveChats(rows);
  }

  function normalizeJobs(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(j => j && validId(j.id) && normalizeChatUrl(j.target_url) && Number(j.remaining) > 0).slice(-MAX_JOBS);
  }
  function loadJobs() { return normalizeJobs(getValue(KEYS.jobs, [])); }
  function saveJobs(rows) { setValue(KEYS.jobs, normalizeJobs(rows)); }
  function loadReceipts() {
    const raw = getValue(KEYS.receipts, []);
    return Array.isArray(raw) ? raw.filter(r => r && validId(r.job_id)).slice(-MAX_RECEIPTS) : [];
  }
  function addReceipt(receipt) {
    const rows = loadReceipts();
    rows.push(receipt);
    setValue(KEYS.receipts, rows.slice(-MAX_RECEIPTS));
  }
  function loadResults() {
    const raw = getValue(KEYS.results, []);
    return Array.isArray(raw) ? raw.filter(r => r && validId(r.id) && r.payload && normalizeChatUrl(r.reply_url)).slice(-MAX_RESULTS) : [];
  }
  function saveResults(rows) { setValue(KEYS.results, rows.slice(-MAX_RESULTS)); }
  function queueResult(id, replyUrl, payload) {
    const rows = loadResults().filter(r => r.id !== id);
    rows.push({id, reply_url: replyUrl, payload, created_at: Date.now()});
    saveResults(rows);
  }
  function loadNotices() {
    const raw = getValue(KEYS.notices, []);
    return Array.isArray(raw) ? raw.filter(n => n && validId(n.id) && n.payload && normalizeChatUrl(n.reply_url)).slice(-MAX_NOTICES) : [];
  }
  function saveNotices(rows) { setValue(KEYS.notices, rows.slice(-MAX_NOTICES)); }
  function addNotice(id, replyUrl, payload) {
    if (!validId(id) || !normalizeChatUrl(replyUrl)) return;
    const rows = loadNotices().filter(n => n.id !== id);
    rows.push({id, reply_url: replyUrl, payload, created_at: Date.now()});
    saveNotices(rows);
  }

  function assistantMessages() {
    if (!IS_TOP) return [];
    const direct = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    const all = direct.length ? direct : [...document.querySelectorAll('article')].filter(node =>
      /chatgpt said/i.test(node.innerText || '') || node.querySelector('[data-message-author-role="assistant"]')
    );
    return all.slice(-24);
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
    if (stopped || sending || generationInProgress()) throw new Error('chat busy');
    const box = composer();
    if (!box) throw new Error('composer missing');
    if (requireEmpty && composerText(box).trim()) throw new Error('composer not empty');
    let prior = null;
    try { prior = window.top?.document?.activeElement || null; } catch {}
    sending = true;
    try {
      if (!IS_TOP) { try { box.focus({preventScroll: true}); } catch {} }
      setComposerText(box, text);
      await sleep(280);
      const button = sendButton();
      if (!button || button.disabled) throw new Error('send button unavailable');
      button.click();
    } finally {
      sending = false;
      if (!IS_TOP && prior?.focus) later(() => { try { prior.focus({preventScroll: true}); } catch {} }, 0);
    }
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 5000,
        headers: {'Cache-Control': 'no-cache'},
        onload: r => {
          let body;
          try { body = JSON.parse(r.responseText); } catch { body = String(r.responseText || '').slice(0, 1000); }
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
  function jobSnapshot(j) {
    return j ? {
      id: j.id, target_chat_id: chatIdFromUrl(j.target_url), next_at: j.next_at,
      remaining: j.remaining, interval_ms: j.interval_ms, run_index: j.run_index || 0,
      wake_attempts: j.wake_attempts || 0, last_sent_at: j.last_sent_at || null,
      last_error: j.last_error || null,
    } : null;
  }
  function addJob(job) {
    const rows = loadJobs().filter(j => j.id !== job.id);
    rows.push(job); saveJobs(rows); return job;
  }
  function newJob(id, targetUrl, message, notifyUrl) {
    return {
      id, target_url: targetUrl, message, notify_url: normalizeChatUrl(notifyUrl),
      next_at: Date.now(), remaining: 1, interval_ms: 0, run_index: 0,
      claimed_by: null, claim_nonce: null, claim_until: 0,
      wake_after: 0, wake_attempts: 0, created_at: Date.now(), last_error: null,
    };
  }
  function enqueueSend(request, replyUrl) {
    return addJob(newJob(`send-${request.id}`.slice(0, 120), targetFromRequest(request), validateMessage(request), request.notify === false ? null : replyUrl));
  }
  function scheduleJob(request, replyUrl) {
    const id = String(request.schedule_id || request.id);
    if (!validId(id)) throw new Error('invalid schedule id');
    const every = Number(request.every_minutes);
    const delay = request.delay_minutes == null ? every : Number(request.delay_minutes);
    const count = Number(request.count);
    if (!Number.isFinite(every) || every < MIN_INTERVAL_MINUTES || every > MAX_INTERVAL_MINUTES) throw new Error('invalid every_minutes');
    if (!Number.isFinite(delay) || delay < 0 || delay > MAX_INTERVAL_MINUTES) throw new Error('invalid delay_minutes');
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new Error('invalid count');
    const job = newJob(id, targetFromRequest(request), validateMessage(request), request.notify_deliveries ? replyUrl : null);
    job.interval_ms = Math.round(every * 60000);
    job.next_at = Date.now() + Math.round(delay * 60000);
    job.remaining = count;
    return addJob(job);
  }

  async function execute(request, replyUrl) {
    if (request.op === 'hello') {
      return {
        id: request.id, op: 'hello', status: 'ok', protocol: PROTOCOL, version: VERSION,
        cap: capability(), chat: {id: chatIdFromUrl(currentChatUrl()), url: currentChatUrl()},
        diagnostics: {
          top: IS_TOP,
          bootstrap: document.documentElement?.dataset?.ktbusRelayBootstrapVersion || null,
          runtime: document.documentElement?.dataset?.ktbusRelayRuntimeVersion || VERSION,
          web_locks: Boolean(navigator.locks?.request),
          stop_visible: generationInProgress(),
        },
      };
    }
    if (request.op === 'ping') {
      return {id: request.id, op: 'ping', status: 'ok', protocol: PROTOCOL, version: VERSION, localhost: await probeLocalhost()};
    }
    requireCap(request);
    if (request.op === 'list_chats') {
      discoverChats();
      return {id: request.id, op: 'list_chats', status: 'ok', protocol: PROTOCOL, version: VERSION, chats: loadChats().slice(0, 50)};
    }
    if (request.op === 'chat_send') {
      const job = enqueueSend(request, replyUrl);
      return {id: request.id, op: 'chat_send', status: 'queued', protocol: PROTOCOL, version: VERSION, dispatch: jobSnapshot(job)};
    }
    if (request.op === 'schedule') {
      const job = scheduleJob(request, replyUrl);
      return {id: request.id, op: 'schedule', status: 'ok', protocol: PROTOCOL, version: VERSION, schedule: jobSnapshot(job)};
    }
    if (request.op === 'cancel_schedule') {
      const id = String(request.schedule_id || '');
      if (!validId(id)) throw new Error('invalid schedule id');
      const rows = loadJobs(); const next = rows.filter(j => j.id !== id); saveJobs(next);
      return {id: request.id, op: 'cancel_schedule', status: 'ok', protocol: PROTOCOL, version: VERSION, cancelled: next.length !== rows.length, schedule_id: id};
    }
    if (request.op === 'list_schedules') {
      return {id: request.id, op: 'list_schedules', status: 'ok', protocol: PROTOCOL, version: VERSION, schedules: loadJobs().map(jobSnapshot)};
    }
    if (request.op === 'job_status') {
      const id = String(request.job_id || '');
      if (!validId(id)) throw new Error('invalid job_id');
      return {id: request.id, op: 'job_status', status: 'ok', protocol: PROTOCOL, version: VERSION, job: jobSnapshot(loadJobs().find(j => j.id === id)), receipts: loadReceipts().filter(r => r.job_id === id).slice(-20)};
    }
    throw new Error('unsupported op');
  }

  async function handle(request) {
    if (!IS_TOP || stopped || handling || !request || !validId(request.id) || seen.has(request.id) || generationInProgress()) return;
    const replyUrl = currentChatUrl();
    if (!replyUrl) return;
    const claim = await acquireRequestClaim(request.id);
    if (!claim || stopped) return;
    if (seen.has(request.id) || loadResults().some(r => r.id === request.id)) { finishRequestClaim(request.id); return; }
    handling = true;
    try {
      let payload;
      try { payload = await execute(request, replyUrl); }
      catch (e) { payload = {id: request.id, op: request.op, status: 'error', protocol: PROTOCOL, version: VERSION, error: String(e)}; }
      queueResult(request.id, replyUrl, payload);
      markSeen(request.id);
      finishRequestClaim(request.id);
    } finally { handling = false; }
    void flushOutbound();
  }

  async function flushOutbound() {
    if (!IS_TOP || stopped || sending || generationInProgress()) return;
    const here = currentChatUrl();
    if (!here) return;
    const result = loadResults().find(r => r.reply_url === here);
    if (result) {
      try {
        await sendText(`KTBUS2_RESULT ${JSON.stringify(result.payload)}`);
        saveResults(loadResults().filter(r => r.id !== result.id));
      } catch {}
      return;
    }
    const notice = loadNotices().find(n => n.reply_url === here);
    if (notice) {
      try {
        await sendText(`KTBUS2_RESULT ${JSON.stringify(notice.payload)}`);
        saveNotices(loadNotices().filter(n => n.id !== notice.id));
      } catch {}
    }
  }

  function scan() {
    if (!IS_TOP || stopped || sending || handling || generationInProgress()) return;
    for (const node of assistantMessages()) {
      const text = node.innerText || '';
      REQUEST_RE.lastIndex = 0;
      let m;
      while ((m = REQUEST_RE.exec(text))) {
        try {
          const req = JSON.parse(m[1]);
          if (validId(req?.id) && !seen.has(req.id) && !loadResults().some(r => r.id === req.id)) {
            void handle(req); return;
          }
        } catch {}
      }
    }
  }

  async function acquireJobClaim(candidate) {
    const attempt = async () => {
      let rows = loadJobs();
      let idx = rows.findIndex(j => j.id === candidate.id);
      if (idx < 0) return null;
      const now = Date.now();
      const j = rows[idx];
      if (j.remaining <= 0 || Number(j.next_at) > now || j.target_url !== currentChatUrl()) return null;
      if (j.claimed_by && Number(j.claim_until) > now && j.claimed_by !== TAB_ID) return null;
      const nonce = randomHex(10);
      j.claimed_by = TAB_ID; j.claim_nonce = nonce; j.claim_until = now + JOB_CLAIM_MS;
      saveJobs(rows);
      await sleep(55);
      const verify = loadJobs().find(x => x.id === candidate.id);
      return verify && verify.claimed_by === TAB_ID && verify.claim_nonce === nonce ? verify : null;
    };
    if (navigator.locks?.request) return navigator.locks.request(`ktbus2:job:${candidate.id}`, {mode: 'exclusive'}, attempt);
    return attempt();
  }

  async function runLocalJob() {
    if (stopped || sending || generationInProgress()) return;
    const here = currentChatUrl();
    if (!here) return;
    const now = Date.now();
    const candidate = loadJobs().find(j => j.target_url === here && j.remaining > 0 && Number(j.next_at) <= now);
    if (!candidate) return;
    const claimed = await acquireJobClaim(candidate);
    if (!claimed || stopped) return;
    const sentAt = Date.now();
    try {
      await sendText(claimed.message);
    } catch (e) {
      const rows = loadJobs(); const idx = rows.findIndex(j => j.id === claimed.id && j.claimed_by === TAB_ID && j.claim_nonce === claimed.claim_nonce);
      if (idx >= 0) {
        rows[idx].claimed_by = null; rows[idx].claim_nonce = null; rows[idx].claim_until = 0; rows[idx].last_error = String(e);
        saveJobs(rows);
      }
      return;
    }
    const rows = loadJobs();
    const idx = rows.findIndex(j => j.id === claimed.id && j.claimed_by === TAB_ID && j.claim_nonce === claimed.claim_nonce);
    if (idx < 0) return;
    const j = rows[idx];
    j.remaining -= 1; j.run_index = Number(j.run_index || 0) + 1; j.last_sent_at = sentAt; j.last_error = null;
    j.claimed_by = null; j.claim_nonce = null; j.claim_until = 0; j.wake_after = 0; j.wake_attempts = 0;
    const receipt = {job_id: j.id, run_index: j.run_index, target_chat_id: chatIdFromUrl(j.target_url), sent_at: sentAt, remaining_after: j.remaining};
    addReceipt(receipt);
    if (j.notify_url) addNotice(`delivery-${j.id}-${j.run_index}`.slice(0,120), j.notify_url, {op:'delivery',status:'sent',protocol:PROTOCOL,version:VERSION,delivery:receipt});
    if (j.remaining <= 0) rows.splice(idx, 1); else j.next_at = sentAt + Number(j.interval_ms);
    saveJobs(rows);
    if (!IS_TOP) {
      try { window.parent?.postMessage({type:'KTBUS2_JOB_DONE', job_id:j.id}, location.origin); } catch {}
    }
  }

  function markWakeFailure(jobId, message) {
    const rows = loadJobs(); const idx = rows.findIndex(j => j.id === jobId); if (idx < 0) return;
    const j = rows[idx];
    j.wake_attempts = Number(j.wake_attempts || 0) + 1; j.wake_after = Date.now() + WAKE_RETRY_MS; j.last_error = message;
    if (j.wake_attempts >= MAX_WAKE_ATTEMPTS) {
      if (j.notify_url) addNotice(`delivery-failed-${j.id}`.slice(0,120), j.notify_url, {op:'delivery',status:'error',protocol:PROTOCOL,version:VERSION,delivery:{job_id:j.id,target_chat_id:chatIdFromUrl(j.target_url),error:message}});
      if (j.interval_ms > 0 && j.remaining > 1) { j.remaining -= 1; j.next_at = Date.now() + Number(j.interval_ms); j.wake_attempts = 0; }
      else rows.splice(idx,1);
    }
    saveJobs(rows);
  }

  function wakeRemoteJob() {
    if (!IS_TOP || stopped) return;
    const here = currentChatUrl(); const now = Date.now();
    const job = loadJobs().find(j => j.target_url !== here && j.remaining > 0 && Number(j.next_at) <= now && Number(j.wake_after || 0) <= now && Number(j.claim_until || 0) <= now);
    if (!job || wakeFrames.has(job.id)) return;
    const rows = loadJobs(); const idx = rows.findIndex(j => j.id === job.id); if (idx < 0) return;
    rows[idx].wake_after = now + WAKE_RETRY_MS; saveJobs(rows);
    try {
      const frame = document.createElement('iframe');
      frame.dataset.ktbus2Job = job.id;
      frame.setAttribute('aria-hidden','true'); frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed!important;left:-30000px!important;top:-30000px!important;width:1280px!important;height:900px!important;opacity:0!important;pointer-events:none!important;border:0!important;';
      frame.src = `${job.target_url}#ktbus2=${encodeURIComponent(job.id)}-${Date.now()}`;
      document.documentElement.appendChild(frame); wakeFrames.set(job.id, frame);
      later(() => {
        if (wakeFrames.get(job.id) !== frame) return;
        wakeFrames.delete(job.id); try { frame.remove(); } catch {}
        if (loadJobs().some(j => j.id === job.id && Number(j.next_at) <= Date.now())) markWakeFailure(job.id, 'invisible target chat did not deliver job');
      }, WAKE_TIMEOUT_MS);
    } catch (e) { markWakeFailure(job.id, `invisible wake failed: ${e}`); }
  }

  window.addEventListener('message', event => {
    if (!IS_TOP || stopped || event.origin !== location.origin || event.data?.type !== 'KTBUS2_JOB_DONE') return;
    const id = String(event.data.job_id || ''); const frame = wakeFrames.get(id);
    if (frame) { wakeFrames.delete(id); try { frame.remove(); } catch {} }
  });

  function tick() {
    if (stopped) return;
    if (IS_TOP) { discoverChats(); void flushOutbound(); scan(); wakeRemoteJob(); }
    void runLocalJob();
  }
  const observer = new MutationObserver(() => later(tick, 180));
  observer.observe(document.documentElement, {subtree:true, childList:true, characterData:true});
  const interval = setInterval(tick, TICK_MS);

  function stop() {
    if (stopped) return;
    stopped = true;
    observer.disconnect(); clearInterval(interval);
    for (const id of timers) clearTimeout(id); timers.clear();
    for (const frame of wakeFrames.values()) { try { frame.remove(); } catch {} }
    wakeFrames.clear();
  }
  try { globalThis.__KTBUS_RELAY_STOP__?.(); } catch {}
  globalThis.__KTBUS_RELAY_STOP__ = stop;
  if (document.documentElement?.dataset) document.documentElement.dataset.ktbusRelayRuntimeVersion = VERSION;
  capability(); tick();
  console.info(`[KT-Bus relay] ${PROTOCOL} runtime v${VERSION} loaded (${IS_TOP ? 'top' : 'frame'})`);
})();
