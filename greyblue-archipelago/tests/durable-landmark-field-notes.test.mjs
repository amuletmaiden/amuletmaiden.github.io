import assert from "node:assert/strict";
import test from "node:test";
import { deriveDurableLandmarkFieldNotes } from "../src/core/durable-landmark-field-notes.js";

function island(index, overrides = {}) {
  const id = `isle-${index}`;
  const regionId = overrides.regionId ?? "hushed-reach";
  return {
    id,
    regionId,
    x: index * 100,
    hidden: `secret-${index}`,
    landmarkRecord: {
      id: `${id}:landmark`,
      title: `The Veiled Bell ${index}`,
      kind: "drowned bell",
      clue: "private clue",
      encounter: {
        revealText: `drowned bell ${index} answers the weather of The Hushed Reach.`,
        triggerRadius: 230,
        approachBearing: 1.3,
        minimumAltitude: 80,
      },
    },
    ...overrides,
  };
}

function event(index, overrides = {}) {
  return {
    kind: "landmark-investigated",
    landmarkId: `isle-${index}:landmark`,
    regionId: "hushed-reach",
    ...overrides,
  };
}

test("reload-style durable investigation evidence becomes authored field notes", () => {
  const result = deriveDurableLandmarkFieldNotes({
    islands: [island(0)],
    discoveredIslandIds: ["isle-0"],
    explorationEvents: [event(0)],
  });
  assert.deepEqual(result, [
    "Investigated: The Veiled Bell 0 — drowned bell 0 answers the weather of The Hushed Reach.",
  ]);
});

test("undiscovered, wrong-region, malformed, and duplicate evidence fail closed", () => {
  const result = deriveDurableLandmarkFieldNotes({
    islands: [island(0), island(1), island(2)],
    discoveredIslandIds: ["isle-0", "isle-1"],
    explorationEvents: [
      event(0),
      event(0),
      event(1, { regionId: "wrong-region" }),
      event(2),
      { kind: "landmark-investigated", landmarkId: null, regionId: "hushed-reach" },
      { kind: "something-else", landmarkId: "isle-1:landmark", regionId: "hushed-reach" },
    ],
  });
  assert.deepEqual(result, [
    "Investigated: The Veiled Bell 0 — drowned bell 0 answers the weather of The Hushed Reach.",
  ]);
});

test("newest five unique known investigations are retained", () => {
  const islands = Array.from({ length: 7 }, (_, index) => island(index));
  const result = deriveDurableLandmarkFieldNotes({
    islands,
    discoveredIslandIds: islands.map(({ id }) => id),
    explorationEvents: islands.map((_, index) => event(index)),
  });
  assert.equal(result.length, 5);
  assert.match(result[0], /Veiled Bell 6/);
  assert.match(result[4], /Veiled Bell 2/);
});

test("projection strips geometry and does not mutate callers", () => {
  const islands = [island(0)];
  const events = [event(0)];
  const beforeIslands = JSON.stringify(islands);
  const beforeEvents = JSON.stringify(events);
  const [note] = deriveDurableLandmarkFieldNotes({
    islands,
    discoveredIslandIds: new Set(["isle-0"]),
    explorationEvents: events,
  });
  assert.equal(note.includes("230"), false);
  assert.equal(note.includes("1.3"), false);
  assert.equal(note.includes("secret-0"), false);
  assert.equal(JSON.stringify(islands), beforeIslands);
  assert.equal(JSON.stringify(events), beforeEvents);
});
