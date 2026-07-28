import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x71848b);
scene.fog = new THREE.FogExp2(0x71848b, 0.00055);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 20000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xbfd8df, 0x243128, 2.2));
const sun = new THREE.DirectionalLight(0xfff0d0, 3);
sun.position.set(300, 500, -200);
sun.castShadow = true;
scene.add(sun);

const loader = new GLTFLoader();
const load = (url) => new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
const [dragonAsset, isleAsset] = await Promise.all([load('dragon.glb'), load('isle.glb')]);

const island = isleAsset.scene;
const dragon = dragonAsset.scene;
scene.add(island, dragon);

island.traverse((object) => {
  if (object.isMesh) {
    object.receiveShadow = true;
    object.castShadow = true;
  }
});
drag­on?.traverse?.(() => {});
dragon.traverse((object) => {
  if (object.isMesh) object.castShadow = true;
});

const islandBounds = new THREE.Box3().setFromObject(island);
const dragonBounds = new THREE.Box3().setFromObject(dragon);
const islandCenter = islandBounds.getCenter(new THREE.Vector3());
const islandSize = islandBounds.getSize(new THREE.Vector3());
const dragonSize = dragonBounds.getSize(new THREE.Vector3());

island.position.sub(islandCenter);
const dragonScale = Math.max(
  1,
  Math.min(islandSize.x, islandSize.y, islandSize.z) /
    Math.max(dragonSize.x, dragonSize.y, dragonSize.z) *
    0.018,
);
dragon.scale.setScalar(dragonScale);
dragon.position.set(0, Math.max(8, islandSize.y * 0.06), Math.max(30, islandSize.z * 0.08));

const mixer = dragonAsset.animations.length ? new THREE.AnimationMixer(dragon) : null;
if (mixer && dragonAsset.animations[0]) mixer.clipAction(dragonAsset.animations[0]).play();

const raycaster = new THREE.Raycaster();
const keys = new Set();
const controlledKeys = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'KeyE',
  'KeyR',
]);

let yaw = 0;
let speed = 0;
let verticalSpeed = 0;
let airborne = true;
const status = document.querySelector('#state');

addEventListener('keydown', (event) => {
  if (controlledKeys.has(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'KeyR') recover();
  if (event.code === 'KeyE' && !event.repeat) {
    airborne = !airborne;
    if (airborne) dragon.position.y += 3;
  }
});

addEventListener('keyup', (event) => {
  if (controlledKeys.has(event.code)) event.preventDefault();
  keys.delete(event.code);
});

addEventListener('blur', () => keys.clear());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function recover() {
  dragon.position.set(0, Math.max(12, islandSize.y * 0.08), Math.max(35, islandSize.z * 0.1));
  speed = 0;
  verticalSpeed = 0;
  airborne = true;
}

function terrainY() {
  raycaster.set(
    new THREE.Vector3(dragon.position.x, islandBounds.max.y + 2000, dragon.position.z),
    new THREE.Vector3(0, -1, 0),
  );
  const hit = raycaster.intersectObject(island, true)[0];
  return hit ? hit.point.y : 0;
}

const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.04);

  if (keys.has('KeyW')) speed += 42 * dt;
  if (keys.has('KeyS')) speed -= 34 * dt;
  speed *= Math.pow(0.985, dt * 60);
  speed = THREE.MathUtils.clamp(speed, -14, 78);

  const turnInput = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  yaw += turnInput * 1.5 * dt;

  if (keys.has('Space')) verticalSpeed += 28 * dt;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) verticalSpeed -= 28 * dt;
  verticalSpeed *= Math.pow(0.94, dt * 60);
  verticalSpeed = THREE.MathUtils.clamp(verticalSpeed, -20, 20);

  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  if (airborne) {
    dragon.position.addScaledVector(forward, speed * dt);
    dragon.position.y += verticalSpeed * dt;
    const ground = terrainY() + 2.2;
    if (dragon.position.y < ground) {
      dragon.position.y = ground;
      verticalSpeed = Math.max(0, verticalSpeed);
      if (Math.abs(speed) < 7) airborne = false;
    }
  } else {
    dragon.position.addScaledVector(forward, speed * 0.22 * dt);
    dragon.position.y = terrainY() + 2.2;
    verticalSpeed = 0;
  }

  dragon.rotation.y = yaw + Math.PI;
  dragon.rotation.z = THREE.MathUtils.lerp(
    dragon.rotation.z,
    keys.has('KeyA') ? 0.28 : keys.has('KeyD') ? -0.28 : 0,
    0.08,
  );

  const chase = dragon.position.clone().addScaledVector(forward, -18).add(new THREE.Vector3(0, 8, 0));
  camera.position.lerp(chase, 1 - Math.pow(0.002, dt));
  camera.lookAt(dragon.position.clone().addScaledVector(forward, 8).add(new THREE.Vector3(0, 3, 0)));

  if (mixer) mixer.update(dt);

  globalThis.__flightState = {
    airborne,
    speed,
    verticalSpeed,
    yaw,
    x: dragon.position.x,
    y: dragon.position.y,
    z: dragon.position.z,
  };

  status.textContent = `${airborne ? 'FLIGHT' : 'LANDED'} · ${Math.round(Math.abs(speed))} speed · ${Math.round(dragon.position.y)} altitude`;
  renderer.render(scene, camera);
}

loop();