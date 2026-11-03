import test from 'node:test';
import assert from 'node:assert/strict';
import { LPSBoxSimulation, RUBBLE_POCKETS, ZONES } from '../js/simulation.js';

function step(sim, seconds) {
  for (let t = 0; t < seconds * 20; t++) sim.update(0.05);
}

test('snapshot, hoist, rubble and six-level report survive a catastrophic scenario', () => {
  const sim = new LPSBoxSimulation();
  sim.spawnPopulation({ S: 3, A: 3, B: 4, C: 3, D: 3, E: 3 });
  assert.equal(sim.canExtractGateway(), false);
  sim.triggerSeismicScenario('catastrophic');
  step(sim, 30);
  assert.ok(sim.frozenSnapshot);
  assert.equal(sim.structuralCollapseStage, 3);
  assert.equal(sim.snifferDamaged, true);
  assert.ok(sim.getEventSeismogram().samples.length > 100);
  const trapped = sim.people.filter(p => p.state === 'trapped');
  assert.ok(trapped.length > 0);
  for (const person of trapped) {
    const pocket = RUBBLE_POCKETS.find(p => p.id === person.rubblePocketId);
    assert.ok(pocket);
    assert.equal(person.currentZone, pocket.zone);
  }
  sim.lowerGatewayFromPole();
  step(sim, 2);
  assert.equal(sim.canExtractGateway(), true);
  assert.deepEqual(Object.keys(sim.frozenSnapshot.groundTruthByZone), ZONES.map(z => z.id));
  const result = sim.evaluateOperatorReport({
    totalGuess: sim.frozenSnapshot.groundTruthTotal,
    zoneGuesses: sim.frozenSnapshot.groundTruthByZone,
    priorityZoneGuess: sim._findBestPriorityZone()
  });
  assert.equal(result.score, 100);
  sim.spawnMissionRandom(true);
  assert.equal(sim.snifferDamaged, false);
  assert.equal(sim.canExtractGateway(), false);
  assert.ok(sim.people.every(p => p.state !== 'trapped'));
});

test('normal conversations do not direct players to the Gateway', () => {
  const sim = new LPSBoxSimulation();
  assert.ok(sim.people.some(p => p.partnerId));
  for (const person of sim.people) assert.doesNotMatch(person.basePhrase, /gateway|operari[oa]/i);
});

test('normal dialogue cycles through varied paired conversations without duplicate visible phrases', () => {
  const sim = new LPSBoxSimulation();
  sim.spawnPopulation({ S: 4, A: 4, B: 4, C: 4, D: 4, E: 4 });
  const seen = new Set();
  let peak = 0;
  for (let cycle = 0; cycle < 16; cycle++) {
    step(sim, 3.5);
    const visible = sim.people.filter(p => p.speechVisible);
    peak = Math.max(peak, visible.length);
    assert.equal(new Set(visible.map(p => p.phrase)).size, visible.length);
    visible.forEach(p => { seen.add(p.phrase); assert.doesNotMatch(p.phrase, /gateway|operari[oa]/i); });
  }
  assert.ok(peak > 5);
  assert.ok(seen.size >= 30, `only ${seen.size} different phrases`);
});
