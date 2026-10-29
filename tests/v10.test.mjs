// Reliquias, comercio con aliados, chat con la IA e historias de solo ejército.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../dist/sim/match.js';
import { AI } from '../dist/sim/ai.js';
import { ALL_SCENARIOS, createScenario, ScenarioState } from '../dist/sim/campaigns.js';
import { TICK_RATE } from '../dist/sim/data.js';

const run = (w, ais, secs) => { for (let i = 0; i < secs * TICK_RATE; i++) { for (const a of ais) a.update(); w.step(); w.events.length = 0; } };

test('reliquias según el tamaño del mapa', () => {
  for (const [size, n] of [['tiny', 3], ['small', 4], ['medium', 5], ['large', 6]]) {
    const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 4, map: 'continental', size });
    assert.equal(m.world.relics.length, n, size);
  }
});

test('el monje lleva la reliquia al monasterio y da 1 de oro por segundo', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 4, map: 'continental', biome: 'templado' });
  const w = m.world;
  w.players[0].age = 3;
  const tc = w.buildingsOf(0, 'towncenter')[0];
  let mon;
  for (let k = 0; k < 200 && !mon; k++) { const x = tc.tx + 4 + (k % 10), y = tc.ty - 5 + Math.floor(k / 10); if (!w.canPlace(0, 'monastery', x, y)) mon = w.placeBuilding(0, 'monastery', x, y, true); }
  const r = w.relics[0];
  const monk = w.spawnUnit(0, 'monk', r.x + 60, r.y);
  w.issue({ t: 'relic', p: 0, ids: [monk.id], relic: r.id });
  for (let i = 0; i < 400 * TICK_RATE && !r.holder; i++) { w.step(); w.events.length = 0; }
  assert.equal(r.holder, mon.id);
  const g0 = w.players[0].res.gold;
  run(w, [], 10);
  assert.ok(Math.abs(w.players[0].res.gold - g0 - 10) < 0.5, `oro ${w.players[0].res.gold - g0}`);
  assert.equal(w.relicsOf(0), 1);
  // si destruyen el monasterio, la reliquia cae
  mon.hp = 0; w.step();
  assert.equal(r.holder, undefined);
});

test('comercio: solo con aliados, la carreta vuelve con oro', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: 6, map: 'continental', biome: 'templado', size: 'small', players: [
    { ai: false, civ: 'francos', team: 1, color: 0 }, { ai: true, civ: 'francos', team: 1, color: 1 }, { ai: true, civ: 'francos', team: 2, color: 2 }] });
  const w = m.world;
  for (const p of [0, 1]) w.players[p].age = 2;
  const place = (p) => { const tc = w.buildingsOf(p, 'towncenter')[0]; for (let k = 0; k < 300; k++) { const x = tc.tx + 5 + (k % 12), y = tc.ty - 6 + Math.floor(k / 12); const pl = w.players[p]; const ex = pl.explored; pl.explored = new Uint8Array(w.w * w.h).fill(1); const bad = w.canPlace(p, 'market', x, y); pl.explored = ex; if (!bad) return w.placeBuilding(p, 'market', x, y, true); } };
  const mine = place(0);
  w.players[0].res.wood = 1000; w.players[0].res.gold = 1000;
  // sin mercado aliado no se puede
  w.issue({ t: 'train', p: 0, bid: mine.id, u: 'tradecart' }); w.step();
  assert.equal(mine.queue.length, 0);
  const theirs = place(1);
  w.issue({ t: 'train', p: 0, bid: mine.id, u: 'tradecart' }); w.step();
  assert.equal(mine.queue.length, 1);
  const g0 = w.players[0].res.gold;
  for (let i = 0; i < 300 * TICK_RATE && w.players[0].res.gold <= g0; i++) { w.step(); w.events.length = 0; }
  const cart = w.unitsOf(0, 'tradecart')[0];
  assert.ok(cart && cart.order?.t === 'trade' && cart.order.dest === theirs.id);
  assert.ok(w.players[0].res.gold > g0, 'ganó oro');
  // con un enemigo no se comercia
  assert.equal(w.orderFor(cart, w.buildingsOf(2, 'towncenter')[0])?.t === 'trade', false);
});

test('chat: la IA aliada obedece y manda recursos; la enemiga provoca', () => {
  const m = createMatch({ mode: 'skirmish', difficulty: 'normal', seed: 8, map: 'continental', size: 'small', players: [
    { ai: false, civ: 'francos', team: 1, color: 0 }, { ai: true, civ: 'francos', team: 1, color: 1 }, { ai: true, civ: 'francos', team: 2, color: 2 }] });
  const w = m.world;
  const ally = m.ais.find((a) => a.p === 1);
  w.players[1].res.gold = 600;
  const g0 = w.players[0].res.gold;
  w.issue({ t: 'chat', p: 0, to: 'allies', text: 'Mándenme oro' });
  w.issue({ t: 'chat', p: 0, to: 'all', text: 'No ataquen todavía' });
  const replies = [];
  for (let i = 0; i < 10 * TICK_RATE; i++) { for (const a of m.ais) a.update(); w.step(); for (const e of w.events) if (e.t === 'chat' && e.from !== 0) replies.push([e.from, e.text]); w.events.length = 0; }
  assert.ok(w.players[0].res.gold >= g0 + 100, 'tributo');
  assert.equal(ally.chatOrder, 'hold');
  assert.ok(replies.some(([f]) => f === 2), 'el enemigo contesta');
  w.issue({ t: 'chat', p: 0, to: 1, text: '¡Ataquen!' });
  run(w, m.ais, 5);
  assert.equal(ally.chatOrder, 'attack');
});

test('historias de solo ejército y soldados sin dueño', () => {
  const army = ALL_SCENARIOS.filter((s) => s.armyOnly);
  assert.ok(army.length >= 6);
  for (const scn of army) {
    const m = createScenario(scn);
    const w = m.world;
    assert.equal(w.buildingsOf(0).length, 0, scn.id + ' sin edificios');
    assert.equal(w.unitsOf(0, 'villager').length, 0);
    const np = w.players.find((p) => p.neutral);
    assert.ok(np && w.unitsOf(np.id).length > 0, 'hay soldados sin dueño');
    const st = new ScenarioState(w, scn);
    // el héroe pasa cerca de los grises → se unen
    const hero = w.get(st.heroId);
    const target = w.unitsOf(np.id)[0];
    const before = w.unitsOf(0).length;
    hero.x = target.x + 30; hero.y = target.y;
    for (let i = 0; i < 10; i++) { w.step(); st.step(); }
    assert.ok(w.unitsOf(0).length > before, scn.id + ' reclutó');
    assert.ok(!w.isEnemy(1, np.id));
    // perder a todo el ejército es derrota (aunque no haya Centro Urbano)
    for (const u of w.unitsOf(0)) if (u.id !== st.heroId) u.hp = 0;
    run(w, [], 2);
    assert.equal(w.players[0].defeated, false);
  }
});
