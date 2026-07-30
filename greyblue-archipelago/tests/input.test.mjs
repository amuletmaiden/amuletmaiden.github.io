import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/flight/input.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { FlightInput, normalizeGamepad } = await import(moduleUrl);

{
  const input = new FlightInput();
  input.keyDown("KeyW");
  input.keyDown("KeyA");
  input.keyDown("Space");
  const sample = input.sample();
  assert.deepEqual(
    { throttle: sample.throttle, steer: sample.steer, climb: sample.climb },
    { throttle: 1, steer: 1, climb: 1 },
  );
  assert.equal(sample.source, "keyboard");
  input.keyUp("KeyW");
  input.keyUp("KeyA");
  input.keyUp("Space");
  assert.equal(input.sample().throttle, 0);
}

{
  const input = new FlightInput();
  input.keyDown("KeyE");
  assert.equal(input.sample().toggleFlight, true, "edge appears on first sample");
  assert.equal(input.sample().toggleFlight, false, "edge is consumed exactly once");
  input.keyUp("KeyE");
  input.keyDown("KeyE");
  assert.equal(input.sample().toggleFlight, true, "new press creates a new edge");
}

{
  const normalized = normalizeGamepad({
    axes: [0.5, -0.7, 0, -0.4],
    buttons: Array.from({ length: 10 }, (_, index) => ({
      value: index === 7 ? 0.8 : index === 0 ? 1 : 0,
      pressed: index === 0,
    })),
  });
  assert.ok(normalized.steer > 0);
  assert.ok(normalized.climb > 0);
  assert.ok(normalized.throttle > 0);
  assert.equal(normalized.toggleFlight, true);
  assert.equal(normalized.active, true);
}

{
  const noisyTriggers = Array.from({ length: 8 }, (_, index) => ({
    value: index === 7 ? 0.03 : 0,
    pressed: false,
  }));
  const normalized = normalizeGamepad({
    axes: [0, 0, 0, -0.6],
    buttons: noisyTriggers,
  });
  assert.ok(normalized.throttle > 0.4, "sub-deadzone trigger noise does not suppress stick throttle");

  const triggerOnly = normalizeGamepad({ axes: [0, 0, 0, 0], buttons: noisyTriggers });
  assert.equal(triggerOnly.throttle, 0, "sub-deadzone trigger noise remains neutral");
  assert.equal(triggerOnly.active, false, "trigger noise does not claim active input");
}

{
  const input = new FlightInput();
  input.setGamepad({ axes: [0.8, 0.5, 0, 0], buttons: [] });
  let sample = input.sample();
  assert.equal(sample.source, "gamepad");
  assert.ok(sample.steer > 0.7);
  assert.ok(sample.climb < 0);

  input.keyDown("KeyA");
  sample = input.sample();
  assert.equal(sample.source, "mixed");
  assert.equal(sample.steer, 1, "stronger keyboard axis wins deterministically");
}

{
  const input = new FlightInput();
  input.keyDown("KeyW");
  input.setEnabled(false);
  assert.deepEqual(input.sample(), {
    throttle: 0,
    steer: 0,
    climb: 0,
    toggleFlight: false,
    recover: false,
    pause: false,
    active: false,
    source: "none",
  });
  input.setEnabled(true);
  assert.equal(input.sample().throttle, 0, "disabled input does not leave stuck keys");
}

{
  const input = new FlightInput();
  input.setGamepad({
    axes: [NaN, Infinity, 0, -Infinity],
    buttons: [{ value: NaN }],
  });
  const sample = input.sample();
  assert.ok([sample.throttle, sample.steer, sample.climb].every(Number.isFinite));
  assert.equal(sample.throttle, 0);
  assert.equal(sample.steer, 0);
  assert.equal(sample.climb, 0);
}

{
  const input = new FlightInput();
  const pressed = { axes: [], buttons: [{ value: 1, pressed: true }] };
  const released = { axes: [], buttons: [{ value: 0, pressed: false }] };

  input.setGamepad(pressed);
  assert.equal(input.sample().toggleFlight, true, "initial gamepad press creates one edge");

  input.setGamepad(pressed);
  assert.equal(
    input.sample().toggleFlight,
    false,
    "held gamepad button does not retrigger every frame",
  );

  input.setGamepad(released);
  input.sample();
  input.setGamepad(pressed);
  assert.equal(input.sample().toggleFlight, true, "release and repress creates a new edge");
}

console.log("input tests passed");
