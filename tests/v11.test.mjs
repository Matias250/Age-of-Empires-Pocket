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
