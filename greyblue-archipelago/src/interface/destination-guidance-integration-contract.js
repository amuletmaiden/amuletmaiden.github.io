import { createDestinationGuidanceLiveSurface } from './destination-guidance-live-surface.js';

export function createDestinationGuidanceIntegrationContract(options = {}) {
  const surface = createDestinationGuidanceLiveSurface(options);
  const publishReceipt = typeof options.publishReceipt === 'function' ? options.publishReceipt : null;
  let disposed = false;
  let updateCount = 0;
  let receiptCount = 0;
  let lastReceipt = freeze({ status: 'idle', changed: false, destinationId: null, phase: 'none' });

  function update(frame = {}) {
    if (disposed) return snapshot('disposed', false);

    const result = surface.update({
      guidance: frame.guidance,
      mountState: frame.mountState,
      headingDegrees: finite(frame.headingDegrees, 0),
      viewportWidth: finite(frame.viewportWidth, frame.mountState?.viewportWidth ?? 1280),
    });

    updateCount += 1;
    const presentation = result.presentation;
    const receipt = freeze({
      status: result.reason,
      changed: Boolean(result.changed),
      destinationId: text(presentation?.destination?.id),
      phase: text(presentation?.destination?.phase) ?? 'none',
      visible: Boolean(presentation?.visible),
      announced: Boolean(presentation?.announcement),
      soundHookId: text(presentation?.soundHookId),
    });

    if (!sameReceipt(lastReceipt, receipt)) {
      lastReceipt = receipt;
      receiptCount += 1;
      safelyPublish(publishReceipt, receipt);
    }

    return snapshot(result.reason, result.changed);
  }

  function clear() {
    if (disposed) return snapshot('disposed', false);
    const result = surface.clear();
    lastReceipt = freeze({ status: 'cleared', changed: true, destinationId: null, phase: 'none', visible: false, announced: false, soundHookId: null });
    receiptCount += 1;
    safelyPublish(publishReceipt, lastReceipt);
    return snapshot(result.reason, result.changed);
  }

  function dispose() {
    if (!disposed) surface.dispose();
    disposed = true;
    return snapshot('disposed', true);
  }

  function snapshot(reason, changed) {
    return freeze({
      reason,
      changed: Boolean(changed),
      disposed,
      receipt: lastReceipt,
      telemetry: freeze({ updateCount, receiptCount }),
    });
  }

  return freeze({ update, clear, dispose, inspect: () => snapshot('inspect', false) });
}

function sameReceipt(a, b) {
  return a.status === b.status
    && a.changed === b.changed
    && a.destinationId === b.destinationId
    && a.phase === b.phase
    && a.visible === b.visible
    && a.announced === b.announced
    && a.soundHookId === b.soundHookId;
}

function safelyPublish(publishReceipt, receipt) {
  if (!publishReceipt) return;
  try {
    publishReceipt(receipt);
  } catch {
    // Integration telemetry must never interrupt the player-facing surface.
  }
}

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
