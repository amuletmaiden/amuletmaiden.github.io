import {
  createTouchdownContactFeedbackState,
  publicTouchdownContactFeedback,
  stepTouchdownContactFeedback,
} from './touchdown-contact-feedback.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let feedbackState = createTouchdownContactFeedbackState();
let disposed = false;
let visualAnimation = null;

const copy = Object.freeze({
  soft: 'Soft touchdown.',
  firm: 'Firm touchdown.',
  impact: 'Hard contact.',
});

const soundHook = Object.freeze({
  soft: 'omen-shared-silence',
  firm: 'omen-measured-weather',
  impact: 'omen-same-door',
});

function reducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

function highContrast() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-contrast: more)')?.matches); } catch { return false; }
}

function ensureNode() {
  let node = document.querySelector('[data-greyblue-touchdown-contact]');
  if (node) return node;
  node = document.createElement('div');
  node.setAttribute('data-greyblue-touchdown-contact', '');
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.setAttribute('aria-atomic', 'true');
  node.hidden = true;
  Object.assign(node.style, {
    position: 'fixed',
    left: '50%',
    bottom: '5.5rem',
    transform: 'translateX(-50%)',
    padding: '0.35rem 0.65rem',
    borderRadius: '999px',
    pointerEvents: 'none',
    font: '600 0.78rem/1.2 system-ui, sans-serif',
    letterSpacing: '0.035em',
    background: 'rgba(10, 18, 28, 0.58)',
    color: 'rgba(240, 247, 255, 0.92)',
    border: '1px solid rgba(214, 232, 255, 0.3)',
    backdropFilter: 'blur(4px)',
    zIndex: '8',
  });
  (document.querySelector('#hud') ?? document.body).append(node);
  return node;
}

function buildFrame(state) {
  return {
    ready: state?.ready === true,
    paused: state?.paused === true,
    restorePublishing: Boolean(state?.restorePublishing || state?.explorationRestorePublishing),
    recovery: state?.collision?.requiresRecovery === true || state?.flight?.mode === 'recovery',
    airborne: state?.flight?.airborne === true && state?.collision?.grounded !== true,
    grounded: state?.collision?.grounded === true,
    collisionReason: state?.collision?.reason,
    speed: state?.flight?.speed,
  };
}

function present(view) {
  globalThis.__greyblueTouchdownContact = view;
  if (!view.active) return;

  const node = ensureNode();
  const line = copy[view.kind] ?? '';
  if (node && line) {
    visualAnimation?.cancel?.();
    visualAnimation = null;
    node.hidden = false;
    node.dataset.kind = view.kind;
    node.textContent = line;
    if (highContrast()) {
      node.style.background = 'rgba(4, 9, 16, 0.9)';
      node.style.borderColor = 'rgba(255, 255, 255, 0.78)';
    } else {
      node.style.background = 'rgba(10, 18, 28, 0.58)';
      node.style.borderColor = 'rgba(214, 232, 255, 0.3)';
    }

    if (!reducedMotion() && typeof node.animate === 'function') {
      visualAnimation = node.animate(
        [
          { opacity: 0, transform: 'translateX(-50%) translateY(5px)' },
          { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
          { opacity: 1, transform: 'translateX(-50%) translateY(0)', offset: 0.7 },
          { opacity: 0, transform: 'translateX(-50%) translateY(-2px)' },
        ],
        { duration: 820, easing: 'ease-out' },
      );
      visualAnimation.addEventListener('finish', () => {
        if (node.dataset.kind !== view.kind) return;
        node.hidden = true;
        node.textContent = '';
      }, { once: true });
    } else {
      node.hidden = true;
    }
  }

  const hook = soundHook[view.kind];
  if (hook) {
    globalThis.dispatchEvent?.(new CustomEvent('greyblue:omen-listened', {
      detail: Object.freeze({ soundHook: hook, source: 'touchdown-contact' }),
    }));
  }

  globalThis.dispatchEvent?.(new CustomEvent('greyblue:touchdown-contact', { detail: view }));
}

function apply(state) {
  feedbackState = stepTouchdownContactFeedback(feedbackState, buildFrame(state));
  present(publicTouchdownContactFeedback(feedbackState));
}

const initialView = publicTouchdownContactFeedback(feedbackState);
globalThis.__greyblueTouchdownContact = initialView;

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      if (!disposed) apply(currentState);
    },
  });
}

if (currentState) apply(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  visualAnimation?.cancel?.();
  visualAnimation = null;
  document.querySelector('[data-greyblue-touchdown-contact]')?.remove();
  delete globalThis.__greyblueTouchdownContact;
}, { once: true });
