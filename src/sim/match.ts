// Creación de partidas: mapa, jugadores e IAs según el modo.
import { NodeType } from './data.js';
import { AI, Difficulty } from './ai.js';
import { World } from './world.js';
import { findPath } from './path.js';
import { Rng } from './rng.js';

export type Mode = 'skirmish' | 'coop' | 'tutorial' | 'aivsai';
export type MapType = 'continental' | 'rio' | 'lagos' | 'bosque' | 'oasis';
export type Biome = 'templado' | 'desierto' | 'nieve' | 'tropical' | 'otono';
export interface MatchConfig {
  mode: Mode; difficulty: Difficulty; seed: number;
  color?: number; map?: MapType | 'random'; biome?: Biome | 'random';
}
export interface Match { world: World; ais: AI[]; human: number; cfg: MatchConfig }

export const MAPS: Record<MapType, { name: string; desc: string }> = {
  continental: { name: 'Continental', desc: 'Campo abierto con bosques sueltos' },
  rio: { name: 'Río', desc: 'Un río divide los reinos; se cruza por vados' },
  lagos: { name: 'Lagos', desc: 'Lagos dispersos que cortan los caminos' },
  bosque: { name: 'Bosque cerrado', desc: 'Bosque denso con senderos angostos' },
  oasis: { name: 'Oasis', desc: 'Un lago central rodeado de riquezas' },
};
export const BIOMES: Record<Biome, string> = { templado: 'Templado', desierto: 'Desierto', nieve: 'Nieve', tropical: 'Tropical', otono: 'Otoño' };

export const PLAYER_COLORS = [
  { name: 'Azul', hex: '#3b82f6' }, { name: 'Rojo', hex: '#ef4444' }, { name: 'Verde', hex: '#22c55e' },
  { name: 'Amarillo', hex: '#eab308' }, { name: 'Violeta', hex: '#8b5cf6' }, { name: 'Naranja', hex: '#f97316' },
  { name: 'Celeste', hex: '#06b6d4' }, { name: 'Rosa', hex: '#ec4899' },
];
export const COLORS = PLAYER_COLORS.map((c) => c.hex);

interface Base { tx: number; ty: number }

function pick<T extends string>(v: T | 'random' | undefined, all: T[], rng: Rng, def: T): T {
  if (v === 'random') return all[Math.floor(rng.next() * all.length)];
  return v ?? def;
}

/** Colores: el del jugador primero, después los demás sin repetir */
function colorOrder(human: number): number[] {
  const out = [human];
  for (let i = 0; i < PLAYER_COLORS.length; i++) if (i !== human) out.push(i);
  return out;
}

export function createMatch(cfg: MatchConfig): Match {
  const rng = new Rng(cfg.seed);
  const biome = pick(cfg.biome, Object.keys(BIOMES) as Biome[], rng, 'templado');
  const colors = colorOrder(cfg.color ?? 0);
  if (cfg.mode === 'tutorial') return createTutorialMap(cfg, biome, colors);
  const map = pick(cfg.map, Object.keys(MAPS) as MapType[], rng, 'continental');
  const size = cfg.mode === 'coop' ? 60 : 48;
  const w = new World(size, size, cfg.seed);
  w.biome = biome; w.mapName = map;
  const ais: AI[] = [];
  let bases: Base[];
  const pc = (i: number) => PLAYER_COLORS[colors[i]];
  if (cfg.mode === 'coop') {
    // equipo 0 a la izquierda, equipo 1 a la derecha
    w.addPlayer('Vos', 0, pc(0).hex, false);
    w.addPlayer(`Reino ${pc(1).name}`, 1, pc(1).hex, true);
    w.addPlayer(`Aliado ${pc(2).name}`, 0, pc(2).hex, true);
    w.addPlayer(`Reino ${pc(3).name}`, 1, pc(3).hex, true);
    bases = [{ tx: 8, ty: 44 }, { tx: 46, ty: 8 }, { tx: 8, ty: 8 }, { tx: 46, ty: 44 }];
  } else {
    w.addPlayer('Vos', 0, pc(0).hex, cfg.mode === 'aivsai');
    w.addPlayer(`Reino ${pc(1).name}`, 1, pc(1).hex, true);
    bases = [{ tx: 7, ty: 37 }, { tx: 37, ty: 7 }];
  }
  const reserved = (x: number, y: number, r = 9) => bases.some((b) => Math.hypot(x - b.tx - 1.5, y - b.ty - 1.5) < r);

  // 1) agua según el tipo de mapa (antes de las bases)
  if (map === 'rio') makeRiver(w, rng, cfg.mode === 'coop', reserved);
  if (map === 'lagos') makeLakes(w, rng, reserved);
  if (map === 'oasis') makeOasis(w, rng);

  // 2) bases
  bases.forEach((b, i) => makeBase(w, i, b, rng));

  // 3) bosques y recursos compartidos
  if (map === 'bosque') {
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++) {
        if (reserved(x, y, 10)) continue;
        const n = Math.sin(x * 0.45) * Math.cos(y * 0.38) + Math.sin((x + y) * 0.21) * 0.6 + rng.next() * 0.5;
        if (n > 0.05) w.addNode('tree', x, y);
      }
  }
  const forests = { continental: 11, rio: 8, lagos: 8, bosque: 40, oasis: 9 }[map] * (cfg.mode === 'coop' ? 1.4 : 1);
  scatterForests(w, rng, reserved, Math.round(forests));
  const c = Math.floor(size / 2);
  if (map === 'oasis') {
    cluster(w, rng, 'goldmine', c - 8, c - 1, 6); cluster(w, rng, 'goldmine', c + 7, c, 6);
    cluster(w, rng, 'stonemine', c, c - 8, 4); cluster(w, rng, 'stonemine', c, c + 7, 4);
  } else {
    cluster(w, rng, 'goldmine', c - 2, c - 2, 5);
    cluster(w, rng, 'stonemine', c + 2, c + 2, 3);
    cluster(w, rng, 'berries', c + 3, c - 3, 5);
  }
  // 4) asegurar que todos puedan llegar a todos
  for (let i = 1; i < bases.length; i++) ensurePath(w, bases[0], bases[i]);
  if (map === 'bosque') for (const b of bases) carve(w, b, { tx: c - 1, ty: c - 1 });

  for (const p of w.players) {
    if (p.isAI) {
      const diff = cfg.mode === 'coop' && p.team === 0 ? 'normal' : cfg.difficulty;
      ais.push(new AI(w, p.id, diff));
    }
  }
  w.refreshVisibility();
  return { world: w, ais, human: 0, cfg };
}

