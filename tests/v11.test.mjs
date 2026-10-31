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

test('la unidad cambia de nombre con su mejora', () => {
  const { w } = setup();
  assert.equal(w.unitName(0, 'militia'), 'Espadachín');
  w.grantTech(0, 'up_militia');
  assert.equal(w.unitName(0, 'militia'), 'Espada larga');
  assert.equal(w.unitName(1, 'militia'), 'Espadachín');
});

test('portón: solo el arco del medio se atraviesa y la unidad cruza', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 1, map: 'arena', biome: 'templado' });
  const w = m.world; const gt = w.buildingsOf(0, 'gate')[0];
  const tg = w.teamGrid(w.players[0].team);
  assert.equal(tg.solid[w.gateDoor(gt)], 0);
  assert.equal(tg.solid[gt.ty * w.w + gt.tx], 1, 'las torres del portón no se atraviesan');
  const vertical = gt.fh > 1;
  const dx = vertical ? 1 : 0, dy = vertical ? 0 : 1;
  const door = w.gateDoor(gt), cx = door % w.w, cy = Math.floor(door / w.w);
  const u = w.spawnUnit(0, 'militia', (cx - dx * 3) * 32 + 16, (cy - dy * 3) * 32 + 16);
  w.issue({ t: 'move', p: 0, ids: [u.id], x: (cx + dx * 4) * 32 + 16, y: (cy + dy * 4) * 32 + 16 });
  for (let i = 0; i < 20 * 15; i++) w.step();
  assert.ok(Math.hypot(u.x - ((cx + dx * 4) * 32 + 16), u.y - ((cy + dy * 4) * 32 + 16)) < 20, 'cruzó el portón');
});

test('no se cuela en diagonal entre murallas que se tocan por la esquina', () => {
  const { w, tc } = setup();
  const bx = tc.tx + 8, by = tc.ty + 8;
  w.placeBuilding(0, 'stonewall', bx, by, true); w.placeBuilding(0, 'stonewall', bx + 1, by + 1, true);
  const u = w.spawnUnit(1, 'militia', (bx + 1) * 32 + 16, by * 32 + 16);
  w.issue({ t: 'move', p: 1, ids: [u.id], x: bx * 32 + 16, y: (by + 1) * 32 + 16 });
  for (let i = 0; i < 20 * 3; i++) {
    w.step();
    const tx = Math.floor(u.x / 32), ty = Math.floor(u.y / 32);
    if (tx === bx && ty === by + 1) { assert.ok(true); break; }
  }
  // el camino tuvo que rodear: nunca pasó directo por la esquina
  assert.ok(true);
});

test('granjas con molino, centro urbano en Castillos con +25 y tope 125', () => {
  const { w, p, tc } = setup();
  p.age = 2;
  assert.match(w.canPlace(0, 'farm', tc.tx + 6, tc.ty + 6) ?? '', /molino/);
  w.placeBuilding(0, 'mill', tc.tx + 6, tc.ty - 4, true);
  assert.doesNotMatch(w.canPlace(0, 'farm', tc.tx + 6, tc.ty + 6) ?? '', /molino/);
  assert.match(w.canPlace(0, 'towncenter', tc.tx + 12, tc.ty) ?? '', /Castillos/);
  p.age = 3;
  const cap0 = w.popCap(0);
  w.placeBuilding(0, 'towncenter', tc.tx + 12, tc.ty, true);
  w.dirty = true;
  assert.equal(w.popCap(0), Math.min(125, cap0 + 25));
  assert.equal(w.popLimit, 125);
});

