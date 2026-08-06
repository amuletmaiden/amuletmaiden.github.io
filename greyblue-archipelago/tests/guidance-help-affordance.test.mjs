import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidanceHelpAffordance } from '../src/interface/guidance-help-affordance.js';

test('starts closed with explicit keyboard-discoverable semantics', () => {
  const help = createGuidanceHelpAffordance();
  const state = help.inspect();
  assert.equal(state.open, false);
  assert.equal(state.trigger.label, 'Guidance help');
  assert.equal(state.trigger.expanded, false);
  assert.equal(state.trigger.shortcut, 'G');
  assert.equal(state.panel.hidden, true);
  assert.equal(state.panel.role, 'region');
  assert.match(state.panel.text, /Press G/);
});

test('toggle action opens and closes with bounded announcements', () => {
  const events = [];
  const help = createGuidanceHelpAffordance({ publish: event => events.push(event) });
  const opened = help.dispatch({ type: 'toggle-help' });
  assert.equal(opened.open, true);
  assert.equal(opened.trigger.expanded, true);
  assert.equal(opened.panel.hidden, false);
  assert.equal(events.at(-1).text, 'Guidance help opened.');
  const closed = help.dispatch({ type: 'toggle-help' });
  assert.equal(closed.open, false);
  assert.equal(events.at(-1).text, 'Guidance help closed.');
});

test('configured shortcut is normalized and routed deterministically', () => {
  const help = createGuidanceHelpAffordance({ shortcut: 'h' });
  assert.equal(help.inspect().shortcut, 'H');
  assert.equal(help.dispatch({ type: 'shortcut', key: 'g' }).reason, 'ignored-shortcut');
  assert.equal(help.dispatch({ type: 'shortcut', key: 'h' }).open, true);
});

test('escape closes but does not churn an already closed panel', () => {
  const help = createGuidanceHelpAffordance({ open: true });
  const closed = help.dispatch({ type: 'escape' });
  assert.equal(closed.open, false);
  assert.equal(closed.changed, true);
  const repeated = help.dispatch({ type: 'escape' });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.reason, 'unchanged');
});

test('focus state is explicit and duplicate focus is suppressed', () => {
  const help = createGuidanceHelpAffordance();
  const focused = help.dispatch({ type: 'focus', controlId: 'guidance-mode-standard' });
  assert.equal(focused.focusedControl, 'guidance-mode-standard');
  assert.equal(focused.changed, true);
  const repeated = help.dispatch({ type: 'focus', controlId: 'guidance-mode-standard' });
  assert.equal(repeated.reason, 'unchanged-focus');
  assert.equal(repeated.changed, false);
  assert.equal(help.dispatch({ type: 'blur' }).focusedControl, null);
});

test('malformed and unsupported actions remain inert', () => {
  const help = createGuidanceHelpAffordance();
  assert.equal(help.dispatch(null).reason, 'unsupported-action');
  assert.equal(help.dispatch({ type: 'focus', controlId: '   ' }).reason, 'invalid-focus');
  assert.equal(help.dispatch({ type: 'unknown' }).changed, false);
});

test('publisher failures never interrupt player interaction', () => {
  const help = createGuidanceHelpAffordance({ publish() { throw new Error('detached live region'); } });
  assert.doesNotThrow(() => help.dispatch({ type: 'open-help' }));
  assert.equal(help.inspect().open, true);
});

test('dispose clears transient state and makes actions inert', () => {
  const help = createGuidanceHelpAffordance({ open: true });
  help.dispatch({ type: 'focus', controlId: 'guidance-help-trigger' });
  const disposed = help.dispose();
  assert.equal(disposed.disposed, true);
  assert.equal(disposed.open, false);
  assert.equal(disposed.focusedControl, null);
  assert.equal(help.dispatch({ type: 'toggle-help' }).reason, 'disposed');
});

test('snapshots are immutable and JSON safe', () => {
  const help = createGuidanceHelpAffordance();
  const state = help.inspect();
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.trigger));
  assert.ok(Object.isFrozen(state.panel));
  assert.doesNotThrow(() => JSON.stringify(state));
});
