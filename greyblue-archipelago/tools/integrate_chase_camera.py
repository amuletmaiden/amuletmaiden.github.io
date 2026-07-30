from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

REPO = "amuletmaiden/amuletmaiden.github.io"
BRANCH = "juniper/camera-integration"


def run(args: list[str], cwd: Path | None = None, timeout: int = 180) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        args,
        cwd=cwd,
        text=True,
        capture_output=True,
        timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        check=False,
    )
    if result.returncode:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {args}\n"
            f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    return result


def main() -> None:
    root = Path(tempfile.mkdtemp(prefix="greyblue-camera-integration-"))
    run(
        [
            "gh.exe",
            "repo",
            "clone",
            REPO,
            str(root),
            "--",
            "--branch",
            BRANCH,
            "--single-branch",
        ],
        timeout=240,
    )
    app = root / "greyblue-archipelago" / "src" / "app.js"
    source = app.read_text(encoding="utf-8")
    replacements = (
        (
            'import { FlightController } from "./flight/controller.js";',
            'import { FlightController } from "./flight/controller.js";\n'
            'import { ChaseCameraRig } from "./flight/chase-camera.js";',
        ),
        (
            "const controller = new FlightController();\ncontroller.airborne = true;",
            "const controller = new FlightController();\n"
            "controller.airborne = true;\n"
            "const chaseCamera = new ChaseCameraRig({ "
            "distance: save?.settings?.cameraDistance ?? 24 });",
        ),
        (
            "  controller.landingRequested = recovered.landingRequested;",
            "  controller.landingRequested = recovered.landingRequested;\n"
            "  chaseCamera.snapTo(position, controller.yaw);",
        ),
        (
            "    settings: { cameraDistance: 24 },",
            "    settings: { cameraDistance: chaseCamera.distance },",
        ),
        (
            "  const forward = new THREE.Vector3(Math.sin(controller.yaw), 0, Math.cos(controller.yaw));\n"
            "  const chase = position.clone().addScaledVector(forward, -24).add(new THREE.Vector3(0, 10, 0));\n"
            "  camera.position.lerp(chase, 1 - Math.pow(0.002, dt));\n"
            "  camera.lookAt(position.clone().addScaledVector(forward, 10).add(new THREE.Vector3(0, 3.5, 0)));",
            "  const cameraState = chaseCamera.update({\n"
            "    target: position,\n"
            "    yaw: controller.yaw,\n"
            "    bank: controller.bank,\n"
            "    speed: flight.speed,\n"
            "    dt,\n"
            "    sampleHeight: terrainHeightAt,\n"
            "  });\n"
            "  camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);\n"
            "  camera.lookAt(cameraState.lookTarget.x, cameraState.lookTarget.y, cameraState.lookTarget.z);",
        ),
        (
            "    animation: dragonRuntime?.telemetry || null,",
            "    animation: dragonRuntime?.telemetry || null,\n"
            "    camera: cameraState,",
        ),
    )
    for before, after in replacements:
        if before not in source:
            raise RuntimeError(f"Integration marker missing: {before[:100]!r}")
        source = source.replace(before, after, 1)
    app.write_text(source, encoding="utf-8", newline="\n")

    node = shutil.which("node.exe") or shutil.which("node")
    if not node:
        raise RuntimeError("node executable not found")
    syntax = run([node, "--check", str(app)], cwd=root, timeout=90)
    camera_test = run(
        [node, str(root / "greyblue-archipelago" / "tests" / "chase-camera.test.mjs")],
        cwd=root / "greyblue-archipelago",
        timeout=180,
    )

    run(["git.exe", "config", "user.name", "Katherine Agent Manager"], cwd=root)
    run(
        [
            "git.exe",
            "config",
            "user.email",
            "amuletmaiden@users.noreply.github.com",
        ],
        cwd=root,
    )
    run(["git.exe", "add", "greyblue-archipelago/src/app.js"], cwd=root)
    run(
        ["git.exe", "commit", "-m", "Juniper: integrate terrain-aware chase camera"],
        cwd=root,
    )
    run(["git.exe", "push", "origin", BRANCH], cwd=root, timeout=240)
    head = run(["git.exe", "rev-parse", "HEAD"], cwd=root).stdout.strip()
    print(
        json.dumps(
            {
                "branch": BRANCH,
                "head": head,
                "syntax": syntax.returncode,
                "camera_tests": (camera_test.stdout + camera_test.stderr).strip(),
            }
        )
    )


if __name__ == "__main__":
    main()
