// Creación de partidas: mapa, jugadores e IAs según el modo.
import { NodeType, TILE } from './data.js';
import { AI, Difficulty } from './ai.js';
import { World } from './world.js';
import { Rng } from './rng.js';

export type Mode = 'skirmish' | 'coop' | 'tutorial' | 'aivsai';
export interface MatchConfig { mode: Mode; difficulty: Difficulty; seed: number }
export interface Match { world: World; ais: AI[]; human: number; cfg: MatchConfig }

export const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308'];

interface Base { tx: number; ty: number }

export function createMatch(cfg: MatchConfig): Match {
  const rng = new Rng(cfg.seed);
  if (cfg.mode === 'tutorial') return createTutorialMap(cfg);
  const size = cfg.mode === 'coop' ? 60 : 48;
  const w = new World(size, size, cfg.seed);
  const ais: AI[] = [];
  let bases: Base[];
  if (cfg.mode === 'coop') {
    w.addPlayer('Vos', 0, COLORS[0], false);
    w.addPlayer('Reino Rojo', 1, COLORS[1], true);
    w.addPlayer('Aliado Verde', 0, COLORS[2], true);
    w.addPlayer('Reino Amarillo', 1, COLORS[3], true);
    bases = [{ tx: 8, ty: 44 }, { tx: 46, ty: 8 }, { tx: 8, ty: 8 }, { tx: 46, ty: 44 }];
  } else {
    w.addPlayer('Vos', 0, COLORS[0], cfg.mode === 'aivsai');
    w.addPlayer('Reino Rojo', 1, COLORS[1], true);
    bases = [{ tx: 7, ty: 37 }, { tx: 37, ty: 7 }];
  }
  // reservar zonas de base antes de esparcir bosques
  const reserved = (x: number, y: number) => bases.some((b) => Math.hypot(x - b.tx - 1.5, y - b.ty - 1.5) < 9);
  bases.forEach((b, i) => makeBase(w, i, b, rng));
  scatterForests(w, rng, reserved, cfg.mode === 'coop' ? 16 : 11);
  // recursos en el centro (para pelear por ellos)
  const c = Math.floor(size / 2);
  cluster(w, rng, 'goldmine', c - 2, c - 2, 5);
  cluster(w, rng, 'stonemine', c + 2, c + 2, 3);
  cluster(w, rng, 'berries', c + 3, c - 3, 5);

  for (const p of w.players) {
    if (p.isAI) {
      // El aliado del jugador en coop juega en "normal" para no hacer todo solo
      const diff = cfg.mode === 'coop' && p.team === 0 ? 'normal' : cfg.difficulty;
      ais.push(new AI(w, p.id, diff));
    }
  }
  w.refreshVisibility();
  return { world: w, ais, human: 0, cfg };
}

function makeBase(w: World, p: number, b: Base, rng: Rng) {
  const tc = w.placeBuilding(p, 'towncenter', b.tx, b.ty, true);
  const cx = b.tx + 1.5, cy = b.ty + 1.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    w.spawnUnit(p, 'villager', tc.x + Math.cos(a) * 62, tc.y + Math.sin(a) * 62);
  }
  // dirección hacia el centro del mapa
  const toC = Math.atan2(w.h / 2 - cy, w.w / 2 - cx);
  const at = (ang: number, dist: number) => ({ x: Math.round(cx + Math.cos(ang) * dist), y: Math.round(cy + Math.sin(ang) * dist) });
  const ber = at(toC + Math.PI / 2, 5.5);
  cluster(w, rng, 'berries', ber.x, ber.y, 6);
  const gold = at(toC - Math.PI / 2, 7.5);
  cluster(w, rng, 'goldmine', gold.x, gold.y, 6);
  const stone = at(toC - Math.PI * 0.9, 8);
  cluster(w, rng, 'stonemine', stone.x, stone.y, 4);
  const wood = at(toC + Math.PI * 0.85, 9);
  forest(w, rng, wood.x, wood.y, 32);
  const wood2 = at(toC + Math.PI * 0.2, 11);
  forest(w, rng, wood2.x, wood2.y, 16);
}

