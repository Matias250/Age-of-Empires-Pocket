// Cada tipo de mapa debe poder jugarse hasta el final (bases conectadas, IA funcional).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../dist/sim/match.js';
import { AI } from '../dist/sim/ai.js';
import { TICK_RATE } from '../dist/sim/data.js';

for (const map of ['continental', 'rio', 'lagos', 'bosque', 'oasis']) {
  test(`mapa ${map}: Difícil vence a Fácil`, () => {
    const m = createMatch({ mode: 'aivsai', difficulty: 'easy', seed: 21, map, biome: 'random' });
    m.ais[1] = new AI(m.world, 1, 'hard');
    const w = m.world;
    for (let i = 0; i < 1500 * TICK_RATE && w.winnerTeam < 0; i++) { for (const ai of m.ais) ai.update(); w.step(); w.events.length = 0; }
    const p = w.players[1];
    console.log(map, w.biome, 'ganador', w.winnerTeam, 'min', (w.tick / TICK_RATE / 60).toFixed(1), 'techs', [...p.techs].join(','));
    assert.equal(w.winnerTeam, 1);
  });
}
