function normalizedScale(budget) {
  const scale = Number(budget?.optionalCueCapScale);
  return Number.isFinite(scale) && scale > 0 && scale <= 1 ? scale : 1;
}

export function retainOptionalCuePrefix(items, budget, { minimumVisible = 1 } = {}) {
  if (!Array.isArray(items) || items.length === 0) return Object.freeze([]);

  const scale = normalizedScale(budget);
  const minimum = Number.isInteger(minimumVisible) && minimumVisible > 0
    ? Math.min(minimumVisible, items.length)
    : 1;
  const cap = Math.min(items.length, Math.max(minimum, Math.ceil(items.length * scale)));

  return Object.freeze(items.slice(0, cap));
}
