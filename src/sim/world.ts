// Simulación determinista del juego. No conoce nada de pantallas ni input:
// solo recibe Comandos y avanza de a ticks fijos. Esto permite, en una etapa
// siguiente, jugar online con "lockstep" enviando solo los comandos.

import {
  AGE_UP, BUILDINGS, BUILDING_ARMOR, BuildingType, CARRY, DT, FARM_RATE, MAX_POP, NODES, NodeType,
  Res, ResBag, RES_LIST, TICK_RATE, TILE, UNITS, UnitType, ArmorClass, START_RES, TECHS, TechType, TRADE,
} from './data.js';
import { findPath, Grid, lineClear } from './path.js';
import { Rng } from './rng.js';

export type Order =
  | { t: 'move'; x: number; y: number }
  | { t: 'attackMove'; x: number; y: number; sub?: number }
  | { t: 'attack'; target: number }
  | { t: 'gather'; target: number; res: Res; phase: 'go' | 'return' }
  | { t: 'build'; target: number }
  | { t: 'heal'; target: number };

export interface Entity {
  id: number;
  cat: 'unit' | 'building' | 'node';
  type: UnitType | BuildingType | NodeType;
  owner: number;
  x: number; y: number;
  tx: number; ty: number; size: number;
  hp: number; maxHp: number;
  radius: number;
  // unidades
  order?: Order;
  path: { x: number; y: number }[];
  pathKey: string;
  repathAt: number;
  carryRes?: Res; carry: number; gatherAcc: number;
  cooldown: number;
  lastHitBy: number;
  acquireAt: number;
  facing: number;
  lastNode: number;
  // edificios
  progress: number;
  queue: UnitType[]; trainT: number; ageT: number;
  tech?: TechType; techT: number;
  rally?: { x: number; y: number; target?: number };
  // nodos / granjas
  amount: number;
}

export interface Player {
  id: number; team: number; name: string; color: string;
  isAI: boolean;
  res: ResBag;
  age: 1 | 2;
  techs: Set<TechType>;
  defeated: boolean;
  gatherMult: number;
  explored: Uint8Array; visible: Uint8Array;
  stats: { gathered: ResBag; kills: number; lost: number; trained: number; built: number };
  lastPopMsg: number; lastAttackMsg: number;
}

export type Command =
  | { t: 'move'; p: number; ids: number[]; x: number; y: number }
  | { t: 'attackMove'; p: number; ids: number[]; x: number; y: number }
  | { t: 'target'; p: number; ids: number[]; target: number }
  | { t: 'build'; p: number; ids: number[]; b: BuildingType; tx: number; ty: number }
  | { t: 'train'; p: number; bid: number; u: UnitType }
  | { t: 'cancel'; p: number; bid: number }
  | { t: 'age'; p: number; bid: number }
  | { t: 'rally'; p: number; bid: number; x: number; y: number }
  | { t: 'research'; p: number; bid: number; tech: TechType }
  | { t: 'trade'; p: number; res: Res; buy: boolean }
  | { t: 'stop'; p: number; ids: number[] };

export type GEvent =
  | { t: 'shot'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'hit'; x: number; y: number }
  | { t: 'death'; x: number; y: number; cat: string; owner: number }
  | { t: 'msg'; p: number; text: string }
  | { t: 'attacked'; p: number; x: number; y: number }
  | { t: 'built'; p: number; id: number }
  | { t: 'trained'; p: number; id: number }
  | { t: 'age'; p: number }
  | { t: 'tech'; p: number; tech: TechType }
  | { t: 'heal'; x: number; y: number };

const INTERACT = 14; // px de distancia para recolectar/construir/depositar


export class World implements Grid {
  readonly w: number; readonly h: number;
  solid: Uint8Array; occ: Int32Array;
  /** 0 = tierra, 1 = agua, 2 = vado (se camina, no se construye) */
  terrain: Uint8Array;
  biome = 'templado';
  mapName = 'continental';
  tick = 0;
  entities = new Map<number, Entity>();
  players: Player[] = [];
  events: GEvent[] = [];
  winnerTeam = -1;
  rng: Rng;
  checkDefeat = true;
  private nextId = 1;
  private pending: Command[] = [];

  constructor(w: number, h: number, seed: number) {
    this.w = w; this.h = h;
    this.solid = new Uint8Array(w * h);
    this.occ = new Int32Array(w * h);
    this.terrain = new Uint8Array(w * h);
    this.rng = new Rng(seed);
  }

  // ---------------------------------------------------------------- setup
  addPlayer(name: string, team: number, color: string, isAI: boolean): Player {
    const p: Player = {
      id: this.players.length, team, name, color, isAI,
      res: { ...START_RES }, age: 1, techs: new Set(), defeated: false, gatherMult: 1,
      explored: new Uint8Array(this.w * this.h), visible: new Uint8Array(this.w * this.h),
      stats: { gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, kills: 0, lost: 0, trained: 0, built: 0 },
      lastPopMsg: -999, lastAttackMsg: -999,
    };
    this.players.push(p);
    return p;
  }

  private blank(cat: Entity['cat'], type: Entity['type'], owner: number): Entity {
    return {
      id: this.nextId++, cat, type, owner, x: 0, y: 0, tx: 0, ty: 0, size: 0, hp: 1, maxHp: 1, radius: 0,
      path: [], pathKey: '', repathAt: 0, carry: 0, gatherAcc: 0, cooldown: 0, lastHitBy: 0, acquireAt: 0,
      facing: 0, lastNode: 0, progress: 1, queue: [], trainT: 0, ageT: -1, techT: 0, amount: 0,
    };
  }

  spawnUnit(owner: number, type: UnitType, x: number, y: number): Entity {
    const d = UNITS[type];
    const e = this.blank('unit', type, owner);
    e.x = x; e.y = y; e.hp = e.maxHp = d.hp; e.radius = d.radius;
    e.facing = this.rng.next() * Math.PI * 2;
    this.entities.set(e.id, e);
    return e;
  }

