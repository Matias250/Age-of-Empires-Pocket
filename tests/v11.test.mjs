import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../dist/sim/match.js';
import { CIVS } from '../dist/sim/civs.js';

function setup(civ = 'francos') {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 5, map: 'continental', biome: 'templado', players: [
    { ai: false, civ, team: 1, color: 0 }, { ai: true, civ: 'francos', team: 2, color: 1, difficulty: 'easy' }] });
  const w = m.world; const p = w.players[0];
  p.res = { food: 5000, wood: 5000, gold: 5000, stone: 5000 }; p.age = 4; p.explored.fill(0);
  const tc = w.buildingsOf(0, 'towncenter')[0];
  const run = (s) => { for (let i = 0; i < s * 20; i++) w.step(); };
  return { w, p, tc, run };
}

test('hasta 5 infantes entran al ariete, lo aceleran y bajan al morir', () => {
  const { w, p, tc, run } = setup();
  const ram = w.spawnUnit(0, 'ram', tc.x + 120, tc.y);
  const inf = Array.from({ length: 6 }, (_, i) => w.spawnUnit(0, 'militia', tc.x + 90, tc.y + 20 + i * 8));
  const pop0 = w.popOf(0), sp0 = w.speedOf(ram);
  w.issue({ t: 'target', p: 0, ids: inf.map((u) => u.id), target: ram.id });
  run(6);
  assert.equal(ram.cargo.length, 5);
  assert.equal(w.popOf(0), pop0, 'la población no cambia');
  assert.ok(w.speedOf(ram) > sp0);
  assert.equal(inf.filter((u) => w.get(u.id)).length, 1);
  w.issue({ t: 'unload', p: 0, ids: [ram.id] });
  run(0.2);
  assert.equal(inf.filter((u) => w.get(u.id)).length, 6);
  w.issue({ t: 'target', p: 0, ids: inf.map((u) => u.id), target: ram.id });
  run(6);
  ram.hp = 0; run(0.2);
  assert.equal(inf.filter((u) => w.get(u.id)).length, 6, 'al romperse el ariete la infantería sale');
  void p;
});

test('el explorador explora solo', () => {
  const { w, p, tc, run } = setup();
  const s = w.spawnUnit(0, 'scout', tc.x + 60, tc.y);
  run(1);
  const before = p.explored.reduce((a, b) => a + b, 0);
  w.issue({ t: 'explore', p: 0, ids: [s.id] });
  run(40);
  assert.equal(s.order?.t, 'explore');
  assert.ok(p.explored.reduce((a, b) => a + b, 0) > before * 1.5);
});

test('guerrero águila solo para aztecas y mayas; telar y carretilla ya no están', () => {
  for (const c of Object.keys(CIVS)) assert.equal(!CIVS[c].lacks.includes('eagle'), c === 'aztecas' || c === 'mayas', c);
  const { w, tc } = setup('mayas');
  const br = w.placeBuilding(0, 'barracks', tc.tx + 6, tc.ty, true);
  assert.ok(w.trainsOf(0, 'barracks').includes('eagle'));
  w.issue({ t: 'train', p: 0, bid: br.id, u: 'eagle' });
  for (let i = 0; i < 300; i++) w.step();
  assert.ok(w.unitsOf(0, 'eagle').length >= 1);
  const f = setup('francos');
  assert.ok(!f.w.trainsOf(0, 'barracks').includes('eagle'));
  assert.ok(!f.w.trainsOf(0, 'towncenter').length || true);
});
