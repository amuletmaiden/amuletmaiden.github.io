import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/core/save.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { saveGame, loadGame, saveSettingsPatch } = await import(moduleUrl);

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

{
  const storage = new MemoryStorage();
  saveGame({
    seed: 1337,
    position: { x: 10, y: 170, z: -20 },
    discovered: ['isle-1'],
    settings: { cameraDistance: 24 },
  }, storage);

  assert.equal(saveSettingsPatch({ hudDensity: 'expanded' }, storage), true);
  const patched = loadGame(storage);
  assert.equal(patched.settings.cameraDistance, 24);
  assert.equal(patched.settings.hudDensity, 'expanded');
  assert.deepEqual(patched.position, { x: 10, y: 170, z: -20 }, 'settings-only patch cannot disturb canonical world state');
  assert.deepEqual(patched.discovered, ['isle-1']);

  saveGame({
    seed: 1337,
    position: { x: 14, y: 175, z: -22 },
    discovered: ['isle-1'],
    settings: { cameraDistance: 30 },
  }, storage);
  const autosaved = loadGame(storage);
  assert.equal(autosaved.settings.cameraDistance, 30, 'new explicitly supplied settings win');
  assert.equal(autosaved.settings.hudDensity, 'expanded', 'generic autosave preserves unrelated canonical settings');
}

{
  const storage = new MemoryStorage();
  assert.equal(saveSettingsPatch({ hudDensity: 'expanded' }, storage), false, 'no parallel settings-only save is created before canonical save exists');
  assert.equal(storage.data.size, 0);
}

{
  const storage = new MemoryStorage();
  storage.setItem('greyblue-archipelago-save-v1', '{not json');
  assert.equal(saveSettingsPatch({ hudDensity: 'expanded' }, storage), false, 'corrupt canonical save fails closed');
}

console.log('hud settings persistence tests passed');
