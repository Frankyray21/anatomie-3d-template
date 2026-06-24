import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "../vendor/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "../vendor/examples/jsm/loaders/OBJLoader.js";

const canvas = document.querySelector("#scene");
const layerList = document.querySelector("#layerList");
const selectedName = document.querySelector("#selectedName");
const selectedSystem = document.querySelector("#selectedSystem");
const selectedNote = document.querySelector("#selectedNote");
const sourceStatus = document.querySelector("#sourceStatus");
const labelLayer = document.querySelector("#labelLayer");
const loadingState = document.querySelector("#loadingState");
const rotateToggle = document.querySelector("#rotateToggle");
const tourToggle = document.querySelector("#tourToggle");
const resetView = document.querySelector("#resetView");
const separationSlider = document.querySelector("#separationSlider");
const opacitySlider = document.querySelector("#opacitySlider");
const speedSlider = document.querySelector("#speedSlider");
const storySteps = [...document.querySelectorAll(".story-step")];
const progressFill = document.querySelector("#progressFill");
const progressLabel = document.querySelector("#progressLabel");
const isTouchFirst = window.matchMedia("(pointer: coarse)").matches;
const isCompactScreen = window.matchMedia("(max-width: 820px)").matches;
const mobileRenderMode = isTouchFirst || isCompactScreen;

const layerConfig = {
  skin: {
    label: "Peau translucide",
    color: "#d78f72",
    opacity: 0.23,
    separation: new THREE.Vector3(0.34, 0, -0.02)
  },
  skeleton: {
    label: "Os",
    color: "#efe2c9",
    opacity: 1,
    separation: new THREE.Vector3(-0.22, 0, 0)
  },
  muscles: {
    label: "Muscles",
    color: "#c74d47",
    opacity: 0.88,
    separation: new THREE.Vector3(0.14, 0, 0.06)
  },
  tendons: {
    label: "Tendons",
    color: "#e8dcc1",
    opacity: 0.96,
    separation: new THREE.Vector3(0.2, 0, 0.18)
  },
  nerves: {
    label: "Nerfs",
    color: "#f2c94c",
    opacity: 1,
    separation: new THREE.Vector3(-0.08, 0, 0.25)
  },
  vessels: {
    label: "Vaisseaux",
    color: "#5fa9d6",
    opacity: 0.92,
    separation: new THREE.Vector3(-0.16, 0, -0.22)
  }
};

const state = {
  autoRotate: true,
  tour: false,
  separation: Number(separationSlider.value),
  globalOpacity: Number(opacitySlider.value),
  speed: Number(speedSlider.value),
  scrollProgress: 0,
  scrollRotation: -0.4,
  spin: 0,
  pointer: new THREE.Vector2(-10, -10),
  selected: null
};

const scrollStops = [
  {
    p: 0,
    separation: 0,
    opacity: 0.74,
    rotation: -0.62,
    camera: new THREE.Vector3(2.8, 1.2, 5.2),
    target: new THREE.Vector3(0, 0.12, 0)
  },
  {
    p: 0.22,
    separation: 0.2,
    opacity: 0.84,
    rotation: 0.42,
    camera: new THREE.Vector3(2.15, 1.6, 4.35),
    target: new THREE.Vector3(0, 0.56, 0)
  },
  {
    p: 0.46,
    separation: 0.52,
    opacity: 0.92,
    rotation: 1.18,
    camera: new THREE.Vector3(3.45, 0.46, 4.0),
    target: new THREE.Vector3(0.04, -0.12, 0)
  },
  {
    p: 0.7,
    separation: 0.74,
    opacity: 0.94,
    rotation: 2.04,
    camera: new THREE.Vector3(2.2, 1.0, 3.7),
    target: new THREE.Vector3(0, 0.22, 0.04)
  },
  {
    p: 1,
    separation: 0.9,
    opacity: 1,
    rotation: 2.78,
    camera: new THREE.Vector3(3.05, 1.36, 4.75),
    target: new THREE.Vector3(0, 0.08, 0)
  }
];

const scene = new THREE.Scene();
scene.background = new THREE.Color("#111214");
scene.fog = new THREE.Fog("#111214", 5.2, 9.5);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(3.2, 1.45, 4.8);

