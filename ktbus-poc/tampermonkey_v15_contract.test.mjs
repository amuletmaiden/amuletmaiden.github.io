import fs from 'node:fs';
import assert from 'node:assert/strict';

const bootstrap = fs.readFileSync(new URL('./chatgpt_ktbus_poc.user.js', import.meta.url), 'utf8');
const patch = fs.readFileSync(new URL('./chatgpt_composer_focus_patch.js', import.meta.url), 'utf8');

assert.match(bootstrap, /@version\s+1\.5\.0/);
assert.match(bootstrap, /@sandbox\s+DOM/);
assert.doesNotMatch(bootstrap, /GM_openInTab/);
assert.doesNotMatch(bootstrap, /new Function|\beval\s*\(/);

const requires = [...bootstrap.matchAll(/^\/\/ @require\s+(\S+)/gm)].map(match => match[1]);
assert.equal(requires.length, 3);
assert.match(requires[0], /\/fd28f5a41a2e0befb0e2ec51a81c53bd17459998\/ktbus-poc\/chatgpt_composer_focus_patch\.js$/);
assert.match(requires[1], /\/6675b091ccfee9b80549364f892ea26ff5f3f29c\/ktbus-poc\/chatgpt_ktbus_runtime\.js$/);
assert.match(requires[2], /\/205ebffc9c2436ef85fcde049bbb0e5a21be91d3\/ktbus-poc\/chatgpt_dat_bridge\.user\.js$/);
for (const url of requires) assert.match(url, /githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\//);

assert.match(patch, /document\.addEventListener\('beforeinput', ensureFocused, true\)/);
assert.match(patch, /document\.addEventListener\('input', ensureFocused, true\)/);
assert.match(patch, /node\.focus\(\{preventScroll: true\}\)/);
assert.doesNotMatch(patch, /prototype\.|MutationObserver|setInterval|setTimeout/);

console.log('Tampermonkey v1.5 contract: PASS');
