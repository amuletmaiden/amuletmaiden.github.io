const ENCOUNTER_CLASSES = new Set(['resonance', 'instrument', 'relic', 'threshold']);

export function deriveLandmarkSoundSignature({ active = false, encounterClass = null } = {}) {
  if (active !== true || !ENCOUNTER_CLASSES.has(encounterClass)) return null;
  return Object.freeze({ encounterClass });
}