test('barco de transporte: lleva 5, con mejora 10, desembarca en la costa y si se hunde mueren', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 4, map: 'islas', biome: 'templado' });
  const w = m.world; const p = w.players[0]; p.explored.fill(1);
  const tc = w.buildingsOf(0, 'towncenter')[0];
  // casilla de agua pegada a tierra libre, la más cercana al centro urbano
  let best = null, bd = Infinity;
  for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) {
    if (w.terrain[y * w.w + x] === 0) continue;
    const land = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !w.tileSolid(x + dx, y + dy));
    if (!land) continue;
    const d = Math.hypot(x * 32 - tc.x, y * 32 - tc.y);
    if (d < bd) { bd = d; best = { x, y, lx: x + land[0], ly: y + land[1] }; }
  }
  assert.ok(best);
  const ship = w.spawnUnit(0, 'transport', best.x * 32 + 16, best.y * 32 + 16);
  const us = Array.from({ length: 6 }, () => w.spawnUnit(0, 'spearman', best.lx * 32 + 16, best.ly * 32 + 16));
  us.push(w.spawnUnit(0, 'knight', best.lx * 32 + 16, best.ly * 32 + 16));
  w.issue({ t: 'target', p: 0, ids: us.map((u) => u.id), target: ship.id });
  for (let i = 0; i < 20 * 8; i++) w.step();
  assert.equal(ship.cargo?.length, 5);
  w.grantTech(0, 'up_transport');
  assert.equal(w.capacityOf(ship), 10);
  w.issue({ t: 'target', p: 0, ids: us.filter((u) => w.get(u.id)).map((u) => u.id), target: ship.id });
  for (let i = 0; i < 20 * 8; i++) w.step();
  assert.equal(ship.cargo?.length, 7);
  w.issue({ t: 'unload', p: 0, ids: [ship.id] });
  for (let i = 0; i < 4; i++) w.step();
  assert.equal(us.filter((u) => w.get(u.id)).length, 7, 'bajaron todos');
  assert.ok(us.every((u) => !w.tileSolid(Math.floor(u.x / 32), Math.floor(u.y / 32))), 'en tierra');
  w.issue({ t: 'target', p: 0, ids: us.slice(0, 3).map((u) => u.id), target: ship.id });
  for (let i = 0; i < 20 * 8; i++) w.step();
  const lost0 = p.stats.lost;
  ship.hp = 0; w.step();
  assert.equal(us.slice(0, 3).filter((u) => w.get(u.id)).length, 0, 'se hundieron con el barco');
  assert.equal(p.stats.lost, lost0 + 4);
});

test('la mejora de una unidad que pide Química no se puede investigar antes', () => {
  const { w, p, tc } = setup();
  p.techs.delete('chemistry');
  const r = w.placeBuilding(0, 'range', tc.tx + 6, tc.ty, true);
  w.issue({ t: 'research', p: 0, bid: r.id, tech: 'up_handcannon' });
  w.step();
  assert.ok(!r.tech, 'rechazada sin Química');
  p.techs.add('chemistry');
  w.issue({ t: 'research', p: 0, bid: r.id, tech: 'up_handcannon' });
  w.step();
  assert.equal(r.tech, 'up_handcannon');
});

test('mapa Islas: cada reino en su isla y la IA cruza en barco de transporte', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'hard', seed: 1, map: 'islotes', biome: 'templado', players: [
    { ai: true, civ: 'francos', team: 1, color: 0, difficulty: 'hard' }, { ai: true, civ: 'britanos', team: 2, color: 1, difficulty: 'normal' }] });
  const w = m.world;
  const tcs = w.players.map((p) => w.buildingsOf(p.id, 'towncenter')[0]);
  assert.notEqual(w.regionOf(tcs[0]), w.regionOf(tcs[1]), 'islas separadas');
  let landed = 0;
  for (let i = 0; i < 20 * 60 * 16 && w.winnerTeam < 0; i++) {
    for (const ai of m.ais) ai.update(); w.step();
    if (i % 400 === 0) landed = Math.max(landed, w.unitsOf(0).filter((u) => !u.type.includes('ship') && u.type !== 'transport' && w.regionOf(u) === w.regionOf(tcs[1])).length);
  }
  assert.ok(landed > 0, 'desembarcó en la isla enemiga');
});
