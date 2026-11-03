import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { buildCytCampusAndBuilding } from '../js/cytBuilding.js';
import { LPSBoxScene3D } from '../js/scene3d.js';
import { LPSBoxSimulation, makeEvacuationRoute } from '../js/simulation.js';

function makeGeometry() {
  const previous = globalThis.document;
  const ctx = new Proxy({}, { get: () => () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
  const env = { scene: new THREE.Group(), buildingGroup: new THREE.Group(), wallBoxes: [],
    walkableTeleportMeshes: [], supportSlabs: [], supportRamps: [], dynamicProps: [] };
  try { buildCytCampusAndBuilding(env); } finally { globalThis.document = previous; }
  return { staticColliders: env.wallBoxes, collapseColliders: [], sim: { structuralCollapseStage: 0 },
    supportSlabs: env.supportSlabs, supportRamps: env.supportRamps,
    _getSupportHeight: LPSBoxScene3D.prototype._getSupportHeight,
    _resolveOperatorCollisions: LPSBoxScene3D.prototype._resolveOperatorCollisions };
}

function walk(scene, points, startY) {
  let feetY = startY;
  let [x, z] = points[0];
  for (const [destX, destZ] of points.slice(1)) {
    const steps = Math.ceil(Math.hypot(destX - x, destZ - z) / 0.05);
    const sx = x, sz = z;
    for (let i = 1; i <= steps; i++) {
      const nx = sx + (destX - sx) * i / steps, nz = sz + (destZ - sz) * i / steps;
      const col = scene._resolveOperatorCollisions(nx, nz, feetY, feetY + 1.72);
      assert.ok(Math.hypot(col.x - nx, col.z - nz) < 0.09, `blocked at ${nx.toFixed(2)}, ${feetY.toFixed(2)}, ${nz.toFixed(2)} => ${col.x.toFixed(2)},${col.z.toFixed(2)}`);
      const height = scene._getSupportHeight(nx, nz, feetY);
      assert.ok(Math.abs(height - feetY) < 0.45, `gap at ${nx}, ${nz}: ${feetY} to ${height}`);
      feetY = height;
    }
    x = destX; z = destZ;
  }
  return feetY;
}

test('auditorium stairs connect the library to the basement both ways', () => {
  const scene = makeGeometry();
  assert.ok(Math.abs(walk(scene, [[-11.0, 4.0], [-14.9, 4.0], [-14.9, 5.4], [-14.9, 10.4]], 0.12) + 3.4) < 0.1);
  assert.ok(Math.abs(walk(scene, [[-14.9, 10.4], [-14.9, 5.4]], -3.4) - 0.12) < 0.1);
});

test('east staircase connects ground and first upper floor without solid slabs blocking it', () => {
  const scene = makeGeometry();
  const path = [[15.45, -3.8], [15.45, -9.1], [15.45, -10], [16.65, -10], [16.65, -9.1], [16.65, -3.8], [16.65, -3.3]];
  assert.ok(Math.abs(walk(scene, path, 0.12) - 3.52) < 0.1);
  assert.ok(Math.abs(walk(scene, path.toReversed(), 3.52) - 0.12) < 0.1);
});

test('west ramps and upper east stairs connect successive floors', () => {
  const scene = makeGeometry();
  const west = [[-11.8, 8.8], [-11.8, -8.2], [-11.8, -9.5],
    [-10.55, -9.5], [-10.55, -8.2], [-10.55, 8.8], [-10.55, 10],
    [-11.8, 10], [-11.8, 8.8], [-11.8, -8.2]];
  assert.ok(Math.abs(walk(scene, west, 0.12) - 10.32) < 0.1);
  for (let floor = 1; floor < 4; floor++) {
    const y = 0.12 + floor * 3.4;
    const path = [[15.45, -3.8], [15.45, -9.1], [15.45, -10], [16.65, -10], [16.65, -9.1], [16.65, -3.8], [16.65, -3.3]];
    assert.ok(Math.abs(walk(scene, path, y) - (y + 3.4)) < 0.1);
  }
});

test('classroom doors allow physical access from the corridor', () => {
  const scene = makeGeometry();
  for (const y of [3.52, 6.92, 10.32]) {
    for (const x of [-7.9, -2.3, 5.5, 12.9])
      assert.ok(Math.abs(walk(scene, [[x, -3.45], [x, -5.4]], y) - y) < 0.1);
  }
});

test('evacuation paths keep height tied to stair movement', () => {
  const sim = new LPSBoxSimulation();
  sim.spawnPopulation({ S: 1, A: 0, B: 1, C: 0, D: 0, E: 0 });
  for (const p of sim.people) {
    const route = makeEvacuationRoute(p);
    assert.ok(route.length > 3);
    assert.ok(route.every(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z)));
    assert.equal(route.at(-1).y, 0.12);
    p.state = 'evacuating_calm';
  }
  for (let i = 0; i < 6000; i++) sim.update(0.05);
  assert.ok(sim.people.every(p => p.state === 'evacuated'));
  assert.ok(sim.people.every(p => Math.abs(p.y - 0.12) < 0.01));
});
