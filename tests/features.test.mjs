// Edificios y mecánicas nuevas: investigación, mercado, monje, empalizada, castillo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../dist/sim/match.js';
import { TECHS } from '../dist/sim/data.js';

function setup() {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 5, map: 'continental', biome: 'templado' });
  const w = m.world; const p = w.players[0];
  p.res = { food: 5000, wood: 5000, gold: 5000, stone: 5000 };
  p.age = 2;
  p.explored.fill(1);
  const tc = w.buildingsOf(0, 'towncenter')[0];
  const run = (s) => { for (let i = 0; i < s * 20; i++) w.step(); };
  return { w, p, tc, run };
}

test('investigación de la herrería suma ataque', () => {
  const { w, p, tc, run } = setup();
  const bs = w.placeBuilding(0, 'blacksmith', tc.tx + 6, tc.ty, true);
  w.issue({ t: 'research', p: 0, bid: bs.id, tech: 'forge' });
  run(TECHS.forge.time + 1);
  assert.ok(p.techs.has('forge'));
});

test('mercado compra y vende', () => {
  const { w, p, tc, run } = setup();
  w.placeBuilding(0, 'market', tc.tx + 6, tc.ty, true);
  const gold = p.res.gold, food = p.res.food;
  w.issue({ t: 'trade', p: 0, res: 'food', buy: true });
  w.issue({ t: 'trade', p: 0, res: 'wood', buy: false });
  run(0.1);
  assert.equal(p.res.food, food + 100);
  assert.equal(p.res.gold, gold - 130 + 70);
});

test('el monje cura a un soldado herido', () => {
  const { w, tc, run } = setup();
  const s = w.spawnUnit(0, 'militia', tc.x + 100, tc.y + 100);
  s.hp = 10;
  w.spawnUnit(0, 'monk', tc.x + 140, tc.y + 100);
  run(6);
  assert.ok(s.hp > 25, 'hp ' + s.hp);
});

test('aldeanos construyen empalizada y castillo', () => {
  const { w, tc, run } = setup();
  const v = w.unitsOf(0, 'villager').map((u) => u.id);
  const free = (type, size) => { for (let r = 4; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!w.canPlace(0, type, tc.tx + dx, tc.ty + dy) && w.areaFree(tc.tx + dx, tc.ty + dy, size, 1)) return { x: tc.tx + dx, y: tc.ty + dy }; };
  const a = free('castle', 6);
  for (let i = 0; i < 4; i++) w.issue({ t: 'build', p: 0, ids: v, b: 'wall', tx: a.x + i, ty: a.y });
  run(40);
  assert.equal(w.buildingsOf(0, 'wall', true).length, 4);
  const c = free('castle', 4);
  w.issue({ t: 'build', p: 0, ids: v, b: 'castle', tx: c.x, ty: c.y });
  run(70);
  assert.equal(w.buildingsOf(0, 'castle', true).length, 1);
});
