import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('./chatgpt_ktbus_runtime.js', import.meta.url), 'utf8');

assert.match(runtime, /const VERSION = '0\.10\.0'/);
assert.match(runtime, /const PIN = '[0-9a-f]{40}'/);
assert.ok(runtime.includes('205ebffc9c2436ef85fcde049bbb0e5a21be91d3'));
assert.ok(runtime.includes('KTBUS2_REQUEST'));
assert.ok(runtime.includes('__KTBUS_RELAY_STOP__'));
assert.ok(runtime.includes('chatgpt_dat_bridge.user.js'));
assert.ok(runtime.includes('DAT_POC_REQUEST'));
assert.ok(runtime.includes('attach_local'));
assert.ok(runtime.includes('__KTBUS_DAT_EMBEDDED_STOP__'));
assert.ok(runtime.includes('observer.disconnect()'));
assert.ok(runtime.includes('clearInterval(__ktbusDatTimer)'));
assert.equal(runtime.includes('/main/ktbus-poc'), false, 'runtime dependencies must be immutable/pinned');

console.log('runtime wrapper v0.10 contract ok');
