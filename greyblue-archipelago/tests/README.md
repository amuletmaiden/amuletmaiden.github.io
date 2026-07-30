# Greyblue tests

Deterministic source regressions:

```sh
node --check greyblue-archipelago/src/app.js
node greyblue-archipelago/tests/collision.test.mjs
node greyblue-archipelago/tests/flight-controller.test.mjs
node greyblue-archipelago/tests/chase-camera.test.mjs
node greyblue-archipelago/tests/input.test.mjs
node greyblue-archipelago/tests/app-collision-integration.test.mjs
```

Deployed browser acceptance:

```sh
npm install --no-save playwright@1.55.0
npx playwright install --with-deps chromium
node greyblue-archipelago/tests/live-smoke.mjs
```

The live test targets the published GitHub Pages build by default and verifies approved asset loading, browser readiness, keyboard flight, bounded telemetry, world streaming, and deployed terrain/water/touchdown collision behavior.
