import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Vehicle } from "./classes/Vehicle.js";
import { PhysicsEngine } from "./classes/PhysicsEngine.js";
import { DataLogger } from "./utils/DataLogger.js";

const canvas = document.getElementById("scene");
const viewport = document.querySelector(".viewport");

const ui = {
  scenario: document.getElementById("scenario"),
  friction: document.getElementById("friction"),
  slopeDeg: document.getElementById("slopeDeg"),
  restitution: document.getElementById("restitution"),
  massA: document.getElementById("massA"),
  speedA: document.getElementById("speedA"),
  skidA: document.getElementById("skidA"),
  distanceA: document.getElementById("distanceA"),
  massB: document.getElementById("massB"),
  speedB: document.getElementById("speedB"),
  distanceB: document.getElementById("distanceB"),
  noBrake: document.getElementById("noBrake"),
  pauseBtn: document.getElementById("pauseBtn"),
  speedFactor: document.getElementById("speedFactor"),
  speedValue: document.getElementById("speedValue"),
  processBtn: document.getElementById("processBtn"),
  resetBtn: document.getElementById("resetBtn"),
  exportBtn: document.getElementById("exportBtn"),
  hudVelA: document.getElementById("hudVelA"),
  hudVelB: document.getElementById("hudVelB"),
  hudVelF: document.getElementById("hudVelF"),
  hudAngle: document.getElementById("hudAngle"),
  hudPhase: document.getElementById("hudPhase"),
  hudHash: document.getElementById("hudHash"),
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.Fog(0x0b0f14, 25, 90);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(18, 12, 18);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = true;
controls.minDistance = 8;
controls.maxDistance = 80;
controls.maxPolarAngle = Math.PI / 2.05;
controls.target.set(0, 0, 0);
controls.update();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(10, 18, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 70;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -30;
scene.add(ambientLight, dirLight);

const roadGroup = new THREE.Group();
scene.add(roadGroup);

const createAsphaltTexture = () => {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  context.fillStyle = "#2a2f35";
  context.fillRect(0, 0, size, size);

  const imageData = context.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const variation = (Math.random() - 0.5) * 26;
    const base = 42 + variation;
    const value = Math.max(18, Math.min(70, base));
    data[i] = value;
    data[i + 1] = value + 2;
    data[i + 2] = value + 4;
    data[i + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);

  for (let i = 0; i < 9000; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() * 1.4;
    context.fillStyle = "rgba(70, 70, 70, 0.25)";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let i = 0; i < 120; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const width = 8 + Math.random() * 24;
    const height = 40 + Math.random() * 120;
    context.fillStyle = "rgba(18, 18, 18, 0.18)";
    context.fillRect(x, y, width, height);
  }

  return new THREE.CanvasTexture(canvas);
};

const roadTexture = createAsphaltTexture();
roadTexture.wrapS = THREE.RepeatWrapping;
roadTexture.wrapT = THREE.RepeatWrapping;
roadTexture.repeat.set(4, 4);
roadTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
roadTexture.minFilter = THREE.LinearMipmapLinearFilter;
roadTexture.magFilter = THREE.LinearFilter;
if ("colorSpace" in roadTexture) {
  roadTexture.colorSpace = THREE.SRGBColorSpace;
}

const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.9,
  metalness: 0.05,
  map: roadTexture,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
roadGroup.add(ground);

const laneGroup = new THREE.Group();
const laneMaterial = new THREE.MeshStandardMaterial({
  color: 0x2f3b44,
  roughness: 0.8,
  metalness: 0.1,
});
for (let i = -2; i <= 2; i += 1) {
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.3), laneMaterial);
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.01, i * 6);
  strip.receiveShadow = true;
  laneGroup.add(strip);
}
roadGroup.add(laneGroup);

const skidGroup = new THREE.Group();
const yawGroup = new THREE.Group();
const markerGroup = new THREE.Group();
const trailGroup = new THREE.Group();
roadGroup.add(skidGroup, yawGroup, markerGroup, trailGroup);

const trailMaterialA = new THREE.LineDashedMaterial({
  color: 0x3da5ff,
  dashSize: 0.6,
  gapSize: 0.4,
  transparent: true,
  opacity: 0.7,
});
const trailMaterialB = new THREE.LineDashedMaterial({
  color: 0xff6b6b,
  dashSize: 0.6,
  gapSize: 0.4,
  transparent: true,
  opacity: 0.7,
});
const trailGeometryA = new THREE.BufferGeometry();
const trailGeometryB = new THREE.BufferGeometry();
const trailLineA = new THREE.Line(trailGeometryA, trailMaterialA);
const trailLineB = new THREE.Line(trailGeometryB, trailMaterialB);
trailGroup.add(trailLineA, trailLineB);

