const MAX_ID = 120;
const PURPOSE_CLASSES = Object.freeze({
  landmark: 'resonance',
  frontier: 'clearing',
  roost: 'warmth',
  familiar: 'hush',
});

function cleanId(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_ID) : '';
}

function cleanPurpose(value) {
  return Object.prototype.hasOwnProperty.call(PURPOSE_CLASSES, value) ? value : '';
}

export function idleExpeditionArrivalConsequence() {
  return Object.freeze({ active: false, phase: 'idle' });
}

export function deriveExpeditionArrivalConsequence({
  before = null,
  after = null,
  completion = null,
  reducedMotion = false,
} = {}) {
  const routeId = cleanId(completion?.routeId);
  if (!routeId) return idleExpeditionArrivalConsequence();

  const beforeRouteId = cleanId(before?.routeId);
  const afterRouteId = cleanId(after?.routeId);
  const purpose = cleanPurpose(before?.purpose);
  if (!before?.active || before?.phase !== 'crossing' || beforeRouteId !== routeId || !purpose) {
    return idleExpeditionArrivalConsequence();
  }
  if (!after?.active || after?.phase !== 'arrived' || afterRouteId !== routeId) {
    return idleExpeditionArrivalConsequence();
  }

  return Object.freeze({
    active: true,
    phase: 'responding',
    class: PURPOSE_CLASSES[purpose],
    routeId,
    durationMs: reducedMotion ? 1800 : 3200,
    cooldownMs: 1200,
  });
}

export function expeditionArrivalLine(consequence) {
  if (!consequence?.active || consequence.phase !== 'responding') return null;
  if (consequence.class === 'resonance') return 'The mist answers with a low resonance.';
  if (consequence.class === 'clearing') return 'The mist loosens around the new shore.';
  if (consequence.class === 'warmth') return 'The air softens with the sense of a known refuge.';
  if (consequence.class === 'hush') return 'The crossing settles into a brief hush.';
  return null;
}

export function expeditionArrivalCooldown(consequence) {
  const routeId = cleanId(consequence?.routeId);
  const consequenceClass = typeof consequence?.class === 'string' ? consequence.class : '';
  if (!routeId || !Object.values(PURPOSE_CLASSES).includes(consequenceClass)) return idleExpeditionArrivalConsequence();
  return Object.freeze({
    active: false,
    phase: 'cooldown',
    class: consequenceClass,
    routeId,
    cooldownMs: 1200,
  });
}
