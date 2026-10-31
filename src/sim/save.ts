// Guardar y cargar una partida en curso (foto completa del estado de la simulación).
import { World } from './world.js';
import { AI } from './ai.js';
import { Rng } from './rng.js';
import { ScenarioState, Scenario } from './campaigns.js';
import type { Match } from './match.js';
import { restore, snapshot } from './snapshot.js';

const CLASSES = { World, AI, Rng, ScenarioState };
const SKIP = { World: ['ownUnits', 'ownBuildings', 'popCache', 'capCache', 'buckets', 'allBuildings', 'teamGrids', 'unreachable', 'events', 'landReg'] };

export interface SavedGame<X = unknown> { match: Match; story?: ScenarioState; extra?: X }

export function saveGame<X>(s: SavedGame<X>, scn?: Scenario): string {
  const externals = new Map<object, string>();
  if (scn) externals.set(scn, 'scn');
  return snapshot(s, { classes: CLASSES, skip: SKIP, externals });
}

export function loadGame<X>(json: string, scn?: Scenario): SavedGame<X> {
  const s = restore<SavedGame<X>>(json, { classes: CLASSES, skip: SKIP, externalsById: scn ? { scn } : {} });
  s.match.world.afterRestore();
  return s;
}
