// js/scene3d.js — Escena 3D / WebXR v2 para LPSBOX System:
// - Edificio arquitectónico de 4 pisos en corte (dollhouse) + escalera de emergencia acristalada + azotea
// - Nodo Sniffer (modelo3d.stl + Raspberry Pi 5 + MPU6050) con pantalla OLED calibrada al 100% del marco
// - Poste de Luz exterior con malacate/polea para bajar el LPSBOX Gateway (3 LEDs físicos) y extraer por USB-C
// - NPCs articulados con vestimenta variada, posturas reactivas y globos de diálogo en vivo
// - Sistema físico de objetos que oscilan, vuelcan y caen (lámparas, estantes, monitores, cajas, cuadros, plafones, chispas y polvo)

import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { STLLoader } from '../vendor/three/STLLoader.js';
import {
  FLOOR_HEIGHT,
  ZONES,
  ASSEMBLY_POINT,
  POLE_WORLD_POS,
  GATEWAY_HEIGHT_UP,
  GATEWAY_HEIGHT_DOWN,
  SNIFFER_WORLD_POS
} from './simulation.js';

let cachedStlGeometry = null;
const stlCallbacks = [];
let stlLoadingStarted = false;

export function loadSharedStlGeometry(onLoaded, onError) {
  if (cachedStlGeometry) {
    onLoaded(cachedStlGeometry);
    return;
  }
  stlCallbacks.push({ onLoaded, onError });
  if (stlLoadingStarted) return;
  stlLoadingStarted = true;

  const loader = new STLLoader();
  fetch('./modelo3d.stl')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((buffer) => {
      const geometry = loader.parse(buffer);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      cachedStlGeometry = geometry;
      stlCallbacks.forEach((cb) => cb.onLoaded && cb.onLoaded(geometry));
    })
    .catch((err) => {
      stlCallbacks.forEach((cb) => cb.onError && cb.onError(err));
    });
}

function drawRoundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function makeLabelTexture(title, subtitle, borderColor = '#38bdf8', bgAlpha = 0.88) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 148;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = `rgba(8, 14, 26, ${bgAlpha})`;
  drawRoundRectPath(ctx, 6, 6, 500, 136, 18);
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = borderColor;
  drawRoundRectPath(ctx, 6, 6, 500, 136, 18);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 31px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 62);

  ctx.fillStyle = borderColor;
  ctx.font = '600 22px monospace';
  ctx.fillText(subtitle, 256, 108);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#040814');
  grad.addColorStop(0.42, '#0b1730');
  grad.addColorStop(0.72, '#162b4d');
  grad.addColorStop(0.9, '#1e3a5f');
  grad.addColorStop(1.0, '#09111f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Subtle stars in upper twilight sky
  ctx.fillStyle = 'rgba(226, 232, 240, 0.65)';
  for (let i = 0; i < 90; i++) {
    const sx = (i * 73) % 512;
    const sy = (i * 41) % 115;
    const sr = (i % 3 === 0) ? 1.4 : 0.9;
    ctx.fillRect(sx, sy, sr, sr);
  }

  // Distant city skyline silhouette near horizon
  ctx.fillStyle = 'rgba(7, 13, 25, 0.85)';
  let bx = 0;
  let seed = 17;
  while (bx < 512) {
    seed = (seed * 31 + 13) % 97;
    const bw = 12 + (seed % 22);
    const bh = 16 + ((seed * 7) % 42);
    ctx.fillRect(bx, 224 - bh, bw - 1, bh + 32);
    // Tiny lit windows
    ctx.fillStyle = 'rgba(251, 191, 36, 0.28)';
    for (let wy = 224 - bh + 5; wy < 218; wy += 7) {
      for (let wx = bx + 3; wx < bx + bw - 4; wx += 5) {
        if ((wx + wy) % 3 === 0) ctx.fillRect(wx, wy, 2, 3);
      }
    }
    ctx.fillStyle = 'rgba(7, 13, 25, 0.85)';
    bx += bw;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawSpeechBubbleCanvas(canvas, text, urgency = 'normal') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const palette = {
    normal: { bg: 'rgba(15, 23, 42, 0.92)', border: '#38bdf8', text: '#f1f5f9' },
    mild: { bg: 'rgba(40, 29, 8, 0.95)', border: '#fbbf24', text: '#fef3c7' },
    major: { bg: 'rgba(69, 10, 10, 0.96)', border: '#f87171', text: '#fee2e2' },
    catastrophic: { bg: 'rgba(59, 7, 100, 0.97)', border: '#c084fc', text: '#faf5ff' },
    trapped: { bg: 'rgba(88, 12, 24, 0.97)', border: '#fb7185', text: '#ffe4e6' },
    safe: { bg: 'rgba(6, 46, 34, 0.94)', border: '#34d399', text: '#d1fae5' }
  };
  const style = palette[urgency] || palette.normal;

  // Bubble box + pointer triangle
  const boxH = h - 24;
  ctx.fillStyle = style.bg;
  drawRoundRectPath(ctx, 8, 6, w - 16, boxH, 20);
  ctx.fill();

  ctx.lineWidth = urgency === 'major' || urgency === 'catastrophic' || urgency === 'trapped' ? 5 : 3.5;
  ctx.strokeStyle = style.border;
  drawRoundRectPath(ctx, 8, 6, w - 16, boxH, 20);
  ctx.stroke();

  // Pointer tail
  ctx.fillStyle = style.border;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 11, boxH + 6);
  ctx.lineTo(w / 2 + 11, boxH + 6);
  ctx.lineTo(w / 2, h - 3);
  ctx.closePath();
  ctx.fill();

  // Word-wrap into up to 2 lines
  ctx.fillStyle = style.text;
  ctx.font = 'bold 23px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';

  const words = String(text || '').split(' ');
  const lines = [];
  let cur = '';
  words.forEach((word) => {
    const test = cur ? `${cur} ${word}` : word;
    if (test.length > 26 && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  });
  if (cur) lines.push(cur);

  if (lines.length === 1) {
    ctx.fillText(lines[0], w / 2, 58);
  } else {
    ctx.fillText(lines[0], w / 2, 43);
    ctx.fillText(lines.slice(1).join(' ').slice(0, 32), w / 2, 74);
  }
}

export class LPSBoxScene3D {
  constructor(container, simulation, callbacks = {}) {
    this.container = container;
    this.sim = simulation;
    this.cb = callbacks;

    this.cameraMode = 'tactical'; // 'tactical' | 'firstperson' | 'gateway' | 'sniffer'
    this.mrVisionEnabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070d19);
    this.scene.fog = new THREE.FogExp2(0x070d19, 0.011);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 180);
    this.camera.position.set(1.5, 13.8, 25.5);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (_) {
      this.renderer = new THREE.WebGLRenderer({ antialias: false });
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.xr.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.492;
    this.controls.minDistance = 0.9;
    this.controls.maxDistance = 54;
    this.controls.target.set(0.2, 5.6, 1.2);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.55;
    this.introOrbitActive = true;

    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      arrowup: false,
      arrowdown: false,
      arrowleft: false,
      arrowright: false,
      space: false,
      shift: false,
      c: false,
      q: false
    };
    this.fpYaw = 0.24;
    this.fpPitch = 0.05;
    this.fpPos = new THREE.Vector3(2.8, 0.14, 11.8);
    this.fpVelY = 0;
    this.fpGrounded = true;
    this.fpCrouching = false;
    this.fpFlashlightOn = false;
    this.staticColliders = [];
    this.collapseColliders = [];
    this.structuralPieces = [];
    this._lastStructuralStage = 0;
    this._sparkDamageTimer = 0;
    this.isPointerDragging = false;

    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();
    this.clickableGateway = [];
    this.clickablePole = [];
    this.clickableSniffer = [];
    this.walkableTeleportMeshes = [];

    // Touch virtual joysticks & buttons state
    this.touchInput = {
      moveX: 0,
      moveY: 0,
      lookX: 0,
      lookY: 0,
      up: false,
      down: false,
      sprint: false
    };

    // WebXR VR Locomotion, Controllers & 3D Interactive Menu state
    this.xrYaw = 0.16;
    this.xrVelY = 0;
    this.xrGrounded = true;
    this.vrFlightMode = false;
    this.vrConsoleOpen = false;
    this.vrMenuVisible = false;
    this.vrUiButtons = [];
    this.xrControllers = [];
    this._xrSnapTurnCooldown = 0;
    this._xrButtonCooldown = 0;
    this._xrAimTeleportPoint = null;
    this._xrTempMatrix = new THREE.Matrix4();
    this._xrTempVec = new THREE.Vector3();
    this._xrTempDir = new THREE.Vector3();

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    // 4 floor groups so upper floors sway with realistic seismic modal drift!
    this.buildingGroup = new THREE.Group();
    this.worldGroup.add(this.buildingGroup);
    this.floorGroups = [];
    for (let f = 0; f < 4; f++) {
      const fg = new THREE.Group();
      fg.position.set(0, f * FLOOR_HEIGHT, 0);
      this.buildingGroup.add(fg);
      this.floorGroups.push(fg);
    }
    this.rooftopGroup = new THREE.Group();
    this.rooftopGroup.position.set(0, FLOOR_HEIGHT * 4, 0);
    this.buildingGroup.add(this.rooftopGroup);

    this.stairwellGroup = new THREE.Group();
    this.buildingGroup.add(this.stairwellGroup);

    this.personMeshes = new Map();
    this.hologramGroup = new THREE.Group();
    this.buildingGroup.add(this.hologramGroup);
    this.lastHoloSignature = '';

    // Dynamic physics props, sparks & dust clouds
    this.dynamicProps = [];
    this.sparks = [];
    this.dustPuffs = [];
    this.floorAlarmLights = [];
    this._crashSoundCooldown = 0;

    this._setupSkyAndLights();
    this._buildUrbanExterior();
    this._buildFourStoryBuilding();
    this._buildStairwellTower();
    this._buildRooftop();
    this._buildSnifferStation();
    this._buildBreakableStructure();
    this._buildStaticColliders();
    this._buildStreetLightPoleGateway();
    this._buildDynamicPropsAcrossFloors();
    this._buildParticlePools();
    this._setupWebXRControllersAndMenu();
    this._bindInputs();

    window.addEventListener('resize', () => this.onResize());
  }

  stopIntroOrbit() {
    if (this.introOrbitActive) {
      this.introOrbitActive = false;
      this.controls.autoRotate = false;
    }
  }

  restoreBackground() {
    if (!this.scene.background) {
      this.scene.background = new THREE.Color(0x070d19);
    } else if (this.scene.background.set) {
      this.scene.background.set(0x070d19);
    }
  }

  _setupSkyAndLights() {
    // Atmospheric sky dome
    const skyGeo = new THREE.SphereGeometry(110, 32, 20);
    const skyMat = new THREE.MeshBasicMaterial({
      map: createSkyTexture(),
      side: THREE.BackSide,
      fog: false
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    this.ambientLight = new THREE.AmbientLight(0x9fb8db, 0.78);
    this.scene.add(this.ambientLight);

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x111827, 0.65);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xf1f5f9, 1.35);
    this.sunLight.position.set(16, 28, 22);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -22;
    this.sunLight.shadow.camera.right = 22;
    this.sunLight.shadow.camera.top = 24;
    this.sunLight.shadow.camera.bottom = -16;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    const coolRim = new THREE.DirectionalLight(0x38bdf8, 0.45);
    coolRim.position.set(-18, 14, -14);
    this.scene.add(coolRim);

    // WebXR Camera Rig (enables full VR thumbstick movement, snap-turn & floor teleport inside small Guardian spaces!)
    this.xrRig = new THREE.Group();
    this.scene.add(this.xrRig);
    this.xrRig.add(this.camera);

    // Operator Tactical Flashlight (attached to camera, toggled with [L] or VR menu)
    this.operatorFlashlight = new THREE.SpotLight(0xfef9c3, 0.0, 24, Math.PI * 0.24, 0.42, 1.1);
    this.operatorFlashlight.position.set(0.18, -0.12, 0);
    this.operatorFlashlight.target.position.set(0, -0.08, -6);
    this.camera.add(this.operatorFlashlight);
    this.camera.add(this.operatorFlashlight.target);
  }

  _buildUrbanExterior() {
    // Base urban terrain
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 110),
      new THREE.MeshStandardMaterial({ color: 0x0b1322, roughness: 0.94, metalness: 0.04 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.worldGroup.add(ground);
    this.walkableTeleportMeshes.push(ground);

    // Building concrete plaza & front sidewalk (z in [-6..5.8])
    const plaza = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.14, 12.6),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    );
    plaza.position.set(0, 0.07, -0.3);
    plaza.receiveShadow = true;
    this.worldGroup.add(plaza);
    this.walkableTeleportMeshes.push(plaza);

    // Street asphalt roadway (z in [5.8..12.6])
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(46, 0.06, 6.6),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.92 })
    );
    road.position.set(0, 0.03, 9.1);
    road.receiveShadow = true;
    this.worldGroup.add(road);
    this.walkableTeleportMeshes.push(road);

    // South park / plaza island where Safe Assembly & Pole sit (z in [7.2..13.5] sidewalks on sides)
    const southPlaza = new THREE.Mesh(
      new THREE.BoxGeometry(30, 0.14, 6.2),
      new THREE.MeshStandardMaterial({ color: 0x1a2639, roughness: 0.86 })
    );
    southPlaza.position.set(0, 0.07, 10.2);
    southPlaza.receiveShadow = true;
    this.worldGroup.add(southPlaza);
    this.walkableTeleportMeshes.push(southPlaza);

    // Pedestrian crosswalk stripes leading from lobby door to Safe Assembly Plaza
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 6; i++) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 2.2), stripeMat);
      st.rotation.x = -Math.PI / 2;
      st.position.set(-3.2 + i * 0.95, 0.148, 6.3);
      this.worldGroup.add(st);
    }

    // Landscaped trees & planters around exterior
    const treePositions = [
      [-12.2, 4.8], [-12.5, 10.6], [11.8, 5.0], [11.8, 10.8], [-2.2, 11.8], [2.6, 11.8]
    ];
    treePositions.forEach(([tx, tz], idx) => {
      const treeGrp = new THREE.Group();
      treeGrp.position.set(tx, 0.14, tz);

      const planter = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.32, 1.3),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 })
      );
      planter.position.y = 0.16;
      treeGrp.add(planter);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.16, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
      );
      trunk.position.y = 1.05;
      trunk.castShadow = true;
      treeGrp.add(trunk);

      const foliageMat = new THREE.MeshStandardMaterial({
        color: idx % 2 === 0 ? 0x15803d : 0x166534,
        roughness: 0.78
      });
      const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 1), foliageMat);
      crown1.position.y = 2.25;
      crown1.castShadow = true;
      treeGrp.add(crown1);

      const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 1), foliageMat);
      crown2.position.set(0.32, 2.75, 0.18);
      treeGrp.add(crown2);

      this.worldGroup.add(treeGrp);
    });

    // Safe Assembly Point (Punto de Encuentro Seguro)
    const apGroup = new THREE.Group();
    apGroup.position.set(ASSEMBLY_POINT.x, 0.15, ASSEMBLY_POINT.z);

    const apPad = new THREE.Mesh(
      new THREE.CircleGeometry(ASSEMBLY_POINT.radius, 36),
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.2 })
    );
    apPad.rotation.x = -Math.PI / 2;
    apGroup.add(apPad);

    this.assemblyRing = new THREE.Mesh(
      new THREE.RingGeometry(ASSEMBLY_POINT.radius - 0.14, ASSEMBLY_POINT.radius, 48),
      new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide })
    );
    this.assemblyRing.rotation.x = -Math.PI / 2;
    this.assemblyRing.position.y = 0.015;
    apGroup.add(this.assemblyRing);

    const apPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 })
    );
    apPost.position.set(0, 1.1, -ASSEMBLY_POINT.radius + 0.2);
    apGroup.add(apPost);

    const apSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.88),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('PUNTO DE ENCUENTRO', 'Zona Segura de Evacuación', '#10b981'),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    apSign.position.set(0, 2.35, -ASSEMBLY_POINT.radius + 0.2);
    apGroup.add(apSign);

    this.worldGroup.add(apGroup);
  }

  _buildFourStoryBuilding() {
    const colMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.2 });
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78 });
    const backWallMat = new THREE.MeshStandardMaterial({ color: 0x162235, roughness: 0.82 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.16,
      roughness: 0.15,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    ZONES.forEach((zone, fIdx) => {
      const fg = this.floorGroups[fIdx];

      // Floor structural concrete slab (-8.8 .. +5.6, z: -4.4 .. +3.6)
      const slab = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.22, 8.2), slabMat);
      slab.position.set(-1.5, 0.11, -0.4);
      slab.receiveShadow = true;
      slab.castShadow = true;
      fg.add(slab);
      this.walkableTeleportMeshes.push(slab);

      // Colored architectural floor finish + perimeter LED strip
      const finishMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(zone.color).multiplyScalar(0.24),
        roughness: 0.8
      });
      const finish = new THREE.Mesh(new THREE.PlaneGeometry(13.8, 7.4), finishMat);
      finish.rotation.x = -Math.PI / 2;
      finish.position.set(-1.5, 0.225, -0.4);
      finish.receiveShadow = true;
      fg.add(finish);
      this.walkableTeleportMeshes.push(finish);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(14.62, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color: zone.color })
      );
      trim.position.set(-1.5, 0.21, 3.68);
      fg.add(trim);

      // Structural concrete columns at corners & mid-span
      const colCoords = [
        [-8.6, -4.3], [-1.5, -4.3], [5.4, -4.3],
        [-8.6, 3.5], [5.4, 3.5]
      ];
      colCoords.forEach(([cx, cz]) => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.34, FLOOR_HEIGHT, 0.34), colMat);
        col.position.set(cx, FLOOR_HEIGHT / 2, cz);
        col.castShadow = true;
        col.receiveShadow = true;
        fg.add(col);
      });

      // Back solid wall with window bands
      const lowerBack = new THREE.Mesh(new THREE.BoxGeometry(14.4, 1.15, 0.18), backWallMat);
      lowerBack.position.set(-1.5, 0.7, -4.35);
      fg.add(lowerBack);

      const upperBack = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.55, 0.18), backWallMat);
      upperBack.position.set(-1.5, FLOOR_HEIGHT - 0.28, -4.35);
      fg.add(upperBack);

      const backGlass = new THREE.Mesh(new THREE.PlaneGeometry(14.0, 1.5), glassMat);
      backGlass.position.set(-1.5, 2.0, -4.35);
      fg.add(backGlass);

      // Left glass curtain wall
      const leftGlass = new THREE.Mesh(new THREE.PlaneGeometry(7.8, FLOOR_HEIGHT - 0.25), glassMat);
      leftGlass.rotation.y = Math.PI / 2;
      leftGlass.position.set(-8.6, FLOOR_HEIGHT / 2 + 0.1, -0.4);
      fg.add(leftGlass);

      // Cutaway front glass safety balustrade on upper floors (Pisos 2, 3, 4) or lobby entrance on Piso 1
      if (fIdx > 0) {
        const railGlass = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.88, 0.04), glassMat);
        railGlass.position.set(-1.5, 0.66, 3.58);
        fg.add(railGlass);

        const handrail = new THREE.Mesh(
          new THREE.BoxGeometry(14.0, 0.05, 0.07),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.3 })
        );
        handrail.position.set(-1.5, 1.12, 3.58);
        fg.add(handrail);
      } else {
        // Piso 1 Main Entrance Portal frame at x = -1.2, z = 3.62 + solid glass facade left/right of portal
        const portalMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.5, roughness: 0.3 });
        const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.22), portalMat);
        pLeft.position.set(-2.4, 1.35, 3.62);
        const pRight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.22), portalMat);
        pRight.position.set(0.0, 1.35, 3.62);
        const pTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.35), portalMat);
        pTop.position.set(-1.2, 2.62, 3.62);
        fg.add(pLeft, pRight, pTop);

        const gLeft = new THREE.Mesh(new THREE.BoxGeometry(6.1, 2.6, 0.06), glassMat);
        gLeft.position.set(-5.5, 1.5, 3.58);
        const gRight = new THREE.Mesh(new THREE.BoxGeometry(5.3, 2.6, 0.06), glassMat);
        gRight.position.set(2.7, 1.5, 3.58);
        const ramp = new THREE.Mesh(
          new THREE.BoxGeometry(2.5, 0.1, 0.75),
          new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 })
        );
        ramp.position.set(-1.2, 0.16, 3.95);
        ramp.rotation.x = 0.11;
        fg.add(gLeft, gRight, ramp);
      }

      // Interior partition wall separating room from stairwell (with open doorway at z in [1.55..3.45])
      const partWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, FLOOR_HEIGHT - 0.22, 5.85),
        backWallMat
      );
      partWall.position.set(5.5, FLOOR_HEIGHT * 0.5 + 0.1, -1.38);
      fg.add(partWall);

      const stairDoorHeader = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.52, 2.0),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
      );
      stairDoorHeader.position.set(5.5, FLOOR_HEIGHT - 0.28, 2.52);
      fg.add(stairDoorHeader);

      // Floor Badge Sign on left column
      const floorSign = new THREE.Mesh(
        new THREE.PlaneGeometry(3.25, 0.86),
        new THREE.MeshBasicMaterial({
          map: makeLabelTexture(zone.code.toUpperCase(), zone.name.split('—')[1]?.trim() || zone.shortName, zone.color),
          transparent: true
        })
      );
      floorSign.position.set(-6.8, FLOOR_HEIGHT - 0.52, 3.72);
      fg.add(floorSign);

      // Floor Passive RF Sensor Repeater node wired to Piso 2 RPi5 Sniffer
      const repBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.16, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
      );
      repBox.position.set(5.1, FLOOR_HEIGHT - 0.55, -4.18);
      fg.add(repBox);
      const repLed = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 8),
        new THREE.MeshBasicMaterial({ color: zone.color })
      );
      repLed.position.set(5.1, FLOOR_HEIGHT - 0.55, -4.12);
      fg.add(repLed);

      // Emergency red strobe beacon + floor interior warm/alert light
      const beaconBulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x450a0a })
      );
      beaconBulb.position.set(4.8, FLOOR_HEIGHT - 0.38, 3.45);
      fg.add(beaconBulb);

      const floorLight = new THREE.PointLight(0xe2e8f0, 0.55, 13);
      floorLight.position.set(-1.5, FLOOR_HEIGHT - 0.45, 0.0);
      fg.add(floorLight);

      this.floorAlarmLights.push({ bulb: beaconBulb, light: floorLight, zoneId: zone.id });

      // Populate static architectural furniture per floor
      this._populateFloorStaticFurniture(fg, fIdx);
    });
  }

  _populateFloorStaticFurniture(fg, fIdx) {
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.45 });
    const accentWood = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.75 });

    if (fIdx === 0) {
      // PISO 1: Cafetería & Lobby
      const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.02, 0.85), accentWood);
      counter.position.set(-5.8, 0.73, -2.5);
      counter.castShadow = true;
      fg.add(counter);

      // Espresso machine on counter
      const espresso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.48, 0.45), darkMetal);
      espresso.position.set(-6.2, 1.48, -2.5);
      fg.add(espresso);

      // Round café tables
      [[-5.2, 1.1], [-2.2, 1.2], [2.2, 1.1], [2.5, -1.8]].forEach(([tx, tz]) => {
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.06, 18), accentWood);
        top.position.set(tx, 0.96, tz);
        top.castShadow = true;
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 0.74, 12), darkMetal);
        ped.position.set(tx, 0.58, tz);
        fg.add(top, ped);
      });
    } else if (fIdx === 1) {
      // PISO 2: Laboratorio de Electrónica & Nodo Sniffer RPi5
      [[-5.6, -1.6], [-5.6, 1.2], [2.4, -1.6], [2.4, 1.2]].forEach(([bx, bz]) => {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.82, 1.05), deskMat);
        bench.position.set(bx, 0.63, bz);
        bench.castShadow = true;
        fg.add(bench);
      });
    } else if (fIdx === 2) {
      // PISO 3: Sala de Servidores y Telecom
      [[-6.0, 1.2], [2.2, 1.2]].forEach(([bx, bz]) => {
        const nocDesk = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.8, 1.0), deskMat);
        nocDesk.position.set(bx, 0.62, bz);
        nocDesk.castShadow = true;
        fg.add(nocDesk);
      });
    } else if (fIdx === 3) {
      // PISO 4: Auditorio & Sala de Proyectos
      const podium = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.65), accentWood);
      podium.position.set(-6.8, 0.8, -0.4);
      podium.castShadow = true;
      fg.add(podium);

      // Rows of auditorium benches/desks
      [-3.8, -1.2, 1.4].forEach((rx) => {
        [-2.0, 0.9].forEach((rz) => {
          const row = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.78, 1.8), deskMat);
          row.position.set(rx, 0.61, rz);
          row.castShadow = true;
          fg.add(row);
        });
      });
    }
  }

  _buildStairwellTower() {
    // Walkable 4-story + rooftop U-turn glass stairwell on right wing (x in [5.58..8.92], z in [-4.05..3.55])
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.45, roughness: 0.5 });
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72 });
    const treadMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.65 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4, metalness: 0.3 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.14,
      roughness: 0.1,
      side: THREE.DoubleSide
    });

    const totalTowerH = FLOOR_HEIGHT * 4 + 3.0;

    // Vertical corner steel mullions
    [[5.62, -4.05], [8.92, -4.05], [5.62, 3.52], [8.92, 3.52]].forEach(([sx, sz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, totalTowerH, 0.22), frameMat);
      post.position.set(sx, totalTowerH * 0.5, sz);
      this.stairwellGroup.add(post);
    });

    // East & North glass enclosure walls + South glass above ground doorway
    const eastGlass = new THREE.Mesh(new THREE.PlaneGeometry(7.55, totalTowerH), glassMat);
    eastGlass.rotation.y = Math.PI / 2;
    eastGlass.position.set(8.92, totalTowerH * 0.5, -0.26);
    this.stairwellGroup.add(eastGlass);

    const northGlass = new THREE.Mesh(new THREE.PlaneGeometry(3.3, totalTowerH), glassMat);
    northGlass.position.set(7.27, totalTowerH * 0.5, -4.05);
    this.stairwellGroup.add(northGlass);

    const southUpperGlass = new THREE.Mesh(new THREE.PlaneGeometry(3.3, totalTowerH - 3.0), glassMat);
    southUpperGlass.position.set(7.27, 3.0 + (totalTowerH - 3.0) * 0.5, 3.52);
    this.stairwellGroup.add(southUpperGlass);

    // Penthouse skylight roof over stairwell at y = 15.8m
    const skyCap = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 7.8), frameMat);
    skyCap.position.set(7.27, totalTowerH, -0.26);
    this.stairwellGroup.add(skyCap);

    // Ground street threshold ramp into stairwell (z in [3.52..4.12])
    const stairThreshold = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.65), stepMat);
    stairThreshold.position.set(7.27, 0.16, 3.82);
    stairThreshold.rotation.x = 0.12;
    this.stairwellGroup.add(stairThreshold);

    // Build landings & U-turn flights from Piso 1 (f=0) all the way up to Rooftop (f=4)!
    for (let f = 0; f <= 4; f++) {
      const yFloor = f * FLOOR_HEIGHT + (f === 4 ? 0.28 : 0.22);

      // South Floor Landing (z in [+1.55..+3.50], connects directly to floor doorway & street on f=0!)
      const southLanding = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.18, 1.98), stepMat);
      southLanding.position.set(7.25, yFloor - 0.09, 2.52);
      southLanding.receiveShadow = true;
      this.stairwellGroup.add(southLanding);
      this.walkableTeleportMeshes.push(southLanding);

      if (f < 4) {
        const yMid = f * FLOOR_HEIGHT + 1.82;
        const yNext = (f + 1) * FLOOR_HEIGHT + (f + 1 === 4 ? 0.28 : 0.22);

        // North Mid-Landing (z in [-4.02..-2.15])
        const northLanding = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.18, 1.9), stepMat);
        northLanding.position.set(7.28, yMid - 0.09, -3.08);
        northLanding.receiveShadow = true;
        this.stairwellGroup.add(northLanding);

        // Flight 1 (West lane x=6.45, going UP from South z=+1.55 to North z=-2.15)
        const spanZ = 3.7;
        const rise1 = yMid - yFloor;
        const len1 = Math.hypot(spanZ, rise1);
        const pitch1 = Math.atan2(rise1, spanZ);

        const stringer1 = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.12, len1), stepMat);
        stringer1.position.set(6.45, (yFloor + yMid) * 0.5 - 0.08, -0.3);
        stringer1.rotation.x = pitch1;
        this.stairwellGroup.add(stringer1);

        // 10 crisp 3D stair steps on Flight 1
        for (let s = 0; s < 10; s++) {
          const frac = (s + 0.5) / 10;
          const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.07, 0.36), treadMat);
          stepMesh.position.set(6.45, yFloor + frac * rise1 - 0.03, 1.55 - frac * spanZ);
          this.stairwellGroup.add(stepMesh);
        }

        const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len1), railMat);
        rail1.position.set(7.22, (yFloor + yMid) * 0.5 + 0.85, -0.3);
        rail1.rotation.x = pitch1;
        this.stairwellGroup.add(rail1);

        // Flight 2 (East lane x=8.06, going UP from North z=-2.15 to South z=+1.55)
        const rise2 = yNext - yMid;
        const len2 = Math.hypot(spanZ, rise2);
        const pitch2 = Math.atan2(rise2, spanZ);

        const stringer2 = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.12, len2), stepMat);
        stringer2.position.set(8.06, (yMid + yNext) * 0.5 - 0.08, -0.3);
        stringer2.rotation.x = -pitch2;
        this.stairwellGroup.add(stringer2);

        for (let s = 0; s < 10; s++) {
          const frac = (s + 0.5) / 10;
          const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.07, 0.36), treadMat);
          stepMesh.position.set(8.06, yMid + frac * rise2 - 0.03, -2.15 + frac * spanZ);
          this.stairwellGroup.add(stepMesh);
        }

        const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len2), railMat);
        rail2.position.set(7.3, (yMid + yNext) * 0.5 + 0.85, -0.3);
        rail2.rotation.x = -pitch2;
        this.stairwellGroup.add(rail2);
      }
    }

    // Center divider spine rail
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, totalTowerH - 1.2, 3.65),
      new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.35 })
    );
    spine.position.set(7.25, (totalTowerH - 1.2) * 0.5 + 0.4, -0.3);
    this.stairwellGroup.add(spine);

    // Stairwell emergency exit sign at ground door
    const exitSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.65, 0.68),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('ESCALERA PISOS 1–4', 'Entrada / Evacuación Peatonal', '#34d399'),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    exitSign.position.set(7.27, 2.82, 3.58);
    this.stairwellGroup.add(exitSign);
  }

  _buildRooftop() {
    // Roof slab at y = 12.8m covering main building (leaving stairwell shaft open for roof access!)
    const roofSlab = new THREE.Mesh(
      new THREE.BoxGeometry(14.5, 0.28, 8.4),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.82 })
    );
    roofSlab.position.set(-1.55, 0.14, -0.35);
    roofSlab.castShadow = true;
    roofSlab.receiveShadow = true;
    this.rooftopGroup.add(roofSlab);
    this.walkableTeleportMeshes.push(roofSlab);

    // Parapet walls
    const paraMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
    const pBack = new THREE.Mesh(new THREE.BoxGeometry(18.0, 0.65, 0.22), paraMat);
    pBack.position.set(0.1, 0.58, -4.42);
    const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 8.4), paraMat);
    pLeft.position.set(-8.78, 0.58, -0.35);
    const pRight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 8.4), paraMat);
    pRight.position.set(8.98, 0.58, -0.35);
    this.rooftopGroup.add(pBack, pLeft, pRight);

    // HVAC industrial chillers with animated fans
    this.hvacFans = [];
    [-5.5, -2.5].forEach((hx) => {
      const hvac = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 1.05, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.4, roughness: 0.55 })
      );
      hvac.position.set(hx, 0.8, -1.6);
      hvac.castShadow = true;
      this.rooftopGroup.add(hvac);

      const fan = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.04, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 })
      );
      fan.position.set(hx, 1.36, -1.6);
      this.rooftopGroup.add(fan);
      this.hvacFans.push(fan);
    });

    // Rooftop solar backup array
    for (let i = 0; i < 3; i++) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.06, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.65, roughness: 0.25 })
      );
      panel.position.set(1.5 + i * 2.1, 0.72, -1.8);
      panel.rotation.x = 0.35;
      this.rooftopGroup.add(panel);
    }

    // Rooftop building title sign
    const bldgSign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 1.15),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('CENTRO EXPERIMENTAL LPSBOX', 'Edificio Instrumentado · 4 Pisos', '#38bdf8'),
        transparent: true
      })
    );
    bldgSign.position.set(-1.2, 1.25, 3.65);
    this.rooftopGroup.add(bldgSign);
  }

  _buildSnifferStation() {
    // Mounted on Piso 2 (floorGroups[1], yBase = 3.2m) central structural column
    const fg2 = this.floorGroups[1];
    const sx = SNIFFER_WORLD_POS.x;
    const sz = SNIFFER_WORLD_POS.z;

    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 2.55, 0.44),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.25 })
    );
    pillar.position.set(sx, 1.38, sz - 0.28);
    pillar.castShadow = true;
    fg2.add(pillar);

    // Raspberry Pi 5 + MPU6050 visible telemetry sub-module mounted right next to Sniffer
    const rpiBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.16, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.45, metalness: 0.35 })
    );
    rpiBoard.position.set(sx + 0.32, 1.02, sz - 0.03);
    fg2.add(rpiBoard);

    const mpuChip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.5 })
    );
    mpuChip.position.set(sx + 0.32, 0.86, sz - 0.02);
    fg2.add(mpuChip);

    const snifferSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.15, 0.84),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('SNIFFER LPSBOX · RPi 5', 'MPU6050 STA/LTA + WiFi/BLE 10s', '#38bdf8'),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    snifferSign.position.set(sx, 2.52, sz + 0.18);
    fg2.add(snifferSign);

    this.rpiBoardMesh = rpiBoard;
    this.mpuChipMesh = mpuChip;
    this.snifferNormalSign = snifferSign;

    this.snifferDamagedSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.35, 0.88),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('⚠ SNIFFER BAJO ESCOMBROS', 'RPi 5 Dañado · t₀ Salvado en Poste', '#fb7185'),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    this.snifferDamagedSign.position.set(sx, 2.48, sz + 0.32);
    this.snifferDamagedSign.visible = false;
    fg2.add(this.snifferDamagedSign);

    this.snifferMount = new THREE.Group();
    this.snifferHomePos = new THREE.Vector3(sx, 1.12, sz);
    this.snifferMount.position.copy(this.snifferHomePos);
    this.snifferScale = 0.88;
    this.snifferMount.scale.setScalar(this.snifferScale);
    fg2.add(this.snifferMount);

    // EXACT RAYCAST-CALIBRATED FULL-COVERAGE OLED SCREEN FOR modelo3d.stl!
    // STL screen frame spans X: [-0.194, +0.109] (width=0.303, center=-0.0425), Y_3d: [0.371, 0.579] (height=0.208, center=0.475)
    this.snifferOledCanvas = document.createElement('canvas');
    this.snifferOledCanvas.width = 512;
    this.snifferOledCanvas.height = 352;
    this.snifferOledTex = new THREE.CanvasTexture(this.snifferOledCanvas);
    this.snifferOledTex.colorSpace = THREE.SRGBColorSpace;

    const bezelBacking = new THREE.Mesh(
      new THREE.BoxGeometry(0.308, 0.212, 0.005),
      new THREE.MeshStandardMaterial({ color: 0x070b12, roughness: 0.25, metalness: 0.45 })
    );
    bezelBacking.position.set(-0.0425, 0.475, 0.1496);
    this.snifferMount.add(bezelBacking);

    const oledPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.304, 0.208),
      new THREE.MeshBasicMaterial({ map: this.snifferOledTex })
    );
    oledPlane.position.set(-0.0425, 0.475, 0.1525);
    this.snifferMount.add(oledPlane);
    this.clickableSniffer.push(oledPlane, bezelBacking);

    // Status LED dot to the right of the screen bezel (matching bozeto del sniffer rediseño IA.jpg)
    this.snifferLedMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf });
    const snifferLed = new THREE.Mesh(new THREE.SphereGeometry(0.011, 14, 14), this.snifferLedMat);
    snifferLed.position.set(0.136, 0.482, 0.1515);
    this.snifferMount.add(snifferLed);

    loadSharedStlGeometry(
      (geometry) => {
        const stlMat = new THREE.MeshStandardMaterial({
          color: 0x262c36,
          roughness: 0.48,
          metalness: 0.28
        });
        const stlMesh = new THREE.Mesh(geometry, stlMat);
        stlMesh.rotation.x = -Math.PI / 2;
        stlMesh.castShadow = true;
        stlMesh.receiveShadow = true;
        this.snifferMount.add(stlMesh);
        this.clickableSniffer.push(stlMesh);
        if (this.cb.onStlReady) this.cb.onStlReady(geometry);
      },
      () => {
        const fb = new THREE.Mesh(
          new THREE.BoxGeometry(0.58, 0.68, 0.28),
          new THREE.MeshStandardMaterial({ color: 0x262c36 })
        );
        fb.position.set(-0.02, 0.34, 0);
        this.snifferMount.add(fb);
        this.clickableSniffer.push(fb);
      }
    );
  }

  _buildBreakableStructure() {
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.92, metalness: 0.08 });
    const fracturedMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95, metalness: 0.05 });
    const beamSteelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.55 });
    const rebarMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.7, metalness: 0.6 });

    const addFallingPiece = (parent, mesh, stage, startY, targetY, targetRot, dustWorldPos) => {
      mesh.position.y = startY;
      mesh.visible = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      this.structuralPieces.push({
        mesh,
        stage,
        startY,
        targetY,
        homeRot: mesh.rotation.clone(),
        targetRot: new THREE.Euler(targetRot[0], targetRot[1], targetRot[2]),
        vy: 0,
        active: false,
        landed: false,
        dustWorldPos
      });
    };

    // --- STAGE 1: West Wing Partial Structural Collapse (Piso 4 & Piso 3 slabs + rubble mounds) ---
    const fg4 = this.floorGroups[3];
    const westSlab4 = new THREE.Group();
    westSlab4.position.set(-6.15, 2.95, -0.5);
    const slabChunk4 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.26, 5.4), concreteMat);
    westSlab4.add(slabChunk4);
    for (let r = -2; r <= 2; r++) {
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.95, 6), rebarMat);
      rebar.rotation.z = Math.PI / 2 + 0.18 * (r % 2);
      rebar.position.set(2.35, 0, r * 0.95);
      westSlab4.add(rebar);
    }
    addFallingPiece(fg4, westSlab4, 1, 2.95, 1.32, [0.06, 0.04, 0.48], [-6.2, 10.1, -0.4]);

    [[-7.2, -1.8, 0.95], [-5.4, 0.8, 0.82], [-6.8, 1.5, 0.74], [-4.8, -1.1, 0.68]].forEach(([rx, rz, sz], idx) => {
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(sz * 0.55, 0), fracturedMat);
      boulder.position.set(rx, 2.8, rz);
      boulder.scale.set(1.25, 0.62, 1.08);
      addFallingPiece(fg4, boulder, 1, 2.85, 0.45, [0.3 * idx, 0.5 * idx, -0.25], [rx, 9.9, rz]);
    });

    const fg3 = this.floorGroups[2];
    const westSlab3 = new THREE.Group();
    westSlab3.position.set(-6.1, 2.95, -0.6);
    const slabChunk3 = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.25, 5.1), concreteMat);
    westSlab3.add(slabChunk3);
    for (let r = -2; r <= 2; r++) {
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.85, 6), rebarMat);
      rebar.rotation.z = Math.PI / 2 - 0.14;
      rebar.position.set(2.2, 0, r * 0.9);
      westSlab3.add(rebar);
    }
    addFallingPiece(fg3, westSlab3, 1, 2.95, 1.28, [-0.05, 0.03, 0.46], [-6.1, 6.9, -0.6]);

    [[-7.0, -1.4, 0.92], [-5.2, 0.6, 0.78], [-6.5, 1.4, 0.72]].forEach(([rx, rz, sz], idx) => {
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(sz * 0.55, 0), fracturedMat);
      boulder.position.set(rx, 2.8, rz);
      boulder.scale.set(1.2, 0.6, 1.1);
      addFallingPiece(fg3, boulder, 1, 2.8, 0.44, [0.4 * idx, 0.2, 0.3], [rx, 6.7, rz]);
    });

    // --- STAGE 2: Central Piso 3 Reinforced Beam & Slab Crushing & Burying Piso 2 Sniffer RPi 5! ---
    const fg2 = this.floorGroups[1];
    const sx = SNIFFER_WORLD_POS.x;
    const sz = SNIFFER_WORLD_POS.z;

    const crushingBeamGroup = new THREE.Group();
    crushingBeamGroup.position.set(sx + 0.05, 3.02, sz + 0.26);
    const iBeam = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.34, 0.44), beamSteelMat);
    const brokenHeader = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.24, 1.35), concreteMat);
    brokenHeader.position.set(0, 0.18, 0.15);
    crushingBeamGroup.add(iBeam, brokenHeader);
    for (let r = -2; r <= 2; r++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 6), rebarMat);
      bar.rotation.x = Math.PI / 2 + 0.2 * r;
      bar.position.set(r * 0.45, 0.1, 0.68);
      crushingBeamGroup.add(bar);
    }
    // Lands directly across the top/front of the Sniffer RPi 5 enclosure, burying it!
    addFallingPiece(fg2, crushingBeamGroup, 2, 3.02, 1.46, [0.22, -0.14, -0.28], [sx, 4.4, sz + 0.2]);

    // Rubble mound boulders burying the base and sides of the Sniffer RPi 5
    const snifferRubbleOffsets = [
      [-0.55, 0.38, 0.85, 0.48],
      [0.52, 0.36, 0.82, 0.46],
      [-0.12, 0.56, 0.78, 0.44],
      [0.24, 0.65, 0.68, 0.38],
      [-0.42, 0.72, 0.64, 0.36],
      [0.05, 0.24, 0.72, 1.08],
      [-0.28, 0.18, 0.58, 1.15]
    ];
    snifferRubbleOffsets.forEach(([ox, oz, rad, landY], idx) => {
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(rad * 0.48, 0), idx % 2 === 0 ? fracturedMat : concreteMat);
      chunk.position.set(sx + ox, 2.95, sz + oz);
      chunk.scale.set(1.25, 0.68, 1.12);
      addFallingPiece(
        fg2,
        chunk,
        2,
        2.95,
        landY,
        [0.5 * idx, 0.8 * idx, -0.35 * idx],
        [sx + ox, 3.7, sz + oz]
      );
    });

    // --- STAGE 3: Exterior Front-West Masonry Debris & Upper Stairwell Parapet ---
    [[-6.6, 4.35, 0.85], [-5.5, 4.65, 0.76], [-4.6, 4.25, 0.68]].forEach(([mx, mz, mr], idx) => {
      const masonry = new THREE.Mesh(new THREE.DodecahedronGeometry(mr * 0.56, 0), concreteMat);
      masonry.position.set(mx, 12.4, mz);
      masonry.scale.set(1.3, 0.62, 1.05);
      addFallingPiece(this.worldGroup, masonry, 3, 12.4, 0.38, [0.4 * idx, 0.6 * idx, 0.25], [mx, 0.35, mz]);
    });

    const stairDebris = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 0), fracturedMat);
    stairDebris.position.set(6.25, 12.5, 2.35);
    stairDebris.scale.set(1.3, 0.65, 1.1);
    addFallingPiece(this.worldGroup, stairDebris, 3, 12.5, 10.05, [0.3, 0.5, -0.2], [6.25, 10.0, 2.35]);
  }

  _buildStaticColliders() {
    this.staticColliders = [];
    const addBox = (xMin, xMax, yMin, yMax, zMin, zMax) => {
      this.staticColliders.push({ xMin, xMax, yMin, yMax, zMin, zMax });
    };

    // 1. Building Outer Structural Envelope
    // Back concrete wall (z = -4.35)
    addBox(-8.85, 5.62, 0.0, 14.2, -4.55, -4.18);
    // West glass curtain wall (x = -8.6)
    addBox(-8.82, -8.42, 0.0, 14.2, -4.55, 3.72);
    // Piso 1 Front Facade left & right of Main Portal (portal opening is x in [-2.40..0.00])
    addBox(-8.75, -2.38, 0.0, 3.15, 3.46, 3.74);
    addBox(0.02, 5.58, 0.0, 3.15, 3.46, 3.74);
    // Upper Floors (Pisos 2, 3, 4 + Roof) Front Safety Glass Balustrades
    addBox(-8.75, 5.58, 3.22, 14.1, 3.46, 3.74);
    // Rooftop back & side parapets
    addBox(-8.85, 5.62, 12.8, 14.1, -4.55, -4.25);

    // 2. Partition Wall between Building Floors & Stairwell (open doorway on each floor at z in [1.55..3.46])
    addBox(5.38, 5.64, 0.0, 13.5, -4.45, 1.54);

    // 3. Stairwell Enclosure & Center Divider Spine
    // East glass wall
    addBox(8.84, 9.15, 0.0, 16.0, -4.18, 3.65);
    // North glass wall
    addBox(5.55, 9.15, 0.0, 16.0, -4.25, -3.95);
    // South stairwell upper glass wall (leaves ground exit y in [0..2.95] open to street!)
    addBox(5.58, 9.10, 3.05, 16.0, 3.46, 3.72);
    // Stairwell center handrail spine separating Flight 1 (x < 7.2) from Flight 2 (x > 7.3)
    addBox(7.19, 7.32, 0.0, 15.6, -2.12, 1.52);

    // 4. Interior Static Furniture Colliders per Floor
    // Piso 1 (yBase = 0): Café bar counter + 4 round tables
    addBox(-7.55, -4.05, 0.15, 1.45, -2.95, -2.02);
    [[-5.2, 1.1], [-2.2, 1.2], [2.2, 1.1], [2.5, -1.8]].forEach(([tx, tz]) => {
      addBox(tx - 0.68, tx + 0.68, 0.15, 1.15, tz - 0.68, tz + 0.68);
    });

    // Piso 2 (yBase = 3.2): 4 Electronics Lab benches + Central Sniffer RPi5 Pillar
    [[-5.6, -1.6], [-5.6, 1.2], [2.4, -1.6], [2.4, 1.2]].forEach(([bx, bz]) => {
      addBox(bx - 1.35, bx + 1.35, 3.35, 4.25, bz - 0.55, bz + 0.55);
    });
    addBox(SNIFFER_WORLD_POS.x - 0.45, SNIFFER_WORLD_POS.x + 0.45, 3.2, 5.9, SNIFFER_WORLD_POS.z - 0.52, SNIFFER_WORLD_POS.z + 0.22);

    // Piso 3 (yBase = 6.4): 2 NOC desks
    [[-6.0, 1.2], [2.2, 1.2]].forEach(([bx, bz]) => {
      addBox(bx - 1.4, bx + 1.4, 6.55, 7.45, bz - 0.52, bz + 0.52);
    });

    // Piso 4 (yBase = 9.6): Podium + 6 auditorium desk blocks
    addBox(-7.28, -6.32, 9.75, 10.95, -0.75, -0.05);
    [-3.8, -1.2, 1.4].forEach((rx) => {
      [-2.0, 0.9].forEach((rz) => {
        addBox(rx - 0.8, rx + 0.8, 9.75, 10.55, rz - 0.9, rz + 0.9);
      });
    });

    // 5. Outdoor Street Light Pole, Laptop Tripod & Street Planters
    addBox(POLE_WORLD_POS.x - 0.38, POLE_WORLD_POS.x + 0.38, 0.0, 7.5, POLE_WORLD_POS.z - 0.38, POLE_WORLD_POS.z + 0.38);
    addBox(POLE_WORLD_POS.x - 1.85, POLE_WORLD_POS.x - 1.15, 0.0, 1.35, POLE_WORLD_POS.z - 0.35, POLE_WORLD_POS.z + 0.35);
    [[-12.2, 4.9], [11.8, 4.9], [-11.5, 11.2], [11.6, 11.4]].forEach(([tx, tz]) => {
      addBox(tx - 0.72, tx + 0.72, 0.0, 3.2, tz - 0.72, tz + 0.72);
    });

    // 6. Catastrophic Rubble Colliders (activated dynamically when stage >= c.stage)
    this.collapseColliders = [
      // Stage 1: Collapsed West Wing slabs on Pisos 4 & 3
      { stage: 1, xMin: -8.5, xMax: -3.95, yMin: 9.75, yMax: 12.2, zMin: -3.4, zMax: 2.2 },
      { stage: 1, xMin: -8.5, xMax: -4.05, yMin: 6.55, yMax: 9.0, zMin: -3.3, zMax: 2.0 },
      // Stage 2: Fallen Central Beam & Concrete Rubble Mound burying Piso 2 Sniffer
      {
        stage: 2,
        xMin: SNIFFER_WORLD_POS.x - 1.32,
        xMax: SNIFFER_WORLD_POS.x + 1.35,
        yMin: 3.35,
        yMax: 5.15,
        zMin: SNIFFER_WORLD_POS.z - 0.55,
        zMax: SNIFFER_WORLD_POS.z + 1.05
      },
      // Stage 3: Exterior fallen masonry on front-west sidewalk
      { stage: 3, xMin: -7.25, xMax: -4.15, yMin: 0.0, yMax: 1.25, zMin: 3.8, zMax: 5.15 }
    ];
  }

  _buildStreetLightPoleGateway() {
    // Outdoor Street Light Pole at POLE_WORLD_POS (7.5, 0, 9.2)
    this.poleGroup = new THREE.Group();
    this.poleGroup.position.set(POLE_WORLD_POS.x, 0.14, POLE_WORLD_POS.z);
    this.worldGroup.add(this.poleGroup);

    const poleSteelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.72, roughness: 0.34 });
    const darkEnclosureMat = new THREE.MeshStandardMaterial({ color: 0x1e242d, roughness: 0.45, metalness: 0.25 });

    // Concrete pedestal base
    const basePedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.36, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 })
    );
    basePedestal.position.y = 0.275;
    basePedestal.castShadow = true;
    this.poleGroup.add(basePedestal);
    this.clickablePole.push(basePedestal);

    // Tapered street light pole shaft (7.4m tall)
    const poleShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.165, 7.1, 16), poleSteelMat);
    poleShaft.position.y = 3.8;
    poleShaft.castShadow = true;
    this.poleGroup.add(poleShaft);
    this.clickablePole.push(poleShaft);

    // Curved luminaire arm + warm LED streetlamp head
    const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 2.0, 12), poleSteelMat);
    lampArm.position.set(-0.82, 7.22, 0);
    lampArm.rotation.z = Math.PI * 0.4;
    this.poleGroup.add(lampArm);

    const lampHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.14, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6 })
    );
    lampHead.position.set(-1.72, 7.42, 0);
    this.poleGroup.add(lampHead);

    const lampDiffuser = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.26),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    lampDiffuser.rotation.x = Math.PI / 2;
    lampDiffuser.position.set(-1.72, 7.34, 0);
    this.poleGroup.add(lampDiffuser);

    // Translucent volumetric streetlamp light cone
    const coneGeo = new THREE.ConeGeometry(3.2, 7.2, 24, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const lightCone = new THREE.Mesh(coneGeo, coneMat);
    lightCone.position.set(-1.72, 3.7, 0);
    this.poleGroup.add(lightCone);

    this.streetLampLight = new THREE.PointLight(0xfef3c7, 1.9, 18);
    this.streetLampLight.position.set(-1.72, 7.05, 0);
    this.poleGroup.add(this.streetLampLight);

    // Service Hoist Guide Rail + Top Pulley + Hand Winch Box on Pole
    const guideRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 4.55, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.25 })
    );
    guideRail.position.set(-0.18, 3.15, 0);
    this.poleGroup.add(guideRail);

    const topPulley = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.07, 16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6 })
    );
    topPulley.rotation.x = Math.PI / 2;
    topPulley.position.set(-0.24, 5.42, 0);
    this.poleGroup.add(topPulley);

    // Winch control box at operator waist height on right side of pole
    const winchBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.34, 0.24),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.45, metalness: 0.35 })
    );
    winchBox.position.set(0.2, 1.25, 0.08);
    this.poleGroup.add(winchBox);
    this.clickablePole.push(winchBox);

    this.winchCrank = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.24, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.8 })
    );
    this.winchCrank.position.set(0.2, 1.25, 0.23);
    this.poleGroup.add(this.winchCrank);
    this.clickablePole.push(this.winchCrank);

    // Dynamic hoist steel cable stretching from pulley (y=5.42) down to gatewayCarriageGroup
    this.hoistCable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85 })
    );
    this.poleGroup.add(this.hoistCable);

    // Operator Field Tripod / Rugged Terminal Stand waiting beside the pole!
    const tripodTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.06, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })
    );
    tripodTop.position.set(-1.22, 0.96, 0.15);
    this.poleGroup.add(tripodTop);

    const tripodLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 0.94, 10), poleSteelMat);
    tripodLeg.position.set(-1.22, 0.47, 0.15);
    this.poleGroup.add(tripodLeg);

    // Field rugged laptop on tripod
    const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3), darkEnclosureMat);
    laptopBase.position.set(-1.22, 1.01, 0.18);
    const laptopScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.28, 0.025),
      new THREE.MeshBasicMaterial({ color: 0x0ea5e9 })
    );
    laptopScreen.position.set(-1.22, 1.15, 0.04);
    laptopScreen.rotation.x = 0.22;
    this.poleGroup.add(laptopBase, laptopScreen);
    this.clickableGateway.push(laptopBase, laptopScreen);

    // USB-C Extraction cable (visible ONLY when Gateway is lowered to operator height!)
    const cablePts = [
      new THREE.Vector3(-0.36, GATEWAY_HEIGHT_DOWN - 0.12, 0.16),
      new THREE.Vector3(-0.75, 0.92, 0.28),
      new THREE.Vector3(-1.02, 1.01, 0.18)
    ];
    this.usbExtractionCable = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts), 16, 0.014, 8, false),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    this.usbExtractionCable.visible = false;
    this.poleGroup.add(this.usbExtractionCable);

    // MOVABLE CARRIAGE CARRYING THE SCREEN-LESS LPSBOX GATEWAY (3 PHYSICAL LEDs)
    this.gatewayCarriageGroup = new THREE.Group();
    this.gatewayCarriageGroup.position.set(-0.36, GATEWAY_HEIGHT_UP, 0);
    this.poleGroup.add(this.gatewayCarriageGroup);

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.16), poleSteelMat);
    bracket.position.set(0.18, 0.02, 0);
    this.gatewayCarriageGroup.add(bracket);

    // Minimalist 3D-printed dark screen-less LPSBOX Gateway box
    const gwShell = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.44, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x222832, roughness: 0.46, metalness: 0.24 })
    );
    gwShell.castShadow = true;
    this.gatewayCarriageGroup.add(gwShell);
    this.clickableGateway.push(gwShell);
    this.clickablePole.push(gwShell);

    const gwSeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.388, 0.012, 0.248),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 })
    );
    gwSeam.position.y = 0.08;
    this.gatewayCarriageGroup.add(gwSeam);

    // Top-left SMA antenna on Gateway
    const gwAnt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.018, 0.28, 12),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35 })
    );
    gwAnt.position.set(-0.11, 0.36, -0.02);
    this.gatewayCarriageGroup.add(gwAnt);

    // Front USB-C + microSD recess
    const gwPortRecess = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x090d16 })
    );
    gwPortRecess.position.set(0.05, -0.14, 0.118);
    this.gatewayCarriageGroup.add(gwPortRecess);

    // THE 3 PHYSICAL GATEWAY LEDS (Blue = No Info, Mini Blink = RX, Yellow = Data Ready t0)
    const ledGeo = new THREE.SphereGeometry(0.024, 16, 16);
    const miniGeo = new THREE.SphereGeometry(0.017, 14, 14);

    this.gwMatBlue = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    this.gwMatBlink = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    this.gwMatYellow = new THREE.MeshBasicMaterial({ color: 0x2a2415 });

    const meshBlue = new THREE.Mesh(ledGeo, this.gwMatBlue);
    meshBlue.position.set(-0.1, 0.13, 0.122);
    const meshBlink = new THREE.Mesh(miniGeo, this.gwMatBlink);
    meshBlink.position.set(-0.01, 0.13, 0.122);
    const meshYellow = new THREE.Mesh(ledGeo, this.gwMatYellow);
    meshYellow.position.set(0.09, 0.13, 0.122);
    this.gatewayCarriageGroup.add(meshBlue, meshBlink, meshYellow);

    this.gwGlowLight = new THREE.PointLight(0x3b82f6, 1.3, 4.0);
    this.gwGlowLight.position.set(0, 0.14, 0.35);
    this.gatewayCarriageGroup.add(this.gwGlowLight);

    // Dynamic floating callout label next to Gateway on Pole
    this.poleSignCanvas = document.createElement('canvas');
    this.poleSignCanvas.width = 512;
    this.poleSignCanvas.height = 148;
    this.poleSignTex = new THREE.CanvasTexture(this.poleSignCanvas);
    this.poleSignTex.colorSpace = THREE.SRGBColorSpace;
    this._lastPoleSignState = '';

    const poleSignMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.92),
      new THREE.MeshBasicMaterial({ map: this.poleSignTex, transparent: true, side: THREE.DoubleSide })
    );
    poleSignMesh.position.set(0, 0.58, 0);
    this.gatewayCarriageGroup.add(poleSignMesh);
    this.clickablePole.push(poleSignMesh);
  }

  _updatePoleSignTexture() {
    const key = `${this.sim.gatewayPoleState}-${this.sim.gatewayLeds.yellow ? 'Y' : 'B'}`;
    if (key === this._lastPoleSignState) return;
    this._lastPoleSignState = key;

    const ctx = this.poleSignCanvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 148);

    let title = 'GATEWAY EN POSTE (4.65 m)';
    let sub = '🪜 Clic aquí o [B] para BAJAR del poste';
    let color = this.sim.gatewayLeds.yellow ? '#fbbf24' : '#38bdf8';

    if (this.sim.gatewayPoleState === 'lowering') {
      title = 'DESCENDIENDO GATEWAY...';
      sub = 'Polea de servicio en movimiento';
      color = '#fbbf24';
    } else if (this.sim.gatewayPoleState === 'raising') {
      title = 'IZANDO GATEWAY AL POSTE...';
      sub = 'Subiendo a posición segura (4.65 m)';
      color = '#38bdf8';
    } else if (this.sim.gatewayPoleState === 'down') {
      title = 'GATEWAY ABAJO (1.18 m)';
      sub = '🔌 Clic para Extraer Datos USB-C';
      color = '#34d399';
    }

    ctx.fillStyle = 'rgba(8, 14, 26, 0.92)';
    drawRoundRectPath(ctx, 6, 6, 500, 136, 18);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    drawRoundRectPath(ctx, 6, 6, 500, 136, 18);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, 60);

    ctx.fillStyle = color;
    ctx.font = 'bold 21px monospace';
    ctx.fillText(sub, 256, 108);
    this.poleSignTex.needsUpdate = true;
  }

  // ================= DYNAMIC FALLING, SWAYING & TOPPLING PROPS =================
  _buildDynamicPropsAcrossFloors() {
    const lampShadeMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: 0xfef3c7,
      emissiveIntensity: 0.55,
      roughness: 0.4
    });
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.4, roughness: 0.6 });
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.6, roughness: 0.35 });
    const boxColors = [0xf97316, 0x38bdf8, 0xfbbf24, 0xa855f7, 0xef4444, 0x10b981];
    const tileMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85 });

    for (let f = 0; f < 4; f++) {
      const fg = this.floorGroups[f];
      const floorFactor = 1.0 + f * 0.24; // Higher floors experience stronger structural whip

      // 1. Hanging Ceiling Lamps (3 per floor = 12 total; some snap & fall in major quake!)
      [-5.8, -1.6, 2.5].forEach((lx, idx) => {
        const pivot = new THREE.Group();
        pivot.position.set(lx, FLOOR_HEIGHT - 0.08, -0.3 + (idx - 1) * 0.6);

        const cord = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6),
          new THREE.MeshBasicMaterial({ color: 0x94a3b8 })
        );
        cord.position.y = -0.275;
        pivot.add(cord);

        const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.09, 0.28), lampShadeMat.clone());
        fixture.position.y = -0.56;
        fixture.castShadow = true;
        pivot.add(fixture);

        fg.add(pivot);

        const willSnap = (f >= 2 && idx !== 1) || (f === 1 && idx === 2);
        this.dynamicProps.push({
          kind: 'lamp',
          floor: f,
          floorFactor,
          mesh: pivot,
          fixture,
          homePos: pivot.position.clone(),
          angleX: 0,
          angleZ: 0,
          velX: 0,
          velZ: 0,
          snapped: false,
          willSnap,
          snapTime: 3.6 + f * 1.4 + idx * 2.1,
          vy: 0,
          fallen: false
        });
      });

      // 2. Tall Bookcases / Server Racks / Storage Shelves (2 per floor = 8 total; rock & topple!)
      [[-7.8, -2.6, 1], [4.4, -2.7, -1]].forEach(([sx, sz, fallDir], sIdx) => {
        const pivot = new THREE.Group();
        pivot.position.set(sx, 0.22, sz);

        const h = f === 2 ? 2.15 : 1.95;
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, h, 0.46),
          f === 2 ? rackMat : shelfMat
        );
        body.position.y = h / 2;
        body.castShadow = true;
        pivot.add(body);

        // Decorative LEDs or shelf books
        for (let r = 0; r < 3; r++) {
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(0.92, 0.14, 0.48),
            new THREE.MeshBasicMaterial({ color: boxColors[(f + r + sIdx) % boxColors.length] })
          );
          bar.position.y = 0.45 + r * 0.56;
          pivot.add(bar);
        }

        fg.add(pivot);

        const canTopple = f >= 1 && (sIdx === 0 || f >= 2);
        this.dynamicProps.push({
          kind: 'shelf',
          floor: f,
          floorFactor,
          mesh: pivot,
          homePos: pivot.position.clone(),
          fallDir,
          tiltZ: 0,
          angVel: 0,
          toppled: false,
          canTopple,
          toppleTime: 4.1 + f * 1.65 + sIdx * 2.8
        });
      });

      // 3. Small Falling Items on Desks/Tables/Shelves (Monitors, Boxes, Coffee Mugs, Potted Plants — 5 per floor = 20 total!)
      const itemDefs = [
        { x: -5.9, y: 1.06, z: -1.5, w: 0.44, h: 0.32, d: 0.08, col: 0x0ea5e9, mildFall: false }, // Monitor
        { x: 2.3, y: 1.06, z: 1.15, w: 0.42, h: 0.3, d: 0.08, col: 0x38bdf8, mildFall: false },   // Monitor
        { x: -7.5, y: 2.18, z: -2.45, w: 0.28, h: 0.24, d: 0.26, col: 0xf97316, mildFall: f >= 2 }, // High shelf box (falls even in mild quake on upper floors!)
        { x: 4.2, y: 2.18, z: -2.55, w: 0.25, h: 0.22, d: 0.24, col: 0xfbbf24, mildFall: f >= 3 }, // High shelf crate
        { x: -2.1, y: 1.02, z: 1.15, w: 0.18, h: 0.22, d: 0.18, col: 0x34d399, mildFall: f === 3 }  // Plant / cup
      ];
      itemDefs.forEach((it, iIdx) => {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(it.w, it.h, it.d),
          new THREE.MeshStandardMaterial({ color: it.col, roughness: 0.5 })
        );
        m.position.set(it.x, it.y, it.z);
        m.castShadow = true;
        fg.add(m);

        this.dynamicProps.push({
          kind: 'item',
          floor: f,
          floorFactor,
          mesh: m,
          homePos: m.position.clone(),
          mildFall: it.mildFall,
          dislodged: false,
          mildTriggerTime: 3.2 + iIdx * 1.3,
          majorTriggerTime: 1.8 + f * 0.55 + iIdx * 1.65,
          vx: (iIdx % 2 === 0 ? 1 : -1) * (0.65 + (iIdx % 3) * 0.35),
          vy: 0.4,
          vz: 0.75 + (iIdx % 2) * 0.45,
          rx: (iIdx % 2 === 0 ? 3.2 : -2.8),
          rz: 2.4,
          landed: false
        });
      });

      // 4. Wall Whiteboards / Framed Displays (tilt crooked in mild quake, unhook & fall in major quake!)
      const frameMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.85, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35 })
      );
      frameMesh.position.set(-3.4 + f * 1.1, 1.85, -4.22);
      fg.add(frameMesh);
      this.dynamicProps.push({
        kind: 'wall_frame',
        floor: f,
        floorFactor,
        mesh: frameMesh,
        homePos: frameMesh.position.clone(),
        tilted: false,
        fallen: false,
        fallTime: 5.5 + f * 2.1,
        vy: 0
      });

      // 5. Detaching Ceiling Panels / Debris slabs during major quake
      if (f >= 1) {
        [-4.2, 0.8, 3.2].forEach((tx, tIdx) => {
          const tile = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.65), tileMat);
          tile.position.set(tx, FLOOR_HEIGHT - 0.14, -0.8 + tIdx * 1.2);
          fg.add(tile);
          this.dynamicProps.push({
            kind: 'ceiling_tile',
            floor: f,
            floorFactor,
            mesh: tile,
            homePos: tile.position.clone(),
            detached: false,
            detachTime: 3.2 + f * 1.2 + tIdx * 3.1,
            vy: 0,
            rx: 1.8 + tIdx,
            rz: -1.5,
            landed: false
          });
        });
      }
    }
  }

  resetDynamicProps() {
    this.dynamicProps.forEach((p) => {
      p.mesh.position.copy(p.homePos);
      p.mesh.rotation.set(0, 0, 0);
      p.slideVx = 0;
      p.slideVz = 0;
      if (p.kind === 'lamp') {
        p.angleX = 0;
        p.angleZ = 0;
        p.velX = 0;
        p.velZ = 0;
        p.snapped = false;
        p.vy = 0;
        p.fallen = false;
        if (p.fixture?.material) p.fixture.material.emissiveIntensity = 0.55;
      } else if (p.kind === 'shelf') {
        p.tiltZ = 0;
        p.angVel = 0;
        p.toppled = false;
      } else if (p.kind === 'item') {
        p.dislodged = false;
        p.landed = false;
        p.vy = 0.4;
      } else if (p.kind === 'wall_frame') {
        p.tilted = false;
        p.fallen = false;
        p.vy = 0;
      } else if (p.kind === 'ceiling_tile') {
        p.detached = false;
        p.landed = false;
        p.vy = 0;
      }
    });

    // Reset breakable structural collapse slabs, beams & rubble
    this._lastStructuralStage = 0;
    this.structuralPieces.forEach((sp) => {
      sp.active = false;
      sp.landed = false;
      sp.vy = 0;
      sp.mesh.visible = false;
      sp.mesh.position.y = sp.startY;
      sp.mesh.rotation.copy(sp.homeRot);
    });

    // Restore Sniffer RPi 5 mount & signage
    if (this.snifferMount && this.snifferHomePos) {
      this.snifferMount.position.copy(this.snifferHomePos);
      this.snifferMount.rotation.set(0, 0, 0);
    }
    if (this.snifferNormalSign) this.snifferNormalSign.visible = true;
    if (this.snifferDamagedSign) this.snifferDamagedSign.visible = false;
    if (this.rpiBoardMesh) this.rpiBoardMesh.rotation.set(0, 0, 0);
  }

  _spawnDustPuff(worldX, worldY, worldZ, scale = 1.0) {
    for (let i = 0; i < 6; i++) {
      const puff = this.dustPool.find((d) => !d.visible);
      if (!puff) break;
      puff.visible = true;
      puff.position.set(
        worldX + (Math.random() - 0.5) * 0.9,
        worldY + 0.15 + Math.random() * 0.25,
        worldZ + (Math.random() - 0.5) * 0.7
      );
      puff.scale.setScalar(0.25 * scale);
      puff.userData.life = 1.0;
      puff.userData.vx = (Math.random() - 0.5) * 1.2;
      puff.userData.vy = 0.45 + Math.random() * 0.7;
      puff.userData.vz = (Math.random() - 0.5) * 1.2;
    }
  }

  _spawnElectricSparks(worldX, worldY, worldZ) {
    for (let i = 0; i < 8; i++) {
      const sp = this.sparkPool.find((s) => !s.visible);
      if (!sp) break;
      sp.visible = true;
      sp.position.set(worldX, worldY, worldZ);
      sp.userData.life = 0.45 + Math.random() * 0.25;
      sp.userData.vx = (Math.random() - 0.5) * 4.5;
      sp.userData.vy = 1.2 + Math.random() * 2.8;
      sp.userData.vz = (Math.random() - 0.5) * 4.5;
    }
    if (this._crashSoundCooldown <= 0 && this.cb.onElectricSpark) {
      this.cb.onElectricSpark();
    }
  }

  _emitCrashAudio(intensity) {
    if (this._crashSoundCooldown <= 0) {
      this._crashSoundCooldown = 0.24;
      if (this.cb.onPropImpact) this.cb.onPropImpact(intensity);
    }
  }

  _updateDynamicProps(dt) {
    if (this._crashSoundCooldown > 0) this._crashSoundCooldown -= dt;

    const ga = this.sim.groundAccel || this.sim.accel;
    const gX = ga.x;
    const gZ = ga.y;
    const dynG = ga.dynamicG;
    const qActive = this.sim.quakeActive;
    const qTime = this.sim.quakeElapsed;
    const isCatastrophic = this.sim.scenario === 'catastrophic';
    const isSevere = this.sim.scenario === 'major' || isCatastrophic;
    const isMild = this.sim.scenario === 'mild';
    const timeMult = isCatastrophic ? 0.68 : 1.0;

    this.dynamicProps.forEach((p) => {
      const fBaseY = p.floor * FLOOR_HEIGHT;

      // Apply Operator-kicked / shoved horizontal sliding physics!
      if (p.slideVx || p.slideVz) {
        p.mesh.position.x = Math.max(-8.15, Math.min(5.1, p.mesh.position.x + (p.slideVx || 0) * dt));
        p.mesh.position.z = Math.max(-3.95, Math.min(3.25, p.mesh.position.z + (p.slideVz || 0) * dt));
        p.mesh.rotation.y += ((p.slideVx || 0) - (p.slideVz || 0)) * 0.65 * dt;
        const damp = Math.exp(-4.6 * dt);
        p.slideVx = Math.abs(p.slideVx * damp) > 0.02 ? p.slideVx * damp : 0;
        p.slideVz = Math.abs(p.slideVz * damp) > 0.02 ? p.slideVz * damp : 0;
      }

      if (p.kind === 'lamp') {
        if (!p.snapped) {
          // Driven damped pendulum!
          const driveX = -gX * 16.0 * p.floorFactor;
          const driveZ = -gZ * 16.0 * p.floorFactor;
          p.velZ += (driveX - 14.0 * Math.sin(p.angleZ) - 1.65 * p.velZ) * dt;
          p.velX += (driveZ - 14.0 * Math.sin(p.angleX) - 1.65 * p.velX) * dt;
          p.angleZ = Math.max(-0.78, Math.min(0.78, p.angleZ + p.velZ * dt));
          p.angleX = Math.max(-0.78, Math.min(0.78, p.angleX + p.velX * dt));
          p.mesh.rotation.z = p.angleZ;
          p.mesh.rotation.x = p.angleX;

          // Flicker light intensity during strong shaking
          if (p.fixture?.material) {
            p.fixture.material.emissiveIntensity =
              dynG > 0.08 ? (Math.random() > 0.35 ? 0.75 : 0.12) : 0.55;
          }

          if (qActive && isSevere && (p.willSnap || isCatastrophic) && qTime >= p.snapTime * timeMult) {
            p.snapped = true;
            p.vy = -0.5;
            this._spawnElectricSparks(p.mesh.position.x, fBaseY + p.mesh.position.y, p.mesh.position.z);
          }
        } else if (!p.fallen) {
          p.vy -= 9.8 * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.rotation.z += 2.6 * dt;
          if (p.mesh.position.y <= 0.68) {
            p.mesh.position.y = 0.68;
            p.fallen = true;
            if (p.fixture?.material) p.fixture.material.emissiveIntensity = 0.0;
            this._spawnDustPuff(p.mesh.position.x, fBaseY + 0.25, p.mesh.position.z, 0.9);
            this._emitCrashAudio(0.65);
          }
        }
      } else if (p.kind === 'shelf') {
        if (!p.toppled) {
          if (qActive && isSevere && (p.canTopple || isCatastrophic) && qTime >= p.toppleTime * timeMult) {
            p.angVel += p.fallDir * 4.8 * dt;
            p.tiltZ += p.angVel * dt;
            if (Math.abs(p.tiltZ) >= Math.PI * 0.47) {
              p.tiltZ = p.fallDir * Math.PI * 0.47;
              p.toppled = true;
              this._spawnDustPuff(
                p.mesh.position.x + p.fallDir * 0.9,
                fBaseY + 0.3,
                p.mesh.position.z,
                1.45
              );
              this._emitCrashAudio(0.95);
            }
            p.mesh.rotation.z = -p.tiltZ;
          } else {
            // Rocking oscillation during mild or early major shaking
            const rockAmp = Math.min(0.16, dynG * 0.32 * p.floorFactor);
            p.mesh.rotation.z = Math.sin(this.sim.time * 15 + p.floor * 2.1) * rockAmp;
          }
        }
      } else if (p.kind === 'item') {
        if (!p.dislodged) {
          // Subtle rattle on desk/shelf
          if (dynG > 0.025) {
            p.mesh.position.x = p.homePos.x + Math.sin(this.sim.time * 28 + p.floor) * dynG * 0.08;
          }
          const triggerMild = qActive && isMild && p.mildFall && qTime >= p.mildTriggerTime;
          const triggerMajor = qActive && isSevere && qTime >= p.majorTriggerTime * timeMult;
          const triggerHit = this.sim.tableShockTimer > 0.35 && p.mildFall;
          if (triggerMild || triggerMajor || triggerHit) {
            p.dislodged = true;
            p.vy = 0.55;
          }
        } else if (!p.landed) {
          p.vy -= 9.8 * dt;
          p.mesh.position.x = Math.max(-8.15, Math.min(5.1, p.mesh.position.x + p.vx * dt));
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z = Math.max(-3.95, Math.min(3.25, p.mesh.position.z + p.vz * dt));
          p.mesh.rotation.x += p.rx * dt;
          p.mesh.rotation.z += p.rz * dt;
          if (p.mesh.position.y <= 0.34) {
            p.mesh.position.y = 0.34;
            if (Math.abs(p.vy) > 1.8) {
              p.vy = -p.vy * 0.28;
              p.vx *= 0.45;
              p.vz *= 0.45;
              this._emitCrashAudio(0.42);
            } else {
              p.landed = true;
            }
          }
        }
      } else if (p.kind === 'wall_frame') {
        if (!p.fallen) {
          if (qActive && (isMild || isSevere) && qTime > 2.0 * timeMult) {
            p.tilted = true;
          }
          if (p.tilted) {
            p.mesh.rotation.z = 0.28 + Math.sin(this.sim.time * 10) * Math.min(0.12, dynG * 0.25);
          }
          if (qActive && isSevere && qTime >= p.fallTime * timeMult) {
            p.vy -= 9.8 * dt;
            p.mesh.position.y += p.vy * dt;
            p.mesh.position.z += 0.35 * dt;
            p.mesh.rotation.x += 2.2 * dt;
            if (p.mesh.position.y <= 0.3) {
              p.mesh.position.y = 0.3;
              p.mesh.rotation.x = Math.PI / 2;
              p.fallen = true;
              this._emitCrashAudio(0.5);
            }
          }
        }
      } else if (p.kind === 'ceiling_tile') {
        if (!p.detached) {
          if (qActive && isSevere && qTime >= p.detachTime * timeMult) {
            p.detached = true;
            p.vy = -0.3;
          }
        } else if (!p.landed) {
          p.vy -= 7.8 * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.rotation.x += p.rx * dt;
          p.mesh.rotation.z += p.rz * dt;
          if (p.mesh.position.y <= 0.26) {
            p.mesh.position.y = 0.26;
            p.mesh.rotation.set(0, 0.4, 0.08);
            p.landed = true;
            this._spawnDustPuff(p.mesh.position.x, fBaseY + 0.24, p.mesh.position.z, 0.85);
            this._emitCrashAudio(0.55);
          }
        }
      }
    });
  }

  _updateBreakableStructure(dt) {
    const curStage = this.sim.structuralCollapseStage || 0;

    if (curStage === 0 && (this._lastStructuralStage > 0 || this.snifferDamagedSign?.visible)) {
      this.resetDynamicProps();
      return;
    }

    if (curStage > this._lastStructuralStage) {
      this._lastStructuralStage = curStage;
      this.structuralPieces.forEach((sp) => {
        if (sp.stage <= curStage && !sp.active) {
          sp.active = true;
          sp.mesh.visible = true;
          sp.vy = -1.2;
          const [dx, dy, dz] = sp.dustWorldPos;
          this._spawnDustPuff(dx, dy + 1.2, dz, 1.8);
        }
      });
    }

    this.structuralPieces.forEach((sp) => {
      if (!sp.active || sp.landed) return;
      sp.vy -= 15.5 * dt;
      sp.mesh.position.y += sp.vy * dt;

      const totalDrop = Math.max(0.2, sp.startY - sp.targetY);
      const frac = Math.min(1.0, Math.max(0.0, (sp.startY - sp.mesh.position.y) / totalDrop));
      sp.mesh.rotation.x = THREE.MathUtils.lerp(sp.homeRot.x, sp.targetRot.x, frac);
      sp.mesh.rotation.y = THREE.MathUtils.lerp(sp.homeRot.y, sp.targetRot.y, frac);
      sp.mesh.rotation.z = THREE.MathUtils.lerp(sp.homeRot.z, sp.targetRot.z, frac);

      if (sp.mesh.position.y <= sp.targetY) {
        sp.mesh.position.y = sp.targetY;
        sp.mesh.rotation.copy(sp.targetRot);
        sp.landed = true;
        const [dx, dy, dz] = sp.dustWorldPos;
        this._spawnDustPuff(dx, dy, dz, 2.35);
        if (sp.stage === 2) {
          this._spawnElectricSparks(SNIFFER_WORLD_POS.x, SNIFFER_WORLD_POS.y + 0.25, SNIFFER_WORLD_POS.z + 0.15);
        }
      }
    });

    // Damaged & rubble-buried Sniffer RPi 5 pose + intermittent short-circuit sparks!
    if (this.sim.snifferDamaged && this.snifferMount && this.snifferHomePos) {
      this.snifferMount.position.x = THREE.MathUtils.lerp(this.snifferMount.position.x, this.snifferHomePos.x + 0.06, 6 * dt);
      this.snifferMount.position.y = THREE.MathUtils.lerp(this.snifferMount.position.y, this.snifferHomePos.y - 0.18, 6 * dt);
      this.snifferMount.position.z = THREE.MathUtils.lerp(this.snifferMount.position.z, this.snifferHomePos.z + 0.08, 6 * dt);
      this.snifferMount.rotation.x = THREE.MathUtils.lerp(this.snifferMount.rotation.x, 0.26, 6 * dt);
      this.snifferMount.rotation.y = THREE.MathUtils.lerp(this.snifferMount.rotation.y, -0.18, 6 * dt);
      this.snifferMount.rotation.z = THREE.MathUtils.lerp(this.snifferMount.rotation.z, 0.34, 6 * dt);

      if (this.snifferNormalSign) this.snifferNormalSign.visible = false;
      if (this.snifferDamagedSign) this.snifferDamagedSign.visible = true;
      if (this.rpiBoardMesh) this.rpiBoardMesh.rotation.z = -0.42;

      this._sparkDamageTimer -= dt;
      if (this._sparkDamageTimer <= 0) {
        this._sparkDamageTimer = 1.35 + Math.random() * 1.9;
        this._spawnElectricSparks(SNIFFER_WORLD_POS.x + 0.08, SNIFFER_WORLD_POS.y + 0.15, SNIFFER_WORLD_POS.z + 0.16);
      }
    }
  }

  _buildParticlePools() {
    // RF Probe Request ring pool
    this.rfRingPool = [];
    const rfGeo = new THREE.RingGeometry(0.84, 1.0, 24);
    rfGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 42; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(rfGeo, mat);
      mesh.visible = false;
      this.buildingGroup.add(mesh);
      this.rfRingPool.push(mesh);
    }

    // Seismic / MR Shockwave ring pool
    this.shockPool = [];
    const swGeo = new THREE.RingGeometry(0.92, 1.0, 48);
    swGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(swGeo, mat);
      mesh.visible = false;
      this.worldGroup.add(mesh);
      this.shockPool.push(mesh);
    }

    // Dust cloud puff pool
    this.dustPool = [];
    const dustGeo = new THREE.SphereGeometry(0.42, 8, 8);
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
      });
      const m = new THREE.Mesh(dustGeo, mat);
      m.visible = false;
      m.userData = { life: 0, vx: 0, vy: 0, vz: 0 };
      this.worldGroup.add(m);
      this.dustPool.push(m);
    }

    // Electrical spark pool
    this.sparkPool = [];
    const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.14);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(
        sparkGeo,
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xfbbf24 : 0x38bdf8 })
      );
      m.visible = false;
      m.userData = { life: 0, vx: 0, vy: 0, vz: 0 };
      this.worldGroup.add(m);
      this.sparkPool.push(m);
    }

    // Wireless telemetry beam from Piso 2 Sniffer RPi5 -> Outdoor Street Light Pole Gateway!
    const initPts = [
      new THREE.Vector3(SNIFFER_WORLD_POS.x, SNIFFER_WORLD_POS.y + 0.5, SNIFFER_WORLD_POS.z),
      new THREE.Vector3(3.2, 7.6, 3.0),
      new THREE.Vector3(POLE_WORLD_POS.x - 0.36, GATEWAY_HEIGHT_UP + 0.25, POLE_WORLD_POS.z)
    ];
    this.linkLineGeo = new THREE.BufferGeometry().setFromPoints(
      new THREE.CatmullRomCurve3(initPts).getPoints(36)
    );
    this.linkLineMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.45,
      gapSize: 0.24,
      transparent: true,
      opacity: 0.65
    });
    this.snifferGatewayBeam = new THREE.Line(this.linkLineGeo, this.linkLineMat);
    this.snifferGatewayBeam.computeLineDistances();
    this.worldGroup.add(this.snifferGatewayBeam);
  }

  // ================= ARTICULATED NPC MODELS + SPEECH BUBBLES =================
  _createPersonMesh(person) {
    const group = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: person.skinColor, roughness: 0.62 });
    const shirtMat = new THREE.MeshStandardMaterial({
      color: person.hasLabCoat ? '#f1f5f9' : person.color,
      roughness: 0.55
    });
    const accentMat = new THREE.MeshStandardMaterial({ color: person.color, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: person.pantsColor, roughness: 0.78 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });

    // Body root so crouch/kneel lowers smoothly
    const bodyRoot = new THREE.Group();
    group.add(bodyRoot);

    // Pelvis / Hips
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.21), pantsMat);
    pelvis.position.y = 0.76;
    bodyRoot.add(pelvis);

    // Articulated Left & Right Legs + Shoes
    const makeLeg = (xOff) => {
      const hip = new THREE.Group();
      hip.position.set(xOff, 0.74, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.06, 0.68, 10), pantsMat);
      thigh.position.y = -0.34;
      thigh.castShadow = true;
      hip.add(thigh);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), shoeMat);
      shoe.position.set(0, -0.68, 0.04);
      hip.add(shoe);
      bodyRoot.add(hip);
      return hip;
    };
    const legL = makeLeg(-0.095);
    const legR = makeLeg(0.095);

    // Upper Torso + Collar + ID Badge
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.48, 0.22), shirtMat);
    torso.position.y = 1.07;
    torso.castShadow = true;
    bodyRoot.add(torso);

    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.09), accentMat);
    badge.position.set(0.09, 1.13, 0.115);
    bodyRoot.add(badge);

    // Neck & Head Group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.44, 0);
    bodyRoot.add(headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 16), skinMat);
    head.castShadow = true;
    headGroup.add(head);

    // Eyes facing +Z
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
    eyeL.position.set(-0.052, 0.02, 0.142);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
    eyeR.position.set(0.052, 0.02, 0.142);
    headGroup.add(eyeL, eyeR);

    // Hair / Safety Helmet variants
    const hairColors = [0x1c1917, 0x451a03, 0x78350f, 0x27272a];
    const hairMat = new THREE.MeshStandardMaterial({
      color: hairColors[person.id % hairColors.length],
      roughness: 0.8
    });
    if (person.hairStyle === 2) {
      // Safety hard-hat (yellow/white)
      const helmetMat = new THREE.MeshStandardMaterial({
        color: person.id % 2 === 0 ? 0xfacc15 : 0xf8fafc,
        roughness: 0.35
      });
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.172, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        helmetMat
      );
      dome.position.y = 0.02;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 16), helmetMat);
      brim.position.set(0, 0.03, 0.02);
      headGroup.add(dome, brim);
    } else {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.162, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
        hairMat
      );
      cap.position.y = 0.02;
      cap.rotation.x = -0.18;
      headGroup.add(cap);
      if (person.hairStyle === 1) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), hairMat);
        bun.position.set(0, 0.02, -0.16);
        headGroup.add(bun);
      }
    }

    // Articulated Left & Right Arms + Hands + Glowing Smartphone
    const makeArm = (xOff) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(xOff, 1.27, 0);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, 0.5, 10), shirtMat);
      sleeve.position.y = -0.24;
      sleeve.castShadow = true;
      shoulder.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 10), skinMat);
      hand.position.y = -0.5;
      shoulder.add(hand);
      bodyRoot.add(shoulder);
      return shoulder;
    };
    const armL = makeArm(-0.235);
    const armR = makeArm(0.235);

    const phoneMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.016), phoneMat);
    phone.position.set(0, -0.53, 0.07);
    phone.rotation.x = -0.6;
    armR.add(phone);

    // Floating Speech Bubble Sprite!
    const bubbleCanvas = document.createElement('canvas');
    bubbleCanvas.width = 480;
    bubbleCanvas.height = 118;
    drawSpeechBubbleCanvas(bubbleCanvas, person.phrase, person.speechUrgency);
    const bubbleTex = new THREE.CanvasTexture(bubbleCanvas);
    bubbleTex.colorSpace = THREE.SRGBColorSpace;
    const bubbleMat = new THREE.SpriteMaterial({
      map: bubbleTex,
      transparent: true,
      depthTest: false
    });
    const bubbleSprite = new THREE.Sprite(bubbleMat);
    bubbleSprite.scale.set(2.35, 0.58, 1);
    bubbleSprite.position.set(0, 2.08, 0);
    bubbleSprite.renderOrder = 10;
    bubbleSprite.visible = person.speechVisible;
    group.add(bubbleSprite);

    group.userData = {
      bodyRoot,
      torso,
      headGroup,
      legL,
      legR,
      armL,
      armR,
      phoneMat,
      bubbleCanvas,
      bubbleTex,
      bubbleSprite,
      lastPhrase: person.phrase,
      lastUrgency: person.speechUrgency
    };

    this.buildingGroup.add(group);
    return group;
  }

  _syncPeopleMeshes(dt) {
    const activeIds = new Set();

    this.sim.people.forEach((p) => {
      activeIds.add(p.id);
      let mesh = this.personMeshes.get(p.id);
      if (!mesh) {
        mesh = this._createPersonMesh(p);
        this.personMeshes.set(p.id, mesh);
      }

      // Compute floor modal horizontal offset if inside building
      const floorFloat = Math.max(0, Math.min(3, p.y / FLOOR_HEIGHT));
      const fLow = Math.floor(floorFloat);
      const fHigh = Math.min(3, fLow + 1);
      const fMix = floorFloat - fLow;
      const inBldg = p.z < 4.1;
      const driftX = inBldg
        ? this.floorGroups[fLow].position.x * (1 - fMix) + this.floorGroups[fHigh].position.x * fMix
        : 0;
      const driftZ = inBldg
        ? this.floorGroups[fLow].position.z * (1 - fMix) + this.floorGroups[fHigh].position.z * fMix
        : 0;

      mesh.position.set(p.x + driftX, p.y + (inBldg ? 0.22 : 0.14), p.z + driftZ);
      mesh.rotation.y = p.facing;

      const ud = mesh.userData;
      const moving = Math.hypot(p.vx, p.vz) > 0.12;
      const stride = moving ? Math.sin(p.walkPhase) : 0;

      // Expressive articulated postures!
      if (p.pose === 'cover_head') {
        ud.bodyRoot.position.y = -0.34;
        ud.bodyRoot.rotation.x = 0.32;
        ud.headGroup.rotation.x = 0.35;
        ud.armL.rotation.set(-2.35, 0, -0.35);
        ud.armR.rotation.set(-2.35, 0, 0.35);
        ud.legL.rotation.x = -0.55;
        ud.legR.rotation.x = 0.35;
      } else if (p.pose === 'crouch') {
        ud.bodyRoot.position.y = -0.26;
        ud.bodyRoot.rotation.x = 0.2;
        ud.headGroup.rotation.x = -0.15;
        ud.armL.rotation.set(-1.6, 0, -0.2);
        ud.armR.rotation.set(-0.7, 0, 0.1);
        ud.legL.rotation.x = -0.4;
        ud.legR.rotation.x = 0.3;
      } else if (p.pose === 'look_up') {
        ud.bodyRoot.position.y = 0;
        ud.bodyRoot.rotation.x = -0.06;
        ud.headGroup.rotation.x = -0.45;
        ud.headGroup.rotation.y = Math.sin(this.sim.time * 3.2 + p.id) * 0.35;
        ud.armL.rotation.set(-0.45, 0, 0.35);
        ud.armR.rotation.set(-0.65, 0, -0.25);
        ud.legL.rotation.x = 0;
        ud.legR.rotation.x = 0;
      } else if (p.pose === 'wave_help') {
        ud.bodyRoot.position.y = -0.28;
        ud.bodyRoot.rotation.x = 0.12;
        ud.headGroup.rotation.x = -0.2;
        ud.armL.rotation.set(-2.65, 0, Math.sin(this.sim.time * 8 + p.id) * 0.45);
        ud.armR.rotation.set(-0.85, 0, 0);
        ud.legL.rotation.x = -0.45;
        ud.legR.rotation.x = 0.25;
      } else if (p.pose === 'run') {
        ud.bodyRoot.position.y = Math.abs(stride) * 0.05;
        ud.bodyRoot.rotation.x = 0.18;
        ud.headGroup.rotation.set(0, 0, 0);
        ud.legL.rotation.x = stride * 0.78;
        ud.legR.rotation.x = -stride * 0.78;
        ud.armL.rotation.set(-stride * 0.72, 0, 0);
        ud.armR.rotation.set(stride * 0.72 - 0.35, 0, 0);
      } else {
        // Normal stand / walk
        ud.bodyRoot.position.y = moving ? Math.abs(stride) * 0.025 : 0;
        ud.bodyRoot.rotation.x = 0;
        ud.headGroup.rotation.x = 0;
        ud.headGroup.rotation.y = moving ? 0 : Math.sin(this.sim.time * 1.1 + p.id) * 0.2;
        ud.legL.rotation.x = stride * 0.48;
        ud.legR.rotation.x = -stride * 0.48;
        ud.armL.rotation.set(-stride * 0.36, 0, 0);
        ud.armR.rotation.set(-0.52 + stride * 0.22, 0, 0);
      }

      // Phone LED status
      if (p.phoneOnline) {
        ud.phoneMat.color.setHex(0x38bdf8);
      } else {
        ud.phoneMat.color.setHex(Math.floor(this.sim.time * 6) % 2 === 0 ? 0xef4444 : 0x1e293b);
      }

      // Speech bubble update
      ud.bubbleSprite.visible = Boolean(p.speechVisible && p.phrase);
      if (ud.bubbleSprite.visible) {
        if (ud.lastPhrase !== p.phrase || ud.lastUrgency !== p.speechUrgency) {
          ud.lastPhrase = p.phrase;
          ud.lastUrgency = p.speechUrgency;
          drawSpeechBubbleCanvas(ud.bubbleCanvas, p.phrase, p.speechUrgency);
          ud.bubbleTex.needsUpdate = true;
        }
        ud.bubbleSprite.position.y = (p.pose === 'cover_head' || p.pose === 'crouch' || p.pose === 'wave_help')
          ? 1.75
          : 2.08;
      }
    });

    for (const [id, mesh] of this.personMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.buildingGroup.remove(mesh);
        this.personMeshes.delete(id);
      }
    }
  }

  _syncPreQuakeHolograms() {
    this.hologramGroup.visible = this.sim.showPreQuakeHologram && Boolean(this.sim.frozenSnapshot);
    if (!this.hologramGroup.visible) return;

    const snap = this.sim.frozenSnapshot;
    const sig = `${snap.triggerTime.toFixed(2)}-${snap.uniqueDevices.length}`;
    if (sig === this.lastHoloSignature) {
      this.hologramGroup.children.forEach((ch, idx) => {
        ch.position.y = ch.userData.baseY + Math.sin(this.sim.time * 3.5 + idx) * 0.06;
      });
      return;
    }

    this.lastHoloSignature = sig;
    while (this.hologramGroup.children.length > 0) {
      this.hologramGroup.remove(this.hologramGroup.children[0]);
    }

    const holoMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.78
    });

    snap.uniqueDevices.forEach((dev) => {
      const marker = new THREE.Group();
      const baseY = (dev.estY || 0) + 0.25;
      marker.position.set(dev.estX, baseY, dev.estZ);
      marker.userData.baseY = baseY;

      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.06, 1.55, 8), holoMat);
      cyl.position.y = 0.78;
      marker.add(cyl);

      const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.44, 20),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide })
      );
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.y = 0.04;
      marker.add(baseRing);

      this.hologramGroup.add(marker);
    });
  }

  _updateSnifferOledCanvas() {
    const ctx = this.snifferOledCanvas.getContext('2d');
    const w = this.snifferOledCanvas.width;
    const h = this.snifferOledCanvas.height;

    // Special shattered/buried OLED state when Piso 2 Sniffer RPi 5 is crushed under rubble!
    if (this.sim.snifferDamaged) {
      ctx.fillStyle = '#090306';
      ctx.fillRect(0, 0, w, h);

      // Glitch scanline bars
      for (let i = 0; i < 9; i++) {
        const gy = ((Math.floor(this.sim.time * 18) * 37 + i * 43) % h);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(244, 63, 94, 0.22)' : 'rgba(56, 189, 248, 0.14)';
        ctx.fillRect(0, gy, w, 6 + (i % 3) * 4);
      }

      // Dead dark upper-right corner quadrant from beam impact
      ctx.fillStyle = '#020204';
      ctx.beginPath();
      ctx.moveTo(w * 0.56, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h * 0.62);
      ctx.lineTo(w * 0.68, h * 0.44);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 7;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      ctx.fillStyle = '#fda4af';
      ctx.font = 'bold 21px monospace';
      ctx.fillText('RPi5 · MPU6050 · SIN SEÑAL', 24, 44);

      ctx.fillStyle = '#fb7185';
      ctx.font = 'bold 48px system-ui, sans-serif';
      ctx.fillText('DAÑO CRÍTICO', 26, 132);

      ctx.fillStyle = '#ffe4e6';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText('BAJO ESCOMBROS · PISO 2', 26, 184);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('CAJA NEGRA t₀ SALVADA EN POSTE', 26, 242);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 21px monospace';
      ctx.fillText('LINK RF: OFFLINE  |  ADC: ERR', 26, 298);

      // Spiderweb shattered glass crack lines radiating from impact point (355, 96)
      const ix = 355;
      const iy = 96;
      const rays = [
        [24, 18], [120, 6], [250, 8], [498, 22], [504, 155],
        [488, 310], [340, 344], [165, 340], [18, 265], [14, 130]
      ];
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.82)';
      ctx.lineWidth = 2.6;
      rays.forEach(([rx, ry], idx) => {
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo((ix + rx) * 0.5 + (idx % 2 === 0 ? 14 : -12), (iy + ry) * 0.5 + (idx % 3 === 0 ? -10 : 11));
        ctx.lineTo(rx, ry);
        ctx.stroke();
      });

      this.snifferLedMat.color.setHex(Math.floor(this.sim.time * 14) % 5 === 0 ? 0xfb7185 : 0x1a050a);
      this.snifferOledTex.needsUpdate = true;
      return;
    }

    const isCatastrophic = this.sim.scenario === 'catastrophic' && (this.sim.quakeActive || this.sim.frozenSnapshot);
    const isMajor = this.sim.scenario === 'major' && (this.sim.quakeActive || this.sim.frozenSnapshot);
    const isMild = this.sim.scenario === 'mild' && (this.sim.quakeActive || this.sim.frozenSnapshot);

    // Full bezel-filling frame with signature cyan/amber/red/purple border matching bozeto del sniffer rediseño IA.jpg
    ctx.fillStyle = isCatastrophic ? '#2a0628' : isMajor ? '#240709' : isMild ? '#221705' : '#060c15';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = isCatastrophic ? '#c084fc' : isMajor ? '#ef4444' : isMild ? '#f59e0b' : '#14b8a6';
    ctx.lineWidth = 7;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // Battery & RPi5 header
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 21px monospace';
    ctx.fillText('RPi5 · MPU6050 · PISO 2', 28, 46);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.strokeRect(430, 26, 52, 24);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(434, 30, 40, 16);

    if (isCatastrophic) {
      ctx.fillStyle = '#e879f9';
      ctx.font = 'bold 56px system-ui, sans-serif';
      ctx.fillText('COLAPSO 7.8', 30, 148);
      ctx.fillStyle = '#faf5ff';
      ctx.font = 'bold 31px system-ui, sans-serif';
      ctx.fillText('TX t₀ urgente → Poste Ext.', 30, 212);
      this.snifferLedMat.color.setHex(Math.floor(this.sim.time * 14) % 2 === 0 ? 0xe879f9 : 0xef4444);
    } else if (isMajor) {
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 68px system-ui, sans-serif';
      ctx.fillText('ALERTA', 34, 152);
      ctx.fillStyle = '#fef2f2';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText('Enviando datos t₀ → Poste', 34, 214);
      this.snifferLedMat.color.setHex(Math.floor(this.sim.time * 10) % 2 === 0 ? 0xef4444 : 0x450a0a);
    } else if (isMild) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 56px system-ui, sans-serif';
      ctx.fillText('SISMO LEVE', 34, 150);
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 32px system-ui, sans-serif';
      ctx.fillText('Enviando datos → Poste', 34, 212);
      this.snifferLedMat.color.setHex(0xfbbf24);
    } else {
      ctx.fillStyle = '#2dd4bf';
      ctx.font = 'bold 52px system-ui, sans-serif';
      ctx.fillText('MONITOREO', 34, 150);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '30px monospace';
      ctx.fillText(`Tramas 10s: ${this.sim.rollingProbes.length}`, 34, 212);
      this.snifferLedMat.color.setHex(0x2dd4bf);
    }

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(
      `STA/LTA: ${this.sim.staLtaRatio.toFixed(2)}  |  ${this.sim.accel.dynamicG.toFixed(3)}g`,
      34,
      298
    );

    this.snifferOledTex.needsUpdate = true;
  }

  _updatePoleGatewayAndLeds(dt) {
    // Smooth carriage height along Street Light Pole
    const h = this.sim.gatewayHeight;
    this.gatewayCarriageGroup.position.y = h;

    // Update steel hoist cable from pulley (y = 5.42) down to carriage (y = h + 0.22)
    const cableLen = Math.max(0.15, 5.42 - (h + 0.22));
    this.hoistCable.scale.set(1, cableLen, 1);
    this.hoistCable.position.set(-0.24, h + 0.22 + cableLen / 2, 0);

    // Rotate winch crank handle while lowering/raising
    if (this.sim.gatewayPoleState === 'lowering') {
      this.winchCrank.rotation.z += dt * 9.5;
    } else if (this.sim.gatewayPoleState === 'raising') {
      this.winchCrank.rotation.z -= dt * 9.5;
    }

    // Show USB-C extraction cable connected to field laptop when Gateway is lowered
    this.usbExtractionCable.visible = this.sim.gatewayPoleState === 'down';

    // Update wireless beam curve from Piso 2 Sniffer -> current Gateway height on Pole!
    if (this.mrVisionEnabled) {
      this.snifferGatewayBeam.visible = true;
      if (this._lastBeamHeight === undefined || Math.abs(h - this._lastBeamHeight) > 0.002) {
        this._lastBeamHeight = h;
        const pts = [
          new THREE.Vector3(SNIFFER_WORLD_POS.x, SNIFFER_WORLD_POS.y + 0.45, SNIFFER_WORLD_POS.z),
          new THREE.Vector3(3.2, 6.2 + h * 0.35, 3.0),
          new THREE.Vector3(POLE_WORLD_POS.x - 0.36, 0.14 + h + 0.22, POLE_WORLD_POS.z)
        ];
        this.linkLineGeo.setFromPoints(new THREE.CatmullRomCurve3(pts).getPoints(36));
        this.snifferGatewayBeam.computeLineDistances();
      }
      if (this.sim.snifferDamaged) {
        this.linkLineMat.color.setHex(0xfb7185);
        this.linkLineMat.opacity = 0.22;
      } else {
        this.linkLineMat.color.setHex(this.sim.gatewayLeds.yellow ? 0xfbbf24 : 0x38bdf8);
        this.linkLineMat.opacity = this.sim.gatewayLeds.blink ? 0.95 : 0.42;
      }
    } else {
      this.snifferGatewayBeam.visible = false;
    }

    // Sync the 3 Physical LEDs on the Gateway
    const leds = this.sim.gatewayLeds;
    this.gwMatBlue.color.setHex(leds.blue ? 0x3b82f6 : 0x101c30);
    this.gwMatBlink.color.setHex(leds.blink ? 0x38bdf8 : 0x132030);
    this.gwMatYellow.color.setHex(leds.yellow ? 0xfbbf24 : 0x292110);

    if (leds.yellow) {
      this.gwGlowLight.color.setHex(0xfbbf24);
      this.gwGlowLight.intensity = leds.blink ? 2.4 : 1.65;
    } else {
      this.gwGlowLight.color.setHex(0x3b82f6);
      this.gwGlowLight.intensity = leds.blink ? 1.85 : 1.1;
    }

    this._updatePoleSignTexture();
  }

  // ================= WEBXR VR CONTROLLERS, GUARDIAN-FREE LOCOMOTION & 3D IN-VR MENU =================
  _drawVrButtonCanvas(canvas, title, subtitle, accentColor, isHovered = false, isActive = false) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = isHovered
      ? 'rgba(14, 116, 144, 0.96)'
      : isActive
        ? 'rgba(30, 58, 138, 0.95)'
        : 'rgba(15, 23, 42, 0.94)';
    drawRoundRectPath(ctx, 4, 4, w - 8, h - 8, 16);
    ctx.fill();

    ctx.lineWidth = isHovered ? 6 : isActive ? 5 : 3;
    ctx.strokeStyle = isHovered ? '#f8fafc' : accentColor;
    drawRoundRectPath(ctx, 4, 4, w - 8, h - 8, 16);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, subtitle ? 44 : 58);

    if (subtitle) {
      ctx.fillStyle = isHovered ? '#e0f2fe' : '#cbd5e1';
      ctx.font = '600 18px monospace';
      ctx.fillText(subtitle, w / 2, 74);
    }
  }

  _setupWebXRControllersAndMenu() {
    // 1. Floor Teleport Target Ring + Laser Aim Dot
    this.xrTeleportRing = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.36, 28),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.88 })
    );
    this.xrTeleportRing.rotation.x = -Math.PI / 2;
    this.xrTeleportRing.visible = false;
    this.scene.add(this.xrTeleportRing);

    this.xrAimDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    this.xrAimDot.visible = false;
    this.scene.add(this.xrAimDot);

    // 2. Setup Dual WebXR Controllers inside this.xrRig
    if (this.renderer.xr && typeof this.renderer.xr.getController === 'function') {
      for (let i = 0; i < 2; i++) {
        const ctrl = this.renderer.xr.getController(i);
        if (!ctrl) continue;
        ctrl.userData.index = i;

        // Controller handle body
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.036, 0.032, 0.13),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.35 })
        );
        handle.position.set(0, -0.012, 0.045);
        ctrl.add(handle);

        // Glowing 3D Laser Ray along -Z
        const rayGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, -1)
        ]);
        const rayMat = new THREE.LineBasicMaterial({
          color: i === 0 ? 0x38bdf8 : 0xfbbf24,
          transparent: true,
          opacity: 0.9
        });
        const laserLine = new THREE.Line(rayGeo, rayMat);
        laserLine.scale.z = 12.0;
        ctrl.add(laserLine);
        ctrl.userData.laserLine = laserLine;
        ctrl.userData.rayMat = rayMat;

        // Left-hand Wrist Quick-Summon Badge ("📋 TRAER MENÚ VR")
        if (i === 0) {
          const wristCanvas = document.createElement('canvas');
          wristCanvas.width = 256;
          wristCanvas.height = 96;
          this._drawVrButtonCanvas(wristCanvas, '📋 MENÚ VR', 'Clic o Botón Grip', '#38bdf8');
          const wristTex = new THREE.CanvasTexture(wristCanvas);
          wristTex.colorSpace = THREE.SRGBColorSpace;
          const wristBtn = new THREE.Mesh(
            new THREE.PlaneGeometry(0.16, 0.06),
            new THREE.MeshBasicMaterial({ map: wristTex, transparent: true, side: THREE.DoubleSide })
          );
          wristBtn.position.set(0.075, 0.045, 0.03);
          wristBtn.rotation.set(-0.55, -0.25, 0);
          wristBtn.userData.vrAction = 'summon_menu';
          ctrl.add(wristBtn);
          this.vrWristBtn = wristBtn;
        }

        ctrl.addEventListener('selectstart', () => this._onXrControllerSelect(ctrl));
        ctrl.addEventListener('squeezestart', () => this.summonVrMenuInFront(0));

        this.xrRig.add(ctrl);
        this.xrControllers.push(ctrl);
      }
    }

    // 3. Build Floating 3D Interactive VR Control Tablet (this.vrMenuGroup)
    this.vrMenuGroup = new THREE.Group();
    this.vrMenuGroup.visible = false;
    this.scene.add(this.vrMenuGroup);

    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(1.26, 0.86, 0.024),
      new THREE.MeshStandardMaterial({ color: 0x09111f, roughness: 0.4, metalness: 0.35 })
    );
    backing.position.set(0, 0, -0.016);
    this.vrMenuBacking = backing;
    this.vrMenuGroup.add(backing);

    const borderFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.285, 0.885, 0.016),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42 })
    );
    borderFrame.position.set(0, 0, -0.022);
    this.vrMenuGroup.add(borderFrame);

    // Header Status Canvas on Top of VR Tablet
    this.vrHeaderCanvas = document.createElement('canvas');
    this.vrHeaderCanvas.width = 1024;
    this.vrHeaderCanvas.height = 156;
    this.vrHeaderTex = new THREE.CanvasTexture(this.vrHeaderCanvas);
    this.vrHeaderTex.colorSpace = THREE.SRGBColorSpace;
    const headerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.20, 0.175),
      new THREE.MeshBasicMaterial({ map: this.vrHeaderTex, transparent: true })
    );
    headerMesh.position.set(0, 0.315, 0.002);
    this.vrMenuGroup.add(headerMesh);

    const makeVrBtn = (x, y, w, h, action, title, sub, accent) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 96;
      this._drawVrButtonCanvas(canvas, title, sub, accent, false, false);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
      );
      mesh.position.set(x, y, 0.004);
      mesh.userData = { vrAction: action, canvas, tex, title, sub, accent, hovered: false, active: false };
      this.vrMenuGroup.add(mesh);
      this.vrUiButtons.push(mesh);
      return mesh;
    };

    // ROW 1 (y = +0.145): Ir a Pisos 1–4, Azotea y Vista Exterior
    const r1Cols = [-0.49, -0.294, -0.098, 0.098, 0.294, 0.49];
    makeVrBtn(r1Cols[0], 0.145, 0.184, 0.105, 'view_exterior', '🏢 Exterior', 'Plaza General', '#38bdf8');
    makeVrBtn(r1Cols[1], 0.145, 0.184, 0.105, 'floor_0', '☕ Piso 1', 'Cafetería', '#10b981');
    makeVrBtn(r1Cols[2], 0.145, 0.184, 0.105, 'floor_1', '🔬 Piso 2', 'Laboratorio', '#38bdf8');
    makeVrBtn(r1Cols[3], 0.145, 0.184, 0.105, 'floor_2', '🖧 Piso 3', 'Servidores', '#a855f7');
    makeVrBtn(r1Cols[4], 0.145, 0.184, 0.105, 'floor_3', '🎓 Piso 4', 'Auditorio', '#f59e0b');
    makeVrBtn(r1Cols[5], 0.145, 0.184, 0.105, 'floor_4', '☀️ Azotea', 'Nivel 13.1m', '#94a3b8');

    // ROW 2 (y = +0.01): Inspección Directa de Sniffer RPi5, Poste & Gateway, Polea y Consola VR
    makeVrBtn(-0.44, 0.01, 0.285, 0.112, 'view_sniffer', '📡 Sniffer RPi5', 'Ir a Piso 2 (Frente)', '#2dd4bf');
    makeVrBtn(-0.145, 0.01, 0.285, 0.112, 'view_gateway', '🏮 Poste & Gateway', 'Ir al Poste Exterior', '#fbbf24');
    makeVrBtn(0.15, 0.01, 0.285, 0.112, 'toggle_pole', '🪜 Polea Poste', 'Bajar / Subir GW', '#f59e0b');
    makeVrBtn(0.445, 0.01, 0.285, 0.112, 'toggle_vr_console', '📊 Datos Gateway', 'Ver Captura t₀ VR', '#38bdf8');

    // ROW 3 (y = -0.125): Control de Escenarios Sísmicos en VR
    makeVrBtn(-0.44, -0.125, 0.285, 0.105, 'sc_normal', '🟢 Monitoreo', 'Calma Base', '#10b981');
    makeVrBtn(-0.145, -0.125, 0.285, 0.105, 'sc_mild', '🟡 Sismo 4.2', 'Leve (14s)', '#fbbf24');
    makeVrBtn(0.15, -0.125, 0.285, 0.105, 'sc_major', '🔴 Fuerte 6.9', 'Evacuación (22s)', '#ef4444');
    makeVrBtn(0.445, -0.125, 0.285, 0.105, 'sc_catastrophic', '💥 Colapso 7.8', 'Escombros + RPi5', '#e879f9');

    // ROW 4 (y = -0.265): Modo Locomoción VR (Caminar vs Vuelo Libre), Empujar, Linterna y Ocultar
    makeVrBtn(-0.44, -0.265, 0.285, 0.102, 'toggle_vr_flight', '🛸 Modo Vuelo VR', 'Alternar Caminar/Volar', '#c084fc');
    makeVrBtn(-0.145, -0.265, 0.285, 0.102, 'shove_props', '✋ Empujar / Golpe', 'Física de Objetos', '#38bdf8');
    makeVrBtn(0.15, -0.265, 0.285, 0.102, 'toggle_flashlight', '🔦 Linterna Casco', 'Luz de Rescate', '#fde047');
    makeVrBtn(0.445, -0.265, 0.285, 0.102, 'recenter_menu', '📌 Centrar Panel', 'O pulsa Grip', '#94a3b8');

    // 4. Floating 3D Holographic Gateway Data & Seismogram Board right beside VR Menu!
    this.vrDataCanvas = document.createElement('canvas');
    this.vrDataCanvas.width = 768;
    this.vrDataCanvas.height = 540;
    this.vrDataTex = new THREE.CanvasTexture(this.vrDataCanvas);
    this.vrDataTex.colorSpace = THREE.SRGBColorSpace;
    this.vrDataBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(1.06, 0.75),
      new THREE.MeshBasicMaterial({ map: this.vrDataTex, transparent: true, side: THREE.DoubleSide })
    );
    this.vrDataBoard.position.set(1.22, 0.02, 0.16);
    this.vrDataBoard.rotation.y = -0.26;
    this.vrDataBoard.visible = false;
    this.vrMenuGroup.add(this.vrDataBoard);

    this._updateVrMenuStatusHeader();
    this._updateVrDataBoardCanvas();
  }

  _updateVrMenuStatusHeader() {
    if (!this.vrHeaderCanvas) return;
    const ctx = this.vrHeaderCanvas.getContext('2d');
    const w = this.vrHeaderCanvas.width;
    const h = this.vrHeaderCanvas.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('🥽 PANEL TÁCTICO VR — LPSBOX (4 PISOS · SNIFFER · GATEWAY)', 22, 40);

    const poleTxt =
      this.sim.gatewayPoleState === 'down'
        ? '✅ GATEWAY ABAJO (1.18m · USB-C LISTO)'
        : `⬆️ GATEWAY EN POSTE (${this.sim.gatewayHeight.toFixed(1)}m)`;
    const snifferTxt = this.sim.snifferDamaged
      ? '⚠ SNIFFER SEPULTADO (t₀ EN POSTE)'
      : `SNIFFER RPi5 ONLINE (STA/LTA ${this.sim.staLtaRatio.toFixed(1)})`;

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 21px monospace';
    ctx.fillText(`${poleTxt}   |   ${snifferTxt}`, 22, 82);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '19px system-ui, sans-serif';
    const modeStr = this.vrFlightMode ? '🛸 Vuelo Libre VR activo (Stick Izq volar · Stick Der subir/bajar)' : '🚶 Caminar VR activo (Stick Izq mover · Stick Der girar 45° · Gatillo al suelo = Teletransporte)';
    ctx.fillText(modeStr, 22, 126);

    this.vrHeaderTex.needsUpdate = true;
  }

  _updateVrDataBoardCanvas() {
    if (!this.vrDataCanvas) return;
    const ctx = this.vrDataCanvas.getContext('2d');
    const w = this.vrDataCanvas.width;
    const h = this.vrDataCanvas.height;

    ctx.fillStyle = 'rgba(6, 12, 24, 0.96)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = this.sim.gatewayLeds.yellow ? '#fbbf24' : '#38bdf8';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('📊 CONSOLA HOLOGRÁFICA VR — EXTRACCIÓN GATEWAY', 24, 42);

    if (!this.sim.canExtractGateway()) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 23px system-ui, sans-serif';
      ctx.fillText('🔒 Gateway arriba en el Poste de Luz (4.65 m)', 24, 92);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Pulsa [🪜 Polea Poste] en el panel VR o apunta al poste con el gatillo', 24, 128);
      ctx.fillText('para bajarlo a 1.18 m y extraer la captura pre-sismo (t₀).', 24, 158);
    } else {
      const snap = this.sim.frozenSnapshot;
      const rawList = snap
        ? snap.rawPackets
        : this.sim.rollingProbes.filter((p) => this.sim.time - p.timestamp <= 10.0);
      const uniqueMap = new Map();
      rawList.forEach((pkt) => {
        if (!pkt.isDuplicateRandomBurst) uniqueMap.set(pkt.deviceHash, pkt);
      });
      const uniqueList = Array.from(uniqueMap.values());
      const zCounts = { A: 0, B: 0, C: 0, D: 0 };
      uniqueList.forEach((p) => {
        if (zCounts[p.estimatedZone] !== undefined) zCounts[p.estimatedZone]++;
      });

      ctx.fillStyle = snap ? '#fcd34d' : '#38bdf8';
      ctx.font = 'bold 21px monospace';
      ctx.fillText(
        snap
          ? `🟡 SNAPSHOT PRE-SISMO CONGELADO EN t₀ = ${snap.triggerTime.toFixed(1)}s (${snap.magnitude.toFixed(1)} Mw)`
          : '🔵 MONITOREO EN VIVO (Ventana 10s recibida desde RPi5)',
        24,
        84
      );

      if (this.sim.snifferDamaged) {
        ctx.fillStyle = '#fb7185';
        ctx.font = 'bold 19px monospace';
        ctx.fillText('⚠ SNIFFER PISO 2 BAJO ESCOMBROS — DATOS t₀ SALVADOS EN ESTE GATEWAY', 24, 114);
      }

      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 28px monospace';
      ctx.fillText(`TOTAL CELULARES ÚNICOS (t₀): ${uniqueList.length} personas`, 24, 156);

      const floorRows = [
        ['Piso 1 — Cafetería & Lobby:', zCounts.A, '#10b981'],
        ['Piso 2 — Laboratorio & RPi5:', zCounts.B, '#38bdf8'],
        ['Piso 3 — Sala de Servidores:', zCounts.C, '#a855f7'],
        ['Piso 4 — Auditorio Proyectos:', zCounts.D, '#f59e0b']
      ];
      floorRows.forEach(([label, count, col], idx) => {
        const ry = 200 + idx * 36;
        ctx.fillStyle = col;
        ctx.font = 'bold 22px monospace';
        ctx.fillText(`${label}  ${count} celulares`, 32, ry);
      });

      const trappedNow = this.sim.people.filter((p) => p.state === 'trapped').length;
      ctx.fillStyle = trappedNow > 0 ? '#fda4af' : '#94a3b8';
      ctx.font = 'bold 19px monospace';
      ctx.fillText(
        `MACs Aleatorias Filtradas: ${rawList.filter((p) => p.isDuplicateRandomBurst).length}  |  Atrapados Post-Sismo: ${trappedNow}`,
        24,
        355
      );
    }

    // Draw Mini Seismogram at the bottom of VR Holographic Console (y: 375..518)
    const sx = 24;
    const sy = 378;
    const sw = w - 48;
    const sh = 138;
    ctx.fillStyle = '#030712';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);

    const ev = this.sim.getEventSeismogram();
    const series = ev && ev.samples.length >= 2 ? ev.samples : this.sim.seismoHistory;
    if (series.length >= 2) {
      const maxG = Math.max(0.18, ev ? ev.peakG * 1.15 : 0.75);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      series.forEach((pt, idx) => {
        const px = sx + (idx / (series.length - 1)) * sw;
        const py = sy + sh - 10 - Math.min(1, pt.accelG / maxG) * (sh - 24);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      if (ev && ev.snifferDamagedRelTime !== null && ev.snifferDamagedRelTime !== undefined) {
        ctx.fillStyle = '#fb7185';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`🪨 Corte RPi5 (+${ev.snifferDamagedRelTime.toFixed(1)}s)`, sx + 12, sy + 24);
      }
    }

    this.vrDataTex.needsUpdate = true;
  }

  _getXrHeadWorldPose() {
    this.xrRig.updateMatrixWorld(true);
    const xrCam =
      this.renderer.xr?.isPresenting && typeof this.renderer.xr.getCamera === 'function'
        ? this.renderer.xr.getCamera()
        : this.camera;
    xrCam.updateMatrixWorld(true);
    const headPos = new THREE.Vector3().setFromMatrixPosition(xrCam.matrixWorld);
    const worldQuat = new THREE.Quaternion();
    xrCam.getWorldQuaternion(worldQuat);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat);
    forward.y = 0;
    if (forward.lengthSq() < 1e-5) forward.set(0, 0, -1);
    forward.normalize();
    return { headPos, forward, xrCam, worldQuat };
  }

  summonVrMenuInFront(sideAngleRad = 0, forceShow = true) {
    if (!this.vrMenuGroup) return;
    if (forceShow) this.vrMenuVisible = true;
    this.vrMenuGroup.visible = this.vrMenuVisible;

    const { headPos, forward } = this._getXrHeadWorldPose();
    const baseYaw = Math.atan2(-forward.x, -forward.z) + sideAngleRad;
    const dist = 1.34;
    const mx = headPos.x - Math.sin(baseYaw) * dist;
    const mz = headPos.z - Math.cos(baseYaw) * dist;
    const my = Math.max(this.xrRig.position.y + 0.92, headPos.y - 0.16);

    this.vrMenuGroup.position.set(mx, my, mz);
    this.vrMenuGroup.lookAt(headPos.x, headPos.y - 0.06, headPos.z);
    this._updateVrMenuStatusHeader();
    if (this.vrConsoleOpen) this._updateVrDataBoardCanvas();
  }

  teleportXrTo(targetWorldX, targetFeetY, targetWorldZ, targetYaw = this.xrYaw, keepMenuSide = -0.44) {
    this.xrRig.updateMatrixWorld(true);
    const { headPos } = this._getXrHeadWorldPose();
    const invRig = new THREE.Matrix4().copy(this.xrRig.matrixWorld).invert();
    const headLocal = headPos.clone().applyMatrix4(invRig);

    // Compensate for seated VR users (if physical headset height < 1.15m above floor, add comfortable standing offset)
    const seatedBoost = headLocal.y > 0.05 && headLocal.y < 1.15 ? 0.45 : 0.0;

    this.xrYaw = targetYaw;
    this.xrVelY = 0;
    this.xrGrounded = true;
    this.xrRig.rotation.set(0, this.xrYaw, 0);

    const cosY = Math.cos(this.xrYaw);
    const sinY = Math.sin(this.xrYaw);
    const worldOffsetX = headLocal.x * cosY + headLocal.z * sinY;
    const worldOffsetZ = -headLocal.x * sinY + headLocal.z * cosY;

    this.xrRig.position.set(
      targetWorldX - worldOffsetX,
      targetFeetY + seatedBoost,
      targetWorldZ - worldOffsetZ
    );
    this.xrRig.updateMatrixWorld(true);

    // Keep fpPos synchronized too!
    this.fpPos.set(targetWorldX, targetFeetY, targetWorldZ);
    this.fpYaw = targetYaw;

    if (this.vrMenuVisible) {
      this.summonVrMenuInFront(keepMenuSide, true);
    }
  }

  teleportXrToPreset(preset) {
    const presets = {
      view_exterior: { x: 2.2, y: 0.14, z: 11.4, yaw: 0.15 },
      floor_0: { x: -0.8, y: 0.22, z: 1.85, yaw: 0.32 },
      floor_1: { x: -2.4, y: 3.42, z: 1.35, yaw: -0.22 },
      floor_2: { x: -0.8, y: 6.62, z: 1.55, yaw: 0.24 },
      floor_3: { x: -1.1, y: 9.82, z: 1.75, yaw: 0.35 },
      floor_4: { x: -0.8, y: 13.08, z: 1.5, yaw: 0.12 },
      // Close-up right in front of Piso 2 Sniffer RPi 5 + calibrated OLED!
      view_sniffer: {
        x: SNIFFER_WORLD_POS.x + 0.05,
        y: 3.42,
        z: SNIFFER_WORLD_POS.z + 1.35,
        yaw: 0.0
      },
      // Close-up beside Outdoor Street Light Pole, Winch & 3-LED Gateway!
      view_gateway: {
        x: POLE_WORLD_POS.x - 2.1,
        y: 0.14,
        z: POLE_WORLD_POS.z + 1.3,
        yaw: -0.98
      }
    };
    const p = presets[preset] || presets.view_exterior;
    if (this.renderer.xr?.isPresenting) {
      this.teleportXrTo(p.x, p.y, p.z, p.yaw, -0.46);
    } else {
      this.setCameraMode('firstperson');
      this.fpPos.set(p.x, p.y, p.z);
      this.fpYaw = p.yaw;
      this.fpPitch = preset === 'view_sniffer' ? -0.02 : 0.04;
      this.fpVelY = 0;
      this.fpGrounded = true;
      this.camera.position.set(p.x, p.y + 1.58, p.z);
    }
  }

  _handleVrUiAction(action) {
    if (
      action === 'view_exterior' ||
      action === 'floor_0' ||
      action === 'floor_1' ||
      action === 'floor_2' ||
      action === 'floor_3' ||
      action === 'floor_4' ||
      action === 'view_sniffer' ||
      action === 'view_gateway'
    ) {
      this.teleportXrToPreset(action);
      if (this.cb.onVrAction) this.cb.onVrAction(action);
      return;
    }

    if (action === 'summon_menu' || action === 'recenter_menu') {
      this.summonVrMenuInFront(0, true);
    } else if (action === 'toggle_pole') {
      if (this.cb.onPoleClick) this.cb.onPoleClick();
      this._updateVrMenuStatusHeader();
      this._updateVrDataBoardCanvas();
    } else if (action === 'toggle_vr_console') {
      this.vrConsoleOpen = !this.vrConsoleOpen;
      if (this.vrDataBoard) this.vrDataBoard.visible = this.vrConsoleOpen;
      if (this.sim.canExtractGateway()) {
        this.sim.dataExtractedByOperator = true;
      }
      this._updateVrDataBoardCanvas();
      if (this.cb.onVrAction) this.cb.onVrAction('toggle_vr_console');
    } else if (action === 'toggle_vr_flight') {
      this.vrFlightMode = !this.vrFlightMode;
      this._updateVrMenuStatusHeader();
    } else if (action === 'shove_props') {
      const { headPos, forward } = this._getXrHeadWorldPose();
      this.fpPos.set(headPos.x, this.xrRig.position.y, headPos.z);
      this.fpYaw = Math.atan2(-forward.x, -forward.z);
      const prevMode = this.cameraMode;
      this.cameraMode = 'firstperson';
      this.triggerOperatorShove();
      this.cameraMode = prevMode;
    } else if (action === 'toggle_flashlight') {
      this.toggleFlashlight();
    } else if (action.startsWith('sc_')) {
      if (this.cb.onVrAction) this.cb.onVrAction(action);
      this._updateVrMenuStatusHeader();
    }
  }

  _setRaycasterFromXrController(ctrl) {
    ctrl.updateMatrixWorld(true);
    this._xrTempMatrix.identity().extractRotation(ctrl.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._xrTempMatrix).normalize();
  }

  _onXrControllerSelect(ctrl) {
    if (!this.renderer.xr?.isPresenting) return;
    this._setRaycasterFromXrController(ctrl);

    // 1. Check Wrist Summon Button
    if (this.vrWristBtn) {
      const wristHit = this.raycaster.intersectObject(this.vrWristBtn, false);
      if (wristHit.length > 0) {
        this.summonVrMenuInFront(0, true);
        return;
      }
    }

    // 2. Check Floating 3D VR Menu Buttons (and Tablet Frame Blocker so gaps don't teleport!)
    if (this.vrMenuGroup?.visible) {
      const uiHits = this.raycaster.intersectObjects(this.vrUiButtons, false);
      if (uiHits.length > 0) {
        const act = uiHits[0].object.userData.vrAction;
        if (act) this._handleVrUiAction(act);
        return;
      }
      const panelBlockers = [this.vrMenuBacking, this.vrDataBoard?.visible ? this.vrDataBoard : null].filter(Boolean);
      if (panelBlockers.length > 0 && this.raycaster.intersectObjects(panelBlockers, false).length > 0) {
        return;
      }
    }

    // 3. Check Interactive 3D Hardware (Gateway, Pole Winch, Sniffer RPi 5)
    if (this.raycaster.intersectObjects(this.clickableGateway, true).length > 0) {
      if (this.sim.gatewayPoleState === 'down') {
        this.vrConsoleOpen = true;
        if (this.vrDataBoard) this.vrDataBoard.visible = true;
        this.sim.dataExtractedByOperator = true;
        this.summonVrMenuInFront(-0.25, true);
        this._updateVrDataBoardCanvas();
        if (this.cb.onGatewayClick) this.cb.onGatewayClick();
      } else if (this.cb.onPoleClick) {
        this.cb.onPoleClick();
      }
      return;
    }

    if (this.raycaster.intersectObjects(this.clickablePole, true).length > 0) {
      if (this.cb.onPoleClick) this.cb.onPoleClick();
      return;
    }

    if (this.raycaster.intersectObjects(this.clickableSniffer, true).length > 0) {
      const { headPos } = this._getXrHeadWorldPose();
      const dSniffer = Math.hypot(headPos.x - SNIFFER_WORLD_POS.x, headPos.z - SNIFFER_WORLD_POS.z);
      if (dSniffer > 3.0) {
        this.teleportXrToPreset('view_sniffer');
      } else if (!this.sim.snifferDamaged) {
        this.sim.hitSnifferTable();
      }
      return;
    }

    // 4. Point-and-Teleport onto ANY Walkable Surface (Plaza, Piso 1–4, Stairwell, Rooftop)!
    const floorHits = this.raycaster.intersectObjects(this.walkableTeleportMeshes, false);
    if (floorHits.length > 0) {
      const hit = floorHits[0];
      if (hit.distance < 36.0) {
        const targetFeetY = this._getSupportHeight(hit.point.x, hit.point.z, hit.point.y + 0.25);
        const col = this._resolveOperatorCollisions(hit.point.x, hit.point.z, targetFeetY, targetFeetY + 1.65);
        this.teleportXrTo(col.x, targetFeetY, col.z, this.xrYaw, -0.46);
      }
    }
  }

  onXrSessionStart() {
    this.stopIntroOrbit();
    this.controls.enabled = false;
    this.vrMenuVisible = true;
    this.vrFlightMode = false;
    this.xrYaw = 0.15;
    this.xrRig.position.set(2.2, 0.14, 11.2);
    this.xrRig.rotation.set(0, this.xrYaw, 0);
    this.xrRig.updateMatrixWorld(true);
    // Place the VR Control Tablet right in front of the user as soon as VR starts
    this.summonVrMenuInFront(-0.18, true);
  }

  onXrSessionEnd() {
    this.vrMenuVisible = false;
    if (this.vrMenuGroup) this.vrMenuGroup.visible = false;
    if (this.xrTeleportRing) this.xrTeleportRing.visible = false;
    if (this.xrAimDot) this.xrAimDot.visible = false;
    this.xrRig.position.set(0, 0, 0);
    this.xrRig.rotation.set(0, 0, 0);
    this.xrRig.updateMatrixWorld(true);
    this.setCameraMode(this.cameraMode || 'tactical');
  }

  setTouchInput(partial) {
    Object.assign(this.touchInput, partial);
  }

  _readXrStick(gamepad) {
    if (!gamepad || !Array.isArray(gamepad.axes) || gamepad.axes.length < 2) {
      return { x: 0, y: 0 };
    }
    const ax2 = gamepad.axes.length >= 4 ? gamepad.axes[2] : 0;
    const ax3 = gamepad.axes.length >= 4 ? gamepad.axes[3] : 0;
    const ax0 = gamepad.axes[0] || 0;
    const ax1 = gamepad.axes[1] || 0;
    return {
      x: Math.abs(ax2) >= Math.abs(ax0) ? ax2 : ax0,
      y: Math.abs(ax3) >= Math.abs(ax1) ? ax3 : ax1
    };
  }

  _updateXrLocomotionAndControllers(dt) {
    if (this._xrSnapTurnCooldown > 0) this._xrSnapTurnCooldown -= dt;
    if (this._xrButtonCooldown > 0) this._xrButtonCooldown -= dt;

    if (this.vrMenuGroup) {
      this.vrMenuGroup.visible = this.vrMenuVisible;
    }

    // 1. Read WebXR InputSources (Thumbsticks & Buttons — Guardian-independent locomotion!)
    const session = this.renderer.xr.getSession ? this.renderer.xr.getSession() : null;
    let moveStickX = 0;
    let moveStickY = 0;
    let turnStickX = 0;
    let rightStickY = 0;
    let turboHeld = false;

    if (session && session.inputSources) {
      const sources = Array.from(session.inputSources);
      sources.forEach((src, idx) => {
        if (!src || !src.gamepad) return;
        const gp = src.gamepad;
        const stick = this._readXrStick(gp);
        const hand = src.handedness;

        if (hand === 'left' || (sources.length === 1 && hand !== 'right')) {
          moveStickX = stick.x;
          moveStickY = stick.y;
          if (gp.buttons?.[1]?.pressed || gp.buttons?.[3]?.pressed) turboHeld = true;
        } else if (hand === 'right') {
          turnStickX = stick.x;
          rightStickY = stick.y;
          if (gp.buttons?.[1]?.pressed) turboHeld = true;
        } else if (idx === 0) {
          moveStickX = stick.x;
          moveStickY = stick.y;
        } else {
          turnStickX = stick.x;
          rightStickY = stick.y;
        }

        // B / Y secondary button (index 5) summons/recenters VR menu; A / X button (index 4) jumps!
        if (this._xrButtonCooldown <= 0) {
          if (gp.buttons?.[5]?.pressed) {
            this._xrButtonCooldown = 0.35;
            this.summonVrMenuInFront(0, true);
          } else if (gp.buttons?.[4]?.pressed && !this.vrFlightMode && this.xrGrounded) {
            this._xrButtonCooldown = 0.35;
            this.xrVelY = 5.8;
            this.xrGrounded = false;
          }
        }
      });
    }

    const { headPos, forward, worldQuat } = this._getXrHeadWorldPose();
    const rightVec = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

    // 2. Comfort Snap Turn (45 deg) on Right Stick X around player's real head position!
    if (Math.abs(turnStickX) > 0.62 && this._xrSnapTurnCooldown <= 0) {
      this._xrSnapTurnCooldown = 0.32;
      const snapAngle = turnStickX > 0 ? -Math.PI / 4 : Math.PI / 4;
      const invRig = new THREE.Matrix4().copy(this.xrRig.matrixWorld).invert();
      const headLocal = headPos.clone().applyMatrix4(invRig);
      this.xrYaw += snapAngle;
      this.xrRig.rotation.set(0, this.xrYaw, 0);
      const cosY = Math.cos(this.xrYaw);
      const sinY = Math.sin(this.xrYaw);
      const worldOffX = headLocal.x * cosY + headLocal.z * sinY;
      const worldOffZ = -headLocal.x * sinY + headLocal.z * cosY;
      this.xrRig.position.x = headPos.x - worldOffX;
      this.xrRig.position.z = headPos.z - worldOffZ;
      this.xrRig.updateMatrixWorld(true);
    }

    // 3. Smooth Left-Stick Movement (Walk with Building/Stair Collisions OR 6-DOF VR Flight!)
    const deadzone = 0.14;
    const stickMag = Math.hypot(moveStickX, moveStickY);
    if (this.vrFlightMode) {
      const flySpd = (turboHeld ? 13.5 : 6.8) * dt;
      if (stickMag > deadzone) {
        const fullFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat).normalize();
        this.xrRig.position.x += (fullFwd.x * -moveStickY + rightVec.x * moveStickX) * flySpd;
        this.xrRig.position.y += fullFwd.y * -moveStickY * flySpd;
        this.xrRig.position.z += (fullFwd.z * -moveStickY + rightVec.z * moveStickX) * flySpd;
      }
      if (Math.abs(rightStickY) > deadzone) {
        this.xrRig.position.y += -rightStickY * flySpd * 0.9;
      }
      this.xrRig.position.x = Math.max(-40, Math.min(40, this.xrRig.position.x));
      this.xrRig.position.y = Math.max(0.14, Math.min(34, this.xrRig.position.y));
      this.xrRig.position.z = Math.max(-30, Math.min(38, this.xrRig.position.z));
    } else {
      // Grounded VR Walking with Solid Wall Collisions & 4-Story Stairwell Climbing!
      const walkSpd = (turboHeld ? 7.6 : 4.8);
      let vx = 0;
      let vz = 0;
      if (stickMag > deadzone) {
        vx = (forward.x * -moveStickY + rightVec.x * moveStickX) * walkSpd;
        vz = (forward.z * -moveStickY + rightVec.z * moveStickX) * walkSpd;
      }

      const curFeetY = this.xrRig.position.y;
      const nextHeadX = headPos.x + vx * dt;
      const nextHeadZ = headPos.z + vz * dt;
      const col = this._resolveOperatorCollisions(nextHeadX, nextHeadZ, curFeetY, curFeetY + 1.72);
      const deltaX = col.x - headPos.x;
      const deltaZ = col.z - headPos.z;
      this.xrRig.position.x += deltaX;
      this.xrRig.position.z += deltaZ;

      this.xrVelY -= 18.5 * dt;
      let candY = curFeetY + this.xrVelY * dt;
      const supY = this._getSupportHeight(col.x, col.z, curFeetY);
      if (candY <= supY || (this.xrGrounded && this.xrVelY <= 0 && candY - supY < 0.38)) {
        candY = supY;
        this.xrVelY = 0;
        this.xrGrounded = true;
      } else {
        this.xrGrounded = false;
      }
      this.xrRig.position.y = candY;

      if (stickMag > deadzone) {
        this._pushNearbyDynamicProps(col.x, candY, col.z, vx, vz);
      }
    }

    // Keep open VR Tablet comfortably oriented & within reach when walking across floors/plaza!
    if (this.vrMenuGroup?.visible) {
      const { headPos: updatedHead } = this._getXrHeadWorldPose();
      const menuDist = updatedHead.distanceTo(this.vrMenuGroup.position);
      if (menuDist > 2.95) {
        this.summonVrMenuInFront(-0.22, true);
      } else {
        this.vrMenuGroup.lookAt(updatedHead.x, this.vrMenuGroup.position.y + 0.08, updatedHead.z);
      }
    }

    // 4. Laser Hover Highlights on VR Menu + Floor Teleport Reticle
    let hoveredBtn = null;
    let floorTeleportHit = null;
    let aimHitPoint = null;

    for (let i = 0; i < this.xrControllers.length; i++) {
      const ctrl = this.xrControllers[i];
      this._setRaycasterFromXrController(ctrl);
      let rayLen = 11.0;

      if (this.vrMenuGroup?.visible) {
        const uiHits = this.raycaster.intersectObjects(this.vrUiButtons, false);
        if (uiHits.length > 0) {
          hoveredBtn = uiHits[0].object;
          rayLen = uiHits[0].distance;
          aimHitPoint = uiHits[0].point;
        }
      }

      if (!aimHitPoint) {
        const hwHits = this.raycaster.intersectObjects(
          [...this.clickableGateway, ...this.clickablePole, ...this.clickableSniffer],
          true
        );
        if (hwHits.length > 0 && hwHits[0].distance < 18) {
          rayLen = hwHits[0].distance;
          aimHitPoint = hwHits[0].point;
        } else {
          const flHits = this.raycaster.intersectObjects(this.walkableTeleportMeshes, false);
          if (flHits.length > 0 && flHits[0].distance < 28) {
            rayLen = flHits[0].distance;
            floorTeleportHit = flHits[0].point;
          }
        }
      }

      if (ctrl.userData.laserLine) {
        ctrl.userData.laserLine.scale.z = Math.max(0.15, rayLen);
      }
    }

    // Redraw VR buttons only when hover/active state changes
    this.vrUiButtons.forEach((btn) => {
      const ud = btn.userData;
      const isHov = btn === hoveredBtn;
      const isAct =
        (ud.vrAction === 'toggle_vr_flight' && this.vrFlightMode) ||
        (ud.vrAction === 'toggle_vr_console' && this.vrConsoleOpen) ||
        (ud.vrAction === 'toggle_flashlight' && this.fpFlashlightOn) ||
        (ud.vrAction === `sc_${this.sim.scenario}`);
      if (ud.hovered !== isHov || ud.active !== isAct) {
        ud.hovered = isHov;
        ud.active = isAct;
        this._drawVrButtonCanvas(ud.canvas, ud.title, ud.sub, ud.accent, isHov, isAct);
        ud.tex.needsUpdate = true;
        btn.scale.setScalar(isHov ? 1.05 : 1.0);
      }
    });

    if (aimHitPoint) {
      this.xrAimDot.visible = true;
      this.xrAimDot.position.copy(aimHitPoint);
      this.xrTeleportRing.visible = false;
    } else if (floorTeleportHit) {
      this.xrAimDot.visible = false;
      this.xrTeleportRing.visible = true;
      this.xrTeleportRing.position.set(floorTeleportHit.x, floorTeleportHit.y + 0.03, floorTeleportHit.z);
    } else {
      this.xrAimDot.visible = false;
      this.xrTeleportRing.visible = false;
    }

    // Refresh VR status header & holographic console periodically (~5 Hz)
    this._vrRefreshTick = (this._vrRefreshTick || 0) + 1;
    if (this._vrRefreshTick % 12 === 0) {
      this._updateVrMenuStatusHeader();
      if (this.vrConsoleOpen) this._updateVrDataBoardCanvas();
    }
  }

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        this.keys.space = true;
        if (this.cameraMode === 'firstperson' || this.cameraMode === 'freefly') {
          e.preventDefault();
        }
      } else if (e.key === 'Shift') {
        this.keys.shift = true;
      } else if (k === 'c') {
        this.keys.c = true;
        if (this.cameraMode === 'firstperson' && !e.repeat) {
          this.fpCrouching = !this.fpCrouching;
        }
      } else if (k === 'f' && !e.repeat) {
        if (this.cameraMode === 'firstperson') {
          this.triggerOperatorShove();
        }
      } else if (k === 'l' && !e.repeat) {
        this.toggleFlashlight();
      } else if (k in this.keys) {
        this.keys[k] = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        this.keys.space = false;
      } else if (e.key === 'Shift') {
        this.keys.shift = false;
      } else if (k === 'c') {
        this.keys.c = false;
      } else if (k in this.keys) {
        this.keys[k] = false;
      }
    });

    const dom = this.renderer.domElement;
    let downX = 0;
    let downY = 0;

    dom.addEventListener('pointerdown', (e) => {
      this.stopIntroOrbit();
      downX = e.clientX;
      downY = e.clientY;
      this.isPointerDragging = true;
    });

    window.addEventListener('pointerup', () => {
      this.isPointerDragging = false;
    });

    dom.addEventListener('pointermove', (e) => {
      if ((this.cameraMode === 'firstperson' || this.cameraMode === 'freefly') && this.isPointerDragging) {
        this.fpYaw -= e.movementX * 0.0042;
        this.fpPitch = Math.max(-1.38, Math.min(1.38, this.fpPitch - e.movementY * 0.0034));
      }
    });

    dom.addEventListener('click', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = dom.getBoundingClientRect();
      this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);

      // Check Pole / Gateway clicks
      if (this.raycaster.intersectObjects(this.clickableGateway, true).length > 0) {
        if (this.sim.gatewayPoleState === 'down') {
          if (this.cb.onGatewayClick) this.cb.onGatewayClick();
        } else if (this.cb.onPoleClick) {
          this.cb.onPoleClick();
        }
        return;
      }
      if (this.raycaster.intersectObjects(this.clickablePole, true).length > 0) {
        if (this.cb.onPoleClick) this.cb.onPoleClick();
        return;
      }
      if (this.raycaster.intersectObjects(this.clickableSniffer, true).length > 0) {
        if (this.cb.onSnifferClick) this.cb.onSnifferClick();
      }
    });
  }

  toggleFlashlight(forceState) {
    this.fpFlashlightOn = typeof forceState === 'boolean' ? forceState : !this.fpFlashlightOn;
    if (this.operatorFlashlight) {
      this.operatorFlashlight.intensity = this.fpFlashlightOn ? 3.4 : 0.0;
    }
    if (this.cb.onFlashlightChange) {
      this.cb.onFlashlightChange(this.fpFlashlightOn);
    }
    return this.fpFlashlightOn;
  }

  triggerOperatorShove() {
    if (this.cameraMode !== 'firstperson') return 0;

    const fwdX = -Math.sin(this.fpYaw);
    const fwdZ = -Math.cos(this.fpYaw);
    const opX = this.fpPos.x;
    const opZ = this.fpPos.z;
    const opFeetY = this.fpPos.y;
    let pushedCount = 0;

    this.dynamicProps.forEach((p) => {
      const fBaseY = p.floor * FLOOR_HEIGHT;
      if (Math.abs(fBaseY - opFeetY) > 1.75) return;

      const dx = p.mesh.position.x - opX;
      const dz = p.mesh.position.z - opZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.85 || dist < 0.05) return;

      const dot = (dx * fwdX + dz * fwdZ) / dist;
      if (dot < 0.25) return;

      const impulse = (1.0 - dist / 3.1) * 5.8;
      if (p.kind === 'item') {
        p.dislodged = true;
        p.landed = false;
        p.vx = fwdX * impulse + (dx / dist) * 1.8;
        p.vz = fwdZ * impulse + (dz / dist) * 1.8;
        p.vy = 2.15;
        p.rx = 4.5;
        p.rz = -3.8;
        pushedCount++;
      } else if (p.kind === 'lamp') {
        if (!p.snapped) {
          p.velZ -= fwdX * 7.5;
          p.velX += fwdZ * 7.5;
          pushedCount++;
        } else if (p.fallen) {
          p.slideVx = (p.slideVx || 0) + fwdX * impulse;
          p.slideVz = (p.slideVz || 0) + fwdZ * impulse;
          pushedCount++;
        }
      } else if (p.kind === 'ceiling_tile' && p.landed) {
        p.slideVx = (p.slideVx || 0) + fwdX * impulse * 1.15;
        p.slideVz = (p.slideVz || 0) + fwdZ * impulse * 1.15;
        pushedCount++;
      } else if (p.kind === 'wall_frame' && p.fallen) {
        p.slideVx = (p.slideVx || 0) + fwdX * impulse;
        p.slideVz = (p.slideVz || 0) + fwdZ * impulse;
        pushedCount++;
      } else if (p.kind === 'shelf' && !p.toppled) {
        p.angVel += p.fallDir * 2.4;
        pushedCount++;
      }
    });

    // If standing right in front of the intact Piso 2 Sniffer RPi 5, physically tap its mount!
    if (
      Math.abs(opFeetY - 3.42) < 0.7 &&
      Math.hypot(opX - SNIFFER_WORLD_POS.x, opZ - SNIFFER_WORLD_POS.z) < 2.3 &&
      !this.sim.snifferDamaged
    ) {
      this.sim.hitSnifferTable();
      pushedCount++;
    }

    if (this.cb.onOperatorShove) {
      this.cb.onOperatorShove(pushedCount);
    }
    return pushedCount;
  }

  _getSupportHeight(x, z, feetY) {
    const maxStep = 0.54;
    let best = 0.0;

    const consider = (h) => {
      if (h <= feetY + maxStep && h > best) {
        best = h;
      }
    };

    // 1. Exterior urban sidewalks & roadway
    if (x >= -15.5 && x <= 15.5 && z >= -7.0 && z <= 14.5) {
      if (z >= 5.8 && z <= 7.1) {
        consider(0.06); // Asphalt street
      } else {
        consider(0.14); // Sidewalk / concrete plaza
      }
    }

    // 2. Front Entrance Threshold Ramp (Lobby portal x in [-2.42..0.02], z in [3.50..4.35])
    if (x >= -2.45 && x <= 0.05 && z >= 3.50 && z <= 4.35) {
      const t = Math.max(0, Math.min(1, (4.35 - z) / 0.85));
      consider(0.14 + t * 0.08);
    }

    // 3. Stairwell Ground Threshold Ramp (x in [5.85..8.75], z in [3.50..4.15])
    if (x >= 5.85 && x <= 8.75 && z >= 3.50 && z <= 4.15) {
      const t = Math.max(0, Math.min(1, (4.15 - z) / 0.65));
      consider(0.14 + t * 0.08);
    }

    // 4. Main 4-Story Floor Slabs (x in [-8.70..5.58], z in [-4.45..3.62])
    if (x >= -8.70 && x <= 5.58 && z >= -4.45 && z <= 3.62) {
      for (let f = 0; f < 4; f++) {
        consider(f * FLOOR_HEIGHT + 0.22);
      }
      // Rooftop main deck (f = 4)
      consider(4 * FLOOR_HEIGHT + 0.28);
    }

    // 5. Walkable U-Turn Stairwell Landings & Flights (x in [5.48..8.92], z in [-4.08..3.56])
    if (x >= 5.48 && x <= 8.92 && z >= -4.08 && z <= 3.56) {
      for (let f = 0; f <= 4; f++) {
        const yFloor = f * FLOOR_HEIGHT + (f === 4 ? 0.28 : 0.22);

        // South Floor Landing (z in [1.50..3.56])
        if (z >= 1.50 && z <= 3.56) {
          if (f < 4 || x >= 7.20) {
            consider(yFloor);
          }
        }

        if (f < 4) {
          const yMid = f * FLOOR_HEIGHT + 1.82;
          const yNext = (f + 1) * FLOOR_HEIGHT + (f + 1 === 4 ? 0.28 : 0.22);

          // North Mid-Landing (z in [-4.08..-2.10])
          if (z >= -4.08 && z <= -2.10 && x >= 5.65) {
            consider(yMid);
          }

          // Flight 1 (West lane x in [5.65..7.25], rising North from z=+1.55 -> z=-2.15)
          if (x >= 5.65 && x <= 7.25 && z >= -2.18 && z <= 1.58) {
            const frac = Math.max(0, Math.min(1, (1.55 - z) / 3.70));
            consider(yFloor + frac * (yMid - yFloor));
          }

          // Flight 2 (East lane x in [7.25..8.92], rising South from z=-2.15 -> z=+1.55)
          if (x >= 7.25 && x <= 8.92 && z >= -2.18 && z <= 1.58) {
            const frac = Math.max(0, Math.min(1, (z - -2.15) / 3.70));
            consider(yMid + frac * (yNext - yMid));
          }
        }
      }
    }

    return best;
  }

  _resolveOperatorCollisions(nextX, nextZ, feetY, headY) {
    const radius = 0.34;
    let rx = Math.max(-24.0, Math.min(24.0, nextX));
    let rz = Math.max(-13.5, Math.min(20.5, nextZ));
    let hitWall = false;

    const resolveBoxList = (boxes, checkStage = false) => {
      const stage = this.sim.structuralCollapseStage || 0;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (checkStage && stage < b.stage) continue;
        // Skip obstacles strictly below step-up threshold or above head
        if (headY <= b.yMin + 0.05 || feetY >= b.yMax - 0.32) continue;

        const closestX = Math.max(b.xMin, Math.min(rx, b.xMax));
        const closestZ = Math.max(b.zMin, Math.min(rz, b.zMax));
        const dx = rx - closestX;
        const dz = rz - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          hitWall = true;
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            rx += (dx / dist) * push;
            rz += (dz / dist) * push;
          } else {
            // Center inside AABB: push out along shallowest axis
            const penLeft = Math.abs(rx - b.xMin);
            const penRight = Math.abs(b.xMax - rx);
            const penBack = Math.abs(rz - b.zMin);
            const penFront = Math.abs(b.zMax - rz);
            const minPen = Math.min(penLeft, penRight, penBack, penFront);
            if (minPen === penLeft) rx = b.xMin - radius;
            else if (minPen === penRight) rx = b.xMax + radius;
            else if (minPen === penBack) rz = b.zMin - radius;
            else rz = b.zMax + radius;
          }
        }
      }
    };

    // 2 solver iterations ensure smooth corner & corridor sliding without snagging!
    for (let pass = 0; pass < 2; pass++) {
      resolveBoxList(this.staticColliders, false);
      resolveBoxList(this.collapseColliders, true);
    }

    return { x: rx, z: rz, hitWall };
  }

  _pushNearbyDynamicProps(opX, opFeetY, opZ, velX, velZ) {
    this.dynamicProps.forEach((p) => {
      const fBaseY = p.floor * FLOOR_HEIGHT;
      if (Math.abs(fBaseY - opFeetY) > 1.35) return;
      const isFloorProp =
        (p.kind === 'item' && p.landed) ||
        (p.kind === 'ceiling_tile' && p.landed) ||
        (p.kind === 'wall_frame' && p.fallen) ||
        (p.kind === 'lamp' && p.fallen);
      if (!isFloorProp) return;

      const dx = p.mesh.position.x - opX;
      const dz = p.mesh.position.z - opZ;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.78 && dist > 0.01) {
        const push = (0.78 - dist) * 5.2;
        p.slideVx = (p.slideVx || 0) + (dx / dist) * push + velX * 0.35;
        p.slideVz = (p.slideVz || 0) + (dz / dist) * push + velZ * 0.35;
      }
    });
  }

  getOperatorStatus() {
    let x = this.fpPos.x;
    let y = this.fpPos.y;
    let z = this.fpPos.z;
    if (this.renderer.xr?.isPresenting) {
      const { headPos } = this._getXrHeadWorldPose();
      x = headPos.x;
      y = this.xrRig.position.y;
      z = headPos.z;
    } else if (this.cameraMode === 'freefly') {
      x = this.camera.position.x;
      y = this.camera.position.y;
      z = this.camera.position.z;
    }

    let location = 'Calle / Plaza Exterior';
    if (x >= 5.48 && x <= 9.0 && z >= -4.1 && z <= 3.6) {
      const approxFloor = Math.min(4, Math.max(1, Math.floor((y + 0.4) / FLOOR_HEIGHT) + 1));
      location = y > 12.8 ? 'Acceso Azotea' : `Escalera · Nivel Piso ${approxFloor}`;
    } else if (x >= -8.8 && x <= 5.58 && z >= -4.5 && z <= 3.65) {
      if (y >= 12.7) location = 'Azotea Técnica (13.1m)';
      else if (y >= 9.5) location = 'Piso 4 — Auditorio';
      else if (y >= 6.3) location = 'Piso 3 — Servidores';
      else if (y >= 3.1) location = 'Piso 2 — Lab & Sniffer RPi5';
      else location = 'Piso 1 — Cafetería & Lobby';
    }

    return {
      mode: this.cameraMode,
      location,
      x,
      y,
      z,
      grounded: this.fpGrounded,
      crouching: this.fpCrouching,
      flashlight: this.fpFlashlightOn
    };
  }

  setCameraMode(mode) {
    this.stopIntroOrbit();
    const prevMode = this.cameraMode;
    this.cameraMode = mode;

    if (mode === 'tactical') {
      this.controls.enabled = true;
      this.camera.position.set(1.5, 13.8, 25.5);
      this.controls.target.set(0.2, 5.6, 1.2);
    } else if (mode === 'gateway' || mode === 'pole') {
      this.controls.enabled = true;
      const focusY = this.sim.gatewayPoleState === 'down' ? 1.55 : 3.35;
      this.camera.position.set(POLE_WORLD_POS.x - 4.4, focusY + 1.2, POLE_WORLD_POS.z + 4.8);
      this.controls.target.set(POLE_WORLD_POS.x - 0.35, focusY, POLE_WORLD_POS.z);
    } else if (mode === 'sniffer') {
      this.controls.enabled = true;
      this.camera.position.set(
        SNIFFER_WORLD_POS.x + 0.15,
        SNIFFER_WORLD_POS.y + 0.55,
        SNIFFER_WORLD_POS.z + 1.65
      );
      this.controls.target.set(
        SNIFFER_WORLD_POS.x - 0.04,
        SNIFFER_WORLD_POS.y + 0.38,
        SNIFFER_WORLD_POS.z
      );
    } else if (mode === 'firstperson') {
      this.controls.enabled = false;
      if (prevMode !== 'firstperson') {
        // Spawn cleanly on exterior plaza facing building lobby & stairwell, or keep valid position
        if (this.fpPos.lengthSq() < 0.01) {
          this.fpPos.set(2.8, 0.14, 11.8);
        }
        this.fpVelY = 0;
        this.fpGrounded = true;
      }
      const eyeH = this.fpCrouching ? 1.02 : 1.58;
      this.camera.position.set(this.fpPos.x, this.fpPos.y + eyeH, this.fpPos.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.fpYaw;
      this.camera.rotation.x = this.fpPitch;
    } else if (mode === 'freefly') {
      this.controls.enabled = false;
      // Start Free-Fly right from current camera vantage point so user can fly smoothly anywhere!
      if (prevMode === 'tactical') {
        this.camera.position.set(2.2, 8.8, 16.5);
        this.fpYaw = 0.12;
        this.fpPitch = -0.18;
      }
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.fpYaw;
      this.camera.rotation.x = this.fpPitch;
    }
  }

  teleportOperatorToFloor(floorIndex = 0) {
    this.setCameraMode('firstperson');
    if (floorIndex <= 0) {
      this.fpPos.set(-1.2, 0.22, 2.2);
      this.fpYaw = 0.0;
    } else if (floorIndex === 1) {
      // Piso 2 right in front of Sniffer RPi 5
      this.fpPos.set(1.8, 3.42, -1.2);
      this.fpYaw = 0.72;
    } else if (floorIndex === 2) {
      this.fpPos.set(0.6, 6.62, 0.5);
      this.fpYaw = 0.4;
    } else if (floorIndex === 3) {
      this.fpPos.set(0.8, 9.82, 0.4);
      this.fpYaw = 0.5;
    } else {
      this.fpPos.set(0.0, 13.08, 0.5);
      this.fpYaw = 0.0;
    }
    this.fpVelY = 0;
    this.fpGrounded = true;
    this.fpPitch = -0.04;
    this.camera.position.set(this.fpPos.x, this.fpPos.y + 1.58, this.fpPos.z);
  }

  onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  update(dt) {
    // 1. Multi-story Structural Modal Sway during Seismic Shaking (driven by physical groundAccel!)
    const ga = this.sim.groundAccel || this.sim.accel;
    const gAmp = ga.dynamicG;
    if (gAmp > 0.015) {
      const baseShakeX = ga.x * 0.26;
      const baseShakeZ = ga.y * 0.22;
      for (let f = 0; f < 4; f++) {
        const ampFactor = 0.38 + f * 0.42; // Upper floors whip further horizontally!
        this.floorGroups[f].position.x = baseShakeX * ampFactor;
        this.floorGroups[f].position.z = baseShakeZ * ampFactor;
      }
      this.rooftopGroup.position.x = baseShakeX * 2.05;
      this.rooftopGroup.position.z = baseShakeZ * 2.05;
      this.stairwellGroup.position.x = baseShakeX * 0.95;
      this.stairwellGroup.position.z = baseShakeZ * 0.95;
    } else {
      for (let f = 0; f < 4; f++) {
        this.floorGroups[f].position.x *= 0.84;
        this.floorGroups[f].position.z *= 0.84;
      }
      this.rooftopGroup.position.x *= 0.84;
      this.rooftopGroup.position.z *= 0.84;
      this.stairwellGroup.position.x *= 0.84;
      this.stairwellGroup.position.z *= 0.84;
    }

    // Spin rooftop HVAC fans
    this.hvacFans.forEach((fan, i) => {
      fan.rotation.y += dt * (4.5 + i * 1.2);
    });

    // Emergency floor strobe beacons
    const alertOn = this.sim.quakeActive || Boolean(this.sim.frozenSnapshot);
    const flash = Math.floor(this.sim.time * 8) % 2 === 0;
    this.floorAlarmLights.forEach((al, idx) => {
      const collapsed = this.sim.collapsedZones.has(al.zoneId);
      if ((this.sim.scenario === 'major' || this.sim.scenario === 'catastrophic') && alertOn) {
        const on = (Math.floor(this.sim.time * 10) + idx) % 2 === 0;
        const bulbHex = this.sim.scenario === 'catastrophic' ? (on ? 0xe879f9 : 0x7f1d1d) : (on ? 0xef4444 : 0x450a0a);
        al.bulb.material.color.setHex(bulbHex);
        al.light.color.setHex(collapsed ? 0xf87171 : 0xfef2f2);
        al.light.intensity = collapsed ? (on ? 0.95 : 0.16) : 0.55;
      } else if (this.sim.scenario === 'mild' && this.sim.quakeActive) {
        al.bulb.material.color.setHex(flash ? 0xfbbf24 : 0x451a03);
        al.light.color.setHex(0xfef3c7);
        al.light.intensity = 0.55;
      } else {
        al.bulb.material.color.setHex(0x3f1d1d);
        al.light.color.setHex(0xe2e8f0);
        al.light.intensity = 0.55;
      }
    });

    // 2. Update Dynamic Falling Props, Breakable Structural Collapse & Particles
    this._updateDynamicProps(dt);
    this._updateBreakableStructure(dt);

    this.dustPool.forEach((d) => {
      if (!d.visible) return;
      d.userData.life -= dt * 0.72;
      if (d.userData.life <= 0) {
        d.visible = false;
        return;
      }
      d.position.x += d.userData.vx * dt;
      d.position.y += d.userData.vy * dt;
      d.position.z += d.userData.vz * dt;
      d.scale.addScalar(dt * 0.65);
      d.material.opacity = d.userData.life * 0.38;
    });

    this.sparkPool.forEach((sp) => {
      if (!sp.visible) return;
      sp.userData.life -= dt;
      if (sp.userData.life <= 0) {
        sp.visible = false;
        return;
      }
      sp.userData.vy -= 9.8 * dt;
      sp.position.x += sp.userData.vx * dt;
      sp.position.y += sp.userData.vy * dt;
      sp.position.z += sp.userData.vz * dt;
    });

    // 3. Sync Articulated NPCs, Speech Bubbles & Pre-Quake Holograms
    this._syncPeopleMeshes(dt);
    this._syncPreQuakeHolograms();

    // 4. Sync Outdoor Pole Gateway, 3 LEDs & Calibrated Sniffer OLED
    this._updatePoleGatewayAndLeds(dt);
    this._oledFrameCounter = (this._oledFrameCounter || 0) + 1;
    if (this._oledFrameCounter % 4 === 0) {
      this._updateSnifferOledCanvas();
    }

    // 5. Sync RF Probe Pulses & MR Shockwaves
    for (let i = 0; i < this.rfRingPool.length; i++) {
      const ring = this.rfRingPool[i];
      const pulse = this.mrVisionEnabled ? this.sim.rfPulses[i] : null;
      if (pulse) {
        ring.visible = true;
        ring.position.set(pulse.x, (pulse.y || 0) + 0.25, pulse.z);
        ring.scale.setScalar(pulse.radius);
        ring.material.color.setHex(pulse.isRandom ? 0xfbbf24 : 0x38bdf8);
        ring.material.opacity = Math.max(0, pulse.alpha * 0.65);
      } else {
        ring.visible = false;
      }
    }

    for (let i = 0; i < this.shockPool.length; i++) {
      const ring = this.shockPool[i];
      const sw = this.sim.shockwaves[i];
      if (sw) {
        ring.visible = true;
        ring.position.set(sw.x, (sw.y || 0.16), sw.z);
        ring.scale.setScalar(sw.radius);
        ring.material.color.set(sw.color);
        ring.material.opacity = Math.max(0, sw.alpha);
      } else {
        ring.visible = false;
      }
    }

    // 6. Camera Controls: WebXR VR Locomotion, Operator Solid Physics ('firstperson'), Free-Fly ('freefly'), or Orbit
    if (this.renderer.xr.isPresenting) {
      this._updateXrLocomotionAndControllers(dt);
    } else {
      // Apply smooth on-screen Touch Look joystick if active
      if (Math.abs(this.touchInput.lookX) > 0.02 || Math.abs(this.touchInput.lookY) > 0.02) {
        this.fpYaw -= this.touchInput.lookX * 2.15 * dt;
        this.fpPitch = Math.max(-1.38, Math.min(1.38, this.fpPitch - this.touchInput.lookY * 1.65 * dt));
      }

      if (this.cameraMode === 'firstperson') {
        const isSprinting = this.keys.shift || this.touchInput.sprint;
        const baseSpeed = this.fpCrouching ? 3.1 : isSprinting ? 8.1 : 5.2;
        const fwdX = -Math.sin(this.fpYaw);
        const fwdZ = -Math.cos(this.fpYaw);
        const rightX = Math.cos(this.fpYaw);
        const rightZ = -Math.sin(this.fpYaw);

        let moveX = 0;
        let moveZ = 0;
        if (this.keys.w || this.keys.arrowup) {
          moveX += fwdX;
          moveZ += fwdZ;
        }
        if (this.keys.s || this.keys.arrowdown) {
          moveX -= fwdX;
          moveZ -= fwdZ;
        }
        if (this.keys.a || this.keys.arrowleft) {
          moveX -= rightX;
          moveZ -= rightZ;
        }
        if (this.keys.d || this.keys.arrowright) {
          moveX += rightX;
          moveZ += rightZ;
        }

        // Blend analog Touch Movement thumbstick seamlessly!
        if (Math.hypot(this.touchInput.moveX, this.touchInput.moveY) > 0.04) {
          moveX += fwdX * -this.touchInput.moveY + rightX * this.touchInput.moveX;
          moveZ += fwdZ * -this.touchInput.moveY + rightZ * this.touchInput.moveX;
        }

        const moveLen = Math.hypot(moveX, moveZ);
        let velX = 0;
        let velZ = 0;
        if (moveLen > 0.001) {
          const analogScale = Math.min(1.0, moveLen);
          velX = (moveX / moveLen) * baseSpeed * analogScale;
          velZ = (moveZ / moveLen) * baseSpeed * analogScale;
        }

        // Jump when grounded (Keyboard Space or Touch Jump button)
        if ((this.keys.space || this.touchInput.up) && this.fpGrounded) {
          this.fpVelY = 6.15;
          this.fpGrounded = false;
        }

        // Apply gravity
        this.fpVelY -= 18.5 * dt;

        const targetEye = this.fpCrouching ? 1.02 : 1.58;
        this._curEyeH = THREE.MathUtils.lerp(this._curEyeH || 1.58, targetEye, Math.min(1, 12 * dt));
        const headY = this.fpPos.y + this._curEyeH + 0.16;

        // Resolve solid wall, balustrade, furniture & rubble collisions!
        const nextX = this.fpPos.x + velX * dt;
        const nextZ = this.fpPos.z + velZ * dt;
        const col = this._resolveOperatorCollisions(nextX, nextZ, this.fpPos.y, headY);
        this.fpPos.x = col.x;
        this.fpPos.z = col.z;

        // Vertical floor / stair / ramp support + ceiling head bump inside floors
        const prevY = this.fpPos.y;
        let candidateY = this.fpPos.y + this.fpVelY * dt;
        const supportY = this._getSupportHeight(this.fpPos.x, this.fpPos.z, this.fpPos.y);

        // Indoor ceiling head bump (floors f = 0..3 have slab bottoms at (f+1)*3.2)
        if (
          this.fpVelY > 0 &&
          this.fpPos.x >= -8.65 &&
          this.fpPos.x <= 5.52 &&
          this.fpPos.z >= -4.4 &&
          this.fpPos.z <= 3.55 &&
          this.fpPos.y < 12.6
        ) {
          const currentFloorIdx = Math.floor((this.fpPos.y + 0.1) / FLOOR_HEIGHT);
          const ceilingBottom = (currentFloorIdx + 1) * FLOOR_HEIGHT - 0.06;
          if (candidateY + this._curEyeH + 0.18 > ceilingBottom) {
            candidateY = ceilingBottom - this._curEyeH - 0.18;
            this.fpVelY = -0.4;
          }
        }

        if (candidateY <= supportY || (this.fpGrounded && this.fpVelY <= 0 && candidateY - supportY < 0.36)) {
          candidateY = supportY;
          this.fpVelY = 0;
          this.fpGrounded = true;
        } else {
          this.fpGrounded = false;
        }
        this.fpPos.y = candidateY;

        // Push dynamic props around Operator's feet & play footstep cadence
        if (moveLen > 0.01) {
          this._pushNearbyDynamicProps(this.fpPos.x, this.fpPos.y, this.fpPos.z, velX, velZ);
          if (this.fpGrounded) {
            this._stepAccum = (this._stepAccum || 0) + baseSpeed * dt;
            if (this._stepAccum >= 1.95) {
              this._stepAccum = 0;
              const onStairs = this.fpPos.x > 5.5 && Math.abs(this.fpPos.y - prevY) > 0.004;
              if (this.cb.onFootstep) this.cb.onFootstep(onStairs);
            }
          }
        }

        // Subtle head-bob + seismic ground tremor felt by Operator!
        const walkBob = moveLen > 0.01 && this.fpGrounded ? Math.sin(this.sim.time * (isSprinting ? 15 : 10.5)) * 0.032 : 0;
        const quakeJitterX = gAmp > 0.03 ? (Math.random() - 0.5) * Math.min(0.09, gAmp * 0.12) : 0;
        const quakeJitterY = gAmp > 0.03 ? (Math.random() - 0.5) * Math.min(0.07, gAmp * 0.1) : 0;

        this.camera.position.set(
          this.fpPos.x + quakeJitterX,
          this.fpPos.y + this._curEyeH + walkBob + quakeJitterY,
          this.fpPos.z
        );
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.fpYaw;
        this.camera.rotation.x = this.fpPitch;
      } else if (this.cameraMode === 'freefly') {
        // Unrestricted 6-DOF Free-View flight mode ('Vista Libre')
        const flySpeed = (this.keys.shift || this.touchInput.sprint ? 19.5 : 8.6) * dt;
        const cosPitch = Math.cos(this.fpPitch);
        const dirX = -Math.sin(this.fpYaw) * cosPitch;
        const dirY = Math.sin(this.fpPitch);
        const dirZ = -Math.cos(this.fpYaw) * cosPitch;
        const rightX = Math.cos(this.fpYaw);
        const rightZ = -Math.sin(this.fpYaw);

        if (this.keys.w || this.keys.arrowup) {
          this.camera.position.x += dirX * flySpeed;
          this.camera.position.y += dirY * flySpeed;
          this.camera.position.z += dirZ * flySpeed;
        }
        if (this.keys.s || this.keys.arrowdown) {
          this.camera.position.x -= dirX * flySpeed;
          this.camera.position.y -= dirY * flySpeed;
          this.camera.position.z -= dirZ * flySpeed;
        }
        if (this.keys.a || this.keys.arrowleft) {
          this.camera.position.x -= rightX * flySpeed;
          this.camera.position.z -= rightZ * flySpeed;
        }
        if (this.keys.d || this.keys.arrowright) {
          this.camera.position.x += rightX * flySpeed;
          this.camera.position.z += rightZ * flySpeed;
        }
        if (Math.hypot(this.touchInput.moveX, this.touchInput.moveY) > 0.04) {
          this.camera.position.x += (dirX * -this.touchInput.moveY + rightX * this.touchInput.moveX) * flySpeed;
          this.camera.position.y += dirY * -this.touchInput.moveY * flySpeed;
          this.camera.position.z += (dirZ * -this.touchInput.moveY + rightZ * this.touchInput.moveX) * flySpeed;
        }
        if (this.keys.space || this.touchInput.up) {
          this.camera.position.y += flySpeed;
        }
        if (this.keys.c || this.keys.q || this.touchInput.down) {
          this.camera.position.y -= flySpeed;
        }

        // Clamp only to skybox bounds so user can explore everything freely without getting lost
        this.camera.position.x = Math.max(-42, Math.min(42, this.camera.position.x));
        this.camera.position.y = Math.max(0.35, Math.min(38, this.camera.position.y));
        this.camera.position.z = Math.max(-32, Math.min(42, this.camera.position.z));

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.fpYaw;
        this.camera.rotation.x = this.fpPitch;
      } else {
        this.controls.update();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
