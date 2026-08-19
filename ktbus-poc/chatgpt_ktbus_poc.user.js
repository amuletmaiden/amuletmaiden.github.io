// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      1.2.0
// @description  Stable KT-Bus ChatGPT relay bootstrap; loads a version-checked cached runtime directly from GitHub.
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

  const BOOTSTRAP_VERSION = '1.2.0';
  const RUNTIME_URL = 'https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_runtime.js';
  const MIN_RUNTIME = [0, 8, 0];
  const CACHE_KEY = 'ktbus-relay-runtime-cache-v3';
  const CACHE_VERSION_KEY = 'ktbus-relay-runtime-cache-version-v3';
  const CACHE_TIME_KEY = 'ktbus-relay-runtime-cache-time-v3';
  const BOOT_MARK = 'ktbusRelayBootstrapActive';

  function parseVersion(code) {
    const match = String(code || '').match(/const\s+VERSION\s*=\s*['\"](\d+)\.(\d+)\.(\d+)['\"]/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }

  function versionString(parts) { return parts ? parts.join('.') : ''; }

  function versionAtLeast(parts, minimum) {
    if (!parts) return false;
    for (let i = 0; i < 3; i += 1) {
      if (parts[i] > minimum[i]) return true;
      if (parts[i] < minimum[i]) return false;
    }
    return true;
  }

  function validateRuntime(code) {
    const version = parseVersion(code);
    if (!versionAtLeast(version, MIN_RUNTIME)) {
      throw new Error(`runtime too old or invalid: ${versionString(version) || 'unknown'}`);
    }
    const text = String(code || '');
    if (!text.includes('KTBUS_POC_REQUEST') || !text.includes('ktbus-relay-request-claims-v1')) {
      throw new Error('runtime missing v0.8 relay invariants');
    }
    return version;
  }

  function fetchRuntime() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${RUNTIME_URL}?bootstrap=${BOOTSTRAP_VERSION}&t=${Date.now()}`,
        timeout: 10000,
        headers: {'Cache-Control': 'no-cache, no-store, max-age=0', 'Pragma': 'no-cache'},
        onload: response => {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`runtime HTTP ${response.status}`));
            return;
          }
          try {
            const code = String(response.responseText || '');
            resolve({code, version: validateRuntime(code)});
          } catch (error) { reject(error); }
        },
        onerror: () => reject(new Error('runtime network error')),
        ontimeout: () => reject(new Error('runtime timeout')),
      });
    });
  }

  function denyVisibleTab() {
    throw new Error('visible helper tabs disabled by KT-Bus bootstrap policy');
  }

  function runRuntime(code, version, source) {
    const root = document.documentElement;
    const v = versionString(version);
    if (root?.dataset?.ktbusRelayRuntimeVersion === v) return;
    const launch = new Function(
      'GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_openInTab',
      `${code}\n//# sourceURL=ktbus-chatgpt-runtime.js`
    );
    launch(GM_xmlhttpRequest, GM_getValue, GM_setValue, denyVisibleTab);
    if (root?.dataset) root.dataset.ktbusRelayRuntimeVersion = v;
    console.info(`[KT-Bus bootstrap] v${BOOTSTRAP_VERSION} loaded runtime v${v} from ${source}; visible helper tabs denied`);
  }

  (async () => {
    const root = document.documentElement;
    if (root?.dataset?.[BOOT_MARK] === BOOTSTRAP_VERSION) return;
    if (root?.dataset) root.dataset[BOOT_MARK] = BOOTSTRAP_VERSION;

    try {
      const {code, version} = await fetchRuntime();
      GM_setValue(CACHE_KEY, code);
      GM_setValue(CACHE_VERSION_KEY, versionString(version));
      GM_setValue(CACHE_TIME_KEY, Date.now());
      runRuntime(code, version, 'raw-github');
      return;
    } catch (error) {
      console.warn('[KT-Bus bootstrap] raw runtime rejected; trying validated cache', error);
    }

    const code = String(GM_getValue(CACHE_KEY, '') || '');
    if (code) {
      try {
        const version = validateRuntime(code);
        runRuntime(code, version, `cache:${GM_getValue(CACHE_TIME_KEY, 0) || 0}`);
        return;
      } catch (error) {
        console.error('[KT-Bus bootstrap] cached runtime rejected', error);
      }
    }

    console.error('[KT-Bus bootstrap] no v0.8+ runtime available');
  })();
})();
