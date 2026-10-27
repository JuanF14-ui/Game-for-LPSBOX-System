// js/scene3d.js — Escena 3D / WebXR (VR & MR) para LPSBOX System (Three.js + STLLoader)

import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { STLLoader } from '../vendor/three/STLLoader.js';
import { ZONES, ASSEMBLY_POINT, GATEWAY_WORLD_POS, SNIFFER_WORLD_POS } from './simulation.js';

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
  loader.load(
    './modelo3d.stl',
    (geometry) => {
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      cachedStlGeometry = geometry;
      stlCallbacks.forEach((cb) => cb.onLoaded && cb.onLoaded(geometry));
    },
    undefined,
    (err) => {
      stlCallbacks.forEach((cb) => cb.onError && cb.onError(err));
    }
  );
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

function makeLabelTexture(title, subtitle, accentColor = '#38bdf8', bgAlpha = 0.82) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = `rgba(8, 14, 25, ${bgAlpha})`;
  drawRoundRectPath(ctx, 6, 6, 500, 148, 20);
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = accentColor;
  ctx.stroke();

  ctx.fillStyle = accentColor;
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 68);

  if (subtitle) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 25px sans-serif';
    ctx.fillText(subtitle, 256, 115);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class LPSBoxScene3D {
  constructor(container, simulation, callbacks = {}) {
    this.container = container;
    this.sim = simulation;
    this.cb = callbacks;

    this.mrVisionEnabled = true;
    this.introOrbitActive = true;
    this.cameraMode = 'tactical'; // 'tactical' | 'firstperson' | 'gateway' | 'sniffer'

    // Scene & Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070c16);
    this.scene.fog = new THREE.FogExp2(0x070c16, 0.014);

    const w = container.clientWidth || window.innerWidth || 1280;
    const h = container.clientHeight || window.innerHeight || 720;

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.08, 140);
    this.cameraBasePos = new THREE.Vector3(7.5, 11.5, 17.5);
    this.camera.position.copy(this.cameraBasePos);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (_) {
      this.renderer = new THREE.WebGLRenderer({ antialias: false });
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    container.appendChild(this.renderer.domElement);

    // VR / XR Rig so user sits naturally at Operator Command Post when entering VR
    this.xrRig = new THREE.Group();
    this.xrRig.position.set(0, 0, 0);
    this.scene.add(this.xrRig);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 42;
    this.controls.target.set(0.8, 1.1, 2.2);

    // First-person movement state
    this.keys = {};
    this.fpPos = new THREE.Vector3(4.5, 1.68, 11.4);
    this.fpYaw = 0.16;
    this.fpPitch = -0.10;
    this.isPointerDragging = false;
    this.prevPointer = { x: 0, y: 0 };

    // Collections for dynamic objects
    this.worldShakeGroup = new THREE.Group();
    this.scene.add(this.worldShakeGroup);

    this.hangingLamps = [];
    this.buildingRoomLights = [];
    this.debrisGroups = {};
    this.personMeshes = new Map();
    this.hologramGroup = new THREE.Group();
    this.worldShakeGroup.add(this.hologramGroup);

    this.rfPulsePool = [];
    this.shockwavePool = [];
    this.snifferBeamParticles = [];

    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();
    this.clickableGateway = [];
    this.clickableDesk = [];
    this.clickableSniffer = [];

    this._setupLights();
    this._buildGroundAndBuilding();
    this._buildOperatorDeskAndGateway();
    this._buildSnifferStation();
    this._buildParticlePools();
    this._bindInputs();

    window.addEventListener('resize', () => this.onResize());
  }

  _setupLights() {
    this.ambientLight = new THREE.AmbientLight(0x8fa8cc, 0.72);
    this.scene.add(this.ambientLight);

    const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 0.55);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xe2e8f0, 1.25);
    this.sunLight.position.set(14, 24, 16);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -18;
    this.sunLight.shadow.camera.right = 18;
    this.sunLight.shadow.camera.top = 18;
    this.sunLight.shadow.camera.bottom = -18;
    this.scene.add(this.sunLight);
  }

  _buildGroundAndBuilding() {
    // Exterior tactical grid floor
    const groundGeo = new THREE.PlaneGeometry(64, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a101d,
      roughness: 0.92,
      metalness: 0.08
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.worldShakeGroup.add(ground);

    const grid = new THREE.GridHelper(56, 56, 0x1e3a5f, 0x111e33);
    grid.position.y = 0.01;
    this.worldShakeGroup.add(grid);

    // Building floor slab (-11..11, -9..5)
    const slabGeo = new THREE.BoxGeometry(22.2, 0.14, 14.2);
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x151f30, roughness: 0.8 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 0.07, -2.0);
    slab.receiveShadow = true;
    this.worldShakeGroup.add(slab);

    // Zone colored floor pads, furniture, hanging lamps, and collapse rubble placeholders
    ZONES.forEach((zone) => {
      const w = zone.bounds.xMax - zone.bounds.xMin;
      const d = zone.bounds.zMax - zone.bounds.zMin;
      const cx = (zone.bounds.xMin + zone.bounds.xMax) / 2;
      const cz = (zone.bounds.zMin + zone.bounds.zMax) / 2;

      const padMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(zone.color).multiplyScalar(0.22),
        roughness: 0.85
      });
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx, 0.145, cz);
      pad.receiveShadow = true;
      this.worldShakeGroup.add(pad);

      // Border strip
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.02, d));
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: zone.color, transparent: true, opacity: 0.65 })
      );
      line.position.set(cx, 0.155, cz);
      this.worldShakeGroup.add(line);

      // Floating zone sign
      const labelTex = makeLabelTexture(zone.code, zone.shortName, zone.color);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.7, 0.85),
        new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, side: THREE.DoubleSide })
      );
      sign.position.set(cx, 2.75, cz);
      this.worldShakeGroup.add(sign);

      // Zone interior furniture
      this._populateZoneFurniture(zone, cx, cz);

      // Hanging pendulum lamp
      const lampPivot = new THREE.Group();
      lampPivot.position.set(cx, 3.6, cz);
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.75),
        new THREE.MeshBasicMaterial({ color: 0x64748b })
      );
      cord.position.y = -0.375;
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.2, 16),
        new THREE.MeshStandardMaterial({
          color: 0x334155,
          emissive: 0xbae6fd,
          emissiveIntensity: 0.6
        })
      );
      shade.position.y = -0.75;
      const pLight = new THREE.PointLight(0xe0f2fe, 2.4, 11);
      pLight.position.y = -0.82;
      lampPivot.add(cord, shade, pLight);
      this.worldShakeGroup.add(lampPivot);
      this.hangingLamps.push({ pivot: lampPivot, shade, light: pLight, phase: cx * 0.3 });
      this.buildingRoomLights.push(pLight);

      // Collapse debris group (hidden until major earthquake collapse!)
      const debrisGrp = new THREE.Group();
      debrisGrp.visible = false;
      for (let i = 0; i < 12; i++) {
        const chunk = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.22 + (i % 3) * 0.14, 0),
          new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.95 })
        );
        chunk.position.set(
          cx + Math.cos(i * 1.7) * 2.1,
          0.24 + (i % 2) * 0.15,
          cz + Math.sin(i * 2.3) * 1.5
        );
        chunk.rotation.set(i, i * 0.6, 0);
        chunk.castShadow = true;
        debrisGrp.add(chunk);
      }
      // Fallen ceiling beam
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.22, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.7 })
      );
      beam.position.set(cx, 0.55, cz + 0.6);
      beam.rotation.set(0.18, 0.4, -0.22);
      debrisGrp.add(beam);

      // Warning hazard beacon
      const haz = new THREE.PointLight(0xef4444, 3.0, 7);
      haz.position.set(cx, 1.4, cz);
      debrisGrp.add(haz);

      this.worldShakeGroup.add(debrisGrp);
      this.debrisGroups[zone.id] = debrisGrp;
    });

    // Cutaway Perimeter & Partition Walls (waist-high solid + glass upper band so interior is 100% visible)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.10,
      roughness: 0.15
    });

    const addCutawayWall = (x, z, w, d) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1.25, d), wallMat);
      base.position.set(x, 0.76, z);
      base.castShadow = true;
      base.receiveShadow = true;
      this.worldShakeGroup.add(base);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, d), glassMat);
      glass.position.set(x, 2.28, z);
      this.worldShakeGroup.add(glass);
    };

    // Back wall (-9), Left wall (-11), Right wall (+11), Front walls leaving central exit door at x ∈ [-1.6, 1.6]
    addCutawayWall(0, -9.0, 22.2, 0.22);
    addCutawayWall(-11.0, -2.0, 0.22, 14.2);
    addCutawayWall(11.0, -2.0, 0.22, 14.2);
    addCutawayWall(-6.3, 5.0, 9.4, 0.22);
    addCutawayWall(6.3, 5.0, 9.4, 0.22);

    // Interior partial dividers with open corridors
    addCutawayWall(-6.2, -1.9, 8.8, 0.16);
    addCutawayWall(6.2, -1.9, 8.8, 0.16);
    addCutawayWall(0, -6.0, 0.16, 5.6);

    // Green illuminated EXIT arch at (0, 5.0)
    const exitSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 0.55),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('SALIDA EMERGENCIA', 'Evacuación →', '#10b981', 0.9),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    exitSign.position.set(0, 2.55, 5.05);
    this.worldShakeGroup.add(exitSign);

    // Outdoor Evacuation Assembly Point (-6.2, 9.8)
    const assemblyRing = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 2.65, 48),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
    );
    assemblyRing.rotation.x = -Math.PI / 2;
    assemblyRing.position.set(ASSEMBLY_POINT.x, 0.03, ASSEMBLY_POINT.z);
    this.worldShakeGroup.add(assemblyRing);

    const assemblyFill = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 48),
      new THREE.MeshBasicMaterial({ color: 0x064e3b, transparent: true, opacity: 0.42 })
    );
    assemblyFill.rotation.x = -Math.PI / 2;
    assemblyFill.position.set(ASSEMBLY_POINT.x, 0.025, ASSEMBLY_POINT.z);
    this.worldShakeGroup.add(assemblyFill);

    const assemblySign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 0.95),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('PUNTO DE ENCUENTRO', 'Zona Segura Exterior', '#10b981'),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    assemblySign.position.set(ASSEMBLY_POINT.x, 1.8, ASSEMBLY_POINT.z);
    this.worldShakeGroup.add(assemblySign);
  }

  _populateZoneFurniture(zone, cx, cz) {
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.5, roughness: 0.4 });
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45
    });

    if (zone.id === 'A') {
      // Electronics Lab benches with oscilloscopes
      [-2.2, 2.0].forEach((dx) => {
        [-1.1, 1.3].forEach((dz) => {
          const bench = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.76, 0.9), deskMat);
          bench.position.set(cx + dx, 0.52, cz + dz);
          bench.castShadow = true;
          const scope = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.28), screenMat);
          scope.position.set(cx + dx - 0.5, 1.05, cz + dz);
          this.worldShakeGroup.add(bench, scope);
        });
      });
    } else if (zone.id === 'B') {
      // Server racks + office desks
      for (let i = -1; i <= 1; i++) {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.95, 0.95), darkMat);
        rack.position.set(cx - 2.3 + i * 1.35, 1.12, cz - 1.4);
        rack.castShadow = true;
        const ledStrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.08, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xa855f7 })
        );
        ledStrip.position.set(cx - 2.3 + i * 1.35, 1.75, cz - 0.91);
        this.worldShakeGroup.add(rack, ledStrip);
      }
      const desk = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.75, 1.0), deskMat);
      desk.position.set(cx + 1.8, 0.52, cz + 1.2);
      this.worldShakeGroup.add(desk);
    } else if (zone.id === 'C') {
      // Auditorium rows + podium
      const podium = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.05, 0.7), deskMat);
      podium.position.set(cx, 0.66, cz - 2.0);
      this.worldShakeGroup.add(podium);
      for (let row = 0; row < 3; row++) {
        const seatRow = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.48, 0.55), deskMat);
        seatRow.position.set(cx, 0.38, cz - 0.5 + row * 1.15);
        seatRow.castShadow = true;
        this.worldShakeGroup.add(seatRow);
      }
    } else if (zone.id === 'D') {
      // Cafeteria round tables
      [
        [-2.0, -1.0],
        [1.8, -1.0],
        [-1.8, 1.2],
        [2.0, 1.2]
      ].forEach(([dx, dz]) => {
        const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.74, 20), deskMat);
        tbl.position.set(cx + dx, 0.51, cz + dz);
        tbl.castShadow = true;
        this.worldShakeGroup.add(tbl);
      });
    }
  }

  _buildOperatorDeskAndGateway() {
    const gx = GATEWAY_WORLD_POS.x;
    const gz = GATEWAY_WORLD_POS.z;

    // Tactical Operator Command Station Platform
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.08, 3.0),
      new THREE.MeshStandardMaterial({ color: 0x17253b, roughness: 0.75 })
    );
    pad.position.set(gx, 0.04, gz + 0.4);
    pad.receiveShadow = true;
    this.worldShakeGroup.add(pad);

    // Command Table (clickable to trigger physical MPU6050 impact shockwave!)
    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.1, 1.15),
      new THREE.MeshStandardMaterial({ color: 0x29374d, roughness: 0.55, metalness: 0.25 })
    );
    tableTop.position.set(gx, 0.87, gz);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    this.worldShakeGroup.add(tableTop);
    this.clickableDesk.push(tableTop);

    [
      [-1.15, -0.45],
      [1.15, -0.45],
      [-1.15, 0.45],
      [1.15, 0.45]
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.85, 0.09),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.6 })
      );
      leg.position.set(gx + lx, 0.43, gz + lz);
      this.worldShakeGroup.add(leg);
    });

    // Desk label
    const opSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 0.88),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('PUESTO DEL OPERARIO', 'LPSBOX Gateway (Clic para extraer)', '#fbbf24'),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    opSign.position.set(gx, 2.25, gz);
    this.worldShakeGroup.add(opSign);

    // Operator Field Laptop next to the Gateway (for USB-C extraction visualization)
    const laptopGroup = new THREE.Group();
    laptopGroup.position.set(gx - 0.62, 0.92, gz + 0.06);
    laptopGroup.rotation.y = 0.24;
    const lapBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.025, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 })
    );
    const lapLid = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.34, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.35 })
    );
    lapLid.position.set(0, 0.16, -0.17);
    lapLid.rotation.x = -0.22;

    this.laptopScreenCanvas = document.createElement('canvas');
    this.laptopScreenCanvas.width = 256;
    this.laptopScreenCanvas.height = 160;
    this.laptopScreenTex = new THREE.CanvasTexture(this.laptopScreenCanvas);
    this.laptopScreenTex.colorSpace = THREE.SRGBColorSpace;
    const lapDisp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.47, 0.29),
      new THREE.MeshBasicMaterial({ map: this.laptopScreenTex })
    );
    lapDisp.position.set(0, 0.16, -0.158);
    lapDisp.rotation.x = -0.22;
    laptopGroup.add(lapBase, lapLid, lapDisp);
    this.worldShakeGroup.add(laptopGroup);

    // ============ 3D LPSBOX GATEWAY (Screen-less Minimalist Dark Box w/ 3 Synced LEDs) ============
    // Faithfully matches lpsbox_gateway_v.png + bozeto del gateway.jpg
    this.gatewayGroup = new THREE.Group();
    this.gatewayGroup.position.set(gx + 0.35, 0.92, gz);
    this.gatewayGroup.rotation.y = -0.15;

    const absBodyMat = new THREE.MeshStandardMaterial({
      color: 0x22262c,
      roughness: 0.68,
      metalness: 0.18
    });
    const absDarkMat = new THREE.MeshStandardMaterial({
      color: 0x121519,
      roughness: 0.5,
      metalness: 0.3
    });

    // Main screen-less rectangular enclosure (0.34m x 0.42m x 0.13m scaled for clear VR/desktop visibility)
    const gwBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.13), absBodyMat);
    gwBody.position.set(0, 0.21, 0);
    gwBody.castShadow = true;
    this.gatewayGroup.add(gwBody);
    this.clickableGateway.push(gwBody);

    // Snap-fit lower seam groove (matching lpsbox_gateway_v.png)
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.344, 0.008, 0.134), absDarkMat);
    seam.position.set(0, 0.055, 0);
    this.gatewayGroup.add(seam);

    // Top-left SMA Brass Connector + Matte Black Rubber Antenna
    const smaNut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.028, 12),
      new THREE.MeshStandardMaterial({ color: 0xb4924c, metalness: 0.85, roughness: 0.3 })
    );
    smaNut.position.set(-0.095, 0.434, 0);
    const antennaRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.02, 0.19, 16),
      absDarkMat
    );
    antennaRod.position.set(-0.095, 0.54, 0);
    this.gatewayGroup.add(smaNut, antennaRod);
    this.clickableGateway.push(antennaRod);

    // Front recessed port bay (bottom-left: microSD + USB-C PROGRAM / EXTRACTION)
    const portBay = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.165, 0.014), absDarkMat);
    portBay.position.set(-0.105, 0.155, 0.061);
    const sdSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.068, 0.018),
      new THREE.MeshBasicMaterial({ color: 0x05070a })
    );
    sdSlot.position.set(-0.112, 0.192, 0.063);
    const usbcProg = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.042, 0.018),
      new THREE.MeshBasicMaterial({ color: 0x05070a })
    );
    usbcProg.position.set(-0.112, 0.112, 0.063);
    this.gatewayGroup.add(portBay, sdSlot, usbcProg);

    // Side USB-C Power port (right face)
    const usbcPwr = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.044, 0.018),
      new THREE.MeshBasicMaterial({ color: 0x05070a })
    );
    usbcPwr.position.set(0.168, 0.20, 0);
    this.gatewayGroup.add(usbcPwr);

    // Embossed "LPSBOX Gateway" front nameplate (NO SCREEN!)
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 256;
    plaqueCanvas.height = 64;
    const pctx = plaqueCanvas.getContext('2d');
    pctx.fillStyle = '#1b1f26';
    pctx.fillRect(0, 0, 256, 64);
    pctx.strokeStyle = '#323946';
    pctx.lineWidth = 4;
    pctx.strokeRect(4, 4, 248, 56);
    pctx.fillStyle = '#8b9bb4';
    pctx.font = 'bold 24px monospace';
    pctx.textAlign = 'center';
    pctx.fillText('LPSBOX Gateway', 128, 40);
    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.038),
      new THREE.MeshBasicMaterial({ map: plaqueTex })
    );
    plaque.position.set(0.005, 0.092, 0.066);
    this.gatewayGroup.add(plaque);

    // === THE 3 PHYSICAL SYNCED LEDs ON THE GATEWAY ===
    // 1. Mini LED que titila recibiendo info (Top-Left smaller LED)
    this.gwLedBlinkMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      emissive: 0x10b981,
      emissiveIntensity: 0
    });
    const ledBlinkMesh = new THREE.Mesh(new THREE.SphereGeometry(0.009, 14, 14), this.gwLedBlinkMat);
    ledBlinkMesh.position.set(-0.115, 0.365, 0.066);

    // 2. LED Amarillo — Indica que hay información lista (Top-Center/Right larger LED)
    this.gwLedYellowMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      emissive: 0xfbbf24,
      emissiveIntensity: 0
    });
    const ledYellowMesh = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 16), this.gwLedYellowMat);
    ledYellowMesh.position.set(-0.045, 0.365, 0.066);

    // 3. LED Azul — Indica que NO hay información aún (Lower-Right / Secondary status LED, matching lpsbox_gateway_v.png)
    this.gwLedBlueMat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x3b82f6,
      emissiveIntensity: 2.2
    });
    const ledBlueMesh = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 16), this.gwLedBlueMat);
    ledBlueMesh.position.set(0.115, 0.094, 0.066);

    this.gwGlowLight = new THREE.PointLight(0x3b82f6, 1.2, 2.2);
    this.gwGlowLight.position.set(0, 0.26, 0.22);

    this.gatewayGroup.add(ledBlinkMesh, ledYellowMesh, ledBlueMesh, this.gwGlowLight);

    // Animated USB-C Cable connecting Gateway <-> Operator Laptop
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(gx + 0.24, 1.03, gz + 0.08),
      new THREE.Vector3(gx + 0.02, 0.93, gz + 0.25),
      new THREE.Vector3(gx - 0.36, 0.94, gz + 0.14)
    ]);
    this.usbCableMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
      roughness: 0.4
    });
    this.usbCableMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.009, 8, false), this.usbCableMat);
    this.worldShakeGroup.add(this.usbCableMesh);

    this.worldShakeGroup.add(this.gatewayGroup);
  }

  _buildSnifferStation() {
    // Central Instrumentation Pillar inside building at SNIFFER_WORLD_POS (0, 1.55, -1.85)
    const sx = SNIFFER_WORLD_POS.x;
    const sz = SNIFFER_WORLD_POS.z;

    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 2.5, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
    );
    pillar.position.set(sx, 1.25, sz - 0.26);
    pillar.castShadow = true;
    this.worldShakeGroup.add(pillar);

    const snifferSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.78),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('NODO SNIFFER ESP32', 'modelo3d.stl + MPU6050', '#38bdf8'),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    snifferSign.position.set(sx, 2.95, sz);
    this.worldShakeGroup.add(snifferSign);

    this.snifferMount = new THREE.Group();
    // Place Sniffer base at y = 1.15m on the central pillar facing +Z
    this.snifferMount.position.set(sx, 1.15, sz);
    this.snifferScale = 0.82;
    this.snifferMount.scale.setScalar(this.snifferScale);
    this.worldShakeGroup.add(this.snifferMount);

    // Dynamic HTML5 Canvas OLED Screen placed right on the front screen bezel of modelo3d.stl!
    // In STL coords: X center ~ -0.025, Z ~ 0.51 (becomes Three.js Y = 0.51), -Y front ~ -0.151 (becomes Three.js Z = +0.151)
    this.snifferOledCanvas = document.createElement('canvas');
    this.snifferOledCanvas.width = 256;
    this.snifferOledCanvas.height = 160;
    this.snifferOledTex = new THREE.CanvasTexture(this.snifferOledCanvas);
    this.snifferOledTex.colorSpace = THREE.SRGBColorSpace;

    const oledPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.155),
      new THREE.MeshBasicMaterial({ map: this.snifferOledTex })
    );
    oledPlane.position.set(-0.022, 0.505, 0.153);
    this.snifferMount.add(oledPlane);

    // Status LED dot next to screen (matching bozeto del sniffer rediseño IA.jpg)
    this.snifferLedMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf });
    const snifferLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 12), this.snifferLedMat);
    snifferLed.position.set(0.145, 0.515, 0.153);
    this.snifferMount.add(snifferLed);

    // Load actual repository './modelo3d.stl' (50,000 triangles!)
    loadSharedStlGeometry(
      (geometry) => {
        const stlMat = new THREE.MeshStandardMaterial({
          color: 0x262b33,
          roughness: 0.55,
          metalness: 0.25
        });
        const stlMesh = new THREE.Mesh(geometry, stlMat);
        // Rotate STL (Z-up, -Y-front) -> Three.js (Y-up, +Z-front)
        stlMesh.rotation.x = -Math.PI / 2;
        stlMesh.castShadow = true;
        stlMesh.receiveShadow = true;
        this.snifferMount.add(stlMesh);
        this.clickableSniffer.push(stlMesh);
        if (this.cb.onStlReady) this.cb.onStlReady(geometry);
      },
      (err) => {
        // Fallback procedural body only if STL fails
        const fb = new THREE.Mesh(
          new THREE.BoxGeometry(0.58, 0.68, 0.28),
          new THREE.MeshStandardMaterial({ color: 0x262b33 })
        );
        fb.position.set(0, 0.34, 0);
        this.snifferMount.add(fb);
        if (this.cb.onStlError) this.cb.onStlError(err);
      }
    );
  }

  _buildParticlePools() {
    // Pool of RF Probe Request rings
    for (let i = 0; i < 36; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.82, 1.0, 28),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.worldShakeGroup.add(ring);
      this.rfPulsePool.push(ring);
    }

    // Pool of MR Seismic Shockwave rings
    for (let i = 0; i < 8; i++) {
      const sw = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1.0, 64),
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide
        })
      );
      sw.rotation.x = -Math.PI / 2;
      sw.visible = false;
      this.worldShakeGroup.add(sw);
      this.shockwavePool.push(sw);
    }

    // Wireless RF data packets flying from Sniffer antenna -> Gateway antenna!
    const startPt = new THREE.Vector3(SNIFFER_WORLD_POS.x + 0.13, 1.98, SNIFFER_WORLD_POS.z);
    const midPt = new THREE.Vector3(2.2, 4.3, 3.8);
    const endPt = new THREE.Vector3(GATEWAY_WORLD_POS.x + 0.26, 1.52, GATEWAY_WORLD_POS.z);
    this.rfLinkCurve = new THREE.QuadraticBezierCurve3(startPt, midPt, endPt);

    const curvePts = this.rfLinkCurve.getPoints(40);
    const linkGeo = new THREE.BufferGeometry().setFromPoints(curvePts);
    this.rfLinkLine = new THREE.Line(
      linkGeo,
      new THREE.LineDashedMaterial({
        color: 0x38bdf8,
        dashSize: 0.35,
        gapSize: 0.22,
        transparent: true,
        opacity: 0.45
      })
    );
    this.rfLinkLine.computeLineDistances();
    this.worldShakeGroup.add(this.rfLinkLine);

    for (let i = 0; i < 6; i++) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
      );
      this.worldShakeGroup.add(orb);
      this.snifferBeamParticles.push({ mesh: orb, t: i / 6 });
    }
  }

  _createPersonMesh(person) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: person.color, roughness: 0.6 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.65 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.52, 0.2), bodyMat);
    torso.position.y = 0.96;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 14), skinMat);
    head.position.y = 1.38;
    head.castShadow = true;

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 0.14), pantsMat);
    legL.position.set(-0.09, 0.35, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 0.14), pantsMat);
    legR.position.set(0.09, 0.35, 0);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.1), bodyMat);
    armL.position.set(-0.23, 0.96, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.1), bodyMat);
    armR.position.set(0.23, 0.96, 0);

    // Glowing smartphone in right hand (visible in MR Vision)
    const phoneMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.02), phoneMat);
    phone.position.set(0, -0.22, 0.08);
    armR.add(phone);

    // Reaction Speech / Status Sprite above head
    const bubbleCanvas = document.createElement('canvas');
    bubbleCanvas.width = 320;
    bubbleCanvas.height = 72;
    const bubbleTex = new THREE.CanvasTexture(bubbleCanvas);
    bubbleTex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false })
    );
    sprite.scale.set(1.65, 0.38, 1);
    sprite.position.y = 1.82;

    group.add(torso, head, legL, legR, armL, armR, sprite);
    this.worldShakeGroup.add(group);

    const meshData = {
      group,
      torso,
      head,
      legL,
      legR,
      armL,
      armR,
      phone,
      phoneMat,
      sprite,
      bubbleCanvas,
      bubbleTex,
      lastPhrase: ''
    };
    this._updatePersonBubble(meshData, person.phrase, person.state);
    return meshData;
  }

  _updatePersonBubble(meshData, phrase, state) {
    const key = `${state}|${phrase}`;
    if (meshData.lastPhrase === key) return;
    meshData.lastPhrase = key;

    const ctx = meshData.bubbleCanvas.getContext('2d');
    ctx.clearRect(0, 0, 320, 72);

    let border = '#38bdf8';
    if (state === 'crouching' || state === 'evacuating_calm') border = '#fbbf24';
    if (state === 'evacuating_panic' || state === 'trapped') border = '#ef4444';
    if (state === 'evacuated') border = '#10b981';

    ctx.fillStyle = 'rgba(7, 12, 22, 0.85)';
    drawRoundRectPath(ctx, 4, 6, 312, 60, 14);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = border;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(phrase.slice(0, 30), 160, 43);

    meshData.bubbleTex.needsUpdate = true;
  }

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyE' && this.cb.onExtractGateway) {
        this.cb.onExtractGateway();
      }
      if (e.code === 'KeyG' && this.cb.onHitDesk) {
        this.cb.onHitDesk();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.stopIntroOrbit();
      this.isPointerDragging = true;
      this.prevPointer.x = e.clientX;
      this.prevPointer.y = e.clientY;
    });

    window.addEventListener('pointerup', (e) => {
      const moved = Math.hypot(e.clientX - this.prevPointer.x, e.clientY - this.prevPointer.y);
      this.isPointerDragging = false;
      if (moved < 6 && e.target === dom) {
        this._handleSceneClick(e);
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.cameraMode === 'firstperson' && this.isPointerDragging) {
        const dx = e.clientX - this.prevPointer.x;
        const dy = e.clientY - this.prevPointer.y;
        this.prevPointer.x = e.clientX;
        this.prevPointer.y = e.clientY;
        this.fpYaw -= dx * 0.0042;
        this.fpPitch = Math.max(-1.1, Math.min(1.1, this.fpPitch - dy * 0.0042));
      }
    });
  }

  _handleSceneClick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    if (this.raycaster.intersectObjects(this.clickableGateway, true).length > 0) {
      if (this.cb.onExtractGateway) this.cb.onExtractGateway();
      return;
    }
    if (this.raycaster.intersectObjects(this.clickableSniffer, true).length > 0) {
      this.setCameraMode('sniffer');
      if (this.cb.onCameraModeChanged) this.cb.onCameraModeChanged('sniffer');
      return;
    }
    if (this.raycaster.intersectObjects(this.clickableDesk, true).length > 0) {
      if (this.cb.onHitDesk) this.cb.onHitDesk();
    }
  }

  stopIntroOrbit() {
    this.introOrbitActive = false;
    this.controls.autoRotate = false;
  }

  restoreBackground() {
    this.scene.background = new THREE.Color(0x070c16);
  }

  setCameraMode(mode) {
    this.stopIntroOrbit();
    this.cameraMode = mode;
    if (mode === 'firstperson') {
      this.controls.enabled = false;
      this.camera.position.copy(this.fpPos);
    } else {
      this.controls.enabled = true;
      if (mode === 'tactical') {
        this.camera.position.set(7.5, 11.5, 17.5);
        this.controls.target.set(0.8, 1.1, 2.2);
      } else if (mode === 'gateway') {
        this.camera.position.set(GATEWAY_WORLD_POS.x + 0.55, 1.38, GATEWAY_WORLD_POS.z + 0.92);
        this.controls.target.set(GATEWAY_WORLD_POS.x + 0.32, 1.14, GATEWAY_WORLD_POS.z);
      } else if (mode === 'sniffer') {
        this.camera.position.set(SNIFFER_WORLD_POS.x + 0.18, 1.72, SNIFFER_WORLD_POS.z + 1.05);
        this.controls.target.set(SNIFFER_WORLD_POS.x, 1.56, SNIFFER_WORLD_POS.z);
      }
      this.controls.update();
    }
  }

  _updateFirstPerson(dt) {
    if (this.cameraMode !== 'firstperson' || this.renderer.xr.isPresenting) return;
    const moveSpeed = (this.keys['ShiftLeft'] ? 6.5 : 4.2) * dt;
    const forward = new THREE.Vector3(-Math.sin(this.fpYaw), 0, -Math.cos(this.fpYaw));
    const right = new THREE.Vector3(Math.cos(this.fpYaw), 0, -Math.sin(this.fpYaw));

    if (this.keys['KeyW'] || this.keys['ArrowUp']) this.fpPos.addScaledVector(forward, moveSpeed);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) this.fpPos.addScaledVector(forward, -moveSpeed);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) this.fpPos.addScaledVector(right, moveSpeed);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.fpPos.addScaledVector(right, -moveSpeed);

    this.fpPos.x = Math.max(-15, Math.min(15, this.fpPos.x));
    this.fpPos.z = Math.max(-11, Math.min(18, this.fpPos.z));

    this.camera.position.copy(this.fpPos);
    const euler = new THREE.Euler(this.fpPitch, this.fpYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  _updateHardwareCanvases() {
    // 1. Sniffer OLED Screen on modelo3d.stl
    const ctx = this.snifferOledCanvas.getContext('2d');
    const isMajor = this.sim.scenario === 'major' && (this.sim.quakeActive || this.sim.frozenSnapshot);
    const isMild = this.sim.scenario === 'mild' && (this.sim.quakeActive || this.sim.frozenSnapshot);

    ctx.fillStyle = isMajor ? '#1d0508' : isMild ? '#1b1204' : '#041210';
    ctx.fillRect(0, 0, 256, 160);

    // Top status bar + battery icon (matching bozeto del sniffer rediseño IA.jpg!)
    ctx.fillStyle = isMajor ? '#f87171' : isMild ? '#fbbf24' : '#5eead4';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`STA/LTA:${this.sim.staLtaRatio.toFixed(1)}`, 12, 24);

    // Battery icon top right
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(208, 10, 32, 15);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(211, 13, 24, 9);
    ctx.fillRect(240, 14, 3, 7);

    // Main title ("ALERTA / Enviando datos")
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    if (isMajor) {
      ctx.fillStyle = '#fecaca';
      ctx.fillText('ALERTA', 128, 76);
      ctx.font = '600 22px sans-serif';
      ctx.fillText('Enviando datos', 128, 112);
    } else if (isMild) {
      ctx.fillStyle = '#fde68a';
      ctx.fillText('SISMO LEVE', 128, 76);
      ctx.font = '600 21px sans-serif';
      ctx.fillText('Enviando datos', 128, 112);
    } else {
      ctx.fillStyle = '#99f6e4';
      ctx.fillText('MONITOREO', 128, 76);
      ctx.font = '600 19px monospace';
      ctx.fillText(`PKTS 10s: ${this.sim.rollingProbes.length}`, 128, 112);
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(`MPU6050: ${this.sim.accel.dynamicG.toFixed(3)}g`, 128, 144);
    this.snifferOledTex.needsUpdate = true;

    this.snifferLedMat.color.setHex(isMajor ? 0xef4444 : isMild ? 0xfbbf24 : 0x2dd4bf);

    // 2. Operator Field Laptop Screen
    const lctx = this.laptopScreenCanvas.getContext('2d');
    lctx.fillStyle = '#07101e';
    lctx.fillRect(0, 0, 256, 160);
    lctx.strokeStyle = this.sim.gatewayLeds.yellow ? '#fbbf24' : '#38bdf8';
    lctx.lineWidth = 4;
    lctx.strokeRect(4, 4, 248, 152);
    lctx.fillStyle = this.sim.gatewayLeds.yellow ? '#fbbf24' : '#38bdf8';
    lctx.font = 'bold 19px monospace';
    lctx.textAlign = 'center';
    lctx.fillText('RPi5 GATEWAY LINK', 128, 42);
    lctx.fillStyle = '#e2e8f0';
    lctx.font = '16px sans-serif';
    lctx.fillText(
      this.sim.gatewayLeds.yellow ? '¡DATOS PRE-SISMO LISTOS!' : 'Esperando evento t₀...',
      128,
      86
    );
    lctx.fillStyle = '#94a3b8';
    lctx.font = '14px monospace';
    lctx.fillText('[Clic en Gateway o Tecla E]', 128, 126);
    this.laptopScreenTex.needsUpdate = true;
  }

  _syncPeopleAndHolograms() {
    const activeIds = new Set();
    const showSpeech = this.sim.quakeActive || this.sim.scenario !== 'normal';

    this.sim.people.forEach((p) => {
      activeIds.add(p.id);
      let m = this.personMeshes.get(p.id);
      if (!m) {
        m = this._createPersonMesh(p);
        this.personMeshes.set(p.id, m);
      }

      m.group.position.set(p.x, 0.14, p.z);
      if (Math.hypot(p.vx, p.vz) > 0.05) {
        m.group.rotation.y = Math.atan2(p.vx, p.vz);
      }

      // Pose animation
      const moving = Math.hypot(p.vx, p.vz) > 0.08;
      if (p.state === 'crouching' || p.state === 'trapped') {
        m.torso.position.y = 0.68;
        m.head.position.y = 1.06;
        m.legL.scale.y = 0.6;
        m.legR.scale.y = 0.6;
        m.armL.position.y = 0.72;
        m.armR.position.y = 0.78;
        // Waving arm if trapped!
        m.armL.rotation.z = p.state === 'trapped' ? 2.4 + Math.sin(this.sim.time * 9) * 0.4 : 0.3;
      } else {
        m.torso.position.y = 0.96;
        m.head.position.y = 1.38;
        m.legL.scale.y = 1.0;
        m.legR.scale.y = 1.0;
        m.armL.position.y = 0.96;
        m.armR.position.y = 0.96;
        m.armL.rotation.z = 0;
        const swing = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
        m.legL.rotation.x = swing;
        m.legR.rotation.x = -swing;
        m.armL.rotation.x = -swing * 0.7;
        m.armR.rotation.x = swing * 0.7;
      }

      m.phone.visible = this.mrVisionEnabled && p.phoneOnline;
      m.sprite.visible = showSpeech || p.id % 3 === 0;
      this._updatePersonBubble(m, p.phrase, p.state);
    });

    // Clean removed people
    for (const [id, m] of this.personMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.worldShakeGroup.remove(m.group);
        this.personMeshes.delete(id);
      }
    }

    // Pre-Quake t0 Holographic Ghost Beacons (shown after Operator submits report or toggles verification)
    if (this.sim.showPreQuakeHologram && this.sim.frozenSnapshot) {
      const positions = this.sim.frozenSnapshot.groundTruthPositions;
      while (this.hologramGroup.children.length < positions.length) {
        const holo = new THREE.Group();
        const cyl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.24, 1.65, 16, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0x34d399,
            transparent: true,
            opacity: 0.38,
            side: THREE.DoubleSide
          })
        );
        cyl.position.y = 0.96;
        const baseRing = new THREE.Mesh(
          new THREE.RingGeometry(0.26, 0.38, 24),
          new THREE.MeshBasicMaterial({ color: 0x6ee7b7, side: THREE.DoubleSide })
        );
        baseRing.rotation.x = -Math.PI / 2;
        baseRing.position.y = 0.16;
        holo.add(cyl, baseRing);
        this.hologramGroup.add(holo);
      }
      this.hologramGroup.visible = true;
      this.hologramGroup.children.forEach((child, idx) => {
        if (idx < positions.length) {
          child.visible = true;
          child.position.set(positions[idx].x, 0, positions[idx].z);
          child.rotation.y = this.sim.time * 1.5;
        } else {
          child.visible = false;
        }
      });
    } else {
      this.hologramGroup.visible = false;
    }
  }

  update(dt) {
    this._updateFirstPerson(dt);
    if (this.controls.enabled && !this.renderer.xr.isPresenting) {
      this.controls.update();
    }

    // 1. Apply physical ground shaking to worldShakeGroup
    const g = this.sim.accel.dynamicG;
    if (g > 0.018) {
      const amp = Math.min(0.28, (g - 0.015) * 0.42);
      this.worldShakeGroup.position.set(
        Math.sin(this.sim.time * 29) * amp,
        Math.cos(this.sim.time * 37) * amp * 0.35,
        Math.cos(this.sim.time * 23) * amp
      );
    } else {
      this.worldShakeGroup.position.set(0, 0, 0);
    }

    // 2. Swing hanging lamps & update emergency lighting on collapse
    this.hangingLamps.forEach((lamp, idx) => {
      const sway = Math.min(0.45, g * 0.85);
      lamp.pivot.rotation.z = Math.sin(this.sim.time * 4.5 + lamp.phase) * sway;
      lamp.pivot.rotation.x = Math.cos(this.sim.time * 3.8 + idx) * sway * 0.7;

      if (this.sim.collapseOccurred) {
        lamp.light.color.setHex(0xef4444);
        lamp.light.intensity = 1.2 + Math.sin(this.sim.time * 12 + idx) * 0.4;
        lamp.shade.material.emissive.setHex(0xef4444);
      } else {
        lamp.light.color.setHex(0xe0f2fe);
        lamp.light.intensity = 2.4;
        lamp.shade.material.emissive.setHex(0xbae6fd);
      }
    });

    // Show/hide collapse rubble per zone
    ZONES.forEach((z) => {
      if (this.debrisGroups[z.id]) {
        this.debrisGroups[z.id].visible = this.sim.collapsedZones.has(z.id);
      }
    });

    // 3. Hardware Sync: Update the 3 Physical LEDs on the 3D Gateway!
    const leds = this.sim.gatewayLeds;
    this.gwLedBlueMat.emissiveIntensity = leds.blue ? 2.6 : 0.0;
    this.gwLedBlueMat.color.setHex(leds.blue ? 0x60a5fa : 0x1e293b);

    this.gwLedBlinkMat.emissiveIntensity = leds.blink ? 2.8 : 0.0;
    this.gwLedBlinkMat.color.setHex(leds.blink ? 0x34d399 : 0x1e293b);

    this.gwLedYellowMat.emissiveIntensity = leds.yellow ? 3.2 : 0.0;
    this.gwLedYellowMat.color.setHex(leds.yellow ? 0xfbbf24 : 0x1e293b);

    if (leds.yellow) {
      this.gwGlowLight.color.setHex(0xf59e0b);
      this.gwGlowLight.intensity = 1.8 + Math.sin(this.sim.time * 5) * 0.4;
      this.usbCableMat.emissive.setHex(0xf59e0b);
    } else if (leds.blink) {
      this.gwGlowLight.color.setHex(0x10b981);
      this.gwGlowLight.intensity = 1.4;
    } else {
      this.gwGlowLight.color.setHex(0x3b82f6);
      this.gwGlowLight.intensity = 0.9;
      this.usbCableMat.emissive.setHex(0x0284c7);
    }

    // 4. Update RF pulses & MR Shockwaves
    const showRfInside =
      this.mrVisionEnabled && !(this.sim.challengeMode && this.sim.frozenSnapshot && !this.sim.reportSubmitted);

    this.rfPulsePool.forEach((ring, idx) => {
      const p = this.sim.rfPulses[idx];
      if (p && showRfInside) {
        ring.visible = true;
        ring.position.set(p.x, 0.18, p.z);
        ring.scale.setScalar(p.radius);
        ring.material.color.setHex(p.isRandom ? 0xfbbf24 : 0x38bdf8);
        ring.material.opacity = Math.max(0, p.alpha * 0.55);
      } else {
        ring.visible = false;
      }
    });

    this.shockwavePool.forEach((swMesh, idx) => {
      const sw = this.sim.shockwaves[idx];
      if (sw) {
        swMesh.visible = true;
        swMesh.position.set(sw.x, 0.22, sw.z);
        swMesh.scale.setScalar(sw.radius);
        swMesh.material.color.set(sw.color);
        swMesh.material.opacity = Math.max(0, sw.alpha);
      } else {
        swMesh.visible = false;
      }
    });

    // Wireless RF stream particles Sniffer -> Gateway
    const linkSpeed = leds.blink ? 1.35 : 0.42;
    this.rfLinkLine.visible = this.mrVisionEnabled;
    this.snifferBeamParticles.forEach((orb) => {
      orb.mesh.visible = this.mrVisionEnabled;
      orb.t = (orb.t + dt * linkSpeed) % 1;
      const pos = this.rfLinkCurve.getPoint(orb.t);
      orb.mesh.position.copy(pos);
      orb.mesh.material.color.setHex(leds.yellow ? 0xfbbf24 : 0x38bdf8);
    });

    // 5. Update Hardware OLED + People
    this._updateHardwareCanvases();
    this._syncPeopleAndHolograms();

    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
