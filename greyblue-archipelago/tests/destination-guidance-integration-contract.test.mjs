import assert from 'node:assert/strict';
import test from 'node:test';
import { createDestinationGuidanceIntegrationContract } from '../src/interface/destination-guidance-integration-contract.js';

function makeElement() {
  return {
    hidden: false,
    textContent: '',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) { return this.children?.[selector] ?? null; },
  };
}

function makeDocument() {
  const root = makeElement();
  root.children = {
    '[data-greyblue-guidance-label]': makeElement(),
    '[data-greyblue-guidance-status]': makeElement(),
    '[data-greyblue-guidance-live]': makeElement(),
  };
  return { root, documentRef: { querySelector: selector => selector === '[data-greyblue-guidance]' ? root : null } };
}

function makeFrame() {
  return {
    guidance: {
      destination: {
        id: 'bell-spire', name: 'Bell Spire', bearingDegrees: 20,
        distanceBand: 'near', phase: 'approach', motion: 'subtle',
        soundHookId: 'guidance:bell-spire',
      },
      announcement: null,
    },
    mountState: {
      viewportWidth: 1280,
      session: { settings: { verbosity: 'standard', reducedMotion: false, soundEnabled: true } },
    },
    headingDegrees: 0,
    viewportWidth: 1280,
  };
}

test('publishes a bounded immutable integration receipt', () => {
  const dom = makeDocument();
  const receipts = [];
  const contract = createDestinationGuidanceIntegrationContract({ documentRef: dom.documentRef, publishReceipt: value => receipts.push(value) });
  const result = contract.update(makeFrame());
  assert.equal(result.reason, 'rendered');
  assert.equal(result.receipt.destinationId, 'bell-spire');
  assert.equal(result.receipt.phase, 'approach');
  assert.equal(result.receipt.visible, true);
  assert.ok(Object.isFrozen(result.receipt));
  assert.equal(receipts.length, 1);
});

test('equivalent repeated frames suppress duplicate receipt churn', () => {
  const receipts = [];
  const contract = createDestinationGuidanceIntegrationContract({ documentRef: makeDocument().documentRef, publishReceipt: value => receipts.push(value) });
  contract.update(makeFrame());
  const repeated = contract.update(makeFrame());
  assert.equal(repeated.reason, 'unchanged');
  assert.equal(repeated.telemetry.updateCount, 2);
  assert.equal(receipts.length, 2);
  contract.update(makeFrame());
  assert.equal(receipts.length, 2);
});

test('malformed numeric values recover without interruption', () => {
  const contract = createDestinationGuidanceIntegrationContract({ documentRef: makeDocument().documentRef });
  const frame = makeFrame();
  frame.headingDegrees = 'unknown';
  frame.viewportWidth = null;
  assert.doesNotThrow(() => contract.update(frame));
});

test('clear publishes a bounded cleared receipt', () => {
  const receipts = [];
  const contract = createDestinationGuidanceIntegrationContract({ documentRef: makeDocument().documentRef, publishReceipt: value => receipts.push(value) });
  contract.update(makeFrame());
  const result = contract.clear();
  assert.equal(result.reason, 'cleared');
  assert.equal(result.receipt.phase, 'none');
  assert.equal(result.receipt.visible, false);
  assert.equal(receipts.at(-1).status, 'cleared');
});

test('dispose makes subsequent updates inert', () => {
  const contract = createDestinationGuidanceIntegrationContract({ documentRef: makeDocument().documentRef });
  contract.update(makeFrame());
  contract.dispose();
  const result = contract.update(makeFrame());
  assert.equal(result.reason, 'disposed');
  assert.equal(result.disposed, true);
});

test('missing DOM remains a valid integration state', () => {
  const contract = createDestinationGuidanceIntegrationContract({ documentRef: null });
  const result = contract.update(makeFrame());
  assert.equal(result.reason, 'rendered');
  assert.equal(result.receipt.destinationId, 'bell-spire');
});

test('inspection is immutable and JSON safe', () => {
  const contract = createDestinationGuidanceIntegrationContract({ documentRef: makeDocument().documentRef });
  contract.update(makeFrame());
  const snapshot = contract.inspect();
  assert.ok(Object.isFrozen(snapshot));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});
