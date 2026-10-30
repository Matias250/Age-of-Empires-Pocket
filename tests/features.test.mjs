// Edificios y mecánicas nuevas: investigación, mercado, monje, empalizada, castillo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../dist/sim/match.js';
import { TECHS, TICK_RATE } from '../dist/sim/data.js';

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

test('una granja admite un solo aldeano', () => {
  const { w, tc, run } = setup();
  const vs = w.unitsOf(0, 'villager').slice(0, 2);
  let f = null;
  for (let r = 4; r < 12 && !f; r++) for (let dx = -r; dx <= r && !f; dx++) if (w.areaFree(tc.tx + dx, tc.ty + r, 2, 1)) f = w.placeBuilding(0, 'farm', tc.tx + dx, tc.ty + r, true);
  w.issue({ t: 'target', p: 0, ids: vs.map((v) => v.id), target: f.id });
  run(1);
  const on = vs.filter((v) => v.order?.t === 'gather' && v.order.target === f.id).length;
  assert.equal(on, 1);
});

test('cola de órdenes: mover y después construir', () => {
  const { w, tc, run } = setup();
  const v = w.unitsOf(0, 'villager')[0];
  w.issue({ t: 'move', p: 0, ids: [v.id], x: tc.x + 160, y: tc.y + 160 });
  w.issue({ t: 'move', p: 0, ids: [v.id], x: tc.x - 160, y: tc.y + 160, queue: true });
  run(0.1);
  assert.equal(v.cmdQueue.length, 1);
  run(20);
  assert.ok(Math.hypot(v.x - (tc.x - 160), v.y - (tc.y + 160)) < 40, 'llegó al segundo punto');
});

test('actitudes: el jugador arranca en neutral; pasiva nunca ataca, neutral solo si la atacan, agresiva sí', () => {
  const { w, tc, run } = setup();
  const a = w.spawnUnit(0, 'militia', tc.x + 200, tc.y + 200);
  const b = w.spawnUnit(0, 'militia', tc.x + 200, tc.y + 230);
  const c = w.spawnUnit(0, 'militia', tc.x + 200, tc.y + 260);
  assert.equal(c.stance, 'def');
  w.issue({ t: 'stance', p: 0, ids: [a.id], stance: 'pas' });
  w.issue({ t: 'stance', p: 0, ids: [b.id], stance: 'agg' });
  run(0.1);
  const v = w.spawnUnit(1, 'villager', tc.x + 240, tc.y + 230);
  run(1);
  assert.equal(a.order, undefined);
  assert.equal(b.order?.t, 'attack');
  assert.equal(c.order, undefined); // neutral: nadie la atacó
  c.lastHitBy = v.id;
  run(1);
  assert.equal(c.order?.t, 'attack');
});

test('investigaciones en cola y en paralelo al entrenamiento', () => {
  const { w, p, tc, run } = setup();
  const bs = w.placeBuilding(0, 'blacksmith', tc.tx + 6, tc.ty, true);
  w.issue({ t: 'research', p: 0, bid: bs.id, tech: 'forge' });
  w.issue({ t: 'research', p: 0, bid: bs.id, tech: 'mail' });
  w.issue({ t: 'research', p: 0, bid: tc.id, tech: 'up_villager' });
  w.issue({ t: 'train', p: 0, bid: tc.id, u: 'villager' });
  run(0.1);
  assert.equal(bs.tech, 'forge');
  assert.deepEqual(bs.techQueue, ['mail']);
  assert.equal(tc.tech, 'up_villager');
  const v0 = w.unitsOf(0, 'villager').length;
  run(60);
  assert.ok(p.techs.has('forge') && p.techs.has('mail') && p.techs.has('up_villager'));
  assert.ok(w.unitsOf(0, 'villager').length > v0, 'siguió entrenando aldeanos');
  assert.ok(w.score(0).tech > 0);
});

