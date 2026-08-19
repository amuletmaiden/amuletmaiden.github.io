import assert from 'node:assert/strict';
import {
  READ_TOOLS,
  ReplayWindow,
  forwardEnvelope,
  makeDispatchEnvelope,
  validateReadRequest,
} from './relay_contract_v07.js';

assert.deepEqual([...READ_TOOLS], [
  'status', 'files_list', 'files_stat', 'files_read', 'files_search', 'browser_read_url',
]);

const read = validateReadRequest({
  id: 'read-001', op: 'local_read', tool: 'files_read',
  arguments: {root: 'web-diagnostics', path: 'web_bridge.log', max_chars: 4000},
});
assert.equal(read.tool, 'files_read');
assert.throws(() => validateReadRequest({
  id: 'bad', op: 'local_read', tool: 'shell', arguments: {},
}));
assert.throws(() => validateReadRequest({
  id: 'bad2', op: 'local_read', tool: 'files_read', arguments: {command: 'whoami'},
}));

const e1 = makeDispatchEnvelope({
  id: 'dispatch-001', origin_chat_id: '12345678-abcd',
  target_chat_id: '87654321-dcba', ttl: 2, message: 'continue safely',
});
const e2 = forwardEnvelope(e1, 'aaaaaaaa-bbbb');
assert.equal(e2.ttl, 1);
assert.throws(() => forwardEnvelope(e2, 'cccccccc-dddd'));

const replay = new ReplayWindow(2);
assert.equal(replay.claim('a'), true);
assert.equal(replay.claim('a'), false);
assert.equal(replay.claim('b'), true);
assert.equal(replay.claim('c'), true);
assert.equal(replay.claim('a'), true); // oldest entry was evicted

console.log('relay_contract_v07: ok');
