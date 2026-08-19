// ==UserScript==
// @name         DAT Direct Local HTTP POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      0.1.0
// @description  Direct ChatGPT -> Tampermonkey -> 127.0.0.1 DAT command relay.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @downloadURL  https://amuletmaiden.github.io/ktbus-poc/chatgpt_dat_http_poc.user.js
// @updateURL    https://amuletmaiden.github.io/ktbus-poc/chatgpt_dat_http_poc.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const REQUEST_RE = /DAT_HTTP_REQUEST\s+({[^\n]+})/g;
  const RESULT_PREFIX = 'DAT_HTTP_RESULT ';
  const BASE = 'http://127.0.0.1:8765';
  const CAP_KEY = 'dat-http-relay-cap-v1';
  const SEEN_KEY = 'dat-http-relay-seen-v1';
  const MAX_SEEN = 500;
  const MAX_RESULT_CHARS = 100000;
  const MAX_SCAN_MESSAGES = 12;
  let busy = false;

  function getValue(key, fallback) {
    try { return GM_getValue(key, fallback); } catch { return fallback; }
  }
  function setValue(key, value) {
    try { GM_setValue(key, value); } catch {}
  }
  function newCap() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function capability() {
    let cap = String(getValue(CAP_KEY, '') || '');
    if (!/^[a-f0-9]{48,128}$/i.test(cap)) {
      cap = newCap();
      setValue(CAP_KEY, cap);
    }
    return cap;
  }
  function loadSeen() {
    const raw = getValue(SEEN_KEY, []);
    return new Set(Array.isArray(raw) ? raw.filter(x => typeof x === 'string').slice(-MAX_SEEN) : []);
  }
  const seen = loadSeen();
  function remember(id) {
    seen.add(id);
    setValue(SEEN_KEY, [...seen].slice(-MAX_SEEN));
  }
  function validId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(id);
  }

  function gmRequest(method, path, body = undefined, {authenticated = true} = {}) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const headers = {'Cache-Control': 'no-cache'};
      if (data !== undefined) headers['Content-Type'] = 'application/json';
      if (authenticated) headers['X-DAT-Cap'] = capability();
      GM_xmlhttpRequest({
        method,
        url: `${BASE}${path}`,
        headers,
        data,
        timeout: 120000,
        onload: response => {
          let parsed;
          try { parsed = JSON.parse(response.responseText); }
          catch { return reject(new Error(`DAT returned non-JSON HTTP ${response.status}`)); }
          if (response.status < 200 || response.status >= 300) {
            return reject(new Error(parsed?.error || `DAT HTTP ${response.status}`));
          }
          resolve(parsed);
        },
        onerror: () => reject(new Error('DAT localhost network error')),
        ontimeout: () => reject(new Error('DAT localhost timeout')),
      });
    });
  }

  function assistantMessages() {
    return [...document.querySelectorAll('[data-message-author-role="assistant"]')].slice(-MAX_SCAN_MESSAGES);
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
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
      const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(node, text); else node.value = text;
      node.dispatchEvent(new Event('input', {bubbles: true}));
      return;
    }
    if (!node.isContentEditable) throw new Error('ChatGPT composer is not editable');
    node.replaceChildren(document.createTextNode(text));
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
  async function submit(payload) {
    let text = RESULT_PREFIX + JSON.stringify(payload);
    if (text.length > MAX_RESULT_CHARS) {
      text = RESULT_PREFIX + JSON.stringify({
        id: payload?.id ?? null,
        ok: false,
        error: `DAT result is ${text.length} characters; request a smaller read/result`,
      });
    }
    const box = composer();
    if (!box) throw new Error('ChatGPT composer not found');
    if (composerText(box).trim()) throw new Error('ChatGPT composer is not empty');
    setComposerText(box, text);
    await new Promise(r => setTimeout(r, 100));
    const button = sendButton();
    if (!button || button.disabled) throw new Error('ChatGPT send button unavailable');
    button.click();
  }

  function requireChatCap(request) {
    if (String(request.cap || '') !== capability()) throw new Error('DAT chat capability required');
  }
  async function handle(request) {
    if (!request || !validId(request.id) || seen.has(request.id) || busy || generationInProgress()) return;
    busy = true;
    remember(request.id);
    let result;
    try {
      if (request.op === 'hello') {
        const health = await gmRequest('GET', '/healthz', undefined, {authenticated: false});
        result = {id: request.id, ok: true, op: 'hello', version: VERSION, cap: capability(), health};
      } else if (request.op === 'ping') {
        const health = await gmRequest('GET', '/healthz', undefined, {authenticated: false});
        result = {id: request.id, ok: true, op: 'ping', version: VERSION, health};
      } else if (request.op === 'call') {
        requireChatCap(request);
        if (!request.call || typeof request.call !== 'object') throw new Error('call object required');
        result = {id: request.id, ok: true, op: 'call', response: await gmRequest('POST', '/api/call', request.call)};
      } else if (request.op === 'batch') {
        requireChatCap(request);
        if (!Array.isArray(request.calls)) throw new Error('calls array required');
        result = {
          id: request.id,
          ok: true,
          op: 'batch',
          response: await gmRequest('POST', '/api/batch', {
            calls: request.calls,
            stop_on_error: request.stop_on_error === true,
          }),
        };
      } else {
        throw new Error(`unsupported DAT HTTP op: ${request.op}`);
      }
    } catch (error) {
      result = {id: request.id, ok: false, op: request.op, error: String(error?.message || error)};
    }
    try { await submit(result); }
    catch (error) { console.error('[DAT HTTP] failed to submit result', error); }
    finally { busy = false; }
  }

  function scan() {
    if (busy || generationInProgress()) return;
    for (const message of assistantMessages()) {
      const text = message.innerText || '';
      REQUEST_RE.lastIndex = 0;
      let match;
      while ((match = REQUEST_RE.exec(text))) {
        try {
          const request = JSON.parse(match[1]);
          if (request && validId(request.id) && !seen.has(request.id)) {
            void handle(request);
            return;
          }
        } catch {}
      }
    }
  }

  const observer = new MutationObserver(() => setTimeout(scan, 0));
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  setInterval(scan, 1200);
  console.info(`[DAT HTTP] direct localhost relay ${VERSION} loaded`);
})();