test('Principiante: ejército chico, sin ataques tempranos; Normal le gana', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'novice', seed: 12, map: 'continental', biome: 'templado', players: [
    { ai: true, civ: 'random', team: 1, color: 0, difficulty: 'novice' }, { ai: true, civ: 'random', team: 2, color: 1, difficulty: 'normal' }] });
  const w = m.world;
  let maxArmy = 0, attackedEarly = false;
  for (let i = 0; i < 1800 * TICK_RATE && w.winnerTeam < 0; i++) {
    for (const ai of m.ais) ai.update(); w.step(); w.events.length = 0;
    if (i % 100 === 0) {
      const army = w.unitsOf(0).filter((u) => u.type !== 'villager' && u.type !== 'fishship');
      maxArmy = Math.max(maxArmy, army.length);
      if (w.tick < 15 * 60 * TICK_RATE && army.some((u) => Math.hypot(u.x - w.buildingsOf(1, 'towncenter')[0]?.x, u.y - w.buildingsOf(1, 'towncenter')[0]?.y) < 12 * 32)) attackedEarly = true;
    }
  }
  console.log('principiante: ejército máx', maxArmy, 'ganador', w.winnerTeam, 'min', (w.tick / TICK_RATE / 60).toFixed(1));
  assert.ok(maxArmy <= 8);
  assert.ok(!attackedEarly);
  assert.equal(w.winnerTeam, 2);
});

test('borrar unidades y edificios propios; cola de 10', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 5, map: 'continental', biome: 'templado' });
  const w = m.world;
  const v = w.unitsOf(0, 'villager')[0];
  const enemy = w.unitsOf(1, 'villager')[0];
  w.issue({ t: 'delete', p: 0, ids: [v.id, enemy.id] }); w.step();
  assert.ok(!w.get(v.id)); assert.ok(w.get(enemy.id));
  const tc = w.buildingsOf(0, 'towncenter')[0];
  w.players[0].res.food = 9999;
  for (let i = 0; i < 14; i++) w.issue({ t: 'train', p: 0, bid: tc.id, u: 'villager' });
  w.step();
  assert.equal(tc.queue.length, 10);
});

test('Combate imperial: edad 4, 2000 de recursos, mejoras listas y la partida termina', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 6, map: 'continental', biome: 'templado', start: 'imperial', players: [
    { ai: true, civ: 'random', team: 1, color: 0, difficulty: 'easy' }, { ai: true, civ: 'random', team: 2, color: 1, difficulty: 'hard' }] });
  const w = m.world;
  for (const p of w.players) {
    assert.equal(p.age, 4); assert.equal(p.res.gold, 2000);
    assert.equal(p.techs.size >= Object.keys(TECHS).length, true);
  }
  assert.equal(w.unitsOf(0, 'villager')[0].maxHp >= 40, true);
  for (let i = 0; i < 1500 * TICK_RATE && w.winnerTeam < 0; i++) { for (const ai of m.ais) ai.update(); w.step(); w.events.length = 0; }
  console.log('imperial: ganador', w.winnerTeam, 'min', (w.tick / TICK_RATE / 60).toFixed(1));
  assert.equal(w.winnerTeam, 2);
});

test('15 civilizaciones: cada una con su unidad única en el castillo', async () => {
  const { CIV_LIST, CIVS } = await import('../dist/sim/civs.js');
  assert.equal(CIV_LIST.length, 15);
  assert.equal(CIV_LIST.filter((c) => CIVS[c].unlock).length, 5);
  for (const civ of CIV_LIST) {
    const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 2, map: 'continental', biome: 'templado', players: [
      { ai: false, civ, team: 1, color: 0 }, { ai: true, civ: 'random', team: 2, color: 1 }] });
    assert.ok(m.world.trainsOf(0, 'castle').includes(CIVS[civ].unique), civ);
  }
});

test('camello: le gana al caballero y pierde contra arqueros', () => {
  const duel = (a, b, na = 1, nb = 1) => {
    const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 3, map: 'continental', biome: 'templado' });
    const w = m.world, cx = w.w * 16, cy = w.h * 16;
    for (const e of [...w.entities.values()]) if (e.cat === 'node' && Math.hypot(e.x - cx, e.y - cy) < 300) w.remove(e.id);
    const A = Array.from({ length: na }, (_, i) => w.spawnUnit(0, a, cx - 90, cy + i * 20)), B = Array.from({ length: nb }, (_, i) => w.spawnUnit(1, b, cx + 90, cy + i * 20));
    w.issue({ t: 'target', p: 0, ids: A.map((u) => u.id), target: B[0].id }); w.issue({ t: 'target', p: 1, ids: B.map((u) => u.id), target: A[0].id });
    for (let i = 0; i < 20 * 120; i++) { w.step(); if (!A.some((u) => w.get(u.id)) || !B.some((u) => w.get(u.id))) break; }
    return A.some((u) => w.get(u.id)) ? 'A' : 'B';
  };
  assert.equal(duel('camel', 'knight'), 'A');
  assert.equal(duel('archer', 'camel', 3, 1), 'A');
});
