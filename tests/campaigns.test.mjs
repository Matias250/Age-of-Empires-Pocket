// Historias: los 25 escenarios se arman bien y su objetivo funciona.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGNS, ALL_SCENARIOS, createScenario, ScenarioState } from '../dist/sim/campaigns.js';
import { TICK_RATE } from '../dist/sim/data.js';

test('7 campañas y 25 escenarios con 3 o 4 cada una', () => {
  assert.equal(CAMPAIGNS.length, 7);
  assert.equal(ALL_SCENARIOS.length, 25);
  for (const c of CAMPAIGNS) assert.ok(c.scenarios.length >= 3 && c.scenarios.length <= 4, c.id);
  assert.equal(new Set(ALL_SCENARIOS.map((s) => s.id)).size, 25);
});

for (const scn of ALL_SCENARIOS) {
  test(`escenario ${scn.id}: se arma y corre 3 minutos`, () => {
    const m = createScenario(scn, 4);
    const w = m.world;
    const st = new ScenarioState(w, scn);
    if (scn.hero) assert.ok(st.heroId > 0, 'héroe');
    if (scn.goal.t === 'destroy') assert.ok(st.targets.length > 0, 'objetivos a destruir');
    for (const e of scn.enemies) for (const [t, n] of e.build ?? []) {
      const p = 1 + (scn.allies?.length ?? 0) + scn.enemies.indexOf(e);
      assert.ok(w.buildingsOf(p, t).length >= Math.min(1, n), `${t} enemigo`);
    }
    let status = null, waves = 0;
    for (let i = 0; i < 180 * TICK_RATE && !status; i++) {
      for (const ai of m.ais) ai.update();
      w.step();
      status = st.step();
      waves += st.events.filter((e) => e.startsWith('⚔️')).length; st.events.length = 0;
      w.events.length = 0;
    }
    if (scn.waves && scn.waves.from < 170) assert.ok(waves > 0, 'oleadas');
    console.log(scn.id, 'estado', status, 'progreso', st.progress(), 'oleadas', waves, 'mapa', w.w);
  });
}

test('objetivos: sobrevivir, juntar y destruir dan la victoria', () => {
  const surv = ALL_SCENARIOS.find((s) => s.goal.t === 'survive');
  const m = createScenario({ ...surv, waves: undefined, goal: { t: 'survive', min: 0.05 } });
  const st = new ScenarioState(m.world, { ...surv, waves: undefined, goal: { t: 'survive', min: 0.05 } });
  let r = null; for (let i = 0; i < 200 && !r; i++) { m.world.step(); r = st.step(); }
  assert.equal(r, 'win');
  const gat = ALL_SCENARIOS.find((s) => s.goal.t === 'gather');
  const m2 = createScenario(gat); const st2 = new ScenarioState(m2.world, gat);
  m2.world.players[0].res[gat.goal.res] = gat.goal.n; m2.world.step();
  assert.equal(st2.step(), 'win');
  const des = ALL_SCENARIOS.find((s) => s.goal.t === 'destroy');
  const m3 = createScenario(des); const st3 = new ScenarioState(m3.world, des);
  for (const id of st3.targets) m3.world.get(id).hp = 0;
  m3.world.step();
  assert.equal(st3.step(), 'win');
  // si muere el héroe se pierde
  const m4 = createScenario(des); const st4 = new ScenarioState(m4.world, des);
  m4.world.get(st4.heroId).hp = 0; m4.world.step();
  assert.equal(st4.step(), 'lose');
});