let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobileRenderMode,
    alpha: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: mobileRenderMode ? "default" : "high-performance"
  });
} catch (error) {
  showStartupError("WebGL ne peut pas demarrer sur ce navigateur. Essayez Chrome ou activez l'acceleration materielle.");
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileRenderMode ? 1.25 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !mobileRenderMode;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.addEventListener(
  "webglcontextlost",
  (event) => {
    event.preventDefault();
    showStartupError("Contexte WebGL perdu. Rechargez la page pour relancer la scene 3D.");
  },
  false
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false;
controls.rotateSpeed = 0.48;
controls.minDistance = 2.4;
controls.maxDistance = 8.5;
controls.target.set(0, 0.08, 0);
controls.enabled = !isTouchFirst;
renderer.domElement.style.touchAction = isTouchFirst ? "pan-y" : "none";

const anatomyRoot = new THREE.Group();
scene.add(anatomyRoot);

const demoRoot = new THREE.Group();
demoRoot.name = "Demo procedural anatomy";
anatomyRoot.add(demoRoot);

const layers = Object.fromEntries(
  Object.keys(layerConfig).map((key) => {
    const group = new THREE.Group();
    group.name = key;
    group.userData.layer = key;
    demoRoot.add(group);
    return [key, group];
  })
);

const importedRoot = new THREE.Group();
importedRoot.name = "Validated imported anatomy";
anatomyRoot.add(importedRoot);

const raycaster = new THREE.Raycaster();
const interactive = [];
const labels = [];
const animatedParts = [];

const materials = {
  skin: makeMaterial(layerConfig.skin.color, 0.23, true, 0.52),
  bone: makeMaterial(layerConfig.skeleton.color, 1, false, 0.82),
  cartilage: makeMaterial("#cbd6cf", 0.82, true, 0.58),
  muscle: makeMaterial(layerConfig.muscles.color, 0.88, true, 0.78),
  tendon: makeMaterial(layerConfig.tendons.color, 0.96, true, 0.84),
  nerve: makeMaterial(layerConfig.nerves.color, 1, false, 0.44),
  artery: makeMaterial("#d75b4d", 0.94, true, 0.54),
  vein: makeMaterial("#4f9bc7", 0.9, true, 0.52),
  organ: makeMaterial("#915f68", 0.7, true, 0.6),
  scan: new THREE.MeshBasicMaterial({
    color: "#6fd0bd",
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false
  })
};

buildInterface();
buildLights();
buildEnvironment();
buildSkinLayer();
buildSkeletonLayer();
buildMuscleLayer();
buildTendonLayer();
buildNerveLayer();
buildVesselLayer();
buildScanPlane();
createLabels();
loadValidatedManifest();
handleScroll();
updateLayerState();
window.__anatomyAppReady = true;
setTimeout(() => loadingState.classList.add("is-hidden"), 420);

renderer.setAnimationLoop(render);

function showStartupError(message) {
  const node = document.querySelector("#loadingMessage");
  if (node) node.textContent = message;
  document.body.classList.add("has-startup-error");
}

function makeMaterial(color, opacity = 1, transparent = false, roughness = 0.7) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    transparent: transparent || opacity < 1,
    opacity,
    depthWrite: opacity > 0.42,
    side: THREE.FrontSide
  });
}

function buildInterface() {
  Object.entries(layerConfig).forEach(([key, config]) => {
    const row = document.createElement("label");
    row.className = "layer-row";
    row.innerHTML = `
      <input class="layer-toggle" type="checkbox" data-layer="${key}" checked />
      <span class="layer-name">${config.label}</span>
      <span class="swatch" style="background:${config.color}"></span>
    `;
    layerList.append(row);
  });

  layerList.addEventListener("change", (event) => {
    const input = event.target.closest(".layer-toggle");
    if (!input) return;
    const group = layers[input.dataset.layer];
    if (group) group.visible = input.checked;
  });

  separationSlider.addEventListener("input", () => {
    state.separation = Number(separationSlider.value);
    updateLayerState();
  });

  opacitySlider.addEventListener("input", () => {
    state.globalOpacity = Number(opacitySlider.value);
    updateLayerState();
  });

  speedSlider.addEventListener("input", () => {
    state.speed = Number(speedSlider.value);
  });

  rotateToggle.addEventListener("click", () => {
    state.autoRotate = !state.autoRotate;
    rotateToggle.classList.toggle("is-active", state.autoRotate);
  });

  tourToggle.addEventListener("click", () => {
    state.tour = !state.tour;
    tourToggle.classList.toggle("is-active", state.tour);
  });

  resetView.addEventListener("click", () => {
    camera.position.set(3.2, 1.45, 4.8);
    controls.target.set(0, 0.08, 0);
    controls.update();
    state.separation = 0.34;
    separationSlider.value = "0.34";
    updateLayerState();
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  });

  canvas.addEventListener("pointerleave", () => {
    state.pointer.set(-10, -10);
  });

  canvas.addEventListener("click", pickStructure);
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", resize);
}

