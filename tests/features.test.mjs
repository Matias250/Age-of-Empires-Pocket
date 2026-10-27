// Edificios y mecánicas nuevas: investigación, mercado, monje, empalizada, castillo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../dist/sim/match.js';
import { TECHS } from '../dist/sim/data.js';

function setup() {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 5, map: 'continental', biome: 'templado' });
  const w = m.world; const p = w.players[0];
  p.res = { food: 5000, wood: 5000, gold: 5000, stone: 5000 };
  p.age = 4;
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

test('muelle: el barco pesquero pesca y descarga', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 9, map: 'mediterraneo', biome: 'templado' });
  const w = m.world; const p = w.players[0];
  p.explored.fill(1); p.res.wood = 2000;
  const tc = w.buildingsOf(0, 'towncenter')[0];
  let spot = null;
  for (let r = 3; r < 30 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r; dx++) if (!w.canPlace(0, 'dock', tc.tx + dx, tc.ty + dy)) { spot = { x: tc.tx + dx, y: tc.ty + dy }; break; }
  assert.ok(spot, 'debería haber lugar para un muelle');
  const dock = w.placeBuilding(0, 'dock', spot.x, spot.y, true);
  w.issue({ t: 'train', p: 0, bid: dock.id, u: 'fishship' });
  for (let i = 0; i < 20 * 20; i++) w.step();
  const ship = w.unitsOf(0, 'fishship')[0];
  assert.ok(ship, 'se entrenó el barco');
  const fish = w.findNode(ship, 'food', 60 * 32);
  assert.ok(fish, 'hay peces');
  w.issue({ t: 'target', p: 0, ids: [ship.id], target: fish.id });
  const food0 = p.stats.gathered.food;
  for (let i = 0; i < 90 * 20; i++) w.step();
  assert.ok(p.stats.gathered.food > food0, 'pescó y descargó comida');
});

test('civilizaciones: bonos y unidad única en el castillo', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 4, players: [
    { ai: false, civ: 'chinos', team: 1, color: 0 }, { ai: true, civ: 'turcos', team: 2, color: 1 }] });
  const w = m.world;
  assert.equal(w.unitsOf(0, 'villager').length, 7, 'chinos empiezan con 3 aldeanos extra');
  assert.ok(w.players[1].techs.has('chemistry'), 'turcos tienen Química gratis');
  assert.deepEqual(w.trainsOf(0, 'castle'), ['chukonu', 'trebuchet']);
  assert.deepEqual(w.trainsOf(1, 'castle')[0], 'janissary');
});

test('las 4 edades se pueden avanzar', () => {
  const { w, p, tc, run } = setup();
  p.age = 1; p.res = { food: 9999, wood: 9999, gold: 9999, stone: 9999 };
  for (const a of [2, 3, 4]) { w.issue({ t: 'age', p: 0, bid: tc.id }); run(55); assert.equal(p.age, a); }
});
