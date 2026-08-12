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
  const input = new FlightInput();
  input.keyDown("KeyF");
  assert.equal(input.sample().interact, true, "interaction appears on first sample");
  assert.equal(input.sample().interact, false, "interaction is edge-triggered");
  input.keyUp("KeyF");
  input.keyDown("KeyF");
  assert.equal(input.sample().interact, true, "interaction rearms after release");
  assert.equal(input.sample().toggleFlight, false, "interaction does not steal flight toggle");
}

{
  const normalized = normalizeGamepad({
    axes: [0.5, -0.7, 0.6, -0.4],
    buttons: Array.from({ length: 10 }, (_, index) => ({
      value: index === 7 ? 0.8 : index === 0 || index === 2 ? 1 : 0,
      pressed: index === 0 || index === 2,
    })),
  });
  assert.ok(normalized.steer > 0);
  assert.ok(normalized.climb > 0);
  assert.ok(normalized.lookX > 0);
  assert.ok(normalized.lookY > 0);
  assert.ok(normalized.throttle > 0);
  assert.equal(normalized.toggleFlight, true);
  assert.equal(normalized.interact, true);
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
  assert.equal(normalized.throttle, 0, "sub-deadzone trigger noise remains neutral throttle");
  assert.ok(normalized.lookY > 0.4, "right-stick vertical axis belongs only to camera look");

  const triggerOnly = normalizeGamepad({ axes: [0, 0, 0, 0], buttons: noisyTriggers });
  assert.equal(triggerOnly.throttle, 0, "sub-deadzone trigger noise remains neutral");
  assert.equal(triggerOnly.active, false, "trigger noise does not claim active input");
}

{
  const input = new FlightInput();
  input.setGamepad({ axes: [0.8, 0.5, 0.7, -0.65], buttons: [] });
  let sample = input.sample();
  assert.equal(sample.source, "gamepad");
  assert.ok(sample.steer > 0.7);
  assert.ok(sample.climb < 0);
  assert.ok(sample.lookX > 0.6);
  assert.ok(sample.lookY > 0.5);

  input.keyDown("KeyA");
  sample = input.sample();
  assert.equal(sample.source, "mixed");
  assert.equal(sample.steer, 1, "stronger keyboard axis wins deterministically");
}

{
  const input = new FlightInput();
  input.pointerDelta(90, -45);
  const sample = input.sample();
  assert.ok(sample.lookX > 0.45 && sample.lookX < 0.55);
  assert.ok(sample.lookY > 0.2 && sample.lookY < 0.3);
  const next = input.sample();
  assert.equal(next.lookX, 0, "pointer delta is frame-bounded and consumed once");
  assert.equal(next.lookY, 0);
}

{
  const input = new FlightInput();
  input.keyDown("KeyW");
  input.pointerDelta(100, 100);
  input.setEnabled(false);
  assert.deepEqual(input.sample(), {
    throttle: 0,
    steer: 0,
    climb: 0,
    lookX: 0,
    lookY: 0,
    toggleFlight: false,
    interact: false,
    recover: false,
    pause: false,
    active: false,
    source: "none",
  });
  input.setEnabled(true);
  const sample = input.sample();
  assert.equal(sample.throttle, 0, "disabled input does not leave stuck keys");
  assert.equal(sample.lookX, 0, "disabled input clears pointer look");
}

{
  const input = new FlightInput();
  input.setGamepad({
    axes: [NaN, Infinity, -Infinity, NaN],
    buttons: [{ value: NaN }],
  });
  const sample = input.sample();
  assert.ok([sample.throttle, sample.steer, sample.climb, sample.lookX, sample.lookY].every(Number.isFinite));
  assert.equal(sample.throttle, 0);
  assert.equal(sample.steer, 0);
  assert.equal(sample.climb, 0);
  assert.equal(sample.lookX, 0);
  assert.equal(sample.lookY, 0);
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

{
  const input = new FlightInput();
  const buttons = Array.from({ length: 4 }, () => ({ value: 0, pressed: false }));
  buttons[2] = { value: 1, pressed: true };
  input.setGamepad({ axes: [], buttons });
  assert.equal(input.sample().interact, true, "gamepad face-button interaction creates one edge");
  input.setGamepad({ axes: [], buttons });
  assert.equal(input.sample().interact, false, "held interaction button does not retrigger");
}

console.log("input tests passed");