const arrowA = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(),
  1,
  0x3da5ff,
  0.4,
  0.25,
);
const arrowB = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(),
  1,
  0xff6b6b,
  0.4,
  0.25,
);
const arrowF = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(),
  1,
  0xf4f5f6,
  0.5,
  0.3,
);
roadGroup.add(arrowA, arrowB, arrowF);
arrowA.visible = false;
arrowB.visible = false;
arrowF.visible = false;

let vehicleA = null;
let vehicleB = null;
let physics = null;
let simulationActive = false;
let isPaused = false;
let simulationSpeed = 1;
let skidTimer = 0;
let yawTimer = 0;
let impactCaptured = false;
let restMarker = null;
let dataLogger = null;
let auditFinalized = false;
let currentConfig = null;

const trailPointsA = [];
const trailPointsB = [];
const trailMaxPoints = 260;
const trailMinDistance = 0.35;
let lastTrailPointA = null;
let lastTrailPointB = null;

const clock = new THREE.Clock();

const readNumber = (input, fallback) => {
  const value = parseFloat(input.value);
  return Number.isFinite(value) ? value : fallback;
};

const formatNumber = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return "0.00";
  }
  return value.toFixed(digits);
};

const setSpeedLabel = (value) => {
  if (ui.speedValue) {
    ui.speedValue.textContent = `${value.toFixed(2)}x`;
  }
};

const updateSpeedFromUi = () => {
  const value = readNumber(ui.speedFactor, 1);
  simulationSpeed = Math.min(Math.max(value, 0.25), 3);
  setSpeedLabel(simulationSpeed);
};

const KMH_TO_MS = 1 / 3.6;
const MS_TO_KMH = 3.6;
const DEG_TO_RAD = Math.PI / 180;

const toMetersPerSecond = (speedKmh) => speedKmh * KMH_TO_MS;
const toKilometersPerHour = (speedMs) => speedMs * MS_TO_KMH;

const applyRoadSlope = (slopeDeg) => {
  roadGroup.rotation.z = slopeDeg * DEG_TO_RAD;
};

const buildScenario = (scenario, distanceA, distanceB) => {
  const posA = { x: -distanceA, z: 0 };
  const dirA = new THREE.Vector3(1, 0, 0);
  let posB = { x: 0, z: -distanceB };
  let dirB = new THREE.Vector3(0, 0, 1);
  let typeB = "Sedan";
  let radiusB = 1.1;

  if (scenario === "frontal") {
    posB = { x: distanceB, z: 0 };
    dirB = new THREE.Vector3(-1, 0, 0);
  } else if (scenario === "muro") {
    posB = { x: distanceB, z: 0 };
    dirB = new THREE.Vector3(0, 0, 0);
  } else if (scenario === "atropello") {
    posB = { x: 0, z: -distanceB };
    dirB = new THREE.Vector3(0, 0, 1);
    typeB = "Moto";
    radiusB = 0.55;
  }

  return { posA, dirA, posB, dirB, typeB, radiusB };
};

const trimGroup = (group, max) => {
  while (group.children.length > max) {
    group.remove(group.children[0]);
  }
};

const clearMarks = () => {
  while (skidGroup.children.length > 0) {
    skidGroup.remove(skidGroup.children[0]);
  }
  while (yawGroup.children.length > 0) {
    yawGroup.remove(yawGroup.children[0]);
  }
  while (markerGroup.children.length > 0) {
    markerGroup.remove(markerGroup.children[0]);
  }
};

const resetScene = () => {
  simulationActive = false;
  skidTimer = 0;
  yawTimer = 0;
  impactCaptured = false;
  restMarker = null;
  dataLogger = null;
  auditFinalized = false;
  currentConfig = null;

  if (vehicleA) {
    roadGroup.remove(vehicleA.mesh);
    vehicleA = null;
  }
  if (vehicleB) {
    roadGroup.remove(vehicleB.mesh);
    vehicleB = null;
  }

  clearMarks();

  arrowA.visible = false;
  arrowB.visible = false;
  arrowF.visible = false;

  ui.hudVelA.textContent = "0.00";
  ui.hudVelB.textContent = "0.00";
  ui.hudVelF.textContent = "0.00";
  ui.hudAngle.textContent = "0.0";
  ui.hudPhase.textContent = "En espera";
  if (ui.hudHash) {
    ui.hudHash.textContent = "N/D";
  }
  applyRoadSlope(0);
};