function handleScroll() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  state.scrollProgress = THREE.MathUtils.clamp(window.scrollY / maxScroll, 0, 1);
  if (progressFill) progressFill.style.width = `${Math.round(state.scrollProgress * 100)}%`;
  updateActiveStory();
}

function updateActiveStory() {
  if (!storySteps.length) return;
  const center = window.innerHeight * 0.48;
  let active = storySteps[0];
  let nearest = Number.POSITIVE_INFINITY;

  storySteps.forEach((step) => {
    const rect = step.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height * 0.34 - center);
    if (distance < nearest) {
      nearest = distance;
      active = step;
    }
  });

  storySteps.forEach((step) => step.classList.toggle("is-active", step === active));
  if (progressLabel) progressLabel.textContent = active.dataset.stage || "Animation";
}

function scrollPose(progress) {
  for (let i = 0; i < scrollStops.length - 1; i += 1) {
    const start = scrollStops[i];
    const end = scrollStops[i + 1];
    if (progress <= end.p) {
      const local = easeInOut((progress - start.p) / (end.p - start.p));
      return {
        separation: THREE.MathUtils.lerp(start.separation, end.separation, local),
        opacity: THREE.MathUtils.lerp(start.opacity, end.opacity, local),
        rotation: THREE.MathUtils.lerp(start.rotation, end.rotation, local),
        camera: start.camera.clone().lerp(end.camera, local),
        target: start.target.clone().lerp(end.target, local)
      };
    }
  }

  const last = scrollStops[scrollStops.length - 1];
  return {
    separation: last.separation,
    opacity: last.opacity,
    rotation: last.rotation,
    camera: last.camera.clone(),
    target: last.target.clone()
  };
}

