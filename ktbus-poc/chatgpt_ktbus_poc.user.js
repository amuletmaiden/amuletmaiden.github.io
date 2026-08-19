// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      0.5.0
// @description  ChatGPT <-> localhost relay POC with bounded schedules and guarded cross-chat dispatch.
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

  const VERSION = '0.5.0';
  const STATUS_URLS = [
    'http://127.0.0.1:8765/healthz',
    'http://127.0.0.1:8765/api/status',
  ];
  const REQUEST_RE = /KTBUS_POC_REQUEST\s+({[^\n]+})/g;
  const SESSION_SEEN_KEY = 'ktbus-poc-seen';
  const GLOBAL_SEEN_KEY = 'ktbus-relay-seen-v2';
  const JOBS_KEY = 'ktbus-relay-jobs-v1';
  const CHATS_KEY = 'ktbus-relay-chats-v1';
  const MIN_INTERVAL_MINUTES = 5;
  const MAX_INTERVAL_MINUTES = 24 * 60;
  const MAX_COUNT = 48;
  const MAX_MESSAGE_CHARS = 6000;
  const TICK_MS = 15000;
  const CLAIM_MS = 30000;
  const WAKE_RETRY_MS = 90000;
  const OPEN_TAB_LIFETIME_MS = 60000;
  const MAX_SCANNED_ASSISTANT_MESSAGES = 12;
  const MAX_REGISTERED_CHATS = 200;
  const TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  let sending = false;
  const locallyOpenedTabs = new Map();

  function validId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(value);
  }

  function normalizeChatUrl(value) {
    try {
      const url = new URL(value, location.origin);
      if (!['chatgpt.com', 'chat.openai.com'].includes(url.hostname)) return null;
      const match = url.pathname.match(/^\/c\/([A-Za-z0-9-]{8,})\/?$/);
      if (!match) return null;
      return `${url.origin}/c/${match[1]}`;
    } catch {
      return null;
    }
  }

  function currentChatUrl() {
    return normalizeChatUrl(location.href);
  }

  function chatIdFromUrl(url) {
    const normalized = normalizeChatUrl(url);
    return normalized ? normalized.split('/').pop() : null;
  }

  function normalizeJobs(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(job => job && typeof job === 'object' && validId(job.id) && normalizeChatUrl(job.target_url));
  }

  function loadJobs() {
    try { return normalizeJobs(GM_getValue(JOBS_KEY, [])); }
    catch { return []; }
  }

  function saveJobs(jobs) {
    GM_setValue(JOBS_KEY, normalizeJobs(jobs).slice(-200));
  }

  function loadGlobalSeen() {
    let values = [];
    try { values = GM_getValue(GLOBAL_SEEN_KEY, []); } catch {}
    if (!Array.isArray(values)) values = [];
    try {
      const oldSession = JSON.parse(sessionStorage.getItem(SESSION_SEEN_KEY) || '[]');
      if (Array.isArray(oldSession)) values.push(...oldSession);
    } catch {}
    return new Set(values.filter(validId).slice(-600));
  }

  const seen = loadGlobalSeen();

  function saveSeen() {
    const values = [...seen].slice(-600);
    try { GM_setValue(GLOBAL_SEEN_KEY, values); } catch {}
    try { sessionStorage.setItem(SESSION_SEEN_KEY, JSON.stringify(values.slice(-300))); } catch {}
  }

  saveSeen();

  function chatTitleFromDocument() {
    const title = String(document.title || '').replace(/\s*[|\-–—]\s*ChatGPT\s*$/i, '').trim();
    return title || 'ChatGPT conversation';
  }

  function loadChats() {
    let value = [];
    try { value = GM_getValue(CHATS_KEY, []); } catch {}
    return Array.isArray(value) ? value.filter(item => item && normalizeChatUrl(item.url)) : [];
  }

  function saveChats(chats) {
    const byId = new Map();
    for (const chat of chats) {
      const url = normalizeChatUrl(chat?.url);
      if (!url) continue;
      const id = chatIdFromUrl(url);
      const candidate = {
        id,
        url,
        title: String(chat.title || '').trim().slice(0, 180) || id,
        last_seen: Number(chat.last_seen) || Date.now(),
      };
      const existing = byId.get(id);
      if (!existing || candidate.last_seen >= existing.last_seen) byId.set(id, candidate);
    }
    GM_setValue(CHATS_KEY, [...byId.values()].sort((a, b) => b.last_seen - a.last_seen).slice(0, MAX_REGISTERED_CHATS));
  }

  function discoverChats() {
    const now = Date.now();
    const chats = loadChats();
    const here = currentChatUrl();
    if (here) chats.push({id: chatIdFromUrl(here), url: here, title: chatTitleFromDocument(), last_seen: now});

    for (const anchor of document.querySelectorAll('a[href*="/c/"]')) {
      const url = normalizeChatUrl(anchor.href || anchor.getAttribute('href'));
      if (!url) continue;
      const title = String(anchor.innerText || anchor.textContent || anchor.getAttribute('aria-label') || '').trim();
      chats.push({id: chatIdFromUrl(url), url, title: title || chatIdFromUrl(url), last_seen: now - 1});
    }
    saveChats(chats);
  }

  function assistantMessages() {
    const byAuthor = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    const messages = byAuthor.length ? byAuthor : [...document.querySelectorAll('article')].filter(node =>
      /chatgpt said/i.test(node.innerText || '') || node.querySelector('[data-message-author-role="assistant"]')
    );
    return messages.slice(-MAX_SCANNED_ASSISTANT_MESSAGES);
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest unavailable; userscript manager permission missing'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 5000,
        headers: {'Cache-Control': 'no-cache'},
        onload: response => {
          let value = null;
          try { value = JSON.parse(response.responseText); } catch {}
          if (response.status < 200 || response.status >= 300) {
            const detail = value?.error || String(response.responseText || '').slice(0, 160) || `HTTP ${response.status}`;
            reject(new Error(`${url} -> ${response.status}: ${detail}`));
            return;
          }
          resolve({url, status: response.status, body: value ?? String(response.responseText || '').slice(0, 500)});
        },
        onerror: () => reject(new Error(`${url} -> network error`)),
        ontimeout: () => reject(new Error(`${url} -> timed out`)),
      });
    });
  }

  async function probeLocalhost() {
    const failures = [];
    for (const url of STATUS_URLS) {
      try { return await gmGet(url); }
      catch (error) { failures.push(String(error)); }
    }
    throw new Error(failures.join(' | '));
  }

  function composer() {
    return document.querySelector('#prompt-textarea') ||
      document.querySelector('[contenteditable="true"][data-virtualkeyboard="true"]') ||
      document.querySelector('textarea');
  }

  function composerText(node) {
    if (!node) return '';
    if (node instanceof HTMLTextAreaElement) return node.value || '';
    return node.innerText || node.textContent || '';
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
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    node.appendChild(paragraph);
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
    sending = true;
    try {
      const box = composer();
      if (!box) throw new Error('ChatGPT composer not found');
      if (requireEmpty && composerText(box).trim()) throw new Error('composer not empty');
      setComposerText(box, text);
      await new Promise(resolve => setTimeout(resolve, 180));
      const button = sendButton();
      if (!button || button.disabled) throw new Error('ChatGPT send button unavailable');
      button.click();
    } finally {
      sending = false;
    }
  }

  async function sendResult(payload) {
    await sendText(`KTBUS_POC_RESULT ${JSON.stringify(payload)}`);
  }

  function targetFromRequest(request) {
    if (request.target_url) {
      const url = normalizeChatUrl(request.target_url);
      if (!url) throw new Error('target_url must be a ChatGPT conversation URL');
      return url;
    }
    if (request.target_chat_id) {
      if (!/^[A-Za-z0-9-]{8,}$/.test(String(request.target_chat_id))) throw new Error('invalid target_chat_id');
      const found = loadChats().find(chat => chat.id === request.target_chat_id);
      if (!found) throw new Error('target_chat_id has not been discovered by the relay');
      return found.url;
    }
    return currentChatUrl();
  }

  function validateMessage(request) {
    const message = String(request.message || '');
    if (!message || message.length > MAX_MESSAGE_CHARS) {
      throw new Error(`message must be 1..${MAX_MESSAGE_CHARS} characters`);
    }
    return message;
  }

  function scheduleJob(request) {
    const scheduleId = request.schedule_id || request.id;
    if (!validId(scheduleId)) throw new Error('invalid schedule id');
    const every = Number(request.every_minutes);
    const delay = request.delay_minutes == null ? every : Number(request.delay_minutes);
    const count = Number(request.count);
    const message = validateMessage(request);
    const targetUrl = targetFromRequest(request);
    if (!targetUrl) throw new Error('this page is not a ChatGPT conversation');
    if (!Number.isFinite(every) || every < MIN_INTERVAL_MINUTES || every > MAX_INTERVAL_MINUTES) {
      throw new Error(`every_minutes must be ${MIN_INTERVAL_MINUTES}..${MAX_INTERVAL_MINUTES}`);
    }
    if (!Number.isFinite(delay) || delay < 0 || delay > MAX_INTERVAL_MINUTES) {
      throw new Error(`delay_minutes must be 0..${MAX_INTERVAL_MINUTES}`);
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      throw new Error(`count must be 1..${MAX_COUNT}`);
    }

    const jobs = loadJobs().filter(job => job.id !== scheduleId);
    const job = {
      id: scheduleId,
      target_url: targetUrl,
      message,
      interval_ms: Math.round(every * 60000),
      next_at: Date.now() + Math.round(delay * 60000),
      remaining: count,
      created_at: Date.now(),
      wake_after: 0,
      claimed_by: null,
      claim_until: 0,
    };
    jobs.push(job);
    saveJobs(jobs);
    return job;
  }

  function enqueueChatSend(request) {
    const targetUrl = targetFromRequest(request);
    const message = validateMessage(request);
    if (!targetUrl) throw new Error('target chat unavailable');
    const jobId = `send-${request.id}`.slice(0, 120);
    const jobs = loadJobs().filter(job => job.id !== jobId);
    const job = {
      id: jobId,
      target_url: targetUrl,
      message,
      interval_ms: 0,
      next_at: Date.now(),
      remaining: 1,
      created_at: Date.now(),
      wake_after: 0,
      claimed_by: null,
      claim_until: 0,
    };
    jobs.push(job);
    saveJobs(jobs);
    return job;
  }

  function cancelJob(scheduleId) {
    if (!validId(scheduleId)) throw new Error('invalid schedule id');
    const jobs = loadJobs();
    const filtered = jobs.filter(job => job.id !== scheduleId);
    saveJobs(filtered);
    return jobs.length !== filtered.length;
  }

  function listJobs() {
    return loadJobs().map(job => ({
      id: job.id,
      target_chat_id: chatIdFromUrl(job.target_url),
      target_url: job.target_url,
      next_at: job.next_at,
      remaining: job.remaining,
      interval_ms: job.interval_ms,
    }));
  }

  function listChats() {
    discoverChats();
    return loadChats().slice(0, 40);
  }

  async function handle(request) {
    if (!request || !validId(request.id) || seen.has(request.id)) return;
    seen.add(request.id);
    saveSeen();

    try {
      if (request.op === 'ping') {
        const localhost = await probeLocalhost();
        await sendResult({
          id: request.id,
          op: 'ping',
          status: 'ok',
          pong: true,
          version: VERSION,
          transport: 'userscript-gm-xhr-to-localhost',
          localhost,
        });
        return;
      }

      if (request.op === 'schedule') {
        const job = scheduleJob(request);
        await sendResult({
          id: request.id,
          op: 'schedule',
          status: 'ok',
          version: VERSION,
          schedule: {id: job.id, target_chat_id: chatIdFromUrl(job.target_url), next_at: job.next_at, remaining: job.remaining, interval_ms: job.interval_ms},
        });
        return;
      }

      if (request.op === 'chat_send') {
        const job = enqueueChatSend(request);
        await sendResult({
          id: request.id,
          op: 'chat_send',
          status: 'queued',
          version: VERSION,
          dispatch: {id: job.id, target_chat_id: chatIdFromUrl(job.target_url)},
        });
        return;
      }

      if (request.op === 'cancel_schedule') {
        const cancelled = cancelJob(request.schedule_id);
        await sendResult({id: request.id, op: 'cancel_schedule', status: 'ok', cancelled, schedule_id: request.schedule_id});
        return;
      }

      if (request.op === 'list_schedules') {
        await sendResult({id: request.id, op: 'list_schedules', status: 'ok', schedules: listJobs()});
        return;
      }

      if (request.op === 'list_chats') {
        await sendResult({id: request.id, op: 'list_chats', status: 'ok', version: VERSION, chats: listChats()});
      }
    } catch (error) {
      try { await sendResult({id: request.id, op: request.op, status: 'error', error: String(error)}); }
      catch (sendError) { console.error('[KT-Bus POC] failed to report request error', sendError); }
    }
  }

  function scan() {
    for (const message of assistantMessages()) {
      const text = message.innerText || '';
      REQUEST_RE.lastIndex = 0;
      let match;
      while ((match = REQUEST_RE.exec(text))) {
        try { void handle(JSON.parse(match[1])); }
        catch {}
      }
    }
  }

  function claimDueLocalJob() {
    const here = currentChatUrl();
    if (!here) return null;
    const now = Date.now();
    const jobs = loadJobs();
    const index = jobs.findIndex(job =>
      job.target_url === here &&
      job.remaining > 0 &&
      Number(job.next_at) <= now &&
      (!job.claimed_by || Number(job.claim_until) <= now || job.claimed_by === TAB_ID)
    );
    if (index < 0) return null;
    jobs[index].claimed_by = TAB_ID;
    jobs[index].claim_until = now + CLAIM_MS;
    saveJobs(jobs);
    const verify = loadJobs().find(job => job.id === jobs[index].id);
    return verify && verify.claimed_by === TAB_ID ? verify : null;
  }

  function releaseClaim(jobId) {
    const jobs = loadJobs();
    const job = jobs.find(item => item.id === jobId);
    if (job && job.claimed_by === TAB_ID) {
      job.claimed_by = null;
      job.claim_until = 0;
      saveJobs(jobs);
    }
  }

  async function runDueLocalJob() {
    if (sending || generationInProgress()) return;
    const job = claimDueLocalJob();
    if (!job) return;
    const sentAt = Date.now();
    try {
      await sendText(job.message, {requireEmpty: true});
    } catch (error) {
      releaseClaim(job.id);
      if (!/chat busy|composer not empty|send button unavailable/.test(String(error))) {
        console.error('[KT-Bus POC] scheduled send failed', error);
      }
      return;
    }

    const jobs = loadJobs();
    const index = jobs.findIndex(item => item.id === job.id && item.claimed_by === TAB_ID);
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

  function wakeOneRemoteJob() {
    if (typeof GM_openInTab !== 'function') return;
    const here = currentChatUrl();
    const now = Date.now();
    const jobs = loadJobs();
    const index = jobs.findIndex(job =>
      job.target_url !== here &&
      job.remaining > 0 &&
      Number(job.next_at) <= now &&
      Number(job.wake_after || 0) <= now &&
      Number(job.claim_until || 0) <= now
    );
    if (index < 0) return;

    const job = jobs[index];
    job.wake_after = now + WAKE_RETRY_MS;
    saveJobs(jobs);

    try {
      const tab = GM_openInTab(job.target_url, {active: false, insert: true, setParent: true});
      if (tab && typeof tab.close === 'function') {
        locallyOpenedTabs.set(job.id, tab);
        setTimeout(() => {
          const opened = locallyOpenedTabs.get(job.id);
          if (opened === tab) {
            try { opened.close(); } catch {}
            locallyOpenedTabs.delete(job.id);
          }
        }, OPEN_TAB_LIFETIME_MS);
      }
    } catch (error) {
      console.error('[KT-Bus POC] background chat wake failed', error);
    }
  }

  function tick() {
    discoverChats();
    void runDueLocalJob();
    wakeOneRemoteJob();
  }

  const observer = new MutationObserver(() => queueMicrotask(scan));
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  setInterval(tick, TICK_MS);
  discoverChats();
  scan();
  tick();

  console.info(`[KT-Bus POC] userscript v${VERSION} loaded; bounded schedules + guarded background cross-chat dispatch`);
})();
