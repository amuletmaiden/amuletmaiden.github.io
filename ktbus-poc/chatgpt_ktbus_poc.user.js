// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      1.5.0
// @description  Guarded KT-Bus + DAT relay in Tampermonkey's DOM sandbox with repaired ChatGPT turn sending.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @connect      localhost
// @sandbox      DOM
// @require      https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/fd28f5a41a2e0befb0e2ec51a81c53bd17459998/ktbus-poc/chatgpt_composer_focus_patch.js
// @require      https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/6675b091ccfee9b80549364f892ea26ff5f3f29c/ktbus-poc/chatgpt_ktbus_runtime.js
// @require      https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/205ebffc9c2436ef85fcde049bbb0e5a21be91d3/ktbus-poc/chatgpt_dat_bridge.user.js
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_poc.user.js
// @updateURL    https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_poc.user.js
// ==/UserScript==

(() => {
  'use strict';
  // The focus repair, pinned KTBUS2 runtime, and pinned DAT bridge are executed
  // by Tampermonkey via @require in this DOM sandbox. No dynamic runtime eval or
  // visible helper tabs are introduced here.
  try {
    if (document.documentElement?.dataset) {
      document.documentElement.dataset.ktbusRelayBootstrapVersion = '1.5.0';
      document.documentElement.dataset.ktbusRelayLoader = 'tampermonkey-require';
      document.documentElement.dataset.ktbusRelayComposerPatch = String(globalThis.__KTBUS_COMPOSER_FOCUS_PATCH__ || 'missing');
      document.documentElement.dataset.ktbusDatBridgeBundled = '0.2.0';
    }
  } catch {}
  console.info('[KT-Bus relay] bootstrap v1.5.0 loaded with composer repair + pinned KTBUS2/DAT bridges');
})();
