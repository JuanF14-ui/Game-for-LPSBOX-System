// js/cytBuilding.js — Arquitectura 3D Completa del Edificio 454 de Ciencia y Tecnología
// "Luis Carlos Sarmiento Angulo" — Universidad Nacional de Colombia, Sede Bogotá (Arq. Camilo Avellaneda)
// Optimizado a 60 FPS mediante InstancedMesh batching, texturas procedurales en caché y colisiones por alturas.

import * as THREE from '../vendor/three/three.module.min.js';
import { FLOOR_HEIGHT, POLE_WORLD_POS, SNIFFER_WORLD_POS, RUBBLE_POCKETS, ASSEMBLY_POINT } from './simulation.js';

// Acumulador de instancias para agrupar cientos de sillas, mesas, computadores, libros, cortasoles y árboles en pocos draw calls
class InstancedBatcher {
  constructor() {
    this.buckets = new Map();
    this._dummy = new THREE.Object3D();
  }

  add(key, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, castShadow = false, receiveShadow = true) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { geometry, material, matrices: [], castShadow, receiveShadow };
      this.buckets.set(key, bucket);
    }
    this._dummy.position.set(x, y, z);
    this._dummy.rotation.set(rx, ry, rz);
    this._dummy.scale.set(sx, sy, sz);
    this._dummy.updateMatrix();
    bucket.matrices.push(this._dummy.matrix.clone());
  }

  buildInto(parentGroup) {
    const meshes = [];
    for (const [, b] of this.buckets.entries()) {
      if (b.matrices.length === 0) continue;
      const inst = new THREE.InstancedMesh(b.geometry, b.material, b.matrices.length);
      for (let i = 0; i < b.matrices.length; i++) {
        inst.setMatrixAt(i, b.matrices[i]);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = b.castShadow;
      inst.receiveShadow = b.receiveShadow;
      parentGroup.add(inst);
      meshes.push(inst);
    }
    return meshes;
  }
}

function makePlazaConcreteTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#dcdad5';
  ctx.fillRect(0, 0, 512, 512);

  // Grano sutil de concreto arquitectónico claro de la Plazoleta CyT
  for (let i = 0; i < 900; i++) {
    const gx = (i * 73) % 512;
    const gy = (i * 137) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(120,124,130,0.14)';
    ctx.fillRect(gx, gy, 3, 3);
  }

  // Juntas de dilatación oscuras características de la Plazoleta CyT
  ctx.strokeStyle = '#8b9098';
  ctx.lineWidth = 3;
  for (let p = 0; p <= 512; p += 128) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  // Junta negra principal diagonal/transversal
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, 508, 508);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLibraryWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b77b48';
  ctx.fillRect(0, 0, 512, 512);

  const plankCount = 16;
  const pw = 512 / plankCount;
  const tones = ['#c48853', '#b57744', '#a86b3a', '#cc925d', '#bd7f4a'];
  for (let i = 0; i < plankCount; i++) {
    ctx.fillStyle = tones[i % tones.length];
    ctx.fillRect(i * pw, 0, pw - 2, 512);
    ctx.fillStyle = 'rgba(62, 34, 14, 0.35)';
    ctx.fillRect((i + 1) * pw - 2, 0, 2, 512);
    // Juntas horizontales alternadas de listón de madera
    const jointY = ((i * 157) % 380) + 60;
    ctx.fillRect(i * pw, jointY, pw, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 7);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBookSpinesTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8edf0'; ctx.fillRect(0, 0, 512, 128);
  const colors = ['#344c5e', '#664e43', '#285270', '#7e302d', '#c09a58', '#81929c', '#1b3540'];
  let x = 0, i = 0;
  while (x < 512) {
    const width = 7 + (i * 7 % 9);
    const height = 74 + (i * 17 % 46);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, 125 - height, width - 1, height);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x + 1, 105, width - 3, 3);
    x += width; i++;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBoardConcreteTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cbd0d6';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(100, 110, 122, 0.25)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSlideTexture(title, subtitle, bullets, accent = '#38bdf8') {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 640, 360);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 624, 344);

  ctx.fillStyle = accent;
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(title, 34, 56);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(subtitle, 34, 90);

  ctx.strokeStyle = 'rgba(148,163,184,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(34, 108);
  ctx.lineTo(606, 108);
  ctx.stroke();

  ctx.fillStyle = '#f1f5f9';
  ctx.font = '20px monospace';
  bullets.forEach((b, idx) => {
    ctx.fillText(b, 42, 152 + idx * 42);
  });

  // Pequeña curva modal decorativa
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= 220; x += 6) {
    const y = 290 - Math.sin(x * 0.08) * Math.exp(-x / 180) * 44;
    if (x === 0) ctx.moveTo(380 + x, y);
    else ctx.lineTo(380 + x, y);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(bg, fg, line1, line2 = '', accent = '#10b981') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 192);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 18, 192);
  ctx.fillStyle = fg;
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillText(line1, 36, line2 ? 84 : 110);
  if (line2) {
    ctx.font = '26px system-ui, sans-serif';
    ctx.globalAlpha = 0.88;
    ctx.fillText(line2, 36, 136);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCytCampusAndBuilding({
  scene,
  buildingGroup,
  wallBoxes,
  walkableTeleportMeshes,
  supportSlabs,
  supportRamps,
  dynamicProps
}) {
  const batcher = new InstancedBatcher();

  // Materiales arquitectónicos compartidos (fieles al Edificio 454 CyT de Camilo Avellaneda)
  const plazaTex = makePlazaConcreteTexture();
  const woodTex = makeLibraryWoodTexture();
  const concreteTex = makeBoardConcreteTexture();

  const mats = {
    equitoneWhite: new THREE.MeshStandardMaterial({ color: 0xf6f7f9, roughness: 0.42, metalness: 0.06 }),
     crispWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.36, metalness: 0.08 }),
    fairConcrete: new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.78, metalness: 0.05 }),
    slabGrey: new THREE.MeshStandardMaterial({ color: 0xe9e8e3, roughness: 0.68, metalness: 0.05 }),
    classroomFloor: new THREE.MeshStandardMaterial({ color: 0xe0dfda, roughness: 0.52, metalness: 0.08 }),
    itFloor: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.44, metalness: 0.12 }),
    bathroomTile: new THREE.MeshStandardMaterial({ color: 0xe9eceb, roughness: 0.28, metalness: 0.1 }),
    woodFloor: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.45, metalness: 0.06 }),
    auditoriumWood: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.55, metalness: 0.06 }),
    bookSpines: new THREE.MeshStandardMaterial({ map: makeBookSpinesTexture(), roughness: 0.8 }),
    auditoriumCarpet: new THREE.MeshStandardMaterial({ color: 0x262b36, roughness: 0.88, metalness: 0.02 }),
    cytYellow: new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.38, metalness: 0.12 }),
    unalGreen: new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.52, metalness: 0.08 }),
    steelRail: new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.28, metalness: 0.62 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.38, metalness: 0.68 }),
    glassFacade: new THREE.MeshPhysicalMaterial({
      color: 0xc2c9c8,
      transparent: true,
      opacity: 0.24,
      roughness: 0.08,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false
    }),
    skylightPoly: new THREE.MeshPhysicalMaterial({
      color: 0xf0f9ff,
      transparent: true,
      opacity: 0.52,
      roughness: 0.22,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false
    }),
    deskWhite: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.42, metalness: 0.1 }),
    chairCharcoal: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.2 }),
    auditoriumSeat: new THREE.MeshStandardMaterial({ color: 0xb61e32, roughness: 0.65, metalness: 0.08 }),
    cafeRed: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.38, metalness: 0.14 }),
    screenGlow: new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      roughness: 0.25
    }),
    ledStrip: new THREE.MeshBasicMaterial({ color: 0xf8fafc }),
    rubbleConcrete: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9, metalness: 0.05 }),
    rebarRust: new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.6, metalness: 0.7 })
  };

  // Geometrías reutilizables para InstancedMesh (60 FPS)
  const geos = {
    unitBox: new THREE.BoxGeometry(1, 1, 1),
    cylPost: new THREE.CylinderGeometry(0.04, 0.04, 1, 8),
    treeTrunk: new THREE.CylinderGeometry(0.22, 0.34, 4.2, 8),
    treeCrown: new THREE.DodecahedronGeometry(2.35, 1)
  };

  const addWallCollider = (cx, cy, cz, sx, sy, sz) => {
    wallBoxes.push({
      xMin: cx - sx * 0.5,
      xMax: cx + sx * 0.5,
      yMin: cy - sy * 0.5,
      yMax: cy + sy * 0.5,
      zMin: cz - sz * 0.5,
      zMax: cz + sz * 0.5
    });
  };

  // Barandas blancas de perfiles finos, con colisión continua independiente del dibujo.
  const addRail = (cx, baseY, cz, length, axis) => {
    const alongX = axis === 'x';
    addWallCollider(cx, baseY + 0.52, cz, alongX ? length : 0.09, 1.04, alongX ? 0.09 : length);
    for (let h = 0.18; h <= 1.02; h += 0.21) {
      batcher.add('rail_horizontal', geos.unitBox, mats.steelRail, cx, baseY + h, cz,
        0, 0, 0, alongX ? length : 0.045, 0.035, alongX ? 0.045 : length);
    }
    const n = Math.max(1, Math.ceil(length / 1.3));
    for (let i = 0; i <= n; i++) {
      const offset = (i / n - 0.5) * length;
      batcher.add('rail_post', geos.unitBox, mats.steelRail,
        cx + (alongX ? offset : 0), baseY + 0.52, cz + (alongX ? 0 : offset),
        0, 0, 0, 0.055, 1.04, 0.055);
    }
  };

  const addSolidWall = (parent, cx, cy, cz, sx, sy, sz, mat = mats.equitoneWhite, castShadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(cx, cy, cz);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    parent.add(m);
    addWallCollider(cx, cy, cz, sx, sy, sz);
    return m;
  };

  const registerSlab = (mesh, xMin, xMax, zMin, zMax, topY) => {
    walkableTeleportMeshes.push(mesh);
    supportSlabs.push({ xMin, xMax, zMin, zMax, topY });
  };

  // ============================================================================
  // 1. ENTORNO EXTERIOR: CIUDAD UNIVERSITARIA UNAL & PLAZOLETA CyT
  // ============================================================================
  const campusGroup = new THREE.Group();
  scene.add(campusGroup);

  // Prado verde sabanero de la Ciudad Universitaria (con hueco para el Auditorio Subterráneo!)
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f6a34, roughness: 0.94 });
  const grassNorth = new THREE.Mesh(new THREE.PlaneGeometry(130, 52), grassMat);
  grassNorth.rotation.x = -Math.PI / 2;
  grassNorth.position.set(0, -0.02, -38);
  grassNorth.receiveShadow = true;
  campusGroup.add(grassNorth);

  const grassSouth = new THREE.Mesh(new THREE.PlaneGeometry(130, 55), grassMat);
  grassSouth.rotation.x = -Math.PI / 2;
  grassSouth.position.set(0, -0.02, 38);
  grassSouth.receiveShadow = true;
  campusGroup.add(grassSouth);

  const grassWest = new THREE.Mesh(new THREE.PlaneGeometry(46, 52), grassMat);
  grassWest.rotation.x = -Math.PI / 2;
  grassWest.position.set(-45, -0.02, -6);
  grassWest.receiveShadow = true;
  campusGroup.add(grassWest);

  const grassEast = new THREE.Mesh(new THREE.PlaneGeometry(46, 52), grassMat);
  grassEast.rotation.x = -Math.PI / 2;
  grassEast.position.set(42, -0.02, -6);
  grassEast.receiveShadow = true;
  campusGroup.add(grassEast);

  walkableTeleportMeshes.push(grassNorth, grassSouth, grassWest, grassEast);

  // Gran Plazoleta de Concreto del CyT (dejando el vano de la escalera al Auditorio Subterráneo en x:-5.5..-1.7, z:-2.0..+3.5)
  const plazaMat = new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.82, metalness: 0.04 });

  // Plazoleta principal oriente y sur
  const plazaMain = new THREE.Mesh(new THREE.BoxGeometry(23.5, 0.16, 26.0), plazaMat);
  plazaMain.position.set(10.25, 0.0, 10.5);
  plazaMain.receiveShadow = true;
  campusGroup.add(plazaMain);
  registerSlab(plazaMain, -1.5, 22.0, -2.5, 23.5, 0.08);

  const plazaSouthWest = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.16, 19.8), plazaMat);
  plazaSouthWest.position.set(-6.75, 0.0, 13.6);
  plazaSouthWest.receiveShadow = true;
  campusGroup.add(plazaSouthWest);
  registerSlab(plazaSouthWest, -12.0, -1.5, 3.7, 23.5, 0.08);

  const plazaWestStrip = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.16, 6.2), plazaMat);
  plazaWestStrip.position.set(-8.8, 0.0, 0.6);
  plazaWestStrip.receiveShadow = true;
  campusGroup.add(plazaWestStrip);
  registerSlab(plazaWestStrip, -12.0, -5.6, -2.5, 3.7, 0.08);

  // Vía de servicio frente a la plazoleta, usada por los vehículos de emergencia.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x596168, roughness: 0.94 });
  const serviceRoad = new THREE.Mesh(new THREE.BoxGeometry(82, 0.10, 7.5), roadMat);
  serviceRoad.position.set(-4, 0.03, 27.2);
  serviceRoad.receiveShadow = true;
  campusGroup.add(serviceRoad);
  registerSlab(serviceRoad, -45, 37, 23.45, 30.95, 0.08);
  for (let x = -40; x <= 32; x += 6) {
    batcher.add('road_center_marks', geos.unitBox, mats.crispWhite, x, 0.09, 27.2,
      0, 0, 0, 3, 0.012, 0.1);
  }

  // Recuadros geométricos con borde de ladrillo bogotano en el frente sur de la Plazoleta (idéntico a Foto #3!)
  const brickBorderMat = new THREE.MeshStandardMaterial({ color: 0xb4533c, roughness: 0.85 });
  for (let bx = -8; bx <= 12; bx += 5) {
    batcher.add('brick_strip_x', geos.unitBox, brickBorderMat, bx, 0.085, 19.2, 0, 0, 0, 4.6, 0.02, 0.22, false, true);
    batcher.add('brick_strip_x', geos.unitBox, brickBorderMat, bx, 0.085, 22.4, 0, 0, 0, 4.6, 0.02, 0.22, false, true);
    batcher.add('brick_strip_z', geos.unitBox, brickBorderMat, bx - 2.3, 0.085, 20.8, 0, 0, 0, 0.22, 0.02, 3.3, false, true);
  }

  // Talud verde suave y seto vivo en el costado oriental de la Plazoleta (Foto #3 y #4)
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 });
  const eastHedge = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.95, 16.0), hedgeMat);
  eastHedge.position.set(15.2, 0.52, 11.5);
  eastHedge.castShadow = true;
  eastHedge.receiveShadow = true;
  campusGroup.add(eastHedge);
  addWallCollider(15.2, 0.52, 11.5, 1.3, 0.95, 16.0);

  // Tótem Verde Oficial UNAL: "454 · CIENCIA Y TECNOLOGÍA · Luis Carlos Sarmiento Angulo"
  const totemTex = makeSignTexture('#14532d', '#f8fafc', 'EDIFICIO 454 · CyT', 'Ciencia y Tecnología · UNAL', '#eab308');
  const totem = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.55, 0.22), mats.unalGreen);
  totem.position.set(13.2, 1.35, 5.2);
  totem.castShadow = true;
  campusGroup.add(totem);
  const totemFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.18, 0.58),
    new THREE.MeshBasicMaterial({ map: totemTex })
  );
  totemFace.position.set(13.2, 1.95, 5.32);
  campusGroup.add(totemFace);
  addWallCollider(13.2, 1.35, 5.2, 1.25, 2.55, 0.28);

  // Ciclo-parqueaderos en U invertida (Foto #2) + Postes secundarios de iluminación con reflectores en "V" (Foto #3!)
  const secondaryPoleSpots = [
    { x: 11.8, z: 3.5 },
    { x: 11.8, z: 8.5 },
    { x: 11.8, z: 13.5 },
    { x: 11.8, z: 18.5 }
  ];
  secondaryPoleSpots.forEach((sp) => {
    batcher.add('cyt_lamp_shaft', geos.cylPost, mats.steelRail, sp.x, 2.9, sp.z, 0, 0, 0, 1.6, 5.8, 1.6, true, false);
    // Alas reflectoras inclinadas en "V" características de los postes de la Plazoleta CyT!
    batcher.add('cyt_lamp_wing', geos.unitBox, mats.crispWhite, sp.x - 0.34, 5.88, sp.z, 0, 0, 0.46, 0.72, 0.04, 0.38, false, false);
    batcher.add('cyt_lamp_wing', geos.unitBox, mats.crispWhite, sp.x + 0.34, 5.88, sp.z, 0, 0, -0.46, 0.72, 0.04, 0.38, false, false);
  });

  // Ciclo-parqueaderos junto al sendero norte/occidental
  for (let i = 0; i < 6; i++) {
    const bx = -16.0 - i * 1.1;
    batcher.add('bike_rack', geos.unitBox, mats.darkMetal, bx, 0.48, 13.4, 0, 0, 0, 0.08, 0.8, 0.75, true, false);
  }

  // Punto de Encuentro UNAL en Plazoleta CyT
  const assemblyRing = new THREE.Mesh(
    new THREE.RingGeometry(ASSEMBLY_POINT.radius - 0.25, ASSEMBLY_POINT.radius, 36),
    new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
  );
  assemblyRing.rotation.x = -Math.PI / 2;
  assemblyRing.position.set(ASSEMBLY_POINT.x, 0.1, ASSEMBLY_POINT.z);
  campusGroup.add(assemblyRing);

  const assemblySign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.9),
    new THREE.MeshBasicMaterial({
      map: makeSignTexture('#064e3b', '#ecfdf5', 'PUNTO DE ENCUENTRO', 'Plazoleta CyT · Evacuación UNAL', '#34d399'),
      side: THREE.DoubleSide
    })
  );
  assemblySign.position.set(ASSEMBLY_POINT.x, 2.1, ASSEMBLY_POINT.z + ASSEMBLY_POINT.radius + 0.2);
  assemblySign.rotation.y = Math.PI;
  campusGroup.add(assemblySign);
  batcher.add('sign_post', geos.cylPost, mats.steelRail, ASSEMBLY_POINT.x, 1.05, ASSEMBLY_POINT.z + ASSEMBLY_POINT.radius + 0.2, 0, 0, 0, 1.4, 2.1, 1.4);

  // Arboleda del Campus UNAL (Eucaliptos sabaneros altos alrededor del edificio — Foto #1)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4738, roughness: 0.92 });
  const foliageMat1 = new THREE.MeshStandardMaterial({ color: 0x2d5a32, roughness: 0.86 });
  const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x3b6e3f, roughness: 0.86 });
  const treeCoords = [
    [-28, -16], [-29, -8], [-28, 0], [-29, 8], [-27, 16], [-24, 22],
    [-16, -18], [-6, -19], [4, -18], [14, -19], [23, -15], [25, -5],
    [24, 6], [23, 16], [18, 25], [-18, 25]
  ];
  treeCoords.forEach(([tx, tz], idx) => {
    const hScale = 1.0 + (idx % 3) * 0.28;
    batcher.add('tree_trunk', geos.treeTrunk, trunkMat, tx, 2.1 * hScale, tz, 0, idx * 0.7, 0, 1, hScale, 1, true, true);
    batcher.add(
      idx % 2 === 0 ? 'tree_crown_1' : 'tree_crown_2',
      geos.treeCrown,
      idx % 2 === 0 ? foliageMat1 : foliageMat2,
      tx,
      4.9 * hScale,
      tz,
      0,
      idx * 1.1,
      0,
      1.1,
      1.35 * hScale,
      1.1,
      true,
      true
    );
  });

  // ============================================================================
  // 2. GRAN AUDITORIO SUBTERRÁNEO (-1, y = -3.40 m) CERCA A LA ENTRADA PRINCIPAL
  // ============================================================================
  const audGroup = new THREE.Group();
  buildingGroup.add(audGroup);

  // Losa base del auditorio subterráneo
  const audFloor = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.28, 11.4), mats.auditoriumCarpet);
  audFloor.position.set(-3.6, -3.54, 3.5);
  audFloor.receiveShadow = true;
  audGroup.add(audFloor);
  registerSlab(audFloor, -10.3, 3.1, -2.1, 9.1, -3.4);

  // Muros perimetrales de concreto y revestimiento acústico de madera cálida
  addSolidWall(audGroup, -10.3, -1.65, 3.5, 0.32, 3.6, 11.4, mats.equitoneWhite);
  addSolidWall(audGroup, 3.1, -1.65, 3.5, 0.32, 3.6, 11.4, mats.equitoneWhite);
  addSolidWall(audGroup, -3.6, -1.65, 9.1, 13.6, 3.6, 0.32, mats.fairConcrete);
  addSolidWall(audGroup, -7.9, -1.65, -2.1, 4.8, 3.6, 0.32, mats.fairConcrete);
  addSolidWall(audGroup, 0.7, -1.65, -2.1, 4.8, 3.6, 0.32, mats.fairConcrete);

  // Techo del auditorio bajo la plazoleta (dejando abierto el pozo de la gran escalera de acceso x: -5.5 .. -1.7, z: -2.1 .. +3.5)
  const audCeilingBack = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.24, 5.6), mats.fairConcrete);
  audCeilingBack.position.set(-3.6, -0.06, 6.3);
  audGroup.add(audCeilingBack);

  // Escalera ancha de descenso desde la Entrada Principal (z = -1.8, y = +0.12 m -> z = +3.2, y = -3.40 m)
  const audSteps = 14;
  for (let s = 0; s < audSteps; s++) {
    const t = (s + 0.5) / audSteps;
    const stepY = 0.12 - t * 3.52;
    const stepZ = -1.8 + t * 5.0;
    const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.26, 0.42), mats.slabGrey);
    stepMesh.position.set(-3.6, stepY - 0.13, stepZ);
    stepMesh.receiveShadow = true;
    audGroup.add(stepMesh);
    if (s % 2 === 0) walkableTeleportMeshes.push(stepMesh);
  }
  supportRamps.push({
    xMin: -5.45,
    xMax: -1.75,
    zMin: -2.0,
    zMax: 3.4,
    yAt: (_x, z) => {
      const u = Math.max(0, Math.min(1, (z - (-1.8)) / 5.0));
      return 0.12 - u * 3.52;
    }
  });

  // Barandas de vidrio y acero alrededor del pozo de acceso al Auditorio Subterráneo en la Plazoleta
  addSolidWall(audGroup, -5.5, 0.58, 0.8, 0.1, 0.96, 5.6, mats.glassFacade, false);
  addSolidWall(audGroup, -1.7, 0.58, 0.8, 0.1, 0.96, 5.6, mats.glassFacade, false);
  const audEntranceSign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.65),
    new THREE.MeshBasicMaterial({
      map: makeSignTexture('#0f172a', '#f8fafc', 'AUDITORIO PRINCIPAL CyT', 'Nivel Subterráneo (-1) · Cap. 247', '#f43f5e'),
      side: THREE.DoubleSide
    })
  );
  audEntranceSign.position.set(-3.6, 2.35, -1.85);
  audGroup.add(audEntranceSign);

  // Tarima del escenario (al fondo sur del auditorio z = 7.6), atril UNAL y gran pantalla de proyección
  const audStage = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.42, 2.2), mats.woodFloor);
  audStage.position.set(-3.6, -3.19, 7.6);
  audStage.receiveShadow = true;
  audGroup.add(audStage);
  registerSlab(audStage, -8.4, 1.2, 6.5, 8.7, -2.98);

  const audScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 2.5),
    new THREE.MeshBasicMaterial({
      map: makeSlideTexture(
        'FACULTAD DE INGENIERÍA · UNAL BOGOTÁ',
        'Auditorio Edificio 454 Ciencia y Tecnología — Dinámica Estructural',
        ['• Monitoreo Sísmico STA/LTA en Raspberry Pi 5', '• Localización Pasiva Wi-Fi/BLE Pre-Sismo (t₀)', '• Resiliencia de Enlace hacia Gateway Exterior'],
        '#f43f5e'
      )
    })
  );
  audScreen.position.set(-3.6, -1.55, 8.88);
  audScreen.rotation.y = Math.PI;
  audGroup.add(audScreen);

  // Atril del conferencista
  addSolidWall(audGroup, -1.2, -2.45, 7.1, 0.62, 1.08, 0.48, mats.auditoriumWood);

  // Listones acústicos claros en el cielorraso y paneles de madera del fondo.
  for (let x = -9; x <= 2; x += 1.4) {
    batcher.add('aud_ceiling_wood', geos.unitBox, mats.auditoriumWood, x, -0.22, 6.0,
      0, 0, 0, 0.12, 0.06, 4.8);
  }

  // Gradería escalonada de butacas vinotinto del Auditorio (5 filas x 12 sillas instanciadas = 60 butacas en 2 draw calls!)
  for (let r = 0; r < 5; r++) {
    const rowZ = 3.6 + r * 0.72;
    const tierY = -3.35 + (4 - r) * 0.14;
    batcher.add('aud_riser', geos.unitBox, mats.auditoriumCarpet, -3.6, tierY - 0.08, rowZ, 0, 0, 0, 10.6, 0.16, 0.68, false, true);
    for (let c = -5; c <= 5; c++) {
      if (c === 0) continue; // Pasillo central del auditorio
      const sx = -3.6 + c * 0.86;
      batcher.add('aud_seat_base', geos.unitBox, mats.auditoriumSeat, sx, tierY + 0.22, rowZ, 0, 0, 0, 0.56, 0.14, 0.48, false, true);
      batcher.add('aud_seat_back', geos.unitBox, mats.auditoriumSeat, sx, tierY + 0.52, rowZ - 0.2, -0.12, 0, 0, 0.56, 0.54, 0.1, false, true);
      batcher.add('aud_chair_leg', geos.unitBox, mats.darkMetal, sx, tierY + 0.12, rowZ, 0, 0, 0, 0.09, 0.24, 0.35);
      batcher.add('aud_armrest', geos.unitBox, mats.auditoriumWood, sx + 0.31, tierY + 0.35, rowZ, 0, 0, 0, 0.07, 0.07, 0.5);
    }
  }

  // ============================================================================
  // 3. ESTRUCTURA EN "L" DEL EDIFICIO 454 CyT (ALA OCCIDENTAL + ALA NORTE)
  // ============================================================================
  // --- 3A. ALA OCCIDENTAL (BIBLIOTECA DE CIENCIA Y TECNOLOGÍA: x = -22.5 .. -12.5, z = -11.5 .. +11.5) ---
  for (let fl = 0; fl < 5; fl++) {
    const yTop = 0.12 + fl * FLOOR_HEIGHT;
    const isLibraryWood = fl >= 1 && fl <= 3; // Pisos 2, 3 y 4 son los niveles de Biblioteca con piso de madera cálida (Fotos #1 y #5!)
    const floorMat = fl === 4 ? mats.slabGrey : isLibraryWood ? mats.woodFloor : mats.classroomFloor;

    if (fl === 2 || fl === 3) {
      // Pisos 3 y 4 de la Biblioteca tienen el ICÓNICO VACÍO CENTRAL (Atrium Void x: -19.0 .. -15.6, z: -4.2 .. +4.8, Foto #1!)
      const westStrip = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.24, 23.0), floorMat);
      westStrip.position.set(-20.75, yTop - 0.12, 0);
      westStrip.receiveShadow = true;
      buildingGroup.add(westStrip);
      registerSlab(westStrip, -22.5, -19.0, -11.5, 11.5, yTop);

      const eastStrip = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.24, 23.0), floorMat);
      eastStrip.position.set(-14.05, yTop - 0.12, 0);
      eastStrip.receiveShadow = true;
      buildingGroup.add(eastStrip);
      registerSlab(eastStrip, -15.6, -12.5, -11.5, 11.5, yTop);

      const northBridge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.24, 7.3), floorMat);
      northBridge.position.set(-17.3, yTop - 0.12, -7.85);
      northBridge.receiveShadow = true;
      buildingGroup.add(northBridge);
      registerSlab(northBridge, -19.0, -15.6, -11.5, -4.2, yTop);

      const southBridge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.24, 6.7), floorMat);
      southBridge.position.set(-17.3, yTop - 0.12, 8.15);
      southBridge.receiveShadow = true;
      buildingGroup.add(southBridge);
      registerSlab(southBridge, -19.0, -15.6, 4.8, 11.5, yTop);

      // Barandas blancas alrededor del vacío central de la Biblioteca (Foto #1!)
      addRail(-19.0, yTop, 0.3, 9.0, 'z');
      addRail(-15.6, yTop, 0.3, 9.0, 'z');
      addRail(-17.3, yTop, -4.2, 3.4, 'x');
      addRail(-17.3, yTop, 4.8, 3.4, 'x');
    } else {
      // Piso 1, Piso 2 (base de la Biblioteca) y Piso 5 (Gran Terraza Abierta SIN TECHO sobre el Ala Occidental!)
      const slabW = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.24, 23.0), floorMat);
      slabW.position.set(-17.5, yTop - 0.12, 0);
      slabW.receiveShadow = true;
      buildingGroup.add(slabW);
      registerSlab(slabW, -22.5, -12.5, -11.5, 11.5, yTop);
    }
  }

  // Gran Muro Pórtico Blanco Sur y Occidental del Bloque de Biblioteca + Ventanales con Cortasoles Horizontales Blancos (Foto #1 y #2)
  // Pórticos blancos en los extremos, con fachada acristalada y divisiones verticales.
  // Las ventanas del extremo dejan ver la biblioteca, en lugar de una pared ciega de corte.
  for (const x of [-22.25, -12.75]) {
    addSolidWall(buildingGroup, x, 6.9, 11.45, 0.5, 13.8, 0.32, mats.crispWhite);
  }
  for (let fl = 0; fl < 4; fl++) {
    const y = 0.12 + fl * FLOOR_HEIGHT;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 3.05), mats.glassFacade);
    glass.position.set(-17.5, y + 1.57, 11.45);
    buildingGroup.add(glass);
    addWallCollider(-17.5, y + 1.57, 11.45, 9.0, 3.05, 0.18);
    batcher.add('library_end_fascia', geos.unitBox, mats.crispWhite,
      -17.5, y + 3.2, 11.51, 0, 0, 0, 9.5, 0.28, 0.28, true, true);
    for (let x = -21.8; x < -13.2; x += 1.4) {
      batcher.add('library_end_frame', geos.unitBox, mats.crispWhite,
        x, y + 1.55, 11.49, 0, 0, 0, 0.07, 3.08, 0.09);
    }
  }
  addSolidWall(buildingGroup, -17.5, 6.9, -11.45, 10.2, 13.8, 0.32, mats.crispWhite);

  // Fachada occidental acristalada con los icónicos cortasoles horizontales blancos (Foto #1!)
  const westGlass = new THREE.Mesh(new THREE.PlaneGeometry(22.4, 13.2), mats.glassFacade);
  westGlass.rotation.y = Math.PI / 2;
  westGlass.position.set(-22.45, 6.8, 0);
  buildingGroup.add(westGlass);
  addWallCollider(-22.48, 6.8, 0, 0.18, 13.4, 22.6);

  for (let fl = 1; fl <= 3; fl++) {
    const baseY = 0.12 + fl * FLOOR_HEIGHT;
    for (let lv = 0; lv < 4; lv++) {
      batcher.add(
        'brise_soleil_west',
        geos.unitBox,
        mats.crispWhite,
        -22.68,
        baseY + 0.95 + lv * 0.58,
        0,
        0,
        0,
        0,
        0.32,
        0.07,
        22.2,
        true,
        false
      );
    }
  }

  // Muro cortina de la biblioteca detrás de las rampas; pasajes abiertos en ambos extremos.
  for (let fl = 0; fl <= 3; fl++) {
    const yBase = 0.12 + fl * FLOOR_HEIGHT;
    const facade = new THREE.Mesh(new THREE.PlaneGeometry(17, 3.05), mats.glassFacade);
    facade.rotation.y = Math.PI / 2;
    facade.position.set(-12.46, yBase + 1.55, 0);
    buildingGroup.add(facade);
    addWallCollider(-12.46, yBase + 1.55, 0, 0.12, 3.05, 17);
    for (let z = -8.4; z <= 8.4; z += 1.4) {
      batcher.add('library_curtain_mullion', geos.unitBox, mats.crispWhite,
        -12.42, yBase + 1.55, z, 0, 0, 0, 0.07, 3.05, 0.07);
    }
    batcher.add('library_curtain_crossbar', geos.unitBox, mats.steelRail,
      -12.42, yBase + 1.15, 0, 0, 0, 0, 0.08, 0.06, 17);
  }

  // Barandas perimetrales de la Gran Terraza Abierta (SIN TECHO) en el Piso 5 del Ala Occidental (y = 13.72 m)
  addRail(-22.4, 13.72, 0, 22.8, 'z');
  addRail(-17.5, 13.72, 11.4, 10.0, 'x');
  addRail(-17.5, 13.72, -11.4, 10.0, 'x');
  addRail(-12.55, 13.72, 4.4, 14.0, 'z');

  // ============================================================================
  // 4. LAS ICÓNICAS RAMPAS PEATONALES EXTERIORES EN ZIG-ZAG DEL CyT (Fotos #2, #3 y #4!)
  // ============================================================================
  // Conectan Piso 1 (0.12m) -> Piso 2 (3.52m) -> Piso 3 (6.92m) -> Piso 4 (10.32m) sobre la fachada interior de la Biblioteca
  const rampDefs = [
    { zStart: 8.8, zEnd: -8.2, yStart: 0.12, yEnd: 3.52, xCenter: -11.15 },
    { zStart: -8.2, zEnd: 8.8, yStart: 3.52, yEnd: 6.92, xCenter: -11.15 },
    { zStart: 8.8, zEnd: -8.2, yStart: 6.92, yEnd: 10.32, xCenter: -11.15 }
  ];

  rampDefs.forEach((rd, idx) => {
    const dz = rd.zEnd - rd.zStart;
    const dy = rd.yEnd - rd.yStart;
    const len = Math.hypot(dz, dy);
    const pitch = Math.atan2(dy, Math.abs(dz)) * (dz > 0 ? -1 : 1);

    const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.2, len), mats.crispWhite);
    rampMesh.position.set(rd.xCenter, (rd.yStart + rd.yEnd) * 0.5 - 0.1, (rd.zStart + rd.zEnd) * 0.5);
    rampMesh.rotation.x = pitch;
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    buildingGroup.add(rampMesh);
    walkableTeleportMeshes.push(rampMesh);

    // Barandas metálicas blancas a ambos lados de cada rampa (Foto #2!)
    for (let h = 0.18; h <= 1.02; h += 0.21) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, len), mats.steelRail);
      rail.position.set(rd.xCenter + 1.02, (rd.yStart + rd.yEnd) * 0.5 + h, (rd.zStart + rd.zEnd) * 0.5);
      rail.rotation.x = pitch;
      buildingGroup.add(rail);
    }
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      batcher.add('ramp_rail_posts', geos.unitBox, mats.steelRail, rd.xCenter + 1.02,
        rd.yStart + t * dy + 0.52, rd.zStart + t * dz, 0, 0, 0, 0.05, 1.04, 0.05);
    }

    // Descansos horizontales que conectan la rampa con la puerta de cada piso de la Biblioteca y el Corredor Norte
    const landingZ = dz < 0 ? -9.8 : 10.1;
    const landing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 3.2), mats.crispWhite);
    landing.position.set(-11.2, rd.yEnd - 0.11, landingZ);
    landing.receiveShadow = true;
    buildingGroup.add(landing);
    registerSlab(landing, -12.6, -9.8, landingZ - 1.6, landingZ + 1.6, rd.yEnd);

    // Soporte físico continuo para caminar/rodar por la rampa en modo Operario, Táctil y VR!
    const zMin = Math.min(rd.zStart, rd.zEnd);
    const zMax = Math.max(rd.zStart, rd.zEnd);
    supportRamps.push({
      xMin: rd.xCenter - 1.15,
      xMax: rd.xCenter + 1.15,
      zMin,
      zMax,
      minRefY: rd.yStart - 0.8,
      maxRefY: rd.yEnd + 1.2,
      yAt: (_x, z) => {
        const u = Math.max(0, Math.min(1, (z - rd.zStart) / (rd.zEnd - rd.zStart)));
        return rd.yStart + u * (rd.yEnd - rd.yStart);
      }
    });

    // Columnas esbeltas blancas que sostienen las rampas exteriores
    if (idx === 0) {
      [-6.5, 0.0, 6.5].forEach((cz) => {
        batcher.add('ramp_col', geos.cylPost, mats.crispWhite, -10.15, 5.4, cz, 0, 0, 0, 3.2, 10.8, 3.2, true, true);
      });
    }
  });

  // ============================================================================
  // 5. ALA NORTE PRINCIPAL (PILOTIS P1, SALONES, SALAS TI, BAÑOS Y CAFETERÍA CUBIERTA EN P5)
  // ============================================================================
  // Dimensiones Ala Norte: x = -12.5 .. +17.5 (30 m de largo), z = -11.5 .. -2.5 (9 m de fondo)
  for (let fl = 0; fl < 5; fl++) {
    const yTop = 0.12 + fl * FLOOR_HEIGHT;
    const mat = fl === 0 ? mats.slabGrey : fl === 4 ? mats.classroomFloor : mats.classroomFloor;
    const northSlab = new THREE.Mesh(new THREE.BoxGeometry(30.0, 0.24, 9.0), mat);
    northSlab.position.set(2.5, yTop - 0.12, -7.0);
    northSlab.receiveShadow = true;
    buildingGroup.add(northSlab);
    registerSlab(northSlab, -12.5, 17.5, -11.5, -2.5, yTop);

    // Corredor exterior abierto hacia la Plazoleta en Pisos 2, 3 y 4 con baranda blanca (Fotos #2 y #3!)
    if (fl >= 1 && fl <= 3) {
      // Bandas blancas de borde, el rasgo horizontal continuo de la fachada hacia la plaza.
      batcher.add('north_balcony_fascia', geos.unitBox, mats.crispWhite,
        1.0, yTop - 0.04, -2.55, 0, 0, 0, 27.0, 0.52, 0.28, true, true);
      addRail(1.2, yTop + 0.12, -2.58, 27.2, 'x');
      // Tiras LED lineales en el cielo raso de cada piso
      for (let lx = -10; lx <= 12; lx += 5.5) {
        batcher.add('ceiling_led', geos.unitBox, mats.ledStrip, lx, yTop + FLOOR_HEIGHT - 0.16, -7.8, 0, 0, 0, 2.8, 0.04, 0.18, false, false);
        batcher.add('ceiling_led', geos.unitBox, mats.ledStrip, lx, yTop + FLOOR_HEIGHT - 0.16, -3.4, 0, 0, 0, 2.2, 0.04, 0.14, false, false);
      }
    }
  }

  // Columnas estructurales de concreto a la vista ("Pilotis" abiertos en Primer Piso, Foto #2 y #3!)
  for (let cx = -11.5; cx <= 14.5; cx += 6.5) {
    [-11.1, -4.5, -2.8].forEach((cz) => {
      batcher.add('main_piloti', geos.unitBox, mats.fairConcrete, cx, 6.9, cz, 0, 0, 0, 0.42, 13.8, 0.42, true, true);
      addWallCollider(cx, 6.9, cz, 0.42, 13.8, 0.42);
    });
  }

  // Fachada posterior: gran plano blanco casi ciego, ventanas estrechas y extremos acristalados.
  // Las dimensiones son una interpretación visual de las fotografías, no un plano medido.
  for (let fl = 1; fl <= 3; fl++) {
    const yBase = 0.12 + fl * FLOOR_HEIGHT;
    addSolidWall(buildingGroup, 0.7, yBase + 0.72, -11.42, 17.0, 1.44, 0.22, mats.equitoneWhite);
    addSolidWall(buildingGroup, 0.7, yBase + 2.35, -11.42, 17.0, 1.98, 0.22, mats.equitoneWhite);
    // Ranura horizontal oscura en el gran cerramiento blanco.
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.09), mats.darkMetal);
    slot.position.set(fl === 2 ? 2.5 : -3.2, yBase + 1.5, -11.54);
    slot.rotation.y = Math.PI;
    buildingGroup.add(slot);
    for (const [cx, width] of [[-10.2, 4.2], [11.3, 4.2]]) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, 3.1), mats.glassFacade);
      pane.position.set(cx, yBase + 1.55, -11.42);
      buildingGroup.add(pane);
      addWallCollider(cx, yBase + 1.55, -11.42, width, 3.1, 0.18);
      for (let k = -1; k <= 1; k++) {
        batcher.add('north_glass_frame', geos.unitBox, mats.crispWhite,
          cx + k * 1.35, yBase + 1.55, -11.45, 0, 0, 0, 0.06, 3.1, 0.07);
      }
    }
  }

  // Gran Pórtico Oriental Blanco + Escalera Exterior Metálica con Puertas Amarillas CyT (x = 14.8 .. 17.5, Foto #2 y #4!)
  addSolidWall(buildingGroup, 17.42, 8.6, -7.0, 0.34, 17.2, 9.0, mats.crispWhite);

  for (let fl = 0; fl < 4; fl++) {
    const y0 = 0.12 + fl * FLOOR_HEIGHT;
    const yMid = y0 + FLOOR_HEIGHT * 0.5;
    const y1 = y0 + FLOOR_HEIGHT;

    // Puerta amarilla icónica de acceso al núcleo oriental en cada nivel (Foto #4 nocturna!)
    batcher.add('yellow_panel', geos.unitBox, mats.cytYellow, 14.65, y0 + 1.25, -9.8, 0, 0, 0, 0.14, 2.4, 2.2, false, true);

    // Descanso intermedio norte de la escalera oriental
    const midLand = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 2.1), mats.steelRail);
    midLand.position.set(16.05, yMid - 0.09, -10.2);
    buildingGroup.add(midLand);
    registerSlab(midLand, 14.8, 17.3, -11.3, -9.1, yMid);

    // Tramo 1 (sube de sur z=-3.8 a norte z=-9.1 por carril izquierdo x=15.45)
    const fLen = 5.65;
    const fPitch = Math.atan2(FLOOR_HEIGHT * 0.5, 5.3);
    const flight1 = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.16, fLen), mats.steelRail);
    flight1.position.set(15.45, (y0 + yMid) * 0.5 - 0.08, -6.45);
    flight1.rotation.x = fPitch;
    buildingGroup.add(flight1);
    walkableTeleportMeshes.push(flight1);

    supportRamps.push({
      xMin: 14.85,
      xMax: 16.02,
      zMin: -9.15,
      zMax: -3.75,
      minRefY: y0 - 0.6,
      maxRefY: yMid + 0.9,
      yAt: (_x, z) => {
        const u = Math.max(0, Math.min(1, (-3.8 - z) / 5.3));
        return y0 + u * (FLOOR_HEIGHT * 0.5);
      }
    });

    // Tramo 2 (sube de norte z=-9.1 a sur z=-3.8 por carril derecho x=16.65)
    const flight2 = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.16, fLen), mats.steelRail);
    flight2.position.set(16.65, (yMid + y1) * 0.5 - 0.08, -6.45);
    flight2.rotation.x = -fPitch;
    buildingGroup.add(flight2);
    walkableTeleportMeshes.push(flight2);

    supportRamps.push({
      xMin: 16.05,
      xMax: 17.28,
      zMin: -9.15,
      zMax: -3.75,
      minRefY: yMid - 0.6,
      maxRefY: y1 + 0.9,
      yAt: (_x, z) => {
        const u = Math.max(0, Math.min(1, (z - (-9.1)) / 5.3));
        return yMid + u * (FLOOR_HEIGHT * 0.5);
      }
    });
  }

  // ============================================================================
  // 6. DETALLES INTERIORES COMPLETOS: BIBLIOTECA, SALONES, BAÑOS, SALAS TI Y CAFETERÍA P5
  // ============================================================================
  // Helper para mampara frontal con puerta abierta transitable (z = -4.5)
  const addRoomFrontWithDoor = (xLeft, xRight, yBase, labelText, accent = '#38bdf8') => {
    const doorW = 1.45;
    const doorX = xLeft + 1.35;
    const leftSegW = doorX - doorW * 0.5 - xLeft;
    const rightSegW = xRight - (doorX + doorW * 0.5);
    if (leftSegW > 0.15) {
      addSolidWall(buildingGroup, xLeft + leftSegW * 0.5, yBase + 1.55, -4.55, leftSegW, 3.1, 0.14, mats.equitoneWhite, false);
    }
    if (rightSegW > 0.15) {
      // Mitad inferior blanca + ventanal superior hacia el corredor
      addSolidWall(buildingGroup, xRight - rightSegW * 0.5, yBase + 0.55, -4.55, rightSegW, 1.1, 0.14, mats.equitoneWhite, false);
      const glassUp = new THREE.Mesh(new THREE.PlaneGeometry(rightSegW - 0.1, 1.85), mats.glassFacade);
      glassUp.position.set(xRight - rightSegW * 0.5, yBase + 2.02, -4.55);
      buildingGroup.add(glassUp);
      addWallCollider(xRight - rightSegW * 0.5, yBase + 1.9, -4.55, rightSegW, 1.9, 0.16);
      // Marcos blancos modulares de los ventanales y dintel de cada aula.
      const paneCount = Math.max(1, Math.floor(rightSegW / 1.2));
      for (let n = 0; n <= paneCount; n++) {
        const x = xRight - rightSegW + n * rightSegW / paneCount;
        batcher.add('classroom_window_frame', geos.unitBox, mats.crispWhite,
          x, yBase + 2.02, -4.46, 0, 0, 0, 0.065, 1.85, 0.08);
      }
      batcher.add('classroom_window_sill', geos.unitBox, mats.crispWhite,
        xRight - rightSegW * 0.5, yBase + 1.12, -4.46, 0, 0, 0, rightSegW, 0.08, 0.08);
    }
    // Placa señalética del espacio sobre el dintel
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.34),
      new THREE.MeshBasicMaterial({ map: makeSignTexture('#0f172a', '#f8fafc', labelText, '', accent) })
    );
    plaque.position.set(doorX, yBase + 2.68, -4.46);
    buildingGroup.add(plaque);
  };

  // --- 6A. PISO 1: ENTRADA PRINCIPAL, TORNIQUETES, NODO RED TI P1, BAÑOS P1 Y HEMEROTECA ---
  // Torniquetes de acero inoxidable en el acceso principal de la esquina L (x = -11.5 .. -7.5, z = -2.8)
  for (let tx = -11.0; tx <= -8.0; tx += 1.0) {
    batcher.add('turnstile', geos.unitBox, mats.steelRail, tx, 0.62, -2.9, 0, 0, 0, 0.22, 0.96, 0.95, true, true);
  }
  // Cuarto Principal de Telecomunicaciones / TI Piso 1 (x: -10.5 .. -4.8, z: -11.3 .. -5.2)
  addSolidWall(buildingGroup, -10.5, 1.65, -8.2, 0.16, 3.1, 6.0, mats.equitoneWhite);
  addSolidWall(buildingGroup, -4.8, 1.65, -8.2, 0.16, 3.1, 6.0, mats.equitoneWhite);
  addRoomFrontWithDoor(-10.5, -4.8, 0.12, 'NODO RED TI · P1', '#0ea5e9');
  for (let rx = -9.6; rx <= -5.8; rx += 1.25) {
    batcher.add('server_rack', geos.unitBox, mats.darkMetal, rx, 1.18, -9.8, 0, 0, 0, 0.78, 2.05, 0.85, true, true);
    batcher.add('server_led', geos.unitBox, mats.screenGlow, rx, 1.65, -9.36, 0, 0, 0, 0.52, 0.12, 0.04, false, false);
  }

  // Baños Piso 1 junto a recepción (x: -12.4 .. -10.6, z: -11.3 .. -5.2)
  addRoomFrontWithDoor(-12.4, -10.5, 0.12, 'BAÑOS P1', '#14b8a6');

  // Mesas de estudio grupal en Piso 1 Ala Occidental (Hemeroteca)
  for (let mz = -7.5; mz <= 7.5; mz += 3.8) {
    batcher.add('lib_table', geos.unitBox, mats.deskWhite, -17.5, 0.86, mz, 0, 0, 0, 2.6, 0.08, 1.3, true, true);
    batcher.add('lib_chair', geos.unitBox, mats.chairCharcoal, -17.5 - 0.8, 0.56, mz - 0.82, 0, 0, 0, 0.48, 0.52, 0.48);
    batcher.add('lib_chair', geos.unitBox, mats.chairCharcoal, -17.5 + 0.8, 0.56, mz + 0.82, 0, Math.PI, 0, 0.48, 0.52, 0.48);
  }

  // --- 6B. BIBLIOTECA DE CIENCIA Y TECNOLOGÍA (ALA OCCIDENTAL PISOS 2, 3 Y 4 — Fotos #1 y #5!) ---
  for (let fl = 1; fl <= 3; fl++) {
    const yB = 0.12 + fl * FLOOR_HEIGHT;

    if (fl === 1) {
      // Módulo amarillo/blanco de Préstamo Bibliotecario SINAB al fondo de Piso 2 (idéntico al fondo de Foto #1!)
      addSolidWall(buildingGroup, -17.3, yB + 0.58, -9.4, 3.8, 1.12, 0.9, mats.cytYellow);
      // Estanterías amarillas y blancas con libros en la zona norte y sur del Piso 2
      for (let sz = -6.8; sz <= -4.6; sz += 2.1) {
        batcher.add('book_shelf_frame', geos.unitBox, mats.deskWhite, -17.3, yB + 1.05, sz, 0, 0, 0, 4.4, 2.05, 0.52, true, true);
        batcher.add('book_row_yellow', geos.unitBox, mats.bookSpines, -17.3, yB + 1.35, sz, 0, 0, 0, 4.1, 0.34, 0.56, false, false);
        batcher.add('book_row_blue', geos.unitBox, mats.bookSpines, -17.3, yB + 0.82, sz, 0, 0, 0, 4.0, 0.34, 0.56, false, false);
      }
      for (let sz = 5.4; sz <= 9.2; sz += 1.9) {
        batcher.add('book_shelf_frame', geos.unitBox, mats.deskWhite, -17.3, yB + 1.05, sz, 0, 0, 0, 4.6, 2.05, 0.52, true, true);
        batcher.add('book_row_yellow', geos.unitBox, mats.bookSpines, -17.3, yB + 1.35, sz, 0, 0, 0, 4.2, 0.34, 0.56, false, false);
      }
    }

    // Estantes de la biblioteca en las galerías alrededor del vacío (pisos superiores).
    if (fl > 1) {
      for (const z of [-8.6, 8.6]) {
        batcher.add('upper_book_shelf', geos.unitBox, mats.deskWhite, -20.7, yB + 0.9, z,
          0, 0, 0, 2.5, 1.8, 0.55, true, true);
        for (const h of [0.45, 0.95, 1.45]) {
          batcher.add('upper_book_row', geos.unitBox, mats.bookSpines, -20.7, yB + h, z,
            0, 0, 0, 2.3, 0.35, 0.58);
        }
      }
    }

    // Mesas blancas de consulta con computadores a ambos costados de la Biblioteca (idéntico a Fotos #1 y #5!)
    for (let tz = -3.2; tz <= 3.6; tz += 3.4) {
      // Costado occidental junto al ventanal
      batcher.add('lib_pc_desk', geos.unitBox, mats.deskWhite, -20.8, yB + 0.76, tz, 0, 0, 0, 2.2, 0.07, 1.15, true, true);
      batcher.add('pc_monitor', geos.unitBox, mats.darkMetal, -20.8 - 0.5, yB + 1.06, tz, 0, 0, 0, 0.52, 0.36, 0.05);
      batcher.add('pc_screen', geos.unitBox, mats.screenGlow, -20.8 - 0.5, yB + 1.06, tz + 0.03, 0, 0, 0, 0.46, 0.3, 0.02);
      batcher.add('pc_monitor', geos.unitBox, mats.darkMetal, -20.8 + 0.5, yB + 1.06, tz, 0, 0, 0, 0.52, 0.36, 0.05);
      batcher.add('pc_screen', geos.unitBox, mats.screenGlow, -20.8 + 0.5, yB + 1.06, tz + 0.03, 0, 0, 0, 0.46, 0.3, 0.02);
      batcher.add('lib_chair', geos.unitBox, mats.chairCharcoal, -20.8 - 0.5, yB + 0.48, tz + 0.72, 0, 0, 0, 0.46, 0.48, 0.46);
      batcher.add('lib_chair', geos.unitBox, mats.chairCharcoal, -20.8 + 0.5, yB + 0.48, tz + 0.72, 0, 0, 0, 0.46, 0.48, 0.46);

      // Costado oriental de la Biblioteca (en P2 y P3)
      if (fl <= 2) {
        batcher.add('lib_pc_desk', geos.unitBox, mats.deskWhite, -14.1, yB + 0.76, tz, 0, 0, 0, 2.1, 0.07, 1.15, true, true);
        batcher.add('lib_chair', geos.unitBox, mats.chairCharcoal, -14.1, yB + 0.48, tz - 0.72, 0, 0, 0, 0.46, 0.48, 0.46);
      }
    }
  }

  // --- 6C. SALONES DE CLASE, SALAS DE TI / CÓMPUTO Y BATERÍAS DE BAÑOS EN ALA NORTE (PISOS 2, 3 Y 4) ---
  for (let fl = 1; fl <= 3; fl++) {
    const yB = 0.12 + fl * FLOOR_HEIGHT;
    const floorNum = fl + 1; // 2, 3, 4

    // Muros divisorios transversales entre espacios:
    // [x: -12.2 .. -4.4] Espacio 1 | [x: -4.4 .. +3.4] Espacio 2 | [x: +3.4 .. +11.2] Espacio 3 (TI/Sniffer) | [x: +11.2 .. +14.6] Baños
    [-4.4, 3.4, 11.2, 14.6].forEach((wx) => {
      addSolidWall(buildingGroup, wx, yB + 1.55, -8.0, 0.16, 3.1, 6.8, mats.equitoneWhite);
    });

    const isP4ComputerWing = floorNum === 4;
    addRoomFrontWithDoor(-12.2, -4.4, yB, isP4ComputerWing ? `SALA CÓMPUTO ${floorNum}01` : `SALÓN ${floorNum}01`, '#38bdf8');
    addRoomFrontWithDoor(-4.4, 3.4, yB, isP4ComputerWing ? `SALA CÓMPUTO ${floorNum}02` : `SALÓN ${floorNum}02`, '#38bdf8');
    addRoomFrontWithDoor(
      3.4,
      11.2,
      yB,
      floorNum === 2 ? 'LAB TI 203 · SNIFFER RPi5' : floorNum === 3 ? 'CUARTO SERVIDORES TI 303' : 'SALÓN MAGISTRAL 403',
      floorNum === 2 ? '#10b981' : '#a855f7'
    );
    addRoomFrontWithDoor(11.2, 14.6, yB, `BAÑOS P${floorNum}`, '#14b8a6');

    // Amueblar Espacios 1 y 2 (Salones con tablero acrílico y pupitres en P2/P3; Salas de Cómputo en P4)
    [-8.3, -0.5].forEach((roomCenterX) => {
      // Tablero acrílico blanco al costado oriental del salón
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 1.35),
        new THREE.MeshBasicMaterial({
          map: makeSlideTexture(
            isP4ComputerWing ? 'RED DE SALAS TI · UNAL' : ` CÁTEDRA INGENIERÍA · ${floorNum}0x`,
            'Edificio 454 Ciencia y Tecnología',
            ['∫ σ·dA = m·a   |   STA/LTA ≥ 3.0', 'Análisis matricial y algoritmos'],
            '#38bdf8'
          )
        })
      );
      board.position.set(roomCenterX + 3.65, yB + 1.72, -8.0);
      board.rotation.y = -Math.PI / 2;
      buildingGroup.add(board);

      for (let r = 0; r < 3; r++) {
        const dx = roomCenterX - 2.1 + r * 1.85;
        for (let c = 0; c < 2; c++) {
          const dz = -9.6 + c * 2.4;
          batcher.add('cls_desk', geos.unitBox, mats.deskWhite, dx, yB + 0.74, dz, 0, 0, 0, 0.95, 0.06, 1.65, true, true);
          batcher.add('cls_chair', geos.unitBox, mats.chairCharcoal, dx - 0.52, yB + 0.46, dz - 0.4, 0, 0, 0, 0.44, 0.46, 0.44);
          batcher.add('cls_chair', geos.unitBox, mats.chairCharcoal, dx - 0.52, yB + 0.46, dz + 0.4, 0, 0, 0, 0.44, 0.46, 0.44);
          if (isP4ComputerWing) {
            batcher.add('pc_monitor', geos.unitBox, mats.darkMetal, dx + 0.15, yB + 1.02, dz - 0.4, 0, Math.PI / 2, 0, 0.48, 0.34, 0.05);
            batcher.add('pc_screen', geos.unitBox, mats.screenGlow, dx + 0.12, yB + 1.02, dz - 0.4, 0, Math.PI / 2, 0, 0.42, 0.28, 0.02);
            batcher.add('pc_monitor', geos.unitBox, mats.darkMetal, dx + 0.15, yB + 1.02, dz + 0.4, 0, Math.PI / 2, 0, 0.48, 0.34, 0.05);
            batcher.add('pc_screen', geos.unitBox, mats.screenGlow, dx + 0.12, yB + 1.02, dz + 0.4, 0, Math.PI / 2, 0, 0.42, 0.28, 0.02);
          }
        }
      }
    });

    // Amueblar Espacio 3 (x: 3.4 .. 11.2):
    // - En Piso 2: Laboratorio TI 203 + Mesa dedicada del LPSBOX Sniffer RPi 5 (en SNIFFER_WORLD_POS)
    // - En Piso 3: Cuarto de Servidores / Racks TI 303
    // - En Piso 4: Salón Magistral 403
    if (floorNum === 2) {
      // Estaciones de trabajo TI + Rack de comunicaciones
      for (let wx = 4.6; wx <= 9.8; wx += 2.5) {
        batcher.add('cls_desk', geos.unitBox, mats.deskWhite, wx, yB + 0.74, -6.8, 0, 0, 0, 1.7, 0.07, 0.95, true, true);
        batcher.add('pc_monitor', geos.unitBox, mats.darkMetal, wx, yB + 1.04, -7.0, 0, 0, 0, 0.56, 0.36, 0.05);
        batcher.add('pc_screen', geos.unitBox, mats.screenGlow, wx, yB + 1.04, -6.96, 0, 0, 0, 0.5, 0.3, 0.02);
      }
      batcher.add('server_rack', geos.unitBox, mats.darkMetal, 10.2, yB + 1.05, -9.9, 0, 0, 0, 0.85, 2.1, 0.85, true, true);
    } else if (floorNum === 3) {
      for (let rx = 4.8; rx <= 10.0; rx += 1.7) {
        batcher.add('server_rack', geos.unitBox, mats.darkMetal, rx, yB + 1.05, -9.6, 0, 0, 0, 0.85, 2.1, 0.9, true, true);
        batcher.add('server_led', geos.unitBox, mats.screenGlow, rx, yB + 1.55, -9.13, 0, 0, 0, 0.56, 0.14, 0.04);
      }
    } else {
      for (let wx = 4.8; wx <= 9.6; wx += 2.3) {
        batcher.add('cls_desk', geos.unitBox, mats.deskWhite, wx, yB + 0.74, -8.0, 0, 0, 0, 1.0, 0.06, 2.4, true, true);
      }
    }

    // Amueblar Baterías de Baños (x: 11.2 .. 14.6, z: -11.3 .. -4.6) con cubículos, lavamanos y espejos!
    batcher.add('sink_counter', geos.unitBox, mats.deskWhite, 11.75, yB + 0.82, -8.2, 0, 0, 0, 0.62, 0.12, 3.2, false, true);
    batcher.add('mirror_glass', geos.unitBox, mats.screenGlow, 11.34, yB + 1.52, -8.2, 0, 0, 0, 0.04, 0.95, 2.9, false, false);
    for (let sz = -10.6; sz <= -7.4; sz += 1.45) {
      batcher.add('stall_div', geos.unitBox, mats.bathroomTile, 13.55, yB + 1.05, sz, 0, 0, 0, 1.65, 1.95, 0.08, false, true);
      batcher.add('toilet_box', geos.unitBox, mats.crispWhite, 14.0, yB + 0.36, sz + 0.65, 0, 0, 0, 0.55, 0.44, 0.42, false, true);
    }
  }

  // ============================================================================
  // 7. ÚLTIMO PISO (PISO 5, y = 13.72 m): CAFETERÍA CON TECHO RETICULADO (SOLO EN CAFETERÍA!)
  // ============================================================================
  const yCafe = 13.72;

  // Barandas perimetrales de vidrio y acero alrededor del Ala Norte en Piso 5
  addRail(1.2, yCafe, -2.58, 27.2, 'x');
  addSolidWall(buildingGroup, 2.5, yCafe + 0.54, -11.42, 29.8, 1.05, 0.1, mats.glassFacade, false);

  // CUBIERTA / PÉRGOLA BLANCA RETICULADA EXCLUSIVAMENTE SOBRE LA PARTE DE LA CAFETERÍA (x = -2.2 .. +16.8, z = -11.5 .. -2.5)!
  // (El resto del último piso sobre el Ala Occidental x = -22.5 .. -2.2 queda 100% DESCUBIERTO / SIN TECHO tal como en el edificio real!)
  const cafeRoofY = yCafe + 3.35;
  for (let px = -2.0; px <= 16.5; px += 3.7) {
    // Columnas blancas que sostienen la pérgola de la cafetería
    batcher.add('cafe_col', geos.unitBox, mats.crispWhite, px, yCafe + 1.68, -11.1, 0, 0, 0, 0.26, 3.35, 0.26, true, true);
    batcher.add('cafe_col', geos.unitBox, mats.crispWhite, px, yCafe + 1.68, -3.0, 0, 0, 0, 0.26, 3.35, 0.26, true, true);
    // Vigas transversales blancas de la cubierta de la cafetería (Foto #1, #2, #3 y #4!)
    batcher.add('cafe_beam_z', geos.unitBox, mats.crispWhite, px, cafeRoofY, -7.05, 0, 0, 0, 0.24, 0.34, 9.2, true, false);
  }
  for (let pz = -11.1; pz <= -3.0; pz += 1.62) {
    batcher.add('cafe_beam_x', geos.unitBox, mats.crispWhite, 7.25, cafeRoofY + 0.06, pz, 0, 0, 0, 19.2, 0.18, 0.16, true, false);
  }
  const cafeSkylight = new THREE.Mesh(new THREE.PlaneGeometry(19.0, 8.8), mats.skylightPoly);
  cafeSkylight.rotation.x = -Math.PI / 2;
  cafeSkylight.position.set(7.25, cafeRoofY + 0.18, -7.05);
  buildingGroup.add(cafeSkylight);

  // Cerramiento acristalado de la cafetería, con dos pasos desde el corredor-terraza.
  for (const [cx, width] of [[-1.2, 1.8], [4.8, 5.0], [12.0, 5.5]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, 3.0), mats.glassFacade);
    panel.position.set(cx, yCafe + 1.55, -4.35);
    buildingGroup.add(panel);
    addWallCollider(cx, yCafe + 1.55, -4.35, width, 3.0, 0.12);
  }
  for (let x = -2; x <= 15; x += 1.4) {
    batcher.add('cafe_glass_mullions', geos.unitBox, mats.steelRail, x, yCafe + 1.55, -4.35,
      0, 0, 0, 0.045, 3.1, 0.045);
  }

  // Barra de Atención de la Cafetería CyT (x: 11.2 .. 14.4, z: -10.6 .. -5.6)
  addSolidWall(buildingGroup, 12.6, yCafe + 0.58, -8.2, 1.1, 1.14, 4.6, mats.auditoriumWood);
  addSolidWall(buildingGroup, 14.1, yCafe + 1.35, -8.2, 0.45, 2.6, 4.8, mats.equitoneWhite);
  const cafeSign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.72),
    new THREE.MeshBasicMaterial({
      map: makeSignTexture('#7f1d1d', '#fef2f2', 'CAFETERÍA TERRAZA CyT', 'Café Colombiano · Almuerzos · Onces', '#fbbf24')
    })
  );
  cafeSign.position.set(13.84, yCafe + 2.15, -8.2);
  cafeSign.rotation.y = -Math.PI / 2;
  buildingGroup.add(cafeSign);

  // Mesas y sillas rojas/grises de la Cafetería Cubierta (como se ven desde abajo en Foto #3!)
  for (let mx = -0.5; mx <= 9.5; mx += 2.5) {
    for (let mz = -9.6; mz <= -4.8; mz += 2.4) {
      batcher.add('cafe_table', geos.unitBox, mats.deskWhite, mx, yCafe + 0.74, mz, 0, 0, 0, 0.95, 0.06, 0.95, true, true);
      batcher.add('cafe_leg', geos.cylPost, mats.steelRail, mx, yCafe + 0.37, mz, 0, 0, 0, 1.2, 0.74, 1.2);
      batcher.add('cafe_chair', geos.unitBox, mats.cafeRed, mx - 0.68, yCafe + 0.46, mz, 0, 0, 0, 0.44, 0.48, 0.44, true, false);
      batcher.add('cafe_chair', geos.unitBox, mats.cafeRed, mx + 0.68, yCafe + 0.46, mz, 0, 0, 0, 0.44, 0.48, 0.44, true, false);
    }
  }

  // Bancas exteriores en la Gran Terraza Abierta (sin techo) del Ala Occidental
  for (let bz = -6.0; bz <= 6.0; bz += 4.0) {
    batcher.add('terrace_bench', geos.unitBox, mats.auditoriumWood, -16.8, yCafe + 0.32, bz, 0, 0, 0, 2.2, 0.12, 0.65, true, true);
  }

  // ============================================================================
  // 8. OBJETOS FÍSICOS DINÁMICOS (CAEN CON EL SISMO) Y ESCOMBROS CON PERSONAS ATRAPADAS
  // ============================================================================
  const dynamicSpots = [
    { x: -18.2, y: 3.52 + 1.15, z: -2.5, floorY: 3.52, sx: 0.45, sy: 0.36, sz: 0.25, mat: mats.darkMetal }, // Monitor Biblio P2
    { x: -6.2, y: 3.52 + 0.85, z: -7.5, floorY: 3.52, sx: 0.42, sy: 0.32, sz: 0.32, mat: mats.cytYellow },
    { x: 5.8, y: 3.52 + 1.15, z: -6.8, floorY: 3.52, sx: 0.48, sy: 0.36, sz: 0.22, mat: mats.darkMetal }, // Monitor TI 203
    { x: -14.1, y: 6.92 + 1.2, z: 0.5, floorY: 6.92, sx: 0.55, sy: 0.85, sz: 0.38, mat: mats.cytYellow }, // Estante libros P3
    { x: -6.5, y: 10.32 + 1.05, z: -7.2, floorY: 10.32, sx: 0.48, sy: 0.36, sz: 0.22, mat: mats.darkMetal },
    { x: 4.5, y: 13.72 + 0.82, z: -7.2, floorY: 13.72, sx: 0.32, sy: 0.34, sz: 0.32, mat: mats.cafeRed } // Cafetería P5
  ];

  dynamicSpots.forEach((sp, i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sp.sx, sp.sy, sp.sz), sp.mat);
    mesh.position.set(sp.x, sp.y, sp.z);
    mesh.castShadow = true;
    buildingGroup.add(mesh);
    dynamicProps.push({
      mesh,
      homePos: new THREE.Vector3(sp.x, sp.y, sp.z),
      homeRot: new THREE.Euler(0, 0, 0),
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
      floorY: sp.floorY + sp.sy * 0.5,
      toppled: false,
      settled: true,
      thresholdG: 0.08 + (i % 3) * 0.04
    });
  });

  // Grupos 3D de Escombros Estructurales ("Triángulos de Vida") donde quedan atrapados los NPCs
  const rubbleGroups = new Map();
  RUBBLE_POCKETS.forEach((pk) => {
    const g = new THREE.Group();
    g.position.set(pk.x, pk.y, pk.z);
    g.visible = false;

    // Losa de concreto fracturada inclinada formando un hueco de supervivencia sobre las víctimas atrapadas
    const tiltedSlab = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.24, 1.95), mats.rubbleConcrete);
    tiltedSlab.position.set(0.15, 0.72, -0.15);
    tiltedSlab.rotation.set(0.38, 0.22, -0.34);
    tiltedSlab.castShadow = true;
    tiltedSlab.receiveShadow = true;
    g.add(tiltedSlab);

    // Viga transversal caída
    const fallenBeam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 0.36), mats.fairConcrete);
    fallenBeam.position.set(-0.2, 0.38, 0.55);
    fallenBeam.rotation.set(0.12, 0.48, 0.18);
    fallenBeam.castShadow = true;
    g.add(fallenBeam);

    // Bloques de concreto y varillas de acero corrugado expuestas alrededor
    [
      [-0.85, 0.22, -0.45, 0.55, 0.38, 0.48],
      [0.88, 0.24, 0.42, 0.62, 0.42, 0.52],
      [0.35, 0.18, -0.78, 0.48, 0.32, 0.44],
      [-0.55, 0.16, 0.75, 0.44, 0.28, 0.4]
    ].forEach(([bx, by, bz, sx, sy, sz], idx) => {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats.rubbleConcrete);
      blk.position.set(bx, by, bz);
      blk.rotation.set(idx * 0.3, idx * 0.6, idx * 0.2);
      g.add(blk);
    });

    for (let r = 0; r < 3; r++) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.35, 6), mats.rebarRust);
      rod.position.set(-0.3 + r * 0.35, 0.65, -0.1);
      rod.rotation.set(0.8, r * 0.5, 0.6);
      g.add(rod);
    }

    buildingGroup.add(g);
    rubbleGroups.set(pk.id, g);
  });

  // Grupo especial de escombros que sepultan directamente al LPSBOX Sniffer RPi 5 en Salón TI 203 (Etapa 2 de 7.8 Mw)
  const snifferRubbleGroup = new THREE.Group();
  snifferRubbleGroup.position.set(SNIFFER_WORLD_POS.x, 3.52, SNIFFER_WORLD_POS.z + 0.25);
  snifferRubbleGroup.visible = false;
  const crushBeam = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.34, 1.25), mats.rubbleConcrete);
  crushBeam.position.set(0, 1.32, 0);
  crushBeam.rotation.set(0.28, -0.18, 0.24);
  crushBeam.castShadow = true;
  snifferRubbleGroup.add(crushBeam);
  for (let i = 0; i < 5; i++) {
    const chunk = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.38), mats.rubbleConcrete);
    chunk.position.set((i - 2) * 0.34, 1.08 + (i % 2) * 0.14, (i % 2 === 0 ? 0.18 : -0.14));
    chunk.rotation.set(i * 0.4, i * 0.7, 0.2);
    snifferRubbleGroup.add(chunk);
  }
  buildingGroup.add(snifferRubbleGroup);

  // Compilar todas las instancias en GPU!
  const instancedMeshes = batcher.buildInto(buildingGroup);

  return {
    mats,
    rubbleGroups,
    snifferRubbleGroup,
    instancedMeshes
  };
}
