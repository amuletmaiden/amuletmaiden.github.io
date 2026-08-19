// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      1.0.0
// @description  Stable bootstrap for the KT-Bus ChatGPT relay; loads and caches the current runtime.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @connect      amuletmaiden.github.io
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @downloadURL  https://amuletmaiden.github.io/ktbus-poc/chatgpt_ktbus_bootstrap.user.js
// @updateURL    https://amuletmaiden.github.io/ktbus-poc/chatgpt_ktbus_bootstrap.user.js
// ==/UserScript==

(() => {
  'use strict';

  const RUNTIME_URL = 'https://amuletmaiden.github.io/ktbus-poc/chatgpt_ktbus_poc.user.js';
  const CACHE_KEY = 'ktbus-relay-runtime-cache-v1';
  const CACHE_TIME_KEY = 'ktbus-relay-runtime-cache-time-v1';

  function fetchRuntime() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${RUNTIME_URL}?bootstrap=${Date.now()}`,
        timeout: 8000,
        headers: {'Cache-Control': 'no-cache'},
        onload: response => {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`runtime HTTP ${response.status}`));
            return;
          }
          const code = String(response.responseText || '');
          if (!code.includes("const VERSION = '") || !code.includes('KTBUS_POC_REQUEST')) {
            reject(new Error('runtime validation failed'));
            return;
          }
          resolve(code);
        },
        onerror: () => reject(new Error('runtime network error')),
        ontimeout: () => reject(new Error('runtime timeout')),
      });
    });
  }

  function runRuntime(code, source) {
    const launch = new Function(
      'GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_openInTab',
      `${code}\n//# sourceURL=ktbus-chatgpt-runtime.js`
    );
    launch(GM_xmlhttpRequest, GM_getValue, GM_setValue, GM_openInTab);
    console.info(`[KT-Bus bootstrap] runtime loaded from ${source}`);
  }

  (async () => {
    let code = null;
    try {
      code = await fetchRuntime();
      GM_setValue(CACHE_KEY, code);
      GM_setValue(CACHE_TIME_KEY, Date.now());
      runRuntime(code, 'network');
      return;
    } catch (error) {
      console.warn('[KT-Bus bootstrap] runtime fetch failed; trying cache', error);
    }

    code = String(GM_getValue(CACHE_KEY, '') || '');
    if (code) {
      try {
        runRuntime(code, `cache:${GM_getValue(CACHE_TIME_KEY, 0) || 0}`);
        return;
      } catch (error) {
        console.error('[KT-Bus bootstrap] cached runtime failed', error);
      }
    }

    console.error('[KT-Bus bootstrap] no runnable runtime available');
  })();
})();
