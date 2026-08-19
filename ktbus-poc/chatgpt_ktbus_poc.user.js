// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      1.3.0
// @description  Stable KT-Bus ChatGPT relay bootstrap with hot-swappable version-checked runtime.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      raw.githubusercontent.com
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_poc.user.js
// @updateURL    https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_poc.user.js
// ==/UserScript==

(() => {
  'use strict';

  const BOOTSTRAP_VERSION = '1.3.0';
  const RUNTIME_URL = 'https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_runtime.js';
  const MIN_RUNTIME = [0, 9, 0];
  const CACHE_KEY = 'ktbus-relay-runtime-cache-v4';
  const CACHE_VERSION_KEY = 'ktbus-relay-runtime-cache-version-v4';
  const CACHE_TIME_KEY = 'ktbus-relay-runtime-cache-time-v4';
  const REFRESH_MS = 2 * 60 * 1000;
  let activeVersion = null;
  let refreshBusy = false;

  function parseVersion(code) {
    const match = String(code || '').match(/const\s+VERSION\s*=\s*['\"](\d+)\.(\d+)\.(\d+)['\"]/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }
  function versionString(parts) { return parts ? parts.join('.') : ''; }
  function compareVersion(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    for (let i = 0; i < 3; i += 1) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  }
  function validateRuntime(code) {
    const version = parseVersion(code);
    if (compareVersion(version, MIN_RUNTIME) < 0) throw new Error(`runtime too old or invalid: ${versionString(version) || 'unknown'}`);
    const text = String(code || '');
    if (!text.includes('KTBUS2_REQUEST') || !text.includes('__KTBUS_RELAY_STOP__')) throw new Error('runtime missing KTBUS2 lifecycle invariants');
    return version;
  }
  function fetchRuntime() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${RUNTIME_URL}?bootstrap=${BOOTSTRAP_VERSION}&t=${Date.now()}`,
        timeout: 10000,
        headers: {'Cache-Control':'no-cache, no-store, max-age=0','Pragma':'no-cache'},
        onload: response => {
          if (response.status < 200 || response.status >= 300) return reject(new Error(`runtime HTTP ${response.status}`));
          try {
            const code = String(response.responseText || '');
            resolve({code, version: validateRuntime(code)});
          } catch (e) { reject(e); }
        },
        onerror: () => reject(new Error('runtime network error')),
        ontimeout: () => reject(new Error('runtime timeout')),
      });
    });
  }
  function launch(code, version, source) {
    if (activeVersion && compareVersion(version, activeVersion) <= 0) return false;
    try { globalThis.__KTBUS_RELAY_STOP__?.(); } catch {}
    const fn = new Function('GM_xmlhttpRequest','GM_getValue','GM_setValue', `${code}\n//# sourceURL=ktbus-chatgpt-runtime.js`);
    fn(GM_xmlhttpRequest, GM_getValue, GM_setValue);
    activeVersion = version;
    const root = document.documentElement;
    if (root?.dataset) {
      root.dataset.ktbusRelayBootstrapVersion = BOOTSTRAP_VERSION;
      root.dataset.ktbusRelayRuntimeVersion = versionString(version);
    }
    console.info(`[KT-Bus bootstrap] v${BOOTSTRAP_VERSION} active runtime v${versionString(version)} from ${source}`);
    return true;
  }
  async function refresh({allowCache = false} = {}) {
    if (refreshBusy) return;
    refreshBusy = true;
    try {
      try {
        const {code, version} = await fetchRuntime();
        GM_setValue(CACHE_KEY, code);
        GM_setValue(CACHE_VERSION_KEY, versionString(version));
        GM_setValue(CACHE_TIME_KEY, Date.now());
        launch(code, version, 'raw-github');
        return;
      } catch (error) {
        console.warn('[KT-Bus bootstrap] runtime fetch failed', error);
        if (!allowCache) return;
      }
      const code = String(GM_getValue(CACHE_KEY, '') || '');
      if (!code) return;
      try { launch(code, validateRuntime(code), `cache:${GM_getValue(CACHE_TIME_KEY, 0) || 0}`); }
      catch (error) { console.error('[KT-Bus bootstrap] cached runtime rejected', error); }
    } finally { refreshBusy = false; }
  }

  if (document.documentElement?.dataset) document.documentElement.dataset.ktbusRelayBootstrapVersion = BOOTSTRAP_VERSION;
  void refresh({allowCache:true});
  setInterval(() => void refresh({allowCache:false}), REFRESH_MS);
})();
