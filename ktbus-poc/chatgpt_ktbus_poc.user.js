// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      0.3.0
// @description  Side-effect-free ChatGPT -> existing localhost service -> ChatGPT proof-of-concept.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @downloadURL  https://amuletmaiden.github.io/ktbus-poc/chatgpt_ktbus_poc.user.js
// @updateURL    https://amuletmaiden.github.io/ktbus-poc/chatgpt_ktbus_poc.user.js
// ==/UserScript==

(() => {
  'use strict';

  const STATUS_URLS = [
    'http://127.0.0.1:8765/healthz',
    'http://127.0.0.1:8765/api/status',
  ];
  const REQUEST_RE = /KTBUS_POC_REQUEST\s+({[^\n]+})/g;
  const seen = new Set(JSON.parse(sessionStorage.getItem('ktbus-poc-seen') || '[]'));
  let sending = false;

  function saveSeen() {
    sessionStorage.setItem('ktbus-poc-seen', JSON.stringify([...seen].slice(-200)));
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

  async function sendResult(text) {
    if (sending) throw new Error('send already in progress');
    sending = true;
    try {
      const box = composer();
      if (!box) throw new Error('ChatGPT composer not found');
      setComposerText(box, text);
      await new Promise(resolve => setTimeout(resolve, 150));
      const button = document.querySelector('button[data-testid="send-button"]') ||
        [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''));
      if (!button || button.disabled) throw new Error('ChatGPT send button unavailable');
      button.click();
    } finally {
      sending = false;
    }
  }

  async function handle(request) {
    if (!request || request.op !== 'ping' || typeof request.id !== 'string') return;
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(request.id) || seen.has(request.id)) return;
    seen.add(request.id);
    saveSeen();
    try {
      const localhost = await probeLocalhost();
      await sendResult(`KTBUS_POC_RESULT ${JSON.stringify({
        id: request.id,
        op: 'ping',
        status: 'ok',
        pong: true,
        transport: 'userscript-gm-xhr-to-localhost',
        localhost,
      })}`);
    } catch (error) {
      await sendResult(`KTBUS_POC_RESULT ${JSON.stringify({id: request.id, status: 'error', error: String(error)})}`);
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

  const observer = new MutationObserver(() => queueMicrotask(scan));
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  scan();

  console.info('[KT-Bus POC] userscript v0.3.0 loaded; localhost health ping only');
})();