function easeOut(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function buildLights() {
  scene.add(new THREE.HemisphereLight("#f6f1e8", "#1b1919", 2.25));

  const key = new THREE.DirectionalLight("#fff2de", 3.4);
  key.position.set(2.7, 4.2, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 10;
  scene.add(key);

  const rim = new THREE.DirectionalLight("#78d5c9", 1.6);
  rim.position.set(-3.2, 1.5, -2.6);
  scene.add(rim);
}

function buildEnvironment() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 96),
    new THREE.MeshStandardMaterial({
      color: "#171819",
      roughness: 0.92,
      metalness: 0,
      transparent: true,
      opacity: 0.78
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.92;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(5.2, 26, "#6fd0bd", "#2d3230");
  grid.position.y = -1.91;
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  scene.add(grid);
}

function buildSkinLayer() {
  addEllipsoid("skin", [0, 1.55, 0], [0.29, 0.36, 0.26], materials.skin, "Enveloppe cranienne", {
    system: "Peau",
    note: "Envelope externe translucide servant de repere volumetrique."
  });
  addCapsule("skin", [0, 0.22, 0], [0.54, 1.34, 0.34], materials.skin, "Tronc", {
    system: "Peau",
    note: "Silhouette thoraco-abdominale semi-transparente."
  });
  mirror((side) => {
    addCapsuleBetween("skin", [side * 0.48, 0.92, 0], [side * 1.12, 0.0, 0], 0.095, materials.skin, "Membre superieur", {
      system: "Peau",
      note: "Volume approximatif du bras et de l'avant-bras."
    });
    addCapsuleBetween("skin", [side * 0.28, -0.82, 0], [side * 0.48, -1.72, 0], 0.12, materials.skin, "Membre inferieur", {
      system: "Peau",
      note: "Volume approximatif de la cuisse, de la jambe et du pied."
    });
  });
}

function buildSkeletonLayer() {
  addEllipsoid("skeleton", [0, 1.56, 0], [0.2, 0.26, 0.18], materials.bone, "Crane", {
    system: "Os",
    note: "Repere osseux du neurocrane, simplifie pour la demo."
  });
  addCapsuleBetween("skeleton", [0, 1.35, 0.02], [0, 1.23, 0.02], 0.065, materials.bone, "Mandibule", {
    system: "Os",
    note: "Arc mandibulaire simplifie."
  });

  for (let i = 0; i < 24; i += 1) {
    const t = i / 23;
    const y = 1.12 - t * 1.55;
    const z = -0.035 + Math.sin(t * Math.PI) * 0.075;
    addEllipsoid("skeleton", [0, y, z], [0.052, 0.036, 0.042], materials.bone, "Vertebre", {
      system: "Os",
      note: "Element de colonne vertebrale; utiliser les vertebres separees d'un atlas pour precision."
    });
  }

  addCapsuleBetween("skeleton", [0, 1.04, -0.02], [0, 0.28, 0], 0.032, materials.bone, "Sternum", {
    system: "Os",
    note: "Repere anterieur de la cage thoracique."
  });

  for (let i = 0; i < 10; i += 1) {
    const y = 0.98 - i * 0.068;
    const width = 0.22 + i * 0.028;
    const depth = 0.23 + i * 0.01;
    mirror((side) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.035 * side, y, -0.045),
        new THREE.Vector3(side * width, y - 0.015, -depth),
        new THREE.Vector3(side * (width + 0.12), y - 0.07, -0.03),
        new THREE.Vector3(side * 0.08, y - 0.08, 0.08)
      ]);
      addTube("skeleton", curve, 0.012, materials.bone, "Cote", {
        system: "Os",
        note: "Arc costal simplifie, dispose par paires."
      });
    });
  }

  mirror((side) => {
    addCapsuleBetween("skeleton", [side * 0.06, 1.04, 0.02], [side * 0.44, 1.02, 0.02], 0.025, materials.bone, "Clavicule", {
      system: "Os",
      note: "Liaison sternum-scapula."
    });
    addEllipsoid("skeleton", [side * 0.46, 0.84, -0.18], [0.12, 0.18, 0.035], materials.bone, "Scapula", {
      system: "Os",
      note: "Omoplate simplifiee."
    });
    addCapsuleBetween("skeleton", [side * 0.56, 0.88, 0], [side * 0.72, 0.24, 0], 0.035, materials.bone, "Humerus", {
      system: "Os",
      note: "Os long du bras."
    });
    addCapsuleBetween("skeleton", [side * 0.72, 0.22, 0.018], [side * 0.9, -0.38, 0.038], 0.023, materials.bone, "Radius", {
      system: "Os",
      note: "Os lateral de l'avant-bras en position anatomique."
    });
    addCapsuleBetween("skeleton", [side * 0.7, 0.22, -0.035], [side * 0.82, -0.38, -0.045], 0.021, materials.bone, "Ulna", {
      system: "Os",
      note: "Os medial de l'avant-bras."
    });
    addEllipsoid("skeleton", [side * 0.92, -0.48, 0], [0.075, 0.04, 0.07], materials.bone, "Carpe", {
      system: "Os",
      note: "Bloc simplifie des os du poignet."
    });

    for (let finger = -2; finger <= 2; finger += 1) {
      const x = side * (0.95 + finger * 0.016 * side);
      addCapsuleBetween("skeleton", [x, -0.52, 0], [x + side * 0.035, -0.66, 0.01 * finger], 0.008, materials.bone, "Phalange", {
        system: "Os",
        note: "Segment simplifie de la main."
      });
    }

    addEllipsoid("skeleton", [side * 0.18, -0.36, 0], [0.18, 0.1, 0.105], materials.bone, "Os iliaque", {
      system: "Os",
      note: "Hemibassin simplifie."
    });
    addCapsuleBetween("skeleton", [side * 0.22, -0.48, 0], [side * 0.36, -1.1, 0.018], 0.045, materials.bone, "Femur", {
      system: "Os",
      note: "Os long de la cuisse."
    });
    addCapsuleBetween("skeleton", [side * 0.36, -1.12, 0.018], [side * 0.42, -1.72, 0.025], 0.034, materials.bone, "Tibia", {
      system: "Os",
      note: "Os porteur medial de la jambe."
    });
    addCapsuleBetween("skeleton", [side * 0.42, -1.12, -0.04], [side * 0.5, -1.7, -0.045], 0.018, materials.bone, "Fibula", {
      system: "Os",
      note: "Os lateral de la jambe."
    });
    addEllipsoid("skeleton", [side * 0.39, -1.09, 0.05], [0.055, 0.035, 0.035], materials.bone, "Patella", {
      system: "Os",
      note: "Rotule placee en avant du genou."
    });
    addCapsuleBetween("skeleton", [side * 0.42, -1.78, 0.02], [side * 0.62, -1.83, 0.14], 0.03, materials.bone, "Pied", {
      system: "Os",
      note: "Bloc tarse-metatarse simplifie."
    });
  });
}

