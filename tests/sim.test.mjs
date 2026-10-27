// Pruebas de la simulación sin pantalla: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../dist/sim/match.js';
import { TICK_RATE } from '../dist/sim/data.js';

function run(match, seconds) {
  const { world, ais } = match;
  for (let i = 0; i < seconds * TICK_RATE && world.winnerTeam < 0; i++) {
    for (const ai of ais) ai.update();
    world.step();
    world.events.length = 0;
  }
  return world;
}

for (const diff of ['easy', 'normal', 'hard']) {
  test(`IA ${diff}: la economía crece en 5 minutos`, () => {
    const m = createMatch({ mode: 'aivsai', difficulty: diff, seed: 42 });
    const w = run(m, 300);
    const p = w.players[1];
    const vills = w.unitsOf(1, 'villager').length;
    const g = p.stats.gathered;
    console.log(diff, { vills, army: w.unitsOf(1).length - vills, age: p.age, gathered: g, buildings: w.buildingsOf(1).map(b => b.type).join(',') });
    assert.ok(vills >= 10, 'debería tener al menos 10 aldeanos');
    assert.ok(g.food + g.wood > 1100, 'debería haber recolectado recursos');
  });
}

test('Difícil le gana a Fácil', () => {
  const m = createMatch({ mode: 'aivsai', difficulty: 'easy', seed: 7 });
  // jugador 0 = IA fácil, jugador 1 = IA (reemplazamos por difícil)
  const { AI } = m.ais[0].constructor ? { AI: m.ais[0].constructor } : {};
  m.ais[1] = new AI(m.world, 1, 'hard');
  const w = run(m, 1500);
  console.log('ganador equipo', w.winnerTeam, 'minuto', (w.tick / TICK_RATE / 60).toFixed(1));
  assert.equal(w.winnerTeam, 2);
});

test('Modo coop 2v2 arranca y progresa', () => {
  const m = createMatch({ mode: 'coop', difficulty: 'normal', seed: 3 });
  const w = run(m, 120);
  assert.equal(w.players.length, 4);
  assert.ok(w.unitsOf(2, 'villager').length > 4);
});
