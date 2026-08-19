// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      1.4.0
// @description  Guarded KT-Bus ChatGPT relay in Tampermonkey's DOM sandbox; no dynamic runtime eval or visible helper tabs.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @connect      localhost
// @sandbox      DOM
// @require      https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/6675b091ccfee9b80549364f892ea26ff5f3f29c/ktbus-poc/chatgpt_ktbus_runtime.js
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_poc.user.js
// @updateURL    https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_poc.user.js
// ==/UserScript==

(() => {
  'use strict';
  // The pinned KTBUS2 runtime is executed by Tampermonkey via @require in the
  // same DOM sandbox. This body intentionally contains no remote-code loader.
  try {
    if (document.documentElement?.dataset) {
      document.documentElement.dataset.ktbusRelayBootstrapVersion = '1.4.0';
      document.documentElement.dataset.ktbusRelayLoader = 'tampermonkey-require';
    }
  } catch {}
  console.info('[KT-Bus relay] bootstrap v1.4.0 loaded via @sandbox DOM + pinned @require');
})();