function cluster(w: World, rng: Rng, type: NodeType, x: number, y: number, n: number) {
  let placed = 0, tries = 0;
  const cells = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 0], [0, 2], [-1, 1], [1, -1], [2, 1], [1, 2]];
  while (placed < n && tries < 60) {
    const c = cells[tries % cells.length];
    const ox = tries < cells.length ? 0 : rng.int(-1, 1), oy = tries < cells.length ? 0 : rng.int(-1, 1);
    if (w.addNode(type, x + c[0] + ox, y + c[1] + oy)) placed++;
    tries++;
  }
}

function forest(w: World, rng: Rng, x: number, y: number, n: number, reserved?: (x: number, y: number) => boolean) {
  let px = x, py = y;
  for (let i = 0; i < n * 3 && n > 0; i++) {
    if (!reserved || !reserved(px, py)) if (w.addNode('tree', px, py)) n--;
    px += rng.int(-1, 1); py += rng.int(-1, 1);
    if (Math.hypot(px - x, py - y) > 4) { px = x + rng.int(-2, 2); py = y + rng.int(-2, 2); }
  }
}

function scatterForests(w: World, rng: Rng, reserved: (x: number, y: number) => boolean, count: number) {
  for (let i = 0; i < count; i++) {
    const x = rng.int(2, w.w - 3), y = rng.int(2, w.h - 3);
    if (reserved(x, y)) continue;
    forest(w, rng, x, y, rng.int(8, 22), reserved);
  }
  // borde del mapa con algo de bosque para darle forma
  for (let i = 0; i < w.w; i += 1) {
    if (rng.next() < 0.5 && !reserved(i, 0)) w.addNode('tree', i, 0);
    if (rng.next() < 0.5 && !reserved(i, w.h - 1)) w.addNode('tree', i, w.h - 1);
    if (rng.next() < 0.5 && !reserved(0, i)) w.addNode('tree', 0, i);
    if (rng.next() < 0.5 && !reserved(w.w - 1, i)) w.addNode('tree', w.w - 1, i);
  }
}

/** Mapa fijo del modo historia */
function createTutorialMap(cfg: MatchConfig): Match {
  const rng = new Rng(7);
  const w = new World(44, 36, 7);
  w.addPlayer('Varnia', 0, COLORS[0], false);
  const crows = w.addPlayer('Cuervos Negros', 1, '#7c3aed', true);
  crows.res = { food: 0, wood: 0, gold: 0, stone: 0 };
  const home: Base = { tx: 7, ty: 24 };
  makeBase(w, 0, home, rng);
  // quitar un aldeano: la historia arranca con 3
  const v = w.unitsOf(0, 'villager');
  w.entities.delete(v[3].id);
  // Fortín de los Cuervos (centro urbano debilitado)
  const fort = w.placeBuilding(1, 'towncenter', 35, 5, true);
  fort.maxHp = fort.hp = 550;
  w.placeBuilding(1, 'house', 31, 4, true);
  w.placeBuilding(1, 'house', 38, 10, true);
  for (let i = 0; i < 3; i++) w.spawnUnit(1, 'militia', fort.x - 50 + i * 22, fort.y + 70);
  forest(w, rng, 20, 14, 30);
  forest(w, rng, 26, 28, 20);
  forest(w, rng, 3, 3, 20);
  forest(w, rng, 40, 30, 20);
  for (let i = 0; i < w.w; i++) { w.addNode('tree', i, 0); w.addNode('tree', i, w.h - 1); }
  for (let i = 0; i < w.h; i++) { w.addNode('tree', 0, i); w.addNode('tree', w.w - 1, i); }
  w.refreshVisibility();
  return { world: w, ais: [], human: 0, cfg };
}

export { TILE };
