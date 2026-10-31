import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../dist/sim/match.js';
import { saveGame, loadGame } from '../dist/sim/save.js';
import { createScenario, findScenario, scaleScenario, ScenarioState } from '../dist/sim/campaigns.js';

const hash = (w) => {
  let h = w.tick * 7 + w.entities.size;
  for (const e of w.entities.values()) h = (h * 31 + Math.round(e.x * 10) + Math.round(e.y * 10) * 3 + Math.round(e.hp * 10) * 7) % 1e12;
  for (const p of w.players) h = (h * 17 + Math.round(p.res.food + p.res.wood * 3 + p.res.gold * 5 + p.res.stone * 7)) % 1e12;
  return h;
};
const run = (m, s) => { for (let i = 0; i < s * 20; i++) { for (const ai of m.ais) ai.update(); m.world.step(); } };

test('guardar y cargar una partida sigue exactamente igual', () => {
  const players = [0, 1, 2, 3].map((i) => ({ ai: true, civ: 'random', team: (i % 2) + 1, color: i, difficulty: 'hard' }));
  const m = createMatch({ mode: 'skirmish', difficulty: 'hard', seed: 11, map: 'costa', biome: 'templado', size: 'medium', players });
  run(m, 240);
  const json = saveGame({ match: m, extra: { cam: { x: 1, y: 2 } } });
  const back = loadGame(json);
  assert.equal(back.extra.cam.y, 2);
  assert.equal(hash(back.match.world), hash(m.world));
  run(m, 120); run(back.match, 120);
  assert.equal(hash(back.match.world), hash(m.world), 'después de cargar sigue idéntica');
  assert.ok(json.length < 4_000_000, 'tamaño ' + json.length);
});

test('guardar una historia en curso', () => {
  const f = findScenario('juana1');
  const scn = scaleScenario(f.scn, 'normal');
  const m = createScenario(scn, 0);
  const st = new ScenarioState(m.world, scn);
  const step = (mm, ss, s) => { for (let i = 0; i < s * 20; i++) { for (const ai of mm.ais) ai.update(); mm.world.step(); ss.step(); } };
  step(m, st, 60);
  const back = loadGame(saveGame({ match: m, story: st }, scn), scn);
  assert.equal(back.story.scn, scn);
  step(m, st, 60); step(back.match, back.story, 60);
  assert.equal(hash(back.match.world), hash(m.world));
  assert.equal(back.story.progress(), st.progress());
});

test('las repeticiones: re-simular con los comandos grabados da el mismo resultado', () => {
  const cfg = { mode: 'skirmish', difficulty: 'normal', seed: 21, map: 'continental', biome: 'templado' };
  const m = createMatch(cfg); const w = m.world; w.recordFor = m.human;
  const tc = w.buildingsOf(m.human, 'towncenter')[0];
  for (let s = 0; s < 120; s++) {
    if (s % 10 === 0) w.issue({ t: 'train', p: m.human, bid: tc.id, u: 'villager' });
    if (s === 30) { const v = w.unitsOf(m.human, 'villager')[0]; w.issue({ t: 'move', p: m.human, ids: [v.id], x: tc.x + 200, y: tc.y }); }
    run(m, 1);
  }
  const log = w.cmdLog.slice();
  const r = createMatch(cfg); const rw = r.world; rw.lockedFor = r.human;
  let k = 0;
  for (let i = 0; i < 120 * 20; i++) {
    while (k < log.length && log[k].tick === rw.tick) rw.inject(log[k++].c);
    for (const ai of r.ais) ai.update(); rw.step();
  }
  assert.equal(hash(rw), hash(w));
});
