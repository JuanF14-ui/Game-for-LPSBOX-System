// js/stlViewer.js — Visor CAD 3D interactivo para modelo3d.stl (Parte 4)

import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { loadSharedStlGeometry } from './scene3d.js';

export class StlCadInspector {
  constructor(container) {
    this.container = container;
    this.initialized = false;
    this.wireframe = false;
    this.autoRotate = true;
    this.mesh = null;
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
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.05, 30);
    this.camera.position.set(0.75, 0.72, 1.35);

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
    this.controls.target.set(0, 0.44, 0);

    const amb = new THREE.AmbientLight(0x93c5fd, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 3, 2.5);
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rim.position.set(-2, 1.5, -2);
    this.scene.add(amb, key, rim);

    const grid = new THREE.GridHelper(2.2, 22, 0x38bdf8, 0x1e293b);
    this.scene.add(grid);

    this.material = new THREE.MeshStandardMaterial({
      color: 0x2c3440,
      roughness: 0.45,
      metalness: 0.35
    });

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
      this.material.color.setHex(this.wireframe ? 0x38bdf8 : 0x2c3440);
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
    this.camera.position.set(0.75, 0.72, 1.35);
    this.controls.target.set(0, 0.44, 0);
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
