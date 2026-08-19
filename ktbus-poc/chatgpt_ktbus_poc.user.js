// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      0.2.0
// @description  Side-effect-free ChatGPT -> existing localhost service -> ChatGPT proof-of-concept.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  const STATUS_URL = 'http://127.0.0.1:8765/api/status';
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
          let value;
          try { value = JSON.parse(response.responseText); }
          catch { reject(new Error(`localhost returned non-JSON: ${String(response.responseText).slice(0, 200)}`)); return; }
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(value.error || `HTTP ${response.status}`));
            return;
          }
          resolve(value);
        },
        onerror: () => reject(new Error('localhost request failed')),
        ontimeout: () => reject(new Error('localhost request timed out')),
      });
    });
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
      const status = await gmGet(STATUS_URL);
      await sendResult(`KTBUS_POC_RESULT ${JSON.stringify({
        id: request.id,
        op: 'ping',
        status: 'ok',
        pong: true,
        transport: 'userscript-gm-xhr-to-localhost',
        localhost: status,
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

  console.info('[KT-Bus POC] userscript loaded; existing localhost status ping only');
})();
