// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      1.6.0
// @description  Stable KT-Bus loader: verified GitHub manifest/runtime, CSP-safe hot updates, rollback, DAT bridge.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addElement
// @connect      raw.githubusercontent.com
// @connect      127.0.0.1
// @connect      localhost
// @sandbox      DOM
// @require      https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/205ebffc9c2436ef85fcde049bbb0e5a21be91d3/ktbus-poc/chatgpt_dat_bridge.user.js
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_poc.user.js
// @updateURL    https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_poc.user.js
// ==/UserScript==

(() => {
  'use strict';

  const LOADER_VERSION = '1.6.0';
  const MANIFEST_URL = 'https://raw.githubusercontent.com/amuletmaiden/amuletmaiden.github.io/main/ktbus-poc/chatgpt_ktbus_manifest.json';
  const POLL_MS = 2 * 60 * 1000;
  const MAX_RUNTIME_BYTES = 120000;
  const ALLOWED_RUNTIME_URL = /^https:\/\/raw\.githubusercontent\.com\/amuletmaiden\/amuletmaiden\.github\.io\/[0-9a-f]{40}\/ktbus-poc\/chatgpt_ktbus_runtime\.js$/i;
  const CACHE = {
    code: 'ktbus-loader-current-code-v1',
    version: 'ktbus-loader-current-version-v1',
    blob: 'ktbus-loader-current-blob-v1',
    prevCode: 'ktbus-loader-previous-code-v1',
    prevVersion: 'ktbus-loader-previous-version-v1',
    prevBlob: 'ktbus-loader-previous-blob-v1',
  };

  let activeVersion = null;
  let activeBlob = null;
  let refreshBusy = false;
  let bridge = null;
  let bridgeSecret = null;
  const activeRequests = new Map();

  const parts = value => {
    const m = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    return m ? m.slice(1).map(Number) : null;
  };
  function cmp(a, b) {
    const aa = parts(a), bb = parts(b);
    if (!aa || !bb) return 0;
    for (let i = 0; i < 3; i += 1) if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
    return 0;
  }
  function randomHex(bytes = 24) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function gm(details) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      ...details,
      onload: resolve,
      onerror: () => reject(new Error(`network error: ${details.url}`)),
      ontimeout: () => reject(new Error(`timeout: ${details.url}`)),
    }));
  }
  async function fetchText(url) {
    const r = await gm({
      method: 'GET', url, timeout: 10000,
      headers: {'Cache-Control':'no-cache, no-store, max-age=0', 'Pragma':'no-cache'},
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`${url} -> HTTP ${r.status}`);
    return String(r.responseText || '');
  }
  async function gitBlobSha1(text) {
    const body = new TextEncoder().encode(text);
    const prefix = new TextEncoder().encode(`blob ${body.byteLength}\0`);
    const input = new Uint8Array(prefix.byteLength + body.byteLength);
    input.set(prefix); input.set(body, prefix.byteLength);
    const digest = await crypto.subtle.digest('SHA-1', input);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
  }
  function validateManifest(raw) {
    let manifest;
    try { manifest = JSON.parse(raw); } catch { throw new Error('invalid runtime manifest JSON'); }
    const r = manifest?.schema === 1 ? manifest.runtime : null;
    if (!r || !parts(r.version) || r.protocol !== 'KTBUS2') throw new Error('invalid runtime manifest');
    if (r.min_loader && cmp(LOADER_VERSION, r.min_loader) < 0) throw new Error(`loader ${LOADER_VERSION} below required ${r.min_loader}`);
    if (!ALLOWED_RUNTIME_URL.test(String(r.url || ''))) throw new Error('runtime URL must be an immutable approved commit URL');
    if (!/^[0-9a-f]{40}$/i.test(String(r.git_blob_sha1 || ''))) throw new Error('invalid runtime blob hash');
    return r;
  }
  async function verifyRuntime(code, spec) {
    if (!code || new TextEncoder().encode(code).byteLength > MAX_RUNTIME_BYTES) throw new Error('runtime size invalid');
    if (!code.includes(`const VERSION = '${spec.version}'`) || !code.includes("const PROTOCOL = 'KTBUS2'")) throw new Error('runtime identity mismatch');
    if (!code.includes('KTBUS2_REQUEST') || !code.includes('__KTBUS_RELAY_STOP__')) throw new Error('runtime lifecycle markers missing');
    const actual = await gitBlobSha1(code);
    if (actual.toLowerCase() !== String(spec.git_blob_sha1).toLowerCase()) throw new Error(`runtime blob mismatch: ${actual}`);
  }

  function ensureBridge() {
    if (bridge?.isConnected) return;
    bridgeSecret = randomHex();
    bridge = document.createElement('span');
    bridge.id = `ktbus2-sandbox-bridge-${randomHex(8)}`;
    bridge.hidden = true;
    bridge.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(bridge);

    bridge.addEventListener('ktbus2-bridge-request', () => {
      let q;
      try { q = JSON.parse(bridge.getAttribute('data-request') || '{}'); } catch { return; }
      if (!q || q.secret !== bridgeSecret || typeof q.id !== 'string') return;
      const sync = payload => bridge.setAttribute('data-sync-response', JSON.stringify({secret:bridgeSecret,id:q.id,...payload}));
      const asyncResult = payload => {
        if (!bridge?.isConnected) return;
        bridge.setAttribute('data-async-response', JSON.stringify({secret:bridgeSecret,id:q.id,...payload}));
        bridge.dispatchEvent(new Event('ktbus2-bridge-response'));
        bridge.removeAttribute('data-async-response');
      };
      try {
        if (q.op === 'getValue') {
          const key = String(q.payload?.key || '');
          if (!key.startsWith('ktbus2-')) throw new Error('storage key denied');
          sync({ok:true,value:GM_getValue(key,q.payload?.fallback)});
          return;
        }
        if (q.op === 'setValue') {
          const key = String(q.payload?.key || '');
          if (!key.startsWith('ktbus2-')) throw new Error('storage key denied');
          GM_setValue(key,q.payload?.value);
          sync({ok:true,value:true});
          return;
        }
        if (q.op === 'xhr') {
          const url = String(q.payload?.url || '');
          if (!/^http:\/\/(?:127\.0\.0\.1|localhost):8765\/(?:healthz|api\/status)$/.test(url)) throw new Error('GM request URL denied');
          const handle = GM_xmlhttpRequest({
            method:'GET', url, timeout:Math.min(Math.max(Number(q.payload?.timeout)||5000,500),10000),
            headers:{'Cache-Control':'no-cache'},
            onload:r => { activeRequests.delete(q.id); asyncResult({ok:true,kind:'load',response:{status:r.status,statusText:r.statusText||'',responseText:String(r.responseText||''),finalUrl:r.finalUrl||url,readyState:r.readyState||4}}); },
            onerror:() => { activeRequests.delete(q.id); asyncResult({ok:false,kind:'error'}); },
            ontimeout:() => { activeRequests.delete(q.id); asyncResult({ok:false,kind:'timeout'}); },
          });
          activeRequests.set(q.id, handle);
          sync({ok:true,value:true});
          return;
        }
        if (q.op === 'xhrAbort') {
          const id = String(q.payload?.requestId || '');
          try { activeRequests.get(id)?.abort?.(); } catch {}
          activeRequests.delete(id);
          sync({ok:true,value:true});
          return;
        }
        throw new Error('bridge op denied');
      } catch (error) {
        sync({ok:false,error:String(error?.message || error)});
      }
    });
  }

  function prelude() {
    ensureBridge();
    return `
(() => {
  'use strict';
  const bridge = document.getElementById(${JSON.stringify(bridge.id)});
  const secret = ${JSON.stringify(bridgeSecret)};
  if (!bridge) throw new Error('KT-Bus sandbox bridge missing');
  let seq = 0;
  const callbacks = new Map();
  const nextId = () => 'p-' + Date.now().toString(36) + '-' + (++seq).toString(36);
  function sync(op,payload) {
    const id = nextId();
    bridge.setAttribute('data-request',JSON.stringify({secret,id,op,payload}));
    bridge.removeAttribute('data-sync-response');
    bridge.dispatchEvent(new Event('ktbus2-bridge-request'));
    const raw = bridge.getAttribute('data-sync-response') || '';
    bridge.removeAttribute('data-request'); bridge.removeAttribute('data-sync-response');
    const r = JSON.parse(raw || '{}');
    if (r.secret !== secret || r.id !== id || !r.ok) throw new Error(r.error || 'KT-Bus bridge error');
    return r.value;
  }
  bridge.addEventListener('ktbus2-bridge-response',() => {
    let r; try { r=JSON.parse(bridge.getAttribute('data-async-response')||'{}'); } catch { return; }
    if (r.secret !== secret) return;
    const cb = callbacks.get(r.id); if (!cb) return; callbacks.delete(r.id);
    if (r.kind === 'load' && r.ok) cb.onload?.(r.response);
    else if (r.kind === 'timeout') cb.ontimeout?.();
    else cb.onerror?.();
  });
  globalThis.GM_getValue=(key,fallback)=>sync('getValue',{key,fallback});
  globalThis.GM_setValue=(key,value)=>sync('setValue',{key,value});
  globalThis.GM_xmlhttpRequest=details => {
    const id=nextId();
    callbacks.set(id,{onload:details?.onload,onerror:details?.onerror,ontimeout:details?.ontimeout});
    bridge.setAttribute('data-request',JSON.stringify({secret,id,op:'xhr',payload:{url:String(details?.url||''),timeout:Number(details?.timeout)||5000}}));
    bridge.removeAttribute('data-sync-response');
    bridge.dispatchEvent(new Event('ktbus2-bridge-request'));
    const ack=JSON.parse(bridge.getAttribute('data-sync-response')||'{}');
    bridge.removeAttribute('data-request'); bridge.removeAttribute('data-sync-response');
    if (!ack.ok) { callbacks.delete(id); queueMicrotask(()=>details?.onerror?.()); }
    return {abort(){ callbacks.delete(id); try{sync('xhrAbort',{requestId:id});}catch{} }};
  };
  if (!globalThis.__KTBUS_COMPOSER_FOCUS_PATCH__) {
    const selector='#prompt-textarea, [contenteditable="true"][data-virtualkeyboard="true"], textarea';
    const focus=e => { const n=e?.target; try { if (n instanceof Element && n.matches(selector) && document.activeElement!==n) n.focus({preventScroll:true}); } catch {} };
    document.addEventListener('beforeinput',focus,true);
    document.addEventListener('input',focus,true);
    globalThis.__KTBUS_COMPOSER_FOCUS_PATCH__='1.0.0';
  }

  try { globalThis.__KTBUS_DOM_NORMALIZER_STOP__?.(); } catch {}
  let normalizeTimer=null;
  function textOf(n){ return String(n?.innerText||n?.textContent||'').trim(); }
  function assistantProvenance(turn){
    if (!(turn instanceof Element)) return false;
    if (turn.matches('[data-message-author-role="assistant"],[data-author="assistant"],[data-role="assistant"]')) return true;
    if (turn.querySelector('[data-message-author-role="assistant"],[data-author="assistant"],[data-role="assistant"]')) return true;
    if (turn.matches('[data-message-author-role="user"],[data-author="user"],[data-role="user"]')) return false;
    if (turn.querySelector('[data-message-author-role="user"],[data-author="user"],[data-role="user"]')) return false;
    if (!(turn.matches('[data-testid^="conversation-turn-"]') || turn.tagName==='ARTICLE')) return false;
    for (const n of turn.querySelectorAll('h1,h2,h3,h4,h5,h6,[aria-label]')) {
      const label=String(n.getAttribute?.('aria-label')||textOf(n)).replace(/\\s+/g,' ').trim();
      if (/^(you|user)\\s+said\\b/i.test(label)) return false;
      if (/^(chatgpt|assistant)\\s+said\\b/i.test(label)) return true;
    }
    return false;
  }
  function normalizeAssistantTurns(){
    const candidates=new Set([
      ...document.querySelectorAll('[data-message-author-role="assistant"]'),
      ...document.querySelectorAll('[data-testid^="conversation-turn-"]'),
      ...document.querySelectorAll('article')
    ]);
    for (const candidate of candidates) {
      if (!assistantProvenance(candidate)) continue;
      const turn=candidate.closest('[data-testid^="conversation-turn-"]')||candidate;
      if (turn.getAttribute('data-message-author-role')!=='assistant') turn.setAttribute('data-message-author-role','assistant');
    }
  }
  function scheduleNormalize(){
    if (normalizeTimer!==null) return;
    normalizeTimer=setTimeout(()=>{ normalizeTimer=null; normalizeAssistantTurns(); },100);
  }
  normalizeAssistantTurns();
  const normObserver=new MutationObserver(scheduleNormalize);
  normObserver.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  const normInterval=setInterval(normalizeAssistantTurns,750);
  globalThis.__KTBUS_DOM_NORMALIZER_STOP__=()=>{
    try{normObserver.disconnect();}catch{}
    try{clearInterval(normInterval);}catch{}
    if(normalizeTimer!==null){try{clearTimeout(normalizeTimer);}catch{} normalizeTimer=null;}
  };
})();
`;
  }

  function inject(code,label) {
    const el = GM_addElement('script',{type:'text/javascript',textContent:`${code}\n//# sourceURL=${label}`});
    if (!el) throw new Error(`GM_addElement failed: ${label}`);
    try { el.remove(); } catch {}
  }
  function launch(code,spec,source) {
    if (activeVersion===spec.version && activeBlob===spec.git_blob_sha1) return;
    ensureBridge();
    try { inject(`try{globalThis.__KTBUS_RELAY_STOP__?.();}catch{}`,'ktbus-stop.js'); } catch {}
    inject(prelude(),'ktbus-page-bridge.js');
    inject(code,`ktbus-runtime-${spec.version}.js`);
    activeVersion=spec.version; activeBlob=spec.git_blob_sha1;
    if (document.documentElement?.dataset) {
      document.documentElement.dataset.ktbusRelayBootstrapVersion=LOADER_VERSION;
      document.documentElement.dataset.ktbusRelayLoader='manifest-gm-add-element';
      document.documentElement.dataset.ktbusRelayManifestVersion=spec.version;
      document.documentElement.dataset.ktbusDatBridgeBundled='0.2.0';
    }
    console.info(`[KT-Bus loader] v${LOADER_VERSION} runtime v${spec.version} from ${source}`);
  }
  async function cached(which='current') {
    const prev = which==='previous';
    const code=String(GM_getValue(prev?CACHE.prevCode:CACHE.code,'')||'');
    const version=String(GM_getValue(prev?CACHE.prevVersion:CACHE.version,'')||'');
    const blob=String(GM_getValue(prev?CACHE.prevBlob:CACHE.blob,'')||'');
    if (!code || !parts(version) || !/^[0-9a-f]{40}$/i.test(blob)) return false;
    const spec={version,protocol:'KTBUS2',git_blob_sha1:blob};
    try { await verifyRuntime(code,spec); launch(code,spec,prev?'rollback-cache':'verified-cache'); return true; }
    catch(e) { console.warn(`[KT-Bus loader] ${which} cache rejected`,e); return false; }
  }
  function save(code,spec) {
    const oldCode=String(GM_getValue(CACHE.code,'')||''), oldVersion=String(GM_getValue(CACHE.version,'')||''), oldBlob=String(GM_getValue(CACHE.blob,'')||'');
    if (oldCode && oldVersion && oldBlob && oldBlob!==spec.git_blob_sha1) {
      GM_setValue(CACHE.prevCode,oldCode); GM_setValue(CACHE.prevVersion,oldVersion); GM_setValue(CACHE.prevBlob,oldBlob);
    }
    GM_setValue(CACHE.code,code); GM_setValue(CACHE.version,spec.version); GM_setValue(CACHE.blob,spec.git_blob_sha1);
  }
  async function refresh() {
    if (refreshBusy) return; refreshBusy=true;
    try {
      const spec=validateManifest(await fetchText(`${MANIFEST_URL}?t=${Date.now()}`));
      if (activeVersion===spec.version && activeBlob===spec.git_blob_sha1) return;
      const code=await fetchText(`${spec.url}?t=${Date.now()}`);
      await verifyRuntime(code,spec); save(code,spec);
      try { launch(code,spec,'verified-manifest'); } catch(e) { console.error('[KT-Bus loader] launch failed',e); await cached('previous'); }
    } catch(e) {
      console.warn('[KT-Bus loader] refresh failed',e);
      if (!activeVersion) await cached('previous');
    } finally { refreshBusy=false; }
  }

  if (document.documentElement?.dataset) {
    document.documentElement.dataset.ktbusRelayBootstrapVersion=LOADER_VERSION;
    document.documentElement.dataset.ktbusRelayLoader='manifest-gm-add-element';
    document.documentElement.dataset.ktbusDatBridgeBundled='0.2.0';
  }
  void (async()=>{ await cached('current'); await refresh(); setInterval(()=>void refresh(),POLL_MS); })();
})();
