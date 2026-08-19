(() => {
  'use strict';

  const VERSION = '1.0.0';
  const SELECTOR = '#prompt-textarea, [contenteditable="true"][data-virtualkeyboard="true"], textarea';

  function isComposer(node) {
    try {
      return node instanceof Element && node.matches(SELECTOR);
    } catch {
      return false;
    }
  }

  function ensureFocused(event) {
    const node = event?.target;
    if (!isComposer(node)) return;
    try {
      if (document.activeElement !== node) node.focus({preventScroll: true});
    } catch {
      try { node.focus(); } catch {}
    }
  }

  // KTBUS2 v0.9 dispatches a synthetic `input` event after mutating the
  // composer. Its top-level path accidentally stopped focusing the composer,
  // which ChatGPT's editor needs before it treats the mutation as a sendable
  // turn. A capture listener runs before ChatGPT's own input handlers and
  // restores the v0.6/v0.8 focus-before-input invariant without monkeypatching
  // DOM prototypes or changing the persisted KTBUS2 scheduling state.
  document.addEventListener('beforeinput', ensureFocused, true);
  document.addEventListener('input', ensureFocused, true);

  globalThis.__KTBUS_COMPOSER_FOCUS_PATCH__ = VERSION;
  console.info(`[KT-Bus relay] composer focus patch v${VERSION} loaded`);
})();
