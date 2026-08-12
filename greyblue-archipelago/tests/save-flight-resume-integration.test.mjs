import assert from "node:assert/strict";
import {
  clearSave,
  loadGame,
  saveGame,
  safeRespawn,
} from "../src/core/save.js";

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

const SAVE_KEY = "greyblue-archipelago-save-v1";

{
  const storage = new MemoryStorage();
  const sourceFlight = {
    yaw: Math.PI * 3,
    velocity: { x: 48, y: 9, z: -20 },
    airborne: true,
    landingRequested: true,
  };
  const saved = saveGame({
    seed: 77,
    position: { x: 12, y: 240, z: -31 },
    flight: sourceFlight,
  }, storage);
  assert.equal(saved.version, 3);
  assert.ok(Math.abs(saved.flight.yaw - Math.PI) < 1e-9);
  assert.deepEqual(saved.flight.velocity, { x: 48, y: 9, z: -20 });
  assert.equal(saved.flight.airborne, true);
  assert.equal(saved.flight.landingRequested, true);

  sourceFlight.velocity.x = -999;
  assert.equal(saved.flight.velocity.x, 48, "durable flight state cannot alias caller velocity");

  const loaded = loadGame(storage);
  assert.equal(loaded.version, 3);
  assert.equal(loaded.migratedFromVersion, null);
  assert.equal(loaded.flightRecovery.hadFlightField, true);
  assert.equal(loaded.flightRecovery.recoveredNeutral, false);
  assert.deepEqual(loaded.flight, saved.flight);
}

for (const version of [1, 2]) {
  const storage = new MemoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version,
    seed: 55,
    position: { x: 1, y: 160, z: 2 },
    discovered: ["isle-9"],
    discoveredRoutes: ["route:a"],
    exploration: { version: 1, events: [] },
    settings: { cameraDistance: 24 },
  }));
  const loaded = loadGame(storage);
  assert.equal(loaded.version, 3, `v${version} migrates in memory`);
  assert.equal(loaded.migratedFromVersion, version);
  assert.deepEqual(loaded.flight, {
    yaw: 0,
    velocity: { x: 0, y: 0, z: 0 },
    airborne: true,
    landingRequested: false,
  });
  assert.equal(loaded.flightRecovery.hadFlightField, false);
  assert.equal(loaded.flightRecovery.recoveredNeutral, true);
  assert.deepEqual(loaded.discovered, ["isle-9"]);
  assert.deepEqual(loaded.discoveredRoutes, ["route:a"]);
  assert.deepEqual(loaded.settings, { cameraDistance: 24 });
}

{
  const storage = new MemoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 3,
    seed: 1337,
    position: { x: 0, y: 300, z: 0 },
    recoveryCheckpoint: { x: 0, y: 160, z: 0 },
    flight: {
      yaw: "bad",
      velocity: { x: 1000, y: -999, z: 1000 },
      airborne: true,
      landingRequested: true,
    },
    discovered: ["isle-safe"],
    discoveredRoutes: [],
    exploration: { version: 1, events: [] },
    settings: { highContrast: true },
  }));
  const loaded = loadGame(storage);
  assert.equal(loaded.flight.yaw, 0);
  assert.ok(Math.hypot(loaded.flight.velocity.x, loaded.flight.velocity.z) <= 72 + 1e-9);
  assert.equal(loaded.flight.velocity.y, -24);
  assert.equal(loaded.flight.landingRequested, true);
  assert.deepEqual(loaded.discovered, ["isle-safe"], "corrupt flight values cannot poison discovery state");
  assert.deepEqual(loaded.settings, { highContrast: true }, "corrupt flight values cannot poison settings");
}

{
  const storage = new MemoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 3,
    seed: 1337,
    position: { x: 0, y: 160, z: 0 },
    flight: {
      yaw: 1.1,
      velocity: { x: 20, y: -3, z: 8 },
      airborne: false,
      landingRequested: true,
    },
    discovered: [],
    discoveredRoutes: [],
    settings: {},
  }));
  const loaded = loadGame(storage);
  assert.equal(loaded.flight.airborne, false);
  assert.deepEqual(loaded.flight.velocity, { x: 0, y: 0, z: 0 });
  assert.equal(loaded.flight.landingRequested, false, "grounded durable state cannot resurrect stale landing motion");
}

{
  const storage = new MemoryStorage();
  clearSave(storage);
  saveGame({
    seed: 1337,
    position: { x: 100, y: 220, z: 300 },
    flight: { yaw: 0.7, velocity: { x: 40, y: 8, z: 12 }, airborne: true, landingRequested: true },
  }, storage);
  const recovered = safeRespawn({
    yaw: 0.7,
    velocity: { x: 40, y: 8, z: 12 },
    airborne: true,
    landingRequested: true,
  });
  assert.deepEqual(recovered.velocity, { x: 0, y: 0, z: 0 });
  assert.equal(recovered.airborne, true);
  assert.equal(recovered.landingRequested, false, "recovery remains a zero-motion safety path independent of saved resume state");
}

console.log("save flight resume integration tests passed");