  addNode(type: NodeType, tx: number, ty: number): Entity | null {
    if (!this.areaFree(tx, ty, 1)) return null;
    const e = this.blank('node', type, -1);
    e.tx = tx; e.ty = ty; e.size = 1;
    e.x = (tx + 0.5) * TILE; e.y = (ty + 0.5) * TILE;
    e.amount = NODES[type].amount;
    e.radius = 12;
    this.entities.set(e.id, e);
    this.occupy(e, true);
    return e;
  }

  placeBuilding(owner: number, type: BuildingType, tx: number, ty: number, complete: boolean): Entity {
    const d = BUILDINGS[type];
    const e = this.blank('building', type, owner);
    e.tx = tx; e.ty = ty; e.size = d.size;
    e.x = (tx + d.size / 2) * TILE; e.y = (ty + d.size / 2) * TILE;
    e.maxHp = d.hp;
    e.progress = complete ? 1 : 0;
    e.hp = complete ? d.hp : Math.max(1, d.hp * 0.05);
    e.amount = d.food ?? 0;
    e.radius = d.size * TILE * 0.5;
    this.entities.set(e.id, e);
    this.occupy(e, true);
    if (complete && type === 'farm') e.amount = d.food!;
    return e;
  }

  private occupy(e: Entity, on: boolean) {
    const solid = !(e.cat === 'building' && e.type === 'farm');
    for (let y = e.ty; y < e.ty + e.size; y++)
      for (let x = e.tx; x < e.tx + e.size; x++) {
        const i = y * this.w + x;
        this.occ[i] = on ? e.id : 0;
        if (solid) this.solid[i] = on || this.terrain[i] === 1 ? 1 : 0;
      }
  }

