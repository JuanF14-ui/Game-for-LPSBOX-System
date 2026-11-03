// Llegada visual de servicios de emergencia. No modifica a los NPCs ni al informe.
import * as THREE from '../vendor/three/three.module.min.js';

const DURATION = 12;

function ease(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function labelTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 66px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class EmergencyResponse {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'emergency-response';
    this.root.visible = false;
    scene.add(this.root);
    this.elapsed = 0;
    this.active = false;
    this.completed = false;
    this.wheels = [];
    this.beacons = [];
    this.responders = [];

    const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.58, ...extra });
    this.mats = {
      white: material(0xf7fafc), red: material(0xc71f2a), stripe: material(0xef3340),
      dark: material(0x1d2935), glass: material(0x7999a9, { metalness: 0.15, roughness: 0.22 }),
      rubber: material(0x20232a), silver: material(0xb7c1c8, { metalness: 0.5 }),
      yellow: material(0xfacc15), blue: material(0x164475), skin: material(0xc78d69),
      lightRed: new THREE.MeshBasicMaterial({ color: 0xff3344 }),
      lightBlue: new THREE.MeshBasicMaterial({ color: 0x248dff })
    };
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12);
    this.fire = this._vehicle('fire');
    this.ambulance = this._vehicle('ambulance');
    this.root.add(this.fire, this.ambulance);
    for (let i = 0; i < 4; i++) this._responder(i);
    this._pose(0);
  }

  _box(parent, mat, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(this.boxGeometry, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  _vehicle(type) {
    const fire = type === 'fire';
    const group = new THREE.Group();
    group.name = fire ? 'fire-engine' : 'ambulance';
    const m = this.mats;
    const length = fire ? 5.8 : 4.8;
    // Forward is +X. Cab, enclosed body, windscreen and side windows.
    this._box(group, m.dark, 0, 0.55, 0, length, 0.35, 2.0);
    this._box(group, fire ? m.red : m.white, -0.6, 1.32, 0, fire ? 3.8 : 3.15, 1.7, 2.02);
    this._box(group, fire ? m.red : m.white, length / 2 - 0.85, 1.24, 0, 1.6, 1.35, 1.98);
    this._box(group, m.glass, length / 2 - 0.03, 1.5, 0, 0.035, 0.75, 1.68);
    for (const side of [-1, 1]) {
      this._box(group, m.glass, length / 2 - 0.82, 1.52, side * 1.005, 1.12, 0.68, 0.035);
      this._box(group, fire ? m.white : m.stripe, -0.65, 1.02, side * 1.02, fire ? 3.7 : 3.0, 0.16, 0.025);
      const text = new THREE.Mesh(new THREE.PlaneGeometry(fire ? 2.5 : 2.25, 0.46),
        new THREE.MeshBasicMaterial({ map: labelTexture(fire ? 'BOMBEROS' : 'AMBULANCIA', fire ? '#ffffff' : '#c71f2a'), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      text.position.set(-0.55, 1.62, side * 1.04);
      if (side < 0) text.rotation.y = Math.PI;
      group.add(text);
      if (!fire) {
        this._box(group, m.red, -1.6, 1.55, side * 1.055, 0.56, 0.13, 0.025);
        this._box(group, m.red, -1.6, 1.55, side * 1.06, 0.13, 0.56, 0.025);
      }
      for (const x of [-length * 0.32, length * 0.30]) {
        const wheel = new THREE.Mesh(this.wheelGeometry, m.rubber);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.4, side * 1.07);
        group.add(wheel);
        this.wheels.push(wheel);
        this._box(group, m.silver, x, 0.4, side * 1.2, 0.3, 0.3, 0.05);
      }
    }
    this._box(group, m.silver, length / 2 + 0.04, 0.7, 0, 0.15, 0.18, 2.05);
    // Roof rack and ladder on fire engine, lightbar on both vehicles.
    if (fire) {
      this._box(group, m.silver, -0.55, 2.28, -0.3, 4.5, 0.08, 0.07);
      this._box(group, m.silver, -0.55, 2.28, 0.3, 4.5, 0.08, 0.07);
      for (let x = -2.2; x < 1.5; x += 0.45) this._box(group, m.silver, x, 2.28, 0, 0.05, 0.08, 0.62);
    }
    const red = this._box(group, m.lightRed, 1.15, 2.27, -0.45, 0.48, 0.16, 0.48);
    const blue = this._box(group, m.lightBlue, 1.15, 2.27, 0.45, 0.48, 0.16, 0.48);
    this.beacons.push({ red, blue });
    return group;
  }

  _responder(index) {
    const fire = index < 2;
    const m = this.mats;
    const body = fire ? m.dark : m.blue;
    const group = new THREE.Group();
    group.name = fire ? 'firefighter' : 'paramedic';
    const torso = this._box(group, body, 0, 1.08, 0, 0.48, 0.65, 0.3);
    this._box(group, m.skin, 0, 1.58, 0, 0.30, 0.32, 0.28);
    this._box(group, fire ? m.yellow : m.white, 0, 1.78, 0, 0.38, 0.11, 0.34);
    this._box(group, fire ? m.yellow : m.white, 0, 1.04, 0.16, 0.5, 0.08, 0.025);
    const armL = this._box(group, body, -0.34, 1.07, 0, 0.18, 0.58, 0.19);
    const armR = this._box(group, body, 0.34, 1.07, 0, 0.18, 0.58, 0.19);
    const legL = this._box(group, body, -0.14, 0.43, 0, 0.2, 0.62, 0.22);
    const legR = this._box(group, body, 0.14, 0.43, 0, 0.2, 0.62, 0.22);
    if (!fire && index === 2) this._box(group, m.red, 0.48, 0.73, 0, 0.38, 0.3, 0.2);
    this.root.add(group);
    this.responders.push({ group, armL, armR, legL, legR, torso, index });
  }

  start() {
    this.elapsed = 0;
    this.active = true;
    this.completed = false;
    this.root.visible = true;
    this._pose(0);
  }

  _pose(t) {
    // Both vehicles enter from the left on the service road and stop separately.
    const fireArrival = ease((t - 0.2) / 5.8);
    const ambulanceArrival = ease((t - 1.1) / 6.3);
    this.fire.position.set(-38 + 27 * fireArrival, 0.08, 25.0);
    this.ambulance.position.set(-42 + 44 * ambulanceArrival, 0.08, 29.1);
    const flash = Math.floor(t * 4) % 2 === 0;
    this.beacons.forEach(({ red, blue }) => { red.visible = flash; blue.visible = !flash; });
    this.wheels.forEach(w => { w.rotation.y = t * 7; });
    for (const r of this.responders) {
      const arrival = r.index < 2 ? 6.0 : 7.4;
      const walk = ease((t - arrival) / 3.8);
      r.group.visible = t >= arrival;
      const fromX = r.index < 2 ? -11 : 2;
      const fromZ = r.index < 2 ? 23.9 : 28.0;
      const targetX = [-8.5, -6.5, 1.0, 3.1][r.index];
      const targetZ = [19.4, 19.6, 21, 21][r.index];
      r.group.position.set(fromX + (targetX - fromX) * walk, 0.08, fromZ + (targetZ - fromZ) * walk);
      r.group.rotation.y = Math.PI;
      const stride = walk > 0 && walk < 1 ? Math.sin(t * 9 + r.index) * 0.6 : 0;
      r.legL.rotation.x = stride; r.legR.rotation.x = -stride;
      r.armL.rotation.x = -stride * 0.7; r.armR.rotation.x = stride * 0.7;
    }
  }

  update(dt) {
    if (!this.root.visible) return false;
    if (this.active) {
      this.elapsed = Math.min(DURATION, this.elapsed + Math.max(0, dt));
      this._pose(this.elapsed);
      if (this.elapsed >= DURATION) {
        this.active = false;
        this.completed = true;
        return true;
      }
    } else if (this.completed) {
      // Continue flashing after the cinematic, without advancing the arrival.
      this.beacons.forEach(({ red, blue }) => { const on = Math.floor(performance.now() / 250) % 2 === 0; red.visible = on; blue.visible = !on; });
    }
    return false;
  }

  finish() {
    if (!this.root.visible) return;
    this.elapsed = DURATION;
    this._pose(DURATION);
    this.active = false;
    this.completed = true;
  }

  reset() {
    this.active = false;
    this.completed = false;
    this.elapsed = 0;
    this.root.visible = false;
  }
}