function buildMuscleLayer() {
  addEllipsoid("muscles", [-0.16, 0.72, 0.16], [0.2, 0.14, 0.055], materials.muscle, "Grand pectoral gauche", {
    system: "Muscle",
    note: "Muscle thoracique superficiel, forme stylisee."
  });
  addEllipsoid("muscles", [0.16, 0.72, 0.16], [0.2, 0.14, 0.055], materials.muscle, "Grand pectoral droit", {
    system: "Muscle",
    note: "Muscle thoracique superficiel, forme stylisee."
  });
  addCapsuleBetween("muscles", [0, 0.58, 0.17], [0, -0.16, 0.17], 0.075, materials.muscle, "Grand droit abdominal", {
    system: "Muscle",
    note: "Paroi abdominale anterieure, simplifiee en faisceau central."
  });

  mirror((side) => {
    addEllipsoid("muscles", [side * 0.52, 0.82, 0.02], [0.12, 0.16, 0.11], materials.muscle, "Deltoide", {
      system: "Muscle",
      note: "Masse musculaire de l'epaule."
    });
    addCapsuleBetween("muscles", [side * 0.62, 0.74, 0.07], [side * 0.72, 0.32, 0.05], 0.055, materials.muscle, "Biceps brachial", {
      system: "Muscle",
      note: "Flechisseur du coude, place en avant de l'humerus."
    });
    addCapsuleBetween("muscles", [side * 0.58, 0.72, -0.08], [side * 0.7, 0.28, -0.08], 0.052, materials.muscle, "Triceps brachial", {
      system: "Muscle",
      note: "Extenseur du coude, place en arriere du bras."
    });
    addCapsuleBetween("muscles", [side * 0.74, 0.12, 0.05], [side * 0.89, -0.34, 0.05], 0.048, materials.muscle, "Flechisseurs avant-bras", {
      system: "Muscle",
      note: "Groupe musculaire anterieur de l'avant-bras."
    });
    addEllipsoid("muscles", [side * 0.22, -0.04, -0.13], [0.15, 0.22, 0.07], materials.muscle, "Grand fessier", {
      system: "Muscle",
      note: "Repere posterieur du bassin."
    });
    addCapsuleBetween("muscles", [side * 0.28, -0.54, 0.11], [side * 0.36, -1.04, 0.12], 0.075, materials.muscle, "Quadriceps femoral", {
      system: "Muscle",
      note: "Groupe anterieur de la cuisse, extenseur du genou."
    });
    addCapsuleBetween("muscles", [side * 0.24, -0.54, -0.12], [side * 0.34, -1.02, -0.11], 0.068, materials.muscle, "Ischio-jambiers", {
      system: "Muscle",
      note: "Groupe posterieur de la cuisse."
    });
    addCapsuleBetween("muscles", [side * 0.43, -1.2, -0.06], [side * 0.5, -1.62, -0.07], 0.062, materials.muscle, "Gastrocnemien", {
      system: "Muscle",
      note: "Mollet superficiel, relie au tendon d'Achille."
    });
    addCapsuleBetween("muscles", [side * 0.39, -1.2, 0.1], [side * 0.44, -1.63, 0.11], 0.046, materials.muscle, "Tibial anterieur", {
      system: "Muscle",
      note: "Muscle anterieur de la jambe."
    });
  });
}

