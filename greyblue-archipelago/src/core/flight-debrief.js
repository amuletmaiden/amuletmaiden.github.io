const ORDER = Object.freeze(['mystery','survey','crossing','weather','terrain','low-flight']);
const COPY = Object.freeze({
  mystery: 'You carried a question through the mist.',
  survey: 'You returned with the shape of the islands clearer.',
  crossing: 'You crossed open air and made landfall.',
  weather: 'You flew the full weather column.',
  terrain: 'You threaded the land by feel.',
  'low-flight': 'You held a close, fast line over the world.',
});

function normalizeCategory(value) {
  return ORDER.includes(value) ? value : null;
}

export function createFlightDebriefSession() {
  let categories = new Set();
  let activeOuting = false;

  function beginAirborne() {
    activeOuting = true;
    return snapshot();
  }

  function record(value) {
    const category = normalizeCategory(value);
    if (!activeOuting || !category) return snapshot();
    categories.add(category);
    return snapshot();
  }

  function reset() {
    categories = new Set();
    activeOuting = false;
    return snapshot();
  }

  function resolve({ safe = false, restoring = false, recovering = false } = {}) {
    if (!safe || restoring || recovering || !activeOuting || categories.size === 0) {
      return Object.freeze({ completed: false, lines: Object.freeze([]), text: '' });
    }
    const ordered = ORDER.filter((category) => categories.has(category));
    const lines = Object.freeze(ordered.map((category) => COPY[category]));
    const text = lines.length === 1
      ? lines[0]
      : `${lines.slice(0, -1).join(' ')} ${lines.at(-1)}`;
    reset();
    return Object.freeze({ completed: true, lines, text });
  }

  function snapshot() {
    return Object.freeze({
      active: activeOuting,
      categories: Object.freeze(ORDER.filter((category) => categories.has(category))),
    });
  }

  return Object.freeze({ beginAirborne, record, resolve, reset, snapshot });
}