const addSkidMark = (vehicle) => {
  if (!vehicle) {
    return;
  }
  const speed = vehicle.getSpeed();
  if (speed <= 0.2) {
    return;
  }
  const direction = new THREE.Vector3(vehicle.vx, 0, vehicle.vz);
  if (direction.lengthSq() <= 0) {
    return;
  }
  direction.normalize();
  const mark = vehicle.createSkidMark({
    position: { x: vehicle.x, z: vehicle.z },
    direction,
  });
  skidGroup.add(mark);
  trimGroup(skidGroup, 320);
};

const addYawMark = (vehicle, intensity) => {
  if (!vehicle) {
    return;
  }
  const speed = vehicle.getSpeed();
  if (speed <= 0.3) {
    return;
  }
  const direction = new THREE.Vector3(vehicle.vx, 0, vehicle.vz);
  if (direction.lengthSq() <= 0) {
    return;
  }
  direction.normalize();
  const mark = vehicle.createYawMark({
    position: { x: vehicle.x, z: vehicle.z },
    direction,
    intensity,
  });
  yawGroup.add(mark);
  trimGroup(yawGroup, 260);
};

const makeTextSprite = (text) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const padding = 18;
  const font = "16px Share Tech Mono";

  context.font = font;
  const metrics = context.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  canvas.width = textWidth + padding * 2;
  canvas.height = 42;

  context.font = font;
  context.fillStyle = "rgba(9, 12, 16, 0.85)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255, 255, 255, 0.2)";
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  context.fillStyle = "#f7fbff";
  context.textBaseline = "middle";
  context.fillText(text, padding, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width / 80, canvas.height / 80, 1);
  return sprite;
};

const createRestMarker = (position) => {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.28, 32),
    new THREE.MeshStandardMaterial({
      color: 0xf3c76a,
      roughness: 0.6,
      metalness: 0.15,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, 0.02, position.z);
  group.add(ring);

  const label = makeTextSprite(
    `X:${formatNumber(position.x, 2)} Z:${formatNumber(position.z, 2)}`,
  );
  label.position.set(position.x, 0.6, position.z);
  group.add(label);
  return group;
};

const updateArrows = () => {
  if (!vehicleA || !vehicleB) {
    return;
  }

  const speedA = vehicleA.getSpeed();
  const speedB = vehicleB.getSpeed();

  if (!physics || !physics.hasCollided) {
    arrowA.visible = speedA > 0.01;
    arrowB.visible = speedB > 0.01;
    arrowF.visible = false;

    if (speedA > 0.01) {
      const dirA = new THREE.Vector3(vehicleA.vx, 0, vehicleA.vz).normalize();
      arrowA.position.set(vehicleA.x, 0.6, vehicleA.z);
      arrowA.setDirection(dirA);
      arrowA.setLength(Math.max(0.5, speedA * 0.4), 0.4, 0.25);
    }

    if (speedB > 0.01) {
      const dirB = new THREE.Vector3(vehicleB.vx, 0, vehicleB.vz).normalize();
      arrowB.position.set(vehicleB.x, 0.6, vehicleB.z);
      arrowB.setDirection(dirB);
      arrowB.setLength(Math.max(0.5, speedB * 0.4), 0.4, 0.25);
    }
  } else {
    arrowA.visible = false;
    arrowB.visible = false;
    arrowF.visible = physics.resultSpeed > 0.01;

    if (physics.resultSpeed > 0.01) {
      const dirF = new THREE.Vector3(
        physics.resultVelocity.x,
        0,
        physics.resultVelocity.z,
      ).normalize();
      arrowF.position.set(vehicleA.x, 0.7, vehicleA.z);
      arrowF.setDirection(dirF);
      arrowF.setLength(Math.max(0.8, physics.resultSpeed * 0.5), 0.5, 0.3);
    }
  }
};

const updateHud = () => {
  if (!vehicleA || !vehicleB || !physics) {
    return;
  }

  ui.hudVelA.textContent = formatNumber(
    toKilometersPerHour(vehicleA.getSpeed()),
  );
  ui.hudVelB.textContent = formatNumber(
    toKilometersPerHour(vehicleB.getSpeed()),
  );
  ui.hudVelF.textContent = formatNumber(
    toKilometersPerHour(physics.resultSpeed),
  );
  ui.hudAngle.textContent = formatNumber(physics.resultAngleDeg, 1);
  ui.hudPhase.textContent = physics.getPhaseLabel();
};