function buildTendonLayer() {
  mirror((side) => {
    addCapsuleBetween("tendons", [side * 0.62, 0.31, 0.07], [side * 0.72, 0.21, 0.055], 0.018, materials.tendon, "Tendon distal du biceps", {
      system: "Tendon",
      note: "Connexion distale simplifiee du biceps vers le radius."
    });
    addCapsuleBetween("tendons", [side * 0.88, -0.34, 0.04], [side * 0.93, -0.49, 0.02], 0.015, materials.tendon, "Tendons du poignet", {
      system: "Tendon",
      note: "Faisceaux tendineux schematiques de la main."
    });
    addCapsuleBetween("tendons", [side * 0.35, -0.98, 0.13], [side * 0.39, -1.12, 0.09], 0.022, materials.tendon, "Tendon patellaire", {
      system: "Tendon",
      note: "Relie la patella au tibia."
    });
    addCapsuleBetween("tendons", [side * 0.49, -1.58, -0.07], [side * 0.54, -1.82, -0.02], 0.025, materials.tendon, "Tendon d'Achille", {
      system: "Tendon",
      note: "Tendon calcaneen du triceps sural."
    });
  });
}

function buildNerveLayer() {
  addTube(
    "nerves",
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.45, -0.02),
      new THREE.Vector3(0, 0.7, -0.02),
      new THREE.Vector3(0, -0.55, -0.02)
    ]),
    0.014,
    materials.nerve,
    "Moelle spinale",
    {
      system: "Nerf",
      note: "Axe nerveux central, represente dans le canal vertebral."
    }
  );

  mirror((side) => {
    addTube(
      "nerves",
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.03, 1.04, -0.02),
        new THREE.Vector3(side * 0.36, 0.9, -0.03),
        new THREE.Vector3(side * 0.62, 0.52, 0.02),
        new THREE.Vector3(side * 0.82, -0.16, 0.02),
        new THREE.Vector3(side * 0.93, -0.53, 0.0)
      ]),
      0.01,
      materials.nerve,
      "Plexus brachial",
      {
        system: "Nerf",
        note: "Schema du trajet nerveux vers le membre superieur."
      }
    );
    addTube(
      "nerves",
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.06, -0.42, -0.03),
        new THREE.Vector3(side * 0.24, -0.62, -0.1),
        new THREE.Vector3(side * 0.35, -1.05, -0.1),
        new THREE.Vector3(side * 0.48, -1.62, -0.06)
      ]),
      0.012,
      materials.nerve,
      "Nerf sciatique",
      {
        system: "Nerf",
        note: "Trajet posterieur simplifie vers la jambe."
      }
    );
  });
}

function buildVesselLayer() {
  addEllipsoid("vessels", [0, 0.58, 0.1], [0.08, 0.1, 0.07], materials.artery, "Coeur", {
    system: "Vaisseaux",
    note: "Repere cardiaque stylise au centre du thorax."
  });

  addTube(
    "vessels",
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.72, 0.1),
      new THREE.Vector3(0.03, 0.82, 0.08),
      new THREE.Vector3(0.02, 0.25, 0.08),
      new THREE.Vector3(0, -0.55, 0.06)
    ]),
    0.015,
    materials.artery,
    "Aorte",
    {
      system: "Vaisseaux",
      note: "Axe arteriel principal, courbure simplifiee."
    }
  );

  addTube(
    "vessels",
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.04, 0.54, 0.06),
      new THREE.Vector3(-0.03, 0.1, 0.03),
      new THREE.Vector3(-0.02, -0.5, 0.02)
    ]),
    0.013,
    materials.vein,
    "Veine cave",
    {
      system: "Vaisseaux",
      note: "Axe veineux central schematique."
    }
  );

  mirror((side) => {
    addTube(
      "vessels",
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.7, 0.1),
        new THREE.Vector3(side * 0.28, 0.77, 0.08),
        new THREE.Vector3(side * 0.58, 0.52, 0.04),
        new THREE.Vector3(side * 0.88, -0.3, 0.035)
      ]),
      0.011,
      materials.artery,
      "Artere du membre superieur",
      {
        system: "Vaisseaux",
        note: "Continuation sous-claviere/brachiale simplifiee."
      }
    );
    addTube(
      "vessels",
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.03, -0.45, 0.06),
        new THREE.Vector3(side * 0.22, -0.64, 0.07),
        new THREE.Vector3(side * 0.35, -1.15, 0.08),
        new THREE.Vector3(side * 0.48, -1.74, 0.08)
      ]),
      0.012,
      materials.artery,
      "Artere femorale",
      {
        system: "Vaisseaux",
        note: "Trajet arteriel vers le membre inferieur."
      }
    );
  });
}

