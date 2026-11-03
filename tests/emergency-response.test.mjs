import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { LPSBoxSimulation } from '../js/simulation.js';
import { EmergencyResponse } from '../js/emergencyResponse.js';

// Labels use a canvas in the browser; these tests only need its drawing interface.
globalThis.document = { createElement: () => ({ getContext: () => ({ fillText() {} }) }) };

test('one arrival notification per completed quake; none when monitoring is reset mid-event', () => {
  const notifications = [];
  const sim = new LPSBoxSimulation({ onQuakeEnded: info => notifications.push(info) });
  sim.triggerSeismicScenario('mild');
  for (let i = 0; i < 320; i++) sim.update(0.05);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].scenario, 'mild');
  for (let i = 0; i < 200; i++) sim.update(0.05);
  assert.equal(notifications.length, 1);
  sim.triggerSeismicScenario('major');
  sim.setNormalMonitoring();
  for (let i = 0; i < 500; i++) sim.update(0.05);
  assert.equal(notifications.length, 1);
});

test('emergency vehicles and responders arrive, skip, reset and replay', () => {
  const scene = new THREE.Scene();
  const response = new EmergencyResponse(scene);
  assert.equal(response.root.visible, false);
  response.start();
  assert.equal(response.root.visible, true);
  const fireStart = response.fire.position.x;
  response.update(4);
  assert.ok(response.fire.position.x > fireStart);
  assert.equal(response.responders[0].group.visible, false);
  response.update(4);
  assert.equal(response.responders[0].group.visible, true);
  assert.equal(response.active, true);
  assert.equal(response.update(5), true);
  assert.equal(response.active, false);
  assert.ok(response.responders.every(r => r.group.visible));
  response.reset();
  assert.equal(response.root.visible, false);
  response.start();
  response.finish();
  assert.equal(response.active, false);
  assert.ok(response.responders.every(r => r.group.visible));
  response.reset();
  assert.equal(response.completed, false);
});
