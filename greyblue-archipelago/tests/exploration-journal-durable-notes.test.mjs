import assert from 'node:assert/strict';
import test from 'node:test';
import { createExplorationJournalState, stepExplorationJournal } from '../src/core/exploration-journal-model.js';

test('durable field notes repopulate the visible journal after reload-style empty session state', () => {
  const previous = createExplorationJournalState();
  const result = stepExplorationJournal(previous, {
    journalFieldNotes: [
      'Investigated: The Hushed Bell · drowned bell — drowned bell answers the weather of The Hushed Reach.',
    ],
    discovered: [],
    discoveredCount: 3,
    discoveredRouteCount: 1,
  });
  assert.deepEqual(result.view.discoveries, [
    'Investigated: The Hushed Bell · drowned bell — drowned bell answers the weather of The Hushed Reach.',
  ]);
  assert.equal(result.view.announcement, null);
});

test('current-session discoveries remain announcements while durable notes keep priority', () => {
  const result = stepExplorationJournal(createExplorationJournalState(), {
    latestDiscovery: { islandId: 'isle-4', name: 'The Rainbound Needle', discoveredAt: 12 },
    journalFieldNotes: ['Investigated: The Hushed Bell — the bell answers.'],
    discovered: ['isle-4'],
    discoveredCount: 4,
    discoveredRouteCount: 1,
  });
  assert.equal(result.view.announcement, 'Discovered The Rainbound Needle');
  assert.deepEqual(result.view.discoveries, [
    'Investigated: The Hushed Bell — the bell answers.',
    'Discovered The Rainbound Needle',
  ]);
});

test('visible journal remains capped and duplicate durable labels collapse', () => {
  const result = stepExplorationJournal({
    discoveries: ['Session one', 'Session two', 'Session three'],
  }, {
    journalFieldNotes: ['Earned note', 'Earned note', 'Second earned note', 'Third earned note'],
  });
  assert.deepEqual(result.view.discoveries, [
    'Earned note',
    'Second earned note',
    'Third earned note',
    'Session one',
    'Session two',
  ]);
});
