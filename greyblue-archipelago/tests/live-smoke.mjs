import assert from "node:assert/strict";
import { chromium } from "playwright";

const target = process.env.GREYBLUE_URL || "https://amuletmaiden.github.io/greyblue-archipelago/";
const sourceUrl = new URL("./src/app.js", target);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPublishedSource() {
  let lastStatus = null;
  let lastExcerpt = "";
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    const url = new URL(sourceUrl);
    url.searchParams.set("smoke", `${Date.now()}-${attempt}`);
    try {
      const response = await fetch(url, { cache: "no-store" });
      lastStatus = response.status;
      const source = await response.text();
      lastExcerpt = source.slice(0, 160);
      if (response.ok
        && source.includes("FlightCollisionResolver")
        && source.includes("collision: lastCollision")) {
        return source;
      }
    } catch (error) {
      lastExcerpt = error instanceof Error ? error.message : String(error);
    }
    await wait(10_000);
  }
  throw new Error(`Pages did not publish the collision entrypoint in time (status=${lastStatus}, sample=${lastExcerpt})`);
}

function assertFiniteState(state, label) {
  const values = [
    state?.position?.x,
    state?.position?.y,
    state?.position?.z,
    state?.flight?.velocity?.x,
    state?.flight?.velocity?.y,
    state?.flight?.velocity?.z,
    state?.flight?.speed,
    state?.camera?.position?.x,
    state?.camera?.position?.y,
    state?.camera?.position?.z,
  ];
  assert.ok(values.every(Number.isFinite), `${label} telemetry is finite`);
  assert.ok(Math.abs(state.position.x) < 20_000, `${label} x remains world-bounded`);
  assert.ok(Math.abs(state.position.z) < 20_000, `${label} z remains world-bounded`);
  assert.ok(state.position.y > -50 && state.position.y < 5_000, `${label} altitude remains bounded`);
  assert.ok(state.flight.speed < 100, `${label} planar speed remains bounded`);
}

await waitForPublishedSource();

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  const pageErrors = [];
  const criticalRequestFailures = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (/\.(?:glb|js)(?:\?|$)/i.test(request.url())) {
      criticalRequestFailures.push(`${request.url()}: ${request.failure()?.errorText || "request failed"}`);
    }
  });

  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => globalThis.__greyblueState?.ready === true,
    undefined,
    { timeout: 120_000 },
  );

  const initial = await page.evaluate(() => structuredClone(globalThis.__greyblueState));
  assert.equal(initial.ready, true, "live app reports ready");
  assert.equal(initial.dragonLoaded, true, "approved dragon GLB loaded");
  assert.equal(initial.isleLoaded, true, "approved Isle GLB loaded");
  assert.ok(initial.activeIslandCount > 0, "world streaming is active");
  assert.ok(initial.collision && typeof initial.collision.reason === "string", "entrypoint exposes collision telemetry");
  assertFiniteState(initial, "initial");

  await page.keyboard.down("w");
  await page.waitForTimeout(1_800);
  await page.keyboard.up("w");
  await page.waitForTimeout(400);

  const moved = await page.evaluate(() => structuredClone(globalThis.__greyblueState));
  assertFiniteState(moved, "powered-flight");
  const displacement = Math.hypot(
    moved.position.x - initial.position.x,
    moved.position.y - initial.position.y,
    moved.position.z - initial.position.z,
  );
  assert.ok(displacement > 1, `keyboard flight moved the dragon (${displacement.toFixed(2)} units)`);
  assert.ok(["keyboard", "mixed"].includes(moved.input.source), "live input path observed keyboard control");

  await page.keyboard.press("e");
  await page.waitForFunction(
    () => globalThis.__greyblueState?.flight?.landingRequested === true,
    undefined,
    { timeout: 10_000 },
  );

  const deployedCollision = await page.evaluate(async () => {
    const moduleUrl = new URL("./src/flight/collision.js", location.href);
    moduleUrl.searchParams.set("smoke", String(Date.now()));
    const { FlightCollisionResolver } = await import(moduleUrl.href);

    const terrainResolver = new FlightCollisionResolver();
    const terrain = terrainResolver.resolve({
      previous: { x: 0, y: 40, z: 0 },
      proposed: { x: 0, y: -20, z: 0 },
      velocity: { x: 0, y: -60, z: 0 },
      sampleSurface: () => ({ height: 0, surface: "terrain", id: "live-ground" }),
      airborne: true,
    });

    const waterResolver = new FlightCollisionResolver();
    const water = waterResolver.resolve({
      previous: { x: 0, y: 8, z: 0 },
      proposed: { x: 0, y: -4, z: 12 },
      velocity: { x: 0, y: -12, z: 20 },
      sampleSurface: () => ({ height: 0, surface: "water", id: "live-water" }),
      airborne: true,
    });

    const touchdownResolver = new FlightCollisionResolver();
    const touchdown = touchdownResolver.resolve({
      previous: { x: 0, y: 10, z: 0 },
      proposed: { x: 0, y: 1, z: 8 },
      velocity: { x: 0, y: -5, z: 10 },
      sampleSurface: () => ({ height: 0, surface: "terrain", id: "live-ground" }),
      landingRequested: true,
      airborne: true,
    });

    return {
      terrain: { reason: terrain.reason, grounded: terrain.grounded, requiresRecovery: terrain.requiresRecovery },
      water: { reason: water.reason, grounded: water.grounded, requiresRecovery: water.requiresRecovery },
      touchdown: { reason: touchdown.reason, grounded: touchdown.grounded, requiresRecovery: touchdown.requiresRecovery },
    };
  });

  assert.equal(deployedCollision.terrain.reason, "terrain-impact", "deployed sweep catches high-speed terrain crossing");
  assert.equal(deployedCollision.terrain.requiresRecovery, false);
  assert.equal(deployedCollision.water.reason, "water-contact", "deployed water contact requests recovery");
  assert.equal(deployedCollision.water.requiresRecovery, true);
  assert.equal(deployedCollision.touchdown.reason, "touchdown", "deployed safe approach settles as touchdown");
  assert.equal(deployedCollision.touchdown.grounded, true);

  assert.deepEqual(pageErrors, [], `no uncaught page errors: ${pageErrors.join(" | ")}`);
  assert.deepEqual(
    criticalRequestFailures,
    [],
    `no critical JS/GLB request failures: ${criticalRequestFailures.join(" | ")}`,
  );

  console.log(JSON.stringify({
    target,
    ready: initial.ready,
    dragonLoaded: initial.dragonLoaded,
    isleLoaded: initial.isleLoaded,
    displacement,
    activeIslandCount: moved.activeIslandCount,
    collision: moved.collision,
    deployedCollision,
  }, null, 2));
} finally {
  await browser.close();
}