const finalizeAudit = async () => {
  if (!dataLogger || auditFinalized || !physics) {
    return;
  }

  auditFinalized = true;
  const outputs = {
    hasCollided: physics.hasCollided,
    resultSpeed: physics.resultSpeed,
    resultAngleDeg: physics.resultAngleDeg,
    resultVelocity: { ...physics.resultVelocity },
    finalSpeedA: vehicleA ? vehicleA.getSpeed() : 0,
    finalSpeedB: vehicleB ? vehicleB.getSpeed() : 0,
    restPosition: currentConfig?.restPosition || null,
  };
  dataLogger.setOutputs(outputs);
  const hash = await dataLogger.finalizeHash();
  if (ui.hudHash) {
    ui.hudHash.textContent = hash || "N/D";
  }
  if (currentConfig) {
    currentConfig.hash = hash;
  }
};

const startSimulation = async () => {
  resetScene();

  dataLogger = new DataLogger();
  const scenario = ui.scenario.value;
  const scenarioLabel =
    ui.scenario.options[ui.scenario.selectedIndex]?.text || scenario;

  const rawInputs = {
    scenario,
    mu: parseFloat(ui.friction.value),
    slopeDeg: readNumber(ui.slopeDeg, 0),
    restitution: readNumber(ui.restitution, 0),
    massA: readNumber(ui.massA, 1200),
    skidA: readNumber(ui.skidA, 0),
    speedAInputKmh: Math.max(0, readNumber(ui.speedA, 0)),
    massB: readNumber(ui.massB, 1100),
    speedBInputKmh: Math.max(0, readNumber(ui.speedB, 0)),
    distanceA: Math.max(0, readNumber(ui.distanceA, 14)),
    distanceB: Math.max(0, readNumber(ui.distanceB, 10)),
    noBrake: ui.noBrake.checked,
  };

  let inputs;
  try {
    inputs = dataLogger.sanitizeInputs(rawInputs);
  } catch (error) {
    ui.hudPhase.textContent = "Datos invalidos";
    if (ui.hudHash) {
      ui.hudHash.textContent = "N/D";
    }
    alert(error.message);
    return;
  }

  applyRoadSlope(inputs.slopeDeg);
  const collisionAxis = inputs.scenario === "frontal" ? { x: 1, z: 0 } : null;
  physics = new PhysicsEngine({
    mu: inputs.mu,
    noBrake: inputs.noBrake,
    slopeDeg: inputs.slopeDeg,
    restitution: inputs.restitution,
    collisionAxis,
    logger: dataLogger,
  });
  const speedAFromSkid = physics.computeSpeedFromSkid(
    inputs.skidA,
    inputs.slopeDeg,
  );
  const speedA =
    inputs.speedAInputKmh > 0
      ? toMetersPerSecond(inputs.speedAInputKmh)
      : speedAFromSkid;
  const speedB = toMetersPerSecond(inputs.speedBInputKmh);

  const scenarioData = buildScenario(
    inputs.scenario,
    inputs.distanceA,
    inputs.distanceB,
  );

  vehicleA = new Vehicle({
    tipo: "Sedan",
    masa: inputs.massA,
    x: scenarioData.posA.x,
    z: scenarioData.posA.z,
    vx: scenarioData.dirA.x * speedA,
    vz: scenarioData.dirA.z * speedA,
    radio: 1.2,
  });

  vehicleB = new Vehicle({
    tipo: scenarioData.typeB,
    masa: inputs.massB,
    x: scenarioData.posB.x,
    z: scenarioData.posB.z,
    vx: scenarioData.dirB.x * speedB,
    vz: scenarioData.dirB.z * speedB,
    radio: scenarioData.radiusB,
  });

  roadGroup.add(vehicleA.mesh, vehicleB.mesh);

  await Promise.all([
    vehicleA.loadModel("/assets/sedan.glb", 0x2f83ff),
    vehicleB.loadModel(
      scenarioData.typeB === "Moto" ? "/assets/moto.glb" : "/assets/sedan.glb",
      0xff6b6b,
    ),
  ]);

  physics.initialize(vehicleA, vehicleB);

  dataLogger.setInputs({
    ...inputs,
    scenarioLabel,
    speedAFromSkid,
    speedA,
    speedB,
  });

  currentConfig = {
    ...inputs,
    scenarioLabel,
    speedAFromSkid,
    speedA,
    speedB,
    hash: "",
    restPosition: null,
  };

  simulationActive = true;
  clock.start();
};

