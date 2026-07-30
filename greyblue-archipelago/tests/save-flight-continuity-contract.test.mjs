import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

for (const contract of [
  "Object.assign(controller.velocity, save?.velocity || {})",
  "controller.yaw = save?.orientation?.yaw ?? 0",
  "controller.pitch = save?.orientation?.pitch ?? 0",
  "controller.bank = save?.orientation?.bank ?? 0",
  "controller.airborne = save?.airborne ?? true",
  "controller.landingRequested = save?.landingRequested ?? false",
  "velocity: { ...controller.velocity }",
  "orientation: { yaw: controller.yaw, pitch: controller.pitch, bank: controller.bank }",
  "airborne: controller.airborne",
  "landingRequested: controller.landingRequested",
  "persist();",
]) {
  assert.ok(source.includes(contract), `missing flight continuity contract: ${contract}`);
}

const recover = source.match(/function recover\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(recover, "recover function is present");
assert.ok(recover.includes("controller.yaw = recovered.orientation.yaw"));
assert.ok(recover.includes("controller.pitch = recovered.orientation.pitch"));
assert.ok(recover.includes("controller.bank = recovered.orientation.bank"));
assert.ok(recover.includes("persist();"), "recovery writes the safe state immediately");

console.log("save flight continuity contract passed");