  areaFree(tx: number, ty: number, size: number, margin = 0): boolean {
    for (let y = ty - margin; y < ty + size + margin; y++)
      for (let x = tx - margin; x < tx + size + margin; x++) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
        const i = y * this.w + x;
        if (this.occ[i] || this.terrain[i] !== 0) return false;
      }
    return true;
  }

  setWater(x: number, y: number, kind: 1 | 2) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    const e = this.get(this.occ[i]);
    if (e && e.cat === 'node') this.kill(e);
    else if (e) return;
    this.terrain[i] = kind;
    this.solid[i] = kind === 1 ? 1 : 0;
  }

  /** Quita árboles y convierte agua en vado (para abrir caminos al generar el mapa) */
  clearTile(x: number, y: number) {
    if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) return;
    const i = y * this.w + x;
    const e = this.get(this.occ[i]);
    if (e && e.cat === 'node' && e.type === 'tree') this.kill(e);
    if (this.terrain[i] === 1) { this.terrain[i] = 2; this.solid[i] = this.occ[i] ? this.solid[i] : 0; }
  }

  hasTech(p: number, t: TechType): boolean { return p >= 0 && this.players[p].techs.has(t); }
  speedOf(u: Entity): number {
    const s = UNITS[u.type as UnitType].speed;
    return u.type === 'villager' && this.hasTech(u.owner, 'wheelbarrow') ? s * 1.15 : s;
  }
  carryCap(u: Entity): number { return CARRY + (this.hasTech(u.owner, 'wheelbarrow') ? 5 : 0); }
  isResearching(p: number, t?: TechType): boolean {
    for (const b of this.buildingsOf(p)) if (b.tech && (!t || b.tech === t)) return true;
    return false;
  }

  canPlace(p: number, type: BuildingType, tx: number, ty: number): string | null {
    const d = BUILDINGS[type];
    if (this.players[p].age < d.age) return 'Requiere la Era de los Reinos';
    if (!this.areaFree(tx, ty, d.size)) return 'No se puede construir ahí';
    const pl = this.players[p];
    // Solo en terreno explorado (para el humano y la IA por igual)
    for (let y = ty; y < ty + d.size; y++)
      for (let x = tx; x < tx + d.size; x++) if (!pl.explored[y * this.w + x]) return 'Terreno sin explorar';
    return null;
  }

  // ------------------------------------------------------------ utilidades
  get(id: number | undefined): Entity | undefined { return id ? this.entities.get(id) : undefined; }
  isEnemy(a: number, b: number): boolean {
    if (a < 0 || b < 0) return false;
    return this.players[a].team !== this.players[b].team;
  }
  canAfford(p: number, cost: Partial<ResBag>): boolean {
    const r = this.players[p].res;
    return RES_LIST.every((k) => (cost[k] ?? 0) <= r[k]);
  }
  pay(p: number, cost: Partial<ResBag>) { for (const k of RES_LIST) this.players[p].res[k] -= cost[k] ?? 0; }
  refund(p: number, cost: Partial<ResBag>) { for (const k of RES_LIST) this.players[p].res[k] += cost[k] ?? 0; }

  popOf(p: number): number {
    let n = 0;
    for (const e of this.entities.values()) {
      if (e.owner !== p) continue;
      if (e.cat === 'unit') n++;
      else if (e.cat === 'building' && e.progress >= 1 && e.queue.length && e.trainT > 0) n++;
    }
    return n;
  }
  popCap(p: number): number {
    let n = 0;
    for (const e of this.entities.values())
      if (e.owner === p && e.cat === 'building' && e.progress >= 1) n += BUILDINGS[e.type as BuildingType].pop ?? 0;
    return Math.min(MAX_POP, n);
  }
  unitsOf(p: number, type?: UnitType): Entity[] {
    const out: Entity[] = [];
    for (const e of this.entities.values())
      if (e.owner === p && e.cat === 'unit' && (!type || e.type === type)) out.push(e);
    return out;
  }
  buildingsOf(p: number, type?: BuildingType, onlyDone = false): Entity[] {
    const out: Entity[] = [];
    for (const e of this.entities.values())
      if (e.owner === p && e.cat === 'building' && (!type || e.type === type) && (!onlyDone || e.progress >= 1)) out.push(e);
    return out;
  }

  edgeDist(u: Entity, t: Entity): number {
    if (t.cat === 'unit') return Math.hypot(u.x - t.x, u.y - t.y) - u.radius - t.radius;
    const x0 = t.tx * TILE, y0 = t.ty * TILE, x1 = x0 + t.size * TILE, y1 = y0 + t.size * TILE;
    const cx = Math.max(x0, Math.min(u.x, x1)), cy = Math.max(y0, Math.min(u.y, y1));
    return Math.hypot(u.x - cx, u.y - cy) - u.radius;
  }

  tileSolid(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.solid[ty * this.w + tx] === 1;
  }

  /** Casilla libre más cercana a (tx,ty) */
  nearestFree(tx: number, ty: number, maxR = 12): { x: number; y: number } | null {
    if (!this.tileSolid(tx, ty)) return { x: tx, y: ty };
    for (let r = 1; r <= maxR; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.tileSolid(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
    return null;
  }

  // -------------------------------------------------------------- comandos
  issue(c: Command) { this.pending.push(c); }

  private applyCommand(c: Command) {
    const pl = this.players[c.p];
    if (!pl || pl.defeated) return;
    const own = (ids: number[]) => ids.map((id) => this.entities.get(id)).filter((e): e is Entity => !!e && e.owner === c.p && e.cat === 'unit');
    switch (c.t) {
      case 'move':
      case 'attackMove': {
        const us = own(c.ids);
        const slots = formation(us.length);
        us.forEach((u, i) => {
          const x = c.x + slots[i][0], y = c.y + slots[i][1];
          this.setOrder(u, c.t === 'move' ? { t: 'move', x, y } : { t: 'attackMove', x, y });
        });
        break;
      }
      case 'stop':
        for (const u of own(c.ids)) this.setOrder(u, undefined);
        break;
      case 'target': {
        const t = this.entities.get(c.target);
        if (!t) return;
        for (const u of own(c.ids)) this.orderOnTarget(u, t);
        break;
      }
      case 'build': {
        const us = own(c.ids).filter((u) => u.type === 'villager');
        if (!us.length) return;
        const d = BUILDINGS[c.b];
        const why = this.canPlace(c.p, c.b, c.tx, c.ty);
        if (why) { this.events.push({ t: 'msg', p: c.p, text: why }); return; }
        if (!this.canAfford(c.p, d.cost)) { this.events.push({ t: 'msg', p: c.p, text: 'Recursos insuficientes' }); return; }
        this.pay(c.p, d.cost);
        const b = this.placeBuilding(c.p, c.b, c.tx, c.ty, false);
        for (const u of us) this.setOrder(u, { t: 'build', target: b.id });
        break;
      }
      case 'train': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p || b.cat !== 'building' || b.progress < 1) return;
        const bd = BUILDINGS[b.type as BuildingType];
        const ud = UNITS[c.u];
        if (!bd.trains?.includes(c.u)) return;
        if (pl.age < ud.age) { this.events.push({ t: 'msg', p: c.p, text: 'Requiere la Era de los Reinos' }); return; }
        if (b.queue.length >= 6) return;
        if (!this.canAfford(c.p, ud.cost)) { this.events.push({ t: 'msg', p: c.p, text: 'Recursos insuficientes' }); return; }
        this.pay(c.p, ud.cost);
        b.queue.push(c.u);
        break;
      }
      case 'cancel': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p) return;
        if (b.ageT >= 0) { b.ageT = -1; this.refund(c.p, AGE_UP.cost); return; }
        if (b.tech) { this.refund(c.p, TECHS[b.tech].cost); b.tech = undefined; b.techT = 0; return; }
        const u = b.queue.pop();
        if (u) { this.refund(c.p, UNITS[u].cost); if (!b.queue.length) b.trainT = 0; }
        break;
      }
      case 'age': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p || b.type !== 'towncenter' || b.progress < 1 || b.tech) return;
        if (pl.age >= 2 || this.isResearchingAge(c.p)) return;
        if (!this.canAfford(c.p, AGE_UP.cost)) { this.events.push({ t: 'msg', p: c.p, text: 'Recursos insuficientes' }); return; }
        this.pay(c.p, AGE_UP.cost);
        b.ageT = 0;
        break;
      }
      case 'research': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p || b.cat !== 'building' || b.progress < 1 || b.tech || b.ageT >= 0) return;
        const td = TECHS[c.tech];
        if (!BUILDINGS[b.type as BuildingType].research?.includes(c.tech)) return;
        if (pl.techs.has(c.tech) || this.isResearching(c.p, c.tech)) return;
        if (pl.age < td.age) return;
        if (!this.canAfford(c.p, td.cost)) { this.events.push({ t: 'msg', p: c.p, text: 'Recursos insuficientes' }); return; }
        this.pay(c.p, td.cost);
        b.tech = c.tech; b.techT = 0;
        break;
      }
      case 'trade': {
        if (!this.buildingsOf(c.p, 'market', true).length) return;
        if (c.res === 'gold') return;
        if (c.buy) {
          if (pl.res.gold < TRADE.buy) { this.events.push({ t: 'msg', p: c.p, text: 'Falta oro' }); return; }
          pl.res.gold -= TRADE.buy; pl.res[c.res] += TRADE.lot;
        } else {
          if (pl.res[c.res] < TRADE.lot) { this.events.push({ t: 'msg', p: c.p, text: 'No tenés suficiente para vender' }); return; }
          pl.res[c.res] -= TRADE.lot; pl.res.gold += TRADE.sell;
        }
        break;
      }
      case 'rally': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p || b.cat !== 'building') return;
        const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
        const id = tx >= 0 && ty >= 0 && tx < this.w && ty < this.h ? this.occ[ty * this.w + tx] : 0;
        b.rally = { x: c.x, y: c.y, target: id && id !== b.id ? id : undefined };
        break;
      }
    }
  }

  isResearchingAge(p: number): boolean {
    for (const b of this.buildingsOf(p, 'towncenter')) if (b.ageT >= 0) return true;
    return false;
  }

  /** Orden contextual: recolectar, construir, atacar o moverse según el objetivo. */
  orderOnTarget(u: Entity, t: Entity) {
    const isVill = u.type === 'villager';
    if (u.type === 'monk') {
      if (t.cat === 'unit' && !this.isEnemy(u.owner, t.owner) && t.id !== u.id) this.setOrder(u, { t: 'heal', target: t.id });
      else this.setOrder(u, { t: 'move', x: t.x, y: t.y + (t.cat === 'building' ? t.size * TILE * 0.5 + 12 : 0) });
      return;
    }
    if (t.cat === 'node') {
      if (isVill) this.setOrder(u, { t: 'gather', target: t.id, res: NODES[t.type as NodeType].res, phase: 'go' });
      else this.setOrder(u, { t: 'move', x: t.x, y: t.y + TILE });
      return;
    }
    if (this.isEnemy(u.owner, t.owner)) {
      if (UNITS[u.type as UnitType].onlyBuildings && t.cat !== 'building') { this.setOrder(u, { t: 'move', x: t.x, y: t.y }); return; }
      this.setOrder(u, { t: 'attack', target: t.id });
      return;
    }
    if (t.cat === 'building' && isVill && this.players[t.owner].team === this.players[u.owner].team) {
      if (t.progress < 1 || t.hp < t.maxHp) { this.setOrder(u, { t: 'build', target: t.id }); return; }
      if (t.type === 'farm' && t.owner === u.owner) { this.setOrder(u, { t: 'gather', target: t.id, res: 'food', phase: 'go' }); return; }
      const drop = BUILDINGS[t.type as BuildingType].drop;
      if (u.carry > 0 && u.carryRes && drop?.includes(u.carryRes) && t.owner === u.owner) {
        const node = this.entities.get(u.lastNode);
        this.setOrder(u, { t: 'gather', target: node ? node.id : 0, res: u.carryRes, phase: 'return' });
        return;
      }
    }
    this.setOrder(u, { t: 'move', x: t.x, y: t.y + (t.cat === 'building' ? t.size * TILE * 0.5 + 12 : 0) });
  }

  setOrder(u: Entity, o: Order | undefined) {
    u.order = o;
    u.path = []; u.pathKey = ''; u.repathAt = 0;
  }

  // ------------------------------------------------------------ simulación
  step() {
    for (const c of this.pending) this.applyCommand(c);
    this.pending = [];
    this.tick++;
    for (const e of this.entities.values()) {
      if (e.hp <= 0) continue;
      if (e.cat === 'unit') this.updateUnit(e);
      else if (e.cat === 'building') this.updateBuilding(e);
    }
    this.separate();
    // Limpieza de muertos
    for (const e of [...this.entities.values()]) if (e.hp <= 0) this.kill(e);
    if (this.tick % 10 === 0) this.refreshVisibility();
    if (this.tick % 20 === 0 && this.checkDefeat) this.updateDefeat();
  }

  private kill(e: Entity) {
    if (!this.entities.has(e.id)) return;
    this.entities.delete(e.id);
    if (e.cat !== 'unit') this.occupy(e, false);
    if (e.cat !== 'node') {
      this.events.push({ t: 'death', x: e.x, y: e.y, cat: e.cat, owner: e.owner });
      if (e.owner >= 0) this.players[e.owner].stats.lost++;
    }
  }

  private updateBuilding(b: Entity) {
    if (b.progress < 1) return;
    const bd = BUILDINGS[b.type as BuildingType];
    const pl = this.players[b.owner];
    // Investigaciones
    if (b.tech) {
      b.techT += DT;
      if (b.techT >= TECHS[b.tech].time) {
        pl.techs.add(b.tech);
        this.events.push({ t: 'tech', p: b.owner, tech: b.tech });
        this.events.push({ t: 'msg', p: b.owner, text: `Investigación lista: ${TECHS[b.tech].name}` });
        b.tech = undefined; b.techT = 0;
      }
    } else if (b.ageT >= 0) {
      b.ageT += DT;
      if (b.ageT >= AGE_UP.time) {
        b.ageT = -1; pl.age = 2;
        this.events.push({ t: 'age', p: b.owner });
        this.events.push({ t: 'msg', p: b.owner, text: '¡Avanzaste a la Era de los Reinos!' });
      }
    } else if (b.queue.length) {
      const ut = b.queue[0];
      if (this.popOf(b.owner) - (b.trainT > 0 ? 1 : 0) < this.popCap(b.owner)) {
        b.trainT += DT;
        if (b.trainT >= UNITS[ut].trainTime) {
          b.trainT = 0; b.queue.shift();
          const spot = this.spawnSpot(b);
          const u = this.spawnUnit(b.owner, ut, spot.x, spot.y);
          pl.stats.trained++;
          this.events.push({ t: 'trained', p: b.owner, id: u.id });
          if (b.rally) {
            const t = this.get(b.rally.target);
            if (t) this.orderOnTarget(u, t);
            else this.setOrder(u, { t: 'move', x: b.rally.x, y: b.rally.y });
          }
        }
      } else if (this.tick - pl.lastPopMsg > TICK_RATE * 8) {
        pl.lastPopMsg = this.tick;
        this.events.push({ t: 'msg', p: b.owner, text: 'Necesitás más casas' });
      }
    }
    // Ataque de torres / centro urbano
    if (bd.attack) {
      b.cooldown -= DT;
      if (b.cooldown <= 0) {
        let best: Entity | undefined, bd2 = Infinity;
        for (const e of this.entities.values()) {
          if (e.cat !== 'unit' || !this.isEnemy(b.owner, e.owner)) continue;
          const d = this.edgeDist(e, b) + e.radius;
          if (d <= bd.attack.range && d < bd2) { bd2 = d; best = e; }
        }
        if (best) {
          b.cooldown = bd.attack.cooldown;
          this.dealDamage(b, best, bd.attack.atk, 'pierce', undefined);
          this.events.push({ t: 'shot', x1: b.x, y1: b.y - 10, x2: best.x, y2: best.y });
        } else b.cooldown = 0.3;
      }
    }
  }

  private spawnSpot(b: Entity): { x: number; y: number } {
    const goal = b.rally ?? { x: b.x, y: b.y + 999 };
    let best = { x: b.x, y: b.y + b.size * TILE }, bd = Infinity;
    for (let r = 0; r < 4; r++) {
      const x0 = b.tx - 1 - r, y0 = b.ty - 1 - r, s = b.size + 2 + r * 2;
      for (let y = y0; y < y0 + s; y++)
        for (let x = x0; x < x0 + s; x++) {
          if (x !== x0 && x !== x0 + s - 1 && y !== y0 && y !== y0 + s - 1) continue;
          if (this.tileSolid(x, y)) continue;
          const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
          const d = Math.hypot(px - goal.x, py - goal.y);
          if (d < bd) { bd = d; best = { x: px + (this.rng.next() - 0.5) * 6, y: py + (this.rng.next() - 0.5) * 6 }; }
        }
      if (bd < Infinity) break;
    }
    return best;
  }

  private damageOf(atk: number, type: 'melee' | 'pierce', bonus: Partial<Record<ArmorClass, number>> | undefined, t: Entity): number {
    let armor: number, cls: ArmorClass;
    if (t.cat === 'building') { armor = BUILDING_ARMOR[type]; cls = 'building'; }
    else {
      const d = UNITS[t.type as UnitType];
      armor = type === 'melee' ? d.armorMelee : d.armorPierce; cls = d.cls;
      if (t.type !== 'villager' && t.type !== 'monk' && this.hasTech(t.owner, 'mail')) armor += 1;
    }
    return Math.max(1, atk + (bonus?.[cls] ?? 0) - armor);
  }

  private dealDamage(src: Entity, t: Entity, atk: number, type: 'melee' | 'pierce', bonus: Partial<Record<ArmorClass, number>> | undefined) {
    if (t.hp <= 0) return;
    t.hp -= this.damageOf(atk, type, bonus, t);
    t.lastHitBy = src.id;
    this.events.push({ t: 'hit', x: t.x, y: t.y });
    const tp = this.players[t.owner];
    if (tp && this.tick - tp.lastAttackMsg > TICK_RATE * 15) {
      tp.lastAttackMsg = this.tick;
      this.events.push({ t: 'attacked', p: t.owner, x: t.x, y: t.y });
    }
    if (t.hp <= 0 && src.owner >= 0) this.players[src.owner].stats.kills++;
  }

  // ---------------------------------------------------------- unidades
  private updateUnit(u: Entity) {
    const d = UNITS[u.type as UnitType];
    if (u.cooldown > 0) u.cooldown -= DT;
    const o = u.order;
    if (!o) { this.idleBehaviour(u, d); return; }
    switch (o.t) {
      case 'move':
        if (this.moveTo(u, o.x, o.y)) this.setOrder(u, undefined);
        break;
      case 'attackMove': {
        if (d.heals || d.atk === 0) { if (this.moveTo(u, o.x, o.y)) this.setOrder(u, undefined); break; }
        let sub = this.get(o.sub);
        if (!sub || sub.hp <= 0) {
          o.sub = undefined;
          if (this.tick >= u.acquireAt) {
            u.acquireAt = this.tick + 10;
            sub = this.findEnemy(u, d.sight * TILE, !d.onlyBuildings, true);
            if (sub) { o.sub = sub.id; u.path = []; u.pathKey = ''; }
          }
        }
        if (sub) this.attackStep(u, d, sub);
        else if (this.moveTo(u, o.x, o.y)) this.setOrder(u, undefined);
        break;
      }
      case 'attack': {
        const t = this.get(o.target);
        if (!t || t.hp <= 0) { this.setOrder(u, undefined); break; }
        this.attackStep(u, d, t);
        break;
      }
      case 'gather': this.gatherStep(u, o); break;
      case 'build': this.buildStep(u, o); break;
      case 'heal': {
        const t = this.get(o.target);
        if (!t || t.hp <= 0 || t.hp >= t.maxHp) { this.setOrder(u, undefined); break; }
        if (this.edgeDist(u, t) <= d.range) {
          u.path = [];
          u.facing = Math.atan2(t.y - u.y, t.x - u.x);
          t.hp = Math.min(t.maxHp, t.hp + 4 * DT);
          if (this.tick % 10 === 0) this.events.push({ t: 'heal', x: t.x, y: t.y });
        } else this.approach(u, t, d.range * 0.8);
        break;
      }
    }
  }

  private idleBehaviour(u: Entity, d: (typeof UNITS)[UnitType]) {
    if (this.tick < u.acquireAt) return;
    u.acquireAt = this.tick + 10;
    if (u.type === 'villager') return;
    if (d.heals) {
      let best: Entity | undefined, bd = d.sight * TILE;
      for (const e of this.entities.values()) {
        if (e.cat !== 'unit' || e.id === u.id || e.hp >= e.maxHp || this.isEnemy(u.owner, e.owner) || e.owner < 0) continue;
        const dist = Math.hypot(e.x - u.x, e.y - u.y);
        if (dist < bd) { bd = dist; best = e; }
      }
      if (best) this.setOrder(u, { t: 'heal', target: best.id });
      return;
    }
    const hitter = this.get(u.lastHitBy);
    if (hitter && hitter.hp > 0 && this.isEnemy(u.owner, hitter.owner) && !(d.onlyBuildings && hitter.cat !== 'building')) {
      this.setOrder(u, { t: 'attack', target: hitter.id });
      u.lastHitBy = 0;
      return;
    }
    const e = this.findEnemy(u, d.sight * TILE, !d.onlyBuildings, !!d.onlyBuildings);
    if (e) this.setOrder(u, { t: 'attack', target: e.id });
  }

  findEnemy(u: Entity, range: number, units: boolean, buildings: boolean): Entity | undefined {
    let best: Entity | undefined, bd = Infinity;
    for (const e of this.entities.values()) {
      if (e.hp <= 0 || !this.isEnemy(u.owner, e.owner)) continue;
      if (e.cat === 'unit' && !units) continue;
      if (e.cat === 'building' && !buildings) continue;
      if (e.cat === 'node') continue;
      let dist = this.edgeDist(u, e);
      if (e.cat === 'building') dist += 40; // preferir unidades
      if (dist < range && dist < bd) { bd = dist; best = e; }
    }
    return best;
  }

  private attackStep(u: Entity, d: (typeof UNITS)[UnitType], t: Entity) {
    if ((d.onlyBuildings && t.cat !== 'building') || d.atk === 0) { this.setOrder(u, undefined); return; }
    const dist = this.edgeDist(u, t);
    if (dist <= d.range) {
      u.path = [];
      u.facing = Math.atan2(t.y - u.y, t.x - u.x);
      if (u.cooldown <= 0) {
        u.cooldown = d.cooldown;
        const atk = d.atk + (u.type !== 'villager' && this.hasTech(u.owner, 'forge') ? 1 : 0);
        this.dealDamage(u, t, atk, d.atkType, d.bonus);
        if (d.atkType === 'pierce') this.events.push({ t: 'shot', x1: u.x, y1: u.y, x2: t.x, y2: t.y });
      }
    } else {
      this.approach(u, t, d.range);
    }
  }

  private gatherStep(u: Entity, o: Extract<Order, { t: 'gather' }>) {
    const pl = this.players[u.owner];
    if (u.carry > 0 && u.carryRes !== o.res) o.phase = 'return';
    const cap = this.carryCap(u);
    if (u.carry >= cap) o.phase = 'return';
    if (o.phase === 'return') {
      if (u.carry <= 0) { o.phase = 'go'; return; }
      const drop = this.nearestDrop(u, u.carryRes!);
      if (!drop) {
        if (this.tick % (TICK_RATE * 10) === 0) this.events.push({ t: 'msg', p: u.owner, text: 'No hay depósito para ' + u.carryRes });
        this.setOrder(u, undefined);
        return;
      }
      if (this.edgeDist(u, drop) <= INTERACT) {
        pl.res[u.carryRes!] += u.carry;
        pl.stats.gathered[u.carryRes!] += u.carry;
        u.carry = 0;
        o.phase = 'go';
        u.path = []; u.pathKey = '';
      } else this.approach(u, drop, INTERACT);
      return;
    }
    let node = this.get(o.target);
    const valid = (n: Entity | undefined) => !!n && n.hp > 0 && n.amount > 0 &&
      (n.cat === 'node' || (n.type === 'farm' && n.owner === u.owner && n.progress >= 1));
    if (!valid(node)) {
      node = this.findNode(u, o.res, 10 * TILE);
      if (!node) {
        if (u.carry > 0) { o.phase = 'return'; return; }
        this.setOrder(u, undefined);
        return;
      }
      o.target = node.id;
      u.path = []; u.pathKey = '';
    }
    const n = node!;
    if (this.edgeDist(u, n) <= INTERACT || (n.type === 'farm' && this.insideRect(u, n))) {
      u.path = [];
      u.lastNode = n.id;
      u.facing = Math.atan2(n.y - u.y, n.x - u.x);
      let rate = (n.cat === 'node' ? NODES[n.type as NodeType].rate : FARM_RATE) * pl.gatherMult;
      if ((o.res === 'wood' && pl.techs.has('axe')) || (o.res === 'food' && pl.techs.has('plow')) ||
        ((o.res === 'gold' || o.res === 'stone') && pl.techs.has('mining'))) rate *= 1.2;
      u.carryRes = o.res;
      u.gatherAcc += rate * DT;
      while (u.gatherAcc >= 1 && n.amount > 0 && u.carry < cap) {
        u.gatherAcc -= 1; n.amount -= 1; u.carry += 1;
      }
      if (n.amount <= 0) {
        if (n.cat === 'node') this.kill(n);
        else n.hp = 0; // granja agotada
      }
      if (u.carry >= cap) o.phase = 'return';
    } else {
      // ir al centro de la granja; o al lado del nodo
      if (n.type === 'farm') { if (this.moveTo(u, n.x, n.y)) { /* llegó */ } }
      else this.approach(u, n, INTERACT);
    }
  }

  private insideRect(u: Entity, b: Entity): boolean {
    return u.x >= b.tx * TILE && u.x <= (b.tx + b.size) * TILE && u.y >= b.ty * TILE && u.y <= (b.ty + b.size) * TILE;
  }

  private buildStep(u: Entity, o: Extract<Order, { t: 'build' }>) {
    const b = this.get(o.target);
    if (!b || b.hp <= 0) { this.setOrder(u, undefined); return; }
    if (b.progress >= 1 && b.hp >= b.maxHp) { this.afterBuild(u, b); return; }
    if (this.edgeDist(u, b) <= INTERACT || (b.type === 'farm' && this.insideRect(u, b))) {
      u.path = [];
      u.facing = Math.atan2(b.y - u.y, b.x - u.x);
      const bd = BUILDINGS[b.type as BuildingType];
      if (b.progress < 1) {
        const dp = DT / bd.buildTime;
        b.progress = Math.min(1, b.progress + dp);
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * dp * 0.95);
        if (b.progress >= 1) {
          b.hp = Math.max(b.hp, b.maxHp * 0.98);
          if (b.type === 'farm') b.amount = bd.food!;
          this.players[b.owner].stats.built++;
          this.events.push({ t: 'built', p: b.owner, id: b.id });
          this.afterBuild(u, b);
        }
      } else {
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * DT / (bd.buildTime * 3)); // reparar
      }
    } else if (b.type === 'farm') this.moveTo(u, b.x, b.y);
    else this.approach(u, b, INTERACT);
  }

  private afterBuild(u: Entity, b: Entity) {
    if (b.type === 'farm' && b.owner === u.owner) { this.setOrder(u, { t: 'gather', target: b.id, res: 'food', phase: 'go' }); return; }
    const drop = BUILDINGS[b.type as BuildingType].drop;
    if (drop && b.type !== 'towncenter') {
      for (const r of drop) {
        const n = this.findNode(b, r, 9 * TILE);
        if (n) { this.setOrder(u, { t: 'gather', target: n.id, res: r, phase: 'go' }); return; }
      }
    }
    // ¿otra obra cerca?
    let best: Entity | undefined, bd = 8 * TILE;
    for (const e of this.entities.values()) {
      if (e.cat !== 'building' || e.owner !== u.owner || e.progress >= 1) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < bd) { bd = d; best = e; }
    }
    this.setOrder(u, best ? { t: 'build', target: best.id } : undefined);
  }

  nearestDrop(u: Entity, r: Res): Entity | undefined {
    let best: Entity | undefined, bd = Infinity;
    for (const e of this.entities.values()) {
      if (e.cat !== 'building' || e.owner !== u.owner || e.progress < 1) continue;
      if (!BUILDINGS[e.type as BuildingType].drop?.includes(r)) continue;
      const d = this.edgeDist(u, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  findNode(from: { x: number; y: number; owner: number }, r: Res, range: number): Entity | undefined {
    let best: Entity | undefined, bd = range;
    for (const e of this.entities.values()) {
      if (e.amount <= 0) continue;
      let ok = false;
      if (e.cat === 'node') ok = NODES[e.type as NodeType].res === r;
      else if (r === 'food' && e.type === 'farm' && e.owner === from.owner && e.progress >= 1) {
        // granja libre
        ok = !this.farmBusy(e);
      }
      if (!ok) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  farmBusy(f: Entity): boolean {
    for (const e of this.entities.values())
      if (e.cat === 'unit' && e.order?.t === 'gather' && e.order.target === f.id) return true;
    return false;
  }

  // ---------------------------------------------------------- movimiento
  /** Acercarse a una entidad hasta `range` px de su borde. */
  private approach(u: Entity, t: Entity, range: number) {
    const key = t.cat === 'unit' ? `u${t.id}:${Math.floor(t.x / TILE / 2)},${Math.floor(t.y / TILE / 2)}` : `e${t.id}`;
    if (u.pathKey !== key || (u.path.length === 0 && this.tick >= u.repathAt)) {
      u.pathKey = key;
      u.repathAt = this.tick + 10;
      const sx = Math.floor(u.x / TILE), sy = Math.floor(u.y / TILE);
      const goalR = Math.max(range, 0) + TILE * 0.75;
      const x0 = t.cat === 'unit' ? t.x : t.tx * TILE, y0 = t.cat === 'unit' ? t.y : t.ty * TILE;
      const x1 = t.cat === 'unit' ? t.x : x0 + t.size * TILE, y1 = t.cat === 'unit' ? t.y : y0 + t.size * TILE;
      const tiles = findPath(this, sx, sy, (x, y) => {
        const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
        const cx = Math.max(x0, Math.min(px, x1)), cy = Math.max(y0, Math.min(py, y1));
        return Math.hypot(px - cx, py - cy) <= goalR;
      }, Math.floor(t.x / TILE), Math.floor(t.y / TILE));
      u.path = this.smooth(u, tiles);
    }
    if (u.path.length) this.followPath(u);
    else {
      // tramo final directo hacia el punto más cercano del objetivo
      let px = t.x, py = t.y;
      if (t.cat !== 'unit') {
        px = Math.max(t.tx * TILE, Math.min(u.x, (t.tx + t.size) * TILE));
        py = Math.max(t.ty * TILE, Math.min(u.y, (t.ty + t.size) * TILE));
      }
      this.stepToward(u, px, py);
    }
  }

  /** Moverse a un punto. Devuelve true al llegar. */
  private moveTo(u: Entity, x: number, y: number): boolean {
    if (Math.hypot(u.x - x, u.y - y) < 4) return true;
    const key = `p${Math.round(x)},${Math.round(y)}`;
    if (u.pathKey !== key) {
      u.pathKey = key;
      let gx = Math.floor(x / TILE), gy = Math.floor(y / TILE);
      const free = this.nearestFree(Math.max(0, Math.min(this.w - 1, gx)), Math.max(0, Math.min(this.h - 1, gy)));
      if (!free) return true;
      const changed = free.x !== gx || free.y !== gy;
      gx = free.x; gy = free.y;
      const tiles = findPath(this, Math.floor(u.x / TILE), Math.floor(u.y / TILE), (a, b) => a === gx && b === gy, gx, gy);
      u.path = this.smooth(u, tiles);
      const last = u.path[u.path.length - 1];
      const reached = tiles.length === 0 || (tiles[tiles.length - 1].x === gx && tiles[tiles.length - 1].y === gy);
      if (!changed && reached) {
        if (last) { last.x = x; last.y = y; } else u.path = [{ x, y }];
      }
      if (!u.path.length) return true;
    }
    if (!u.path.length) return true;
    this.followPath(u);
    if (!u.path.length) return true;
    return false;
  }

  private smooth(u: Entity, tiles: { x: number; y: number }[]): { x: number; y: number }[] {
    const pts = tiles.map((t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE }));
    if (pts.length < 2) return pts;
    const out: { x: number; y: number }[] = [];
    let ax = u.x, ay = u.y, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !lineClear(this, TILE, ax, ay, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      ax = pts[j].x; ay = pts[j].y;
      i = j + 1;
    }
    return out;
  }

  private followPath(u: Entity) {
    const p = u.path[0];
    if (!p) return;
    const speed = this.speedOf(u) * DT;
    if (Math.hypot(p.x - u.x, p.y - u.y) <= speed + 1) {
      u.x = p.x; u.y = p.y; u.path.shift();
      return;
    }
    this.stepToward(u, p.x, p.y);
  }

  private stepToward(u: Entity, x: number, y: number) {
    const dx = x - u.x, dy = y - u.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) return;
    const sp = Math.min(dist, this.speedOf(u) * DT);
    u.facing = Math.atan2(dy, dx);
    this.tryMove(u, u.x + (dx / dist) * sp, u.y + (dy / dist) * sp);
  }

  private tryMove(u: Entity, nx: number, ny: number) {
    const inSolid = this.tileSolid(Math.floor(u.x / TILE), Math.floor(u.y / TILE));
    const ok = (x: number, y: number) => inSolid || !this.tileSolid(Math.floor(x / TILE), Math.floor(y / TILE));
    if (ok(nx, ny)) { u.x = nx; u.y = ny; return; }
    if (ok(nx, u.y)) { u.x = nx; return; }
    if (ok(u.x, ny)) { u.y = ny; }
  }

  private separate() {
    const units: Entity[] = [];
    for (const e of this.entities.values()) if (e.cat === 'unit') units.push(e);
    // hash espacial por casillas de 2x2
    const cell = TILE * 2;
    const buckets = new Map<number, Entity[]>();
    for (const u of units) {
      const k = Math.floor(u.x / cell) * 1000 + Math.floor(u.y / cell);
      let b = buckets.get(k); if (!b) buckets.set(k, (b = [])); b.push(u);
    }
    for (const a of units) {
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const b = buckets.get((cx + dx) * 1000 + cy + dy);
        if (!b) continue;
        for (const o of b) {
          if (o.id <= a.id) continue;
          const ddx = o.x - a.x, ddy = o.y - a.y;
          const d = Math.hypot(ddx, ddy), min = (a.radius + o.radius) * 0.85;
          if (d >= min) continue;
          const push = (min - d) * 0.25;
          const nx = d > 0.01 ? ddx / d : Math.cos(a.id), ny = d > 0.01 ? ddy / d : Math.sin(a.id);
          const aMov = a.path.length > 0, oMov = o.path.length > 0;
          const wa = aMov && !oMov ? 1.6 : !aMov && oMov ? 0.4 : 1;
          const wo = 2 - wa;
          this.tryMove(a, a.x - nx * push * wa, a.y - ny * push * wa);
          this.tryMove(o, o.x + nx * push * wo, o.y + ny * push * wo);
        }
      }
    }
    for (const u of units) {
      u.x = Math.max(4, Math.min(this.w * TILE - 4, u.x));
      u.y = Math.max(4, Math.min(this.h * TILE - 4, u.y));
    }
  }

  // ------------------------------------------------------- visión / fin
  refreshVisibility() {
    const teams = new Map<number, Uint8Array>();
    for (const p of this.players) {
      if (!teams.has(p.team)) teams.set(p.team, new Uint8Array(this.w * this.h));
    }
    for (const e of this.entities.values()) {
      if (e.owner < 0) continue;
      const vis = teams.get(this.players[e.owner].team)!;
      const sight = e.cat === 'unit' ? UNITS[e.type as UnitType].sight : BUILDINGS[e.type as BuildingType].sight + e.size / 2;
      const cx = e.x / TILE, cy = e.y / TILE;
      const r = Math.ceil(sight);
      for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) {
        if (y < 0 || y >= this.h) continue;
        for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
          if (x < 0 || x >= this.w) continue;
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= sight * sight) vis[y * this.w + x] = 1;
        }
      }
    }
    for (const p of this.players) {
      const vis = teams.get(p.team)!;
      p.visible = vis;
      for (let i = 0; i < vis.length; i++) if (vis[i]) p.explored[i] = 1;
    }
  }

  private updateDefeat() {
    for (const p of this.players) {
      if (p.defeated) continue;
      const tcs = this.buildingsOf(p.id, 'towncenter', true);
      if (tcs.length === 0) {
        p.defeated = true;
        this.events.push({ t: 'msg', p: -1, text: `${p.name} fue derrotado` });
        for (const e of [...this.entities.values()]) if (e.owner === p.id) e.hp = 0;
        for (const e of [...this.entities.values()]) if (e.hp <= 0) this.kill(e);
      }
    }
    const aliveTeams = new Set(this.players.filter((p) => !p.defeated).map((p) => p.team));
    if (aliveTeams.size === 1 && this.winnerTeam < 0) this.winnerTeam = [...aliveTeams][0];
    if (aliveTeams.size === 0 && this.winnerTeam < 0) this.winnerTeam = 99;
  }
}

/** Posiciones relativas de una formación compacta */
export function formation(n: number): [number, number][] {
  const out: [number, number][] = [];
  const cols = Math.ceil(Math.sqrt(n));
  const sp = 20;
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push([(c - (cols - 1) / 2) * sp, (r - (Math.ceil(n / cols) - 1) / 2) * sp]);
  }
  return out;
}

