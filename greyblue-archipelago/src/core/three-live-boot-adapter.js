import { startLiveBootRuntime } from './live-boot-runtime.js';

function requireThree(THREE) {
  const required = ['Group', 'Mesh', 'ConeGeometry', 'BoxGeometry', 'SphereGeometry', 'MeshStandardMaterial'];
  return required.filter((name) => typeof THREE?.[name] !== 'function');
}

function markFallback(root, kind) {
  root.name = `greyblue-${kind}-fallback`;
  root.userData = {
    ...(root.userData || {}),
    greyblueFallback: true,
    greyblueKind: kind,
  };
  return root;
}

export function createMinimalDragon(THREE) {
  const root = markFallback(new THREE.Group(), 'dragon');
  const bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.03 });
  const wingMaterial = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.25, 12, 8), bodyMaterial);
  body.scale.set(1, 0.55, 2.2);
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 7), bodyMaterial);
  head.position.set(0, 0.18, -2.15);
  head.scale.set(0.9, 0.7, 1.1);
  head.castShadow = true;
  root.add(head);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.4, 3, 1), wingMaterial);
    wing.rotation.set(0, 0, side * Math.PI * 0.5);
    wing.position.set(side * 1.7, 0.1, 0.1);
    wing.scale.set(0.12, 1, 1);
    wing.castShadow = true;
    root.add(wing);
  }

  root.scale.setScalar(2.4);
  return root;
}

export function createMinimalIsle(THREE) {
  const root = markFallback(new THREE.Group(), 'isle');
  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(170, 250, 11, 4),
    new THREE.MeshStandardMaterial({ roughness: 0.98, metalness: 0 }),
  );
  rock.position.set(0, -92, 0);
  rock.receiveShadow = true;
  rock.castShadow = true;
  root.add(rock);

  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(210, 12, 210),
    new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }),
  );
  crown.position.set(0, 26, 0);
  crown.receiveShadow = true;
  root.add(crown);
  return root;
}

function sceneRuntime({ THREE, scene, onDragon, onIsle }) {
  const attached = [];
  return {
    createDragonFallback: () => ({ scene: createMinimalDragon(THREE), animations: [] }),
    createIsleFallback: () => ({ scene: createMinimalIsle(THREE), animations: [] }),
    attachDragon(asset) {
      const root = asset?.scene || asset;
      if (!root) throw new Error('dragon-root-missing');
      scene.add(root);
      attached.push(root);
      onDragon?.(root, asset);
    },
    attachIsle(asset) {
      const root = asset?.scene || asset;
      if (!root) throw new Error('isle-root-missing');
      scene.add(root);
      attached.push(root);
      onIsle?.(root, asset);
    },
    detachAll() {
      while (attached.length) scene.remove(attached.pop());
    },
  };
}

export async function startThreeLiveBoot(input = {}) {
  const missingThree = requireThree(input.THREE);
  const stateTarget = input.stateTarget && typeof input.stateTarget === 'object'
    ? input.stateTarget
    : null;

  if (missingThree.length || typeof input.scene?.add !== 'function' || typeof input.scene?.remove !== 'function') {
    const failureCodes = Object.freeze([
      ...missingThree.map((name) => `three:${name}-missing`),
      ...(typeof input.scene?.add !== 'function' ? ['three:scene-add-missing'] : []),
      ...(typeof input.scene?.remove !== 'function' ? ['three:scene-remove-missing'] : []),
    ].slice(0, 8));
    const boot = Object.freeze({
      mode: 'blocked',
      ready: false,
      playable: false,
      selectedReleaseIds: Object.freeze({ dragon: null, isle: null }),
      dragonSource: 'unavailable',
      isleSource: 'unavailable',
      optionalOmissionCount: 0,
      failureCodes,
    });
    if (stateTarget) stateTarget.boot = boot;
    return Object.freeze({ mode: 'blocked', ready: false, playable: false, dragon: null, isle: null, boot });
  }

  return startLiveBootRuntime({
    saveSchema: input.saveSchema,
    handoffs: input.handoffs,
    loadDragon: input.loadDragon,
    loadIsle: input.loadIsle,
    stateTarget,
    runtime: sceneRuntime({
      THREE: input.THREE,
      scene: input.scene,
      onDragon: input.onDragon,
      onIsle: input.onIsle,
    }),
  });
}
