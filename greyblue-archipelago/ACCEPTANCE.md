# Greyblue live acceptance

The deployed browser smoke test runs in the public repository and does not consume private `kt-bus` Actions minutes.

It waits for GitHub Pages to publish the current collision entrypoint, then verifies:

- the approved dragon and Isle GLBs load read-only;
- the live app reaches ready state with active world streaming;
- keyboard-powered flight moves the dragon while position, velocity, camera and speed remain finite and bounded;
- collision telemetry is exposed by the entrypoint;
- the deployed collision module catches swept terrain impact, requests recovery on water contact, and accepts a safe touchdown;
- no critical JavaScript or GLB request fails and no uncaught page error occurs.

Source-only regression tests remain separate and cover collision, flight controller, chase camera, input and entrypoint integration contracts.
