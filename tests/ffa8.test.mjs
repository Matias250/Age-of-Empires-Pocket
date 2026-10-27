// Partida de 8 IAs: tiene que terminar y correr rápido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../dist/sim/match.js';
import { TICK_RATE } from '../dist/sim/data.js';

test('4 contra 4 con 8 IAs termina con un ganador', () => {
  const players = Array.from({ length: 8 }, (_, i) => ({ ai: true, civ: 'random', team: i < 4 ? 1 : 2, color: i, difficulty: i < 4 ? 'hard' : 'easy' }));
  const m = createMatch({ mode: 'skirmish', difficulty: 'normal', seed: 12, map: 'random', biome: 'random', players });
  const w = m.world;
  const t0 = performance.now();
  for (let i = 0; i < 30 * 60 * TICK_RATE && w.winnerTeam < 0; i++) { for (const ai of m.ais) ai.update(); w.step(); w.events.length = 0; }
  const ms = (performance.now() - t0) / w.tick;
  console.log('mapa', w.mapName, 'ganador', w.winnerTeam, 'min', (w.tick / TICK_RATE / 60).toFixed(1), 'ms/tick', ms.toFixed(2));
  assert.equal(w.winnerTeam, 1);
  assert.ok(ms < 5, 'la simulación debe ser liviana');
});
