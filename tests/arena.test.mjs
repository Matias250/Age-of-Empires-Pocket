// Puertas, murallas y mapa Arena.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, MAP_SIZES } from '../dist/sim/match.js';
import { TICK_RATE } from '../dist/sim/data.js';

test('Arena: cada jugador arranca amurallado con 2 puertas y 2 torres', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 3, map: 'arena', biome: 'templado' });
  const w = m.world;
  for (const p of [0, 1]) {
    assert.ok(w.buildingsOf(p, 'stonewall').length > 40, 'muralla');
    assert.equal(w.buildingsOf(p, 'gate').length, 1);
    const g = w.buildingsOf(p, 'gate')[0];
    assert.equal(g.fw * g.fh, 3, 'portón de 3 casillas');
    assert.equal(w.buildingsOf(p, 'tower').length, 2);
  }
});

test('las puertas dejan pasar solo al propio equipo', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 3, map: 'arena', biome: 'templado' });
  const w = m.world;
  const gate = w.buildingsOf(0, 'gate')[0];
  const i = gate.ty * w.w + gate.tx;
  assert.equal(w.teamGrid(w.players[0].team).solid[i], 0, 'abierta para su equipo');
  assert.equal(w.teamGrid(w.players[1].team).solid[i], 1, 'cerrada para el enemigo');
});

test('el enemigo rompe la muralla para llegar al centro urbano', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 3, map: 'arena', biome: 'templado' });
  const w = m.world;
  const tc = w.buildingsOf(0, 'towncenter')[0];
  const ids = [];
  for (let k = 0; k < 6; k++) ids.push(w.spawnUnit(1, 'champion', (w.w / 2 + k) * 32, (w.h / 2) * 32).id);
  w.issue({ t: 'target', p: 1, ids, target: tc.id });
  const walls0 = w.buildingsOf(0, 'stonewall').length + w.buildingsOf(0, 'gate').length;
  for (let s = 0; s < 120 * TICK_RATE; s++) w.step();
  const walls1 = w.buildingsOf(0, 'stonewall').length + w.buildingsOf(0, 'gate').length;
  assert.ok(walls1 < walls0, 'rompieron al menos un tramo');
});

test('se puede poner una puerta sobre la propia muralla', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 3, map: 'arena', biome: 'templado' });
  const w = m.world; const p = w.players[0];
  p.age = 2; p.explored.fill(1);
  const wall = w.buildingsOf(0, 'stonewall')[10];
  const vertical = w.canPlace(0, 'gate', wall.tx - 1, wall.ty) !== null;
  const gx = vertical ? wall.tx : wall.tx - 1, gy = vertical ? wall.ty - 1 : wall.ty;
  assert.equal(w.canPlace(0, 'gate', gx, gy, vertical), null);
  assert.notEqual(w.canPlace(1, 'gate', gx, gy, vertical), null, 'no sobre muralla ajena');
  const v = w.unitsOf(0, 'villager').map((u) => u.id);
  w.issue({ t: 'build', p: 0, ids: v, b: 'gate', tx: gx, ty: gy, vertical });
  w.step();
  assert.equal(w.get(w.occ[wall.ty * w.w + wall.tx]).type, 'gate');
});

test('el portón bloqueado no deja pasar ni a su equipo', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 3, map: 'arena', biome: 'templado' });
  const w = m.world;
  const gate = w.buildingsOf(0, 'gate')[0];
  const i = gate.ty * w.w + gate.tx;
  w.issue({ t: 'gateLock', p: 0, bid: gate.id }); w.step();
  assert.equal(w.teamGrid(w.players[0].team).solid[i], 1);
  w.issue({ t: 'gateLock', p: 0, bid: gate.id }); w.step();
  assert.equal(w.teamGrid(w.players[0].team).solid[i], 0);
});

test('tamaños de mapa', () => {
  for (const [k, d] of Object.entries(MAP_SIZES)) {
    const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 1, map: 'continental', size: k });
    assert.equal(m.world.w, d.tiles);
  }
});

test('Arena: Difícil vence a Fácil', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 5, map: 'arena', biome: 'templado', players: [
    { ai: true, civ: 'random', team: 1, color: 0, difficulty: 'easy' }, { ai: true, civ: 'random', team: 2, color: 1, difficulty: 'hard' }] });
  const w = m.world;
  for (let s = 0; s < 35 * 60 * TICK_RATE && w.winnerTeam < 0; s++) { for (const ai of m.ais) ai.update(); w.step(); w.events.length = 0; }
  console.log('arena ganador', w.winnerTeam, 'min', (w.tick / TICK_RATE / 60).toFixed(1));
  assert.equal(w.winnerTeam, 2);
});