let scanPlane;

function buildScanPlane() {
  scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 3.7), materials.scan);
  scanPlane.position.set(0, 0, 0.34);
  scanPlane.rotation.y = Math.PI / 2;
  anatomyRoot.add(scanPlane);
}

function createLabels() {
  [
    ["Crane", [0, 1.9, 0]],
    ["Cage thoracique", [0.44, 0.72, 0.1]],
    ["Moelle spinale", [-0.34, 0.48, -0.05]],
    ["Quadriceps", [0.62, -0.74, 0.14]],
    ["Tendon d'Achille", [0.76, -1.65, -0.02]],
    ["Plexus brachial", [-0.72, 0.54, 0.05]]
  ].forEach(([text, position]) => {
    const marker = new THREE.Object3D();
    marker.position.fromArray(position);
    anatomyRoot.add(marker);
    const node = document.createElement("div");
    node.className = "anatomy-label";
    node.textContent = text;
    labelLayer.append(node);
    labels.push({ marker, node });
  });
}

function addCapsule(layer, position, scale, material, name, data) {
  const geometry = new THREE.CapsuleGeometry(0.5, 1, 18, 28);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(position);
  mesh.scale.fromArray(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  registerMesh(mesh, layer, name, data);
  return mesh;
}

function addEllipsoid(layer, position, scale, material, name, data) {
  const geometry = new THREE.SphereGeometry(1, 40, 28);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(position);
  mesh.scale.fromArray(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  registerMesh(mesh, layer, name, data);
  return mesh;
}

function addCapsuleBetween(layer, startArray, endArray, radius, material, name, data) {
  const start = new THREE.Vector3().fromArray(startArray);
  const end = new THREE.Vector3().fromArray(endArray);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 12, 18);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  registerMesh(mesh, layer, name, data);
  return mesh;
}

function addTube(layer, curve, radius, material, name, data) {
  const geometry = new THREE.TubeGeometry(curve, 46, radius, 10, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  registerMesh(mesh, layer, name, data);
  return mesh;
}

function registerMesh(mesh, layer, name, data = {}) {
  mesh.name = name;
  mesh.userData = {
    anatomy: {
      name,
      layer,
      system: data.system || layerConfig[layer]?.label || layer,
      note: data.note || "Structure anatomique."
    },
    baseScale: mesh.scale.clone()
  };
  layers[layer].add(mesh);
  interactive.push(mesh);
  if (layer === "muscles") animatedParts.push(mesh);
}

function mirror(callback) {
  callback(-1);
  callback(1);
}

async function loadValidatedManifest() {
  try {
    const response = await fetch("./assets/anatomy-manifest.json", { cache: "no-store" });
    if (!response.ok) return;
    const manifest = await response.json();
    sourceStatus.textContent = manifest.sourceLabel || "Atlas valide charge";
    if (manifest.replaceDemo) demoRoot.visible = false;
    await Promise.all((manifest.assets || []).map((asset) => loadAsset(asset, manifest.scale || 1)));
  } catch (error) {
    console.info("Aucun manifeste anatomique externe charge.", error);
  }
}

async function loadAsset(asset, globalScale) {
  const type = (asset.type || asset.path.split(".").pop() || "").toLowerCase();
  const loader = type === "obj" ? new OBJLoader() : new GLTFLoader();

  const object = await new Promise((resolve, reject) => {
    loader.load(
      asset.path,
      (result) => resolve(type === "obj" ? result : result.scene),
      undefined,
      reject
    );
  });

  const layer = layerConfig[asset.layer] ? asset.layer : "skeleton";
  const color = asset.color || layerConfig[layer].color;
  const opacity = asset.opacity ?? layerConfig[layer].opacity;
  const mat = makeMaterial(color, opacity, opacity < 1, 0.76);
  object.traverse((child) => {
    if (child.isMesh) {
      child.material = mat;
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.anatomy = {
        name: asset.name || child.name || "Structure importee",
        layer,
        system: layerConfig[layer].label,
        note: asset.note || "Mesh charge depuis le manifeste anatomique."
      };
      interactive.push(child);
    }
  });
  object.position.fromArray(asset.position || [0, 0, 0]);
  object.rotation.fromArray(asset.rotation || [0, 0, 0]);
  const scale = (asset.scale || 1) * globalScale;
  object.scale.setScalar(scale);
  object.name = asset.name || "Imported anatomy asset";
  importedRoot.add(object);
}

function updateLayerState() {
  Object.entries(layerConfig).forEach(([key, config]) => {
    const group = layers[key];
    group.position.copy(config.separation).multiplyScalar(state.separation);
  });

  scene.traverse((object) => {
    if (!object.isMesh || !object.material || object === scanPlane) return;
    const anatomy = object.userData.anatomy;
    if (!anatomy) return;
    const base = layerConfig[anatomy.layer]?.opacity ?? 1;
    const target = Math.min(1, base * state.globalOpacity);
    object.material.opacity = target;
    object.material.transparent = target < 0.98;
    object.material.depthWrite = target > 0.42;
  });
}

function pickStructure() {
  raycaster.setFromCamera(state.pointer, camera);
  const hits = raycaster.intersectObjects(interactive, false);
  if (!hits.length) return;
  const picked = (hits.find((hit) => hit.object.userData.anatomy?.layer !== "skin") || hits[0]).object;
  state.selected = picked;
  const info = picked.userData.anatomy;
  selectedName.textContent = info.name;
  selectedSystem.textContent = info.system;
  selectedNote.textContent = info.note;
}

const clock = new THREE.Clock();

function render() {
  const elapsed = clock.getElapsedTime();
  const delta = clock.getDelta();
  const speed = state.speed;
  const intro = easeOut(elapsed / 2.15);
  const pose = scrollPose(state.scrollProgress);

  state.separation = pose.separation;
  state.globalOpacity = pose.opacity;
  state.scrollRotation = pose.rotation;
  separationSlider.value = state.separation.toFixed(2);
  opacitySlider.value = state.globalOpacity.toFixed(2);
  updateLayerState();

  if (state.autoRotate) {
    state.spin += delta * 0.18 * speed;
  }

  anatomyRoot.rotation.y = state.scrollRotation + state.spin + (1 - intro) * -1.85;
  anatomyRoot.scale.setScalar(THREE.MathUtils.lerp(0.08, 1, intro));
  anatomyRoot.position.y = THREE.MathUtils.lerp(-1.1, 0, intro);

  camera.position.lerp(pose.camera, 0.08);
  controls.target.lerp(pose.target, 0.08);

  if (state.tour) {
    const value = 0.44 + Math.sin(elapsed * 0.75 * speed) * 0.3;
    state.separation = THREE.MathUtils.clamp(value, 0.08, 0.86);
    separationSlider.value = state.separation.toFixed(2);
    updateLayerState();
  }

  animatedParts.forEach((part, index) => {
    const pulse = 1 + Math.sin(elapsed * 2.1 * speed + index * 0.37) * 0.025;
    part.scale.copy(part.userData.baseScale).multiplyScalar(pulse);
  });

  if (scanPlane) {
    scanPlane.visible = state.scrollProgress > 0.28 || state.tour;
    scanPlane.position.x = Math.sin(elapsed * 0.7 * speed) * 0.46;
    scanPlane.material.opacity = 0.08 + Math.sin(elapsed * 1.4 * speed) * 0.03;
  }

  controls.update();
  updateHover();
  updateLabels();
  renderer.render(scene, camera);
}

function updateHover() {
  raycaster.setFromCamera(state.pointer, camera);
  const hits = raycaster.intersectObjects(interactive, false);
  document.body.style.cursor = hits.length ? "pointer" : "default";
}

function updateLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  labels.forEach(({ marker, node }) => {
    const pos = marker.getWorldPosition(new THREE.Vector3()).project(camera);
    const visible = pos.z < 1;
    node.style.display = visible ? "block" : "none";
    node.style.opacity = state.scrollProgress > 0.12 ? "1" : "0";
    node.style.left = `${(pos.x * 0.5 + 0.5) * width}px`;
    node.style.top = `${(-pos.y * 0.5 + 0.5) * height}px`;
  });
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
