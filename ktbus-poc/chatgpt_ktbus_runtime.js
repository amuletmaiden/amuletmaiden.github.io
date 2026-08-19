// KT-Bus ChatGPT relay runtime. Loaded by the stable Tampermonkey bootstrap.
(() => {
  'use strict';

  // Bootstrap contract markers retained intentionally: KTBUS2_REQUEST and __KTBUS_RELAY_STOP__.
  const VERSION = '0.10.0';
  const PIN = '205ebffc9c2436ef85fcde049bbb0e5a21be91d3';
  const BASE = `https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/${PIN}/ktbus-poc`;
  const LEGACY_URL = `${BASE}/chatgpt_ktbus_runtime.js`;
  const DAT_URL = `${BASE}/chatgpt_dat_bridge.user.js`;

  let stopped = false;
  let legacyStop = null;
  let datStop = null;
  const requests = new Set();

  function fetchText(url) {
    return new Promise((resolve, reject) => {
      let handle = null;
      handle = GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        headers: {'Cache-Control':'no-cache, no-store, max-age=0','Pragma':'no-cache'},
        onload: response => {
          requests.delete(handle);
          if (stopped) return;
          if (response.status < 200 || response.status >= 300) return reject(new Error(`${url} -> HTTP ${response.status}`));
          resolve(String(response.responseText || ''));
        },
        onerror: () => { requests.delete(handle); if (!stopped) reject(new Error(`${url} -> network error`)); },
        ontimeout: () => { requests.delete(handle); if (!stopped) reject(new Error(`${url} -> timeout`)); },
      });
      requests.add(handle);
    });
  }

  function evaluate(code, sourceURL) {
    const fn = new Function('GM_xmlhttpRequest','GM_getValue','GM_setValue', `${code}\n//# sourceURL=${sourceURL}`);
    fn(GM_xmlhttpRequest, GM_getValue, GM_setValue);
  }

  function prepareDat(code) {
    if (!/const\s+VERSION\s*=\s*['\"]0\.2\.0['\"]/.test(code) || !code.includes('DAT_POC_REQUEST') || !code.includes('attach_local')) {
      throw new Error('immutable DAT v0.2 runtime failed validation');
    }
    const start = "(() => {\n  'use strict';";
    const startReplacement = "(() => {\n  try { globalThis.__KTBUS_DAT_EMBEDDED_STOP__?.(); } catch {}\n  'use strict';";
    const timer = '  setInterval(() => void tick(), 1000);';
    const timerReplacement = "  const __ktbusDatTimer = setInterval(() => void tick(), 1000);\n  globalThis.__KTBUS_DAT_EMBEDDED_STOP__ = () => {\n    try { observer.disconnect(); } catch {}\n    try { clearInterval(__ktbusDatTimer); } catch {}\n  };";
    if (!code.includes(start) || !code.includes(timer)) throw new Error('DAT v0.2 lifecycle anchors missing');
    return code.replace(start, startReplacement).replace(timer, timerReplacement);
  }

  function stopAll() {
    if (stopped) return;
    stopped = true;
    for (const request of requests) { try { request?.abort?.(); } catch {} }
    requests.clear();
    try { datStop?.(); } catch {}
    try { legacyStop?.(); } catch {}
    if (globalThis.__KTBUS_DAT_EMBEDDED_STOP__ === datStop) globalThis.__KTBUS_DAT_EMBEDDED_STOP__ = undefined;
  }

  globalThis.__KTBUS_RELAY_STOP__ = stopAll;

  Promise.all([fetchText(LEGACY_URL), fetchText(DAT_URL)]).then(([legacyCode, datCode]) => {
    if (stopped) return;
    if (!/const\s+VERSION\s*=\s*['\"]0\.9\.0['\"]/.test(legacyCode) || !legacyCode.includes('KTBUS2_REQUEST') || !legacyCode.includes('__KTBUS_RELAY_STOP__')) {
      throw new Error('immutable KTBUS v0.9 runtime failed validation');
    }

    const combinedStop = globalThis.__KTBUS_RELAY_STOP__;
    globalThis.__KTBUS_RELAY_STOP__ = undefined;
    try {
      evaluate(legacyCode, 'ktbus-chatgpt-runtime-v090.js');
      legacyStop = globalThis.__KTBUS_RELAY_STOP__;
    } finally {
      globalThis.__KTBUS_RELAY_STOP__ = combinedStop;
    }
    if (stopped) { try { legacyStop?.(); } catch {} return; }

    evaluate(prepareDat(datCode), 'ktbus-dat-bridge-v020.js');
    datStop = globalThis.__KTBUS_DAT_EMBEDDED_STOP__;
    if (stopped) { try { datStop?.(); } catch {} return; }

    if (document.documentElement?.dataset) document.documentElement.dataset.ktbusRelayRuntimeVersion = VERSION;
    console.info(`[KT-Bus runtime] v${VERSION} active: pinned KTBUS v0.9 + DAT v0.2`);
  }).catch(error => {
    console.error('[KT-Bus runtime] v0.10 load failed', error);
  });
})();