function makeRiver(w: World, rng: Rng, vertical: boolean, reserved: (x: number, y: number, r?: number) => boolean) {
  const n = vertical ? w.h : w.w;
  const fords = [0.22, 0.5, 0.78].map((f) => Math.floor(n * f));
  let wob = 0;
  for (let t = 0; t < n; t++) {
    wob += (rng.next() - 0.5) * 0.8; wob = Math.max(-3, Math.min(3, wob));
    const isFord = fords.some((f) => Math.abs(f - t) <= 1);
    for (let k = -2; k <= 1; k++) {
      let x: number, y: number;
      if (vertical) { x = Math.floor(w.w / 2 + wob) + k; y = t; }
      else { x = t + Math.round(wob) + k; y = t; } // diagonal principal: separa abajo-izquierda de arriba-derecha
      if (reserved(x, y, 7)) continue;
      w.setWater(x, y, isFord ? 2 : 1);
      if (!vertical) w.setWater(x + 1, y, isFord ? 2 : 1);
    }
  }
}

function lake(w: World, rng: Rng, cx: number, cy: number, r: number) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x - cx, y - cy) + Math.sin(x * 1.7 + y) * 0.6 + rng.next() * 0.4;
      if (d < r) w.setWater(x, y, 1);
    }
}

function makeLakes(w: World, rng: Rng, reserved: (x: number, y: number, r?: number) => boolean) {
  let made = 0;
  for (let tries = 0; tries < 60 && made < (w.w > 50 ? 7 : 5); tries++) {
    const x = rng.int(5, w.w - 6), y = rng.int(5, w.h - 6), r = 2 + rng.next() * 2.2;
    if (reserved(x, y, 12 + r)) continue;
    lake(w, rng, x, y, r);
    made++;
  }
}

function makeOasis(w: World, rng: Rng) {
  const c = w.w / 2;
  lake(w, rng, c, c, 4.5);
  // palmeras alrededor
  for (let i = 0; i < 26; i++) {
    const a = rng.next() * Math.PI * 2, d = 6 + rng.next() * 1.5;
    w.addNode('tree', Math.round(c + Math.cos(a) * d), Math.round(c + Math.sin(a) * d));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    w.addNode('berries', Math.round(c + Math.cos(a) * 5.6), Math.round(c + Math.sin(a) * 5.6));
  }
}

/** Si no hay camino entre dos bases, abre un sendero (vado + tala) en línea recta. */
function ensurePath(w: World, a: Base, b: Base) {
  const sx = a.tx + 1, sy = a.ty + 3, gx = b.tx + 1, gy = b.ty + 3;
  const s0 = w.nearestFree(sx, sy), g0 = w.nearestFree(gx, gy);
  if (!s0 || !g0) return;
  const path = findPath(w, s0.x, s0.y, (x, y) => Math.abs(x - g0.x) <= 2 && Math.abs(y - g0.y) <= 2, g0.x, g0.y, 20000);
  const end = path[path.length - 1];
  if (end && Math.abs(end.x - g0.x) <= 2 && Math.abs(end.y - g0.y) <= 2) return;
  carve(w, a, b);
}

function carve(w: World, a: Base, b: Base) {
  const sx = a.tx + 1, sy = a.ty + 3, gx = b.tx + 1, gy = b.ty + 3;
  const steps = Math.max(Math.abs(gx - sx), Math.abs(gy - sy));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(sx + (gx - sx) * i / steps), y = Math.round(sy + (gy - sy) * i / steps);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) w.clearTile(x + dx, y + dy);
  }
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
function createTutorialMap(cfg: MatchConfig, biome: Biome, colors: number[]): Match {
  const rng = new Rng(7);
  const w = new World(44, 36, 7);
  w.biome = biome;
  w.addPlayer('Varnia', 0, PLAYER_COLORS[colors[0]].hex, false);
  const crows = w.addPlayer('Cuervos Negros', 1, colors[0] === 4 ? '#ef4444' : '#7c3aed', true);
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