const exportReport = async () => {
  if (!currentConfig) {
    return;
  }

  await finalizeAudit();

  const report = [];
  report.push("DICTAMEN FORENSE - SIMULADOR 3D");
  report.push(`Fecha: ${new Date().toISOString().slice(0, 10)}`);
  report.push("");
  report.push(`Escenario: ${currentConfig.scenarioLabel}`);
  report.push(`Friccion (mu): ${currentConfig.mu}`);
  report.push(
    `Inclinacion de calle: ${formatNumber(currentConfig.slopeDeg, 1)} deg`,
  );
  report.push(
    `Coeficiente de restitucion (e): ${formatNumber(
      currentConfig.restitution,
      2,
    )}`,
  );
  report.push(`Masa Vehiculo A: ${currentConfig.massA} kg`);
  report.push(`Masa Vehiculo B: ${currentConfig.massB} kg`);
  report.push(
    `Distancia inicial A: ${formatNumber(currentConfig.distanceA)} m`,
  );
  report.push(
    `Distancia inicial B: ${formatNumber(currentConfig.distanceB)} m`,
  );
  report.push(
    `Velocidad inicial A: ${formatNumber(
      toKilometersPerHour(currentConfig.speedA),
    )} km/h`,
  );
  report.push(
    `Velocidad inicial B: ${formatNumber(
      toKilometersPerHour(currentConfig.speedB),
    )} km/h`,
  );

  if (physics && physics.hasCollided) {
    report.push(
      `Velocidad final resultante: ${formatNumber(
        toKilometersPerHour(physics.resultSpeed),
      )} km/h`,
    );
    report.push(
      `Angulo impacto: ${formatNumber(physics.resultAngleDeg, 1)} deg`,
    );
  } else {
    report.push("No se detecto colision en la simulacion.");
  }

  if (currentConfig.restPosition) {
    report.push(
      `Posicion final (X, Z): ${formatNumber(
        currentConfig.restPosition.x,
        2,
      )}, ${formatNumber(currentConfig.restPosition.z, 2)}`,
    );
  }

  report.push("");
  report.push("VALIDACION CRIPTOGRAFICA");
  report.push(`Hash SHA-256: ${currentConfig.hash || "N/D"}`);

  const blob = new Blob([report.join("\n")], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dictamen_forense.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

ui.processBtn.addEventListener("click", () => {
  startSimulation();
});

ui.resetBtn.addEventListener("click", () => {
  resetScene();
});

ui.exportBtn.addEventListener("click", () => {
  exportReport();
});

const resizeRenderer = () => {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

const resizeObserver = new ResizeObserver(() => resizeRenderer());
resizeObserver.observe(viewport);
resizeRenderer();

const animate = () => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (simulationActive && vehicleA && vehicleB && physics) {
    physics.update(dt, vehicleA, vehicleB);

    if (physics.hasCollided && !impactCaptured) {
      vehicleA.captureImpactHeading();
      vehicleB.captureImpactHeading();
      if (currentConfig?.scenario === "frontal") {
        vehicleA.lockHeading();
        vehicleB.lockHeading();
      }
      impactCaptured = true;
    }

    vehicleA.update(dt);
    vehicleB.update(dt);

    updateArrows();
    updateHud();

    if (!physics.hasCollided && !physics.noBrake) {
      skidTimer -= dt;
      if (skidTimer <= 0) {
        addSkidMark(vehicleA);
        skidTimer = 0.12;
      }
    }

    if (physics.hasCollided) {
      yawTimer -= dt;
      if (yawTimer <= 0) {
        const yawThreshold = 12 * DEG_TO_RAD;
        const maxYaw = 45 * DEG_TO_RAD;
        const yawA = Math.abs(vehicleA.getSlipAngle());
        const yawB = Math.abs(vehicleB.getSlipAngle());
        if (yawA > yawThreshold) {
          addYawMark(vehicleA, Math.min(1, yawA / maxYaw));
        }
        if (yawB > yawThreshold) {
          addYawMark(vehicleB, Math.min(1, yawB / maxYaw));
        }
        yawTimer = 0.08;
      }
    }

    if (physics.stopped) {
      simulationActive = false;
      if (!restMarker) {
        const restPosition = {
          x: (vehicleA.x + vehicleB.x) * 0.5,
          z: (vehicleA.z + vehicleB.z) * 0.5,
        };
        restMarker = createRestMarker(restPosition);
        markerGroup.add(restMarker);
        currentConfig.restPosition = restPosition;
        finalizeAudit();
      }
    }
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};

animate();
