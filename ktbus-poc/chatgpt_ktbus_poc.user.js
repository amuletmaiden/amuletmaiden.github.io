// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      0.4.0
// @description  ChatGPT <-> localhost relay POC with a bounded current-chat continuation scheduler.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @downloadURL  https://amuletmaiden.github.io/ktbus-poc/chatgpt_ktbus_poc.user.js
// @updateURL    https://amuletmaiden.github.io/ktbus-poc/chatgpt_ktbus_poc.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.4.0';
  const STATUS_URLS = [
    'http://127.0.0.1:8765/healthz',
    'http://127.0.0.1:8765/api/status',
  ];
  const REQUEST_RE = /KTBUS_POC_REQUEST\s+({[^\n]+})/g;
  const SEEN_KEY = 'ktbus-poc-seen';
  const JOBS_KEY = 'ktbus-relay-jobs-v1';
  const MIN_INTERVAL_MINUTES = 5;
  const MAX_INTERVAL_MINUTES = 24 * 60;
  const MAX_COUNT = 48;
  const MAX_MESSAGE_CHARS = 6000;
  const TICK_MS = 15000;

  const seen = new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]'));
  let sending = false;

  function saveSeen() {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)));
  }

  function currentChatUrl() {
    return `${location.origin}${location.pathname}`;
  }

  function normalizeJobs(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(job => job && typeof job === 'object' && typeof job.id === 'string');
  }

  function loadJobs() {
    try { return normalizeJobs(GM_getValue(JOBS_KEY, [])); }
    catch { return []; }
  }

  function saveJobs(jobs) {
    GM_setValue(JOBS_KEY, normalizeJobs(jobs).slice(-200));
  }

  function assistantMessages() {
    const byAuthor = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    if (byAuthor.length) return byAuthor;
    return [...document.querySelectorAll('article')].filter(node =>
      /chatgpt said/i.test(node.innerText || '') || node.querySelector('[data-message-author-role="assistant"]')
    );
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

  function validId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(value);
  }

  function scheduleJob(request) {
    const scheduleId = request.schedule_id || request.id;
    if (!validId(scheduleId)) throw new Error('invalid schedule id');
    const every = Number(request.every_minutes);
    const delay = request.delay_minutes == null ? every : Number(request.delay_minutes);
    const count = Number(request.count);
    const message = String(request.message || '');
    if (!Number.isFinite(every) || every < MIN_INTERVAL_MINUTES || every > MAX_INTERVAL_MINUTES) {
      throw new Error(`every_minutes must be ${MIN_INTERVAL_MINUTES}..${MAX_INTERVAL_MINUTES}`);
    }
    if (!Number.isFinite(delay) || delay < 0 || delay > MAX_INTERVAL_MINUTES) {
      throw new Error(`delay_minutes must be 0..${MAX_INTERVAL_MINUTES}`);
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      throw new Error(`count must be 1..${MAX_COUNT}`);
    }
    if (!message || message.length > MAX_MESSAGE_CHARS) {
      throw new Error(`message must be 1..${MAX_MESSAGE_CHARS} characters`);
    }

    const jobs = loadJobs().filter(job => job.id !== scheduleId);
    const job = {
      id: scheduleId,
      target_url: currentChatUrl(),
      message,
      interval_ms: Math.round(every * 60000),
      next_at: Date.now() + Math.round(delay * 60000),
      remaining: count,
      created_at: Date.now(),
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

  function listCurrentJobs() {
    const here = currentChatUrl();
    return loadJobs()
      .filter(job => job.target_url === here)
      .map(job => ({id: job.id, next_at: job.next_at, remaining: job.remaining, interval_ms: job.interval_ms}));
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
          schedule: {id: job.id, next_at: job.next_at, remaining: job.remaining, interval_ms: job.interval_ms},
        });
        return;
      }

      if (request.op === 'cancel_schedule') {
        const cancelled = cancelJob(request.schedule_id);
        await sendResult({id: request.id, op: 'cancel_schedule', status: 'ok', cancelled, schedule_id: request.schedule_id});
        return;
      }

      if (request.op === 'list_schedules') {
        await sendResult({id: request.id, op: 'list_schedules', status: 'ok', schedules: listCurrentJobs()});
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
        catch { }
      }
    }
  }

  async function runDueJob() {
    if (sending || generationInProgress()) return;
    const jobs = loadJobs();
    const here = currentChatUrl();
    const now = Date.now();
    const index = jobs.findIndex(job => job.target_url === here && job.remaining > 0 && Number(job.next_at) <= now);
    if (index < 0) return;

    const job = jobs[index];
    try {
      await sendText(job.message, {requireEmpty: true});
    } catch (error) {
      if (!/chat busy|composer not empty|send button unavailable/.test(String(error))) {
        console.error('[KT-Bus POC] scheduled send failed', error);
      }
      return;
    }

    job.remaining -= 1;
    job.last_sent_at = now;
    if (job.remaining <= 0) jobs.splice(index, 1);
    else job.next_at = now + Number(job.interval_ms);
    saveJobs(jobs);
  }

  const observer = new MutationObserver(() => queueMicrotask(scan));
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  setInterval(() => { void runDueJob(); }, TICK_MS);
  scan();
  void runDueJob();

  console.info(`[KT-Bus POC] userscript v${VERSION} loaded; localhost ping + bounded current-chat scheduler`);
})();
