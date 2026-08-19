// ==UserScript==
// @name         KT-Bus ChatGPT Browser Relay POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      1.5.1
// @description  Guarded KT-Bus + DAT relay in Tampermonkey's DOM sandbox with repaired ChatGPT turn sending and message detection.
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

  // KTBUS2 v0.9 deliberately scans only DOM nodes explicitly classified as
  // assistant messages. ChatGPT's current turn containers do not always retain
  // data-message-author-role="assistant", so normalize only turns with
  // independent assistant provenance. User turns are never promoted.
  const root = document.documentElement;
  let runs = 0;
  let tagged = 0;

  function textOf(node) {
    return String(node?.innerText || node?.textContent || '').trim();
  }

  function hasAssistantProvenance(turn) {
    if (!(turn instanceof Element)) return false;
    if (turn.matches('[data-message-author-role="assistant"], [data-author="assistant"], [data-role="assistant"]')) return true;
    if (turn.querySelector('[data-message-author-role="assistant"], [data-author="assistant"], [data-role="assistant"]')) return true;
    if (turn.matches('[data-message-author-role="user"], [data-author="user"], [data-role="user"]')) return false;
    if (turn.querySelector('[data-message-author-role="user"], [data-author="user"], [data-role="user"]')) return false;

    const labelled = turn.matches('[data-testid^="conversation-turn-"]') || turn.tagName === 'ARTICLE';
    if (!labelled) return false;
    for (const node of turn.querySelectorAll('h1,h2,h3,h4,h5,h6,[aria-label]')) {
      const label = String(node.getAttribute?.('aria-label') || textOf(node)).replace(/\s+/g, ' ').trim();
      if (/^(you|user)\s+said\b/i.test(label)) return false;
      if (/^(chatgpt|assistant)\s+said\b/i.test(label)) return true;
    }
    return false;
  }

  function normalizeAssistantTurns() {
    runs += 1;
    const candidates = new Set([
      ...document.querySelectorAll('[data-message-author-role="assistant"]'),
      ...document.querySelectorAll('[data-testid^="conversation-turn-"]'),
      ...document.querySelectorAll('article'),
    ]);
    let found = 0;
    for (const candidate of candidates) {
      if (!hasAssistantProvenance(candidate)) continue;
      found += 1;
      const turn = candidate.closest('[data-testid^="conversation-turn-"]') || candidate;
      if (turn.getAttribute('data-message-author-role') !== 'assistant') {
        turn.setAttribute('data-message-author-role', 'assistant');
        tagged += 1;
      }
    }
    try {
      root.dataset.ktbusRelayBootstrapVersion = '1.5.1';
      root.dataset.ktbusRelayLoader = 'tampermonkey-require';
      root.dataset.ktbusRelayComposerPatch = String(globalThis.__KTBUS_COMPOSER_FOCUS_PATCH__ || 'missing');
      root.dataset.ktbusDatBridgeBundled = '0.2.0';
      root.dataset.ktbusRelayNormalizer = 'active';
      root.dataset.ktbusRelayNormalizerRuns = String(runs);
      root.dataset.ktbusRelayAssistantTurns = String(found);
      root.dataset.ktbusRelayAssistantTurnsTagged = String(tagged);
      root.dataset.ktbusRelayRuntimeLoaded = root.dataset.ktbusRelayRuntimeVersion ? 'true' : 'false';
    } catch {}
  }

  try { globalThis.__KTBUS_DOM_NORMALIZER_STOP__?.(); } catch {}
  normalizeAssistantTurns();
  const observer = new MutationObserver(() => queueMicrotask(normalizeAssistantTurns));
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  const interval = setInterval(normalizeAssistantTurns, 750);
  globalThis.__KTBUS_DOM_NORMALIZER_STOP__ = () => {
    try { observer.disconnect(); } catch {}
    try { clearInterval(interval); } catch {}
  };

  console.info('[KT-Bus relay] bootstrap v1.5.1 loaded with composer repair + assistant-turn normalization + pinned KTBUS2/DAT bridges');
})();
