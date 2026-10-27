// js/stlViewer.js — Visor CAD 3D interactivo para modelo3d.stl (Nodo Sniffer RPi5 + MPU6050)

import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { loadSharedStlGeometry } from './scene3d.js';

function createCalibratedSnifferScreenTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 352;
  const ctx = c.getContext('2d');

  // Outer rounded bezel border matching bozeto del sniffer rediseño IA.jpg
  ctx.fillStyle = '#070b11';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = '#14b8a6';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, c.width - 8, c.height - 8);

  // Inner active OLED glass
  ctx.fillStyle = '#0b121c';
  ctx.fillRect(18, 18, c.width - 36, c.height - 36);

  // Top telemetry header + battery icon
  ctx.fillStyle = '#5eead4';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('RPi5 · MPU6050', 34, 56);

  // Battery icon top-right
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(424, 36, 48, 22);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(472, 42, 5, 10);
  ctx.fillStyle = '#34d399';
  ctx.fillRect(428, 40, 36, 14);

  // Main alert text
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 68px system-ui, sans-serif';
  ctx.fillText('ALERTA', 72, 178);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 38px system-ui, sans-serif';
  ctx.fillText('Enviando datos', 72, 248);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '19px monospace';
  ctx.fillText('TX → Gateway Poste · STA/LTA ≥ 3.0', 72, 304);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class StlCadInspector {
  constructor(container) {
    this.container = container;
    this.initialized = false;
    this.wireframe = false;
    this.autoRotate = true;
    this.mesh = null;
    this.screenGroup = null;
  }

  initIfNeeded() {
    if (this.initialized) {
      this.onResize();
      return;
    }
    this.initialized = true;

    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 30);
    this.camera.position.set(0.72, 0.68, 1.32);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (_) {
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      } catch (err) {
        console.warn('No se pudo inicializar el segundo contexto WebGL del visor CAD:', err);
        this.renderer = null;
        return;
      }
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 2.0;
    this.controls.target.set(-0.02, 0.44, 0);

    const amb = new THREE.AmbientLight(0x93c5fd, 0.9);
    const key = new THREE.DirectionalLight(0xffffff, 1.75);
    key.position.set(2.2, 3.2, 2.8);
    const rim = new THREE.DirectionalLight(0x38bdf8, 1.0);
    rim.position.set(-2.2, 1.6, -2.0);
    this.scene.add(amb, key, rim);

    const grid = new THREE.GridHelper(2.2, 22, 0x38bdf8, 0x1e293b);
    this.scene.add(grid);

    this.material = new THREE.MeshStandardMaterial({
      color: 0x2b323d,
      roughness: 0.42,
      metalness: 0.32
    });

    // Exact raycast-calibrated full-coverage screen module for modelo3d.stl:
    // STL screen frame spans X: [-0.194, +0.109] (w=0.303, cx=-0.0425), Y_3d: [0.371, 0.579] (h=0.208, cy=0.475)
    this.screenGroup = new THREE.Group();
    const bezelBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.308, 0.212, 0.005),
      new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.25, metalness: 0.4 })
    );
    bezelBack.position.set(-0.0425, 0.475, 0.1495);
    this.screenGroup.add(bezelBack);

    const screenPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.304, 0.208),
      new THREE.MeshBasicMaterial({ map: createCalibratedSnifferScreenTexture() })
    );
    screenPlane.position.set(-0.0425, 0.475, 0.1524);
    this.screenGroup.add(screenPlane);

    const statusDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x2dd4bf })
    );
    statusDot.position.set(0.136, 0.482, 0.151);
    this.screenGroup.add(statusDot);

    this.scene.add(this.screenGroup);

    loadSharedStlGeometry((geometry) => {
      this.mesh = new THREE.Mesh(geometry, this.material);
      this.mesh.rotation.x = -Math.PI / 2;
      this.scene.add(this.mesh);
    });

    window.addEventListener('resize', () => this.onResize());
  }

  toggleWireframe() {
    this.wireframe = !this.wireframe;
    if (this.material) {
      this.material.wireframe = this.wireframe;
      this.material.color.setHex(this.wireframe ? 0x38bdf8 : 0x2b323d);
    }
    if (this.screenGroup) {
      this.screenGroup.visible = !this.wireframe;
    }
    return this.wireframe;
  }

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    if (this.controls) {
      this.controls.autoRotate = this.autoRotate;
    }
    return this.autoRotate;
  }

  resetCamera() {
    if (!this.controls) return;
    this.camera.position.set(0.72, 0.68, 1.32);
    this.controls.target.set(-0.02, 0.44, 0);
    this.controls.update();
  }

  render() {
    if (!this.initialized || !this.renderer) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    if (!this.initialized || !this.renderer) return;
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || 400;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
