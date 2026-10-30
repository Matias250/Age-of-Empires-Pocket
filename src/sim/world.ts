// Simulación determinista del juego. No conoce nada de pantallas ni input:
// solo recibe Comandos y avanza de a ticks fijos. Esto permite, en una etapa
// siguiente, jugar online con "lockstep" enviando solo los comandos.

import {
  Age, AGE_NAME, AGE_UPS, ArmorClass, BUILDINGS, BUILDING_ARMOR, BuildingType, CARRY, DT, FARM_RATE, MAX_POP,
  NODES, NodeType, Projectile, Res, ResBag, RES_LIST, RES_NAME, SHIP_CARRY, START_RES, TECHS, TechType, TICK_RATE, TILE,
  TRADE, UNITS, UnitDef, UnitType, upAtk,
} from './data.js';
import { CivId, CIVS, CivMods } from './civs.js';
import { findPath, Grid, lineClear, pathFound } from './path.js';
import { Rng } from './rng.js';

export type Order =
  | { t: 'move'; x: number; y: number }
  | { t: 'attackMove'; x: number; y: number; sub?: number }
  | { t: 'attack'; target: number; auto?: boolean }
  | { t: 'gather'; target: number; res: Res; phase: 'go' | 'return' }
  | { t: 'build'; target: number }
  | { t: 'heal'; target: number }
  | { t: 'relic'; relic: number }
  | { t: 'trade'; home: number; dest: number; leg: 'go' | 'back' }
  | { t: 'board'; target: number }
  | { t: 'explore'; x: number; y: number; until: number };

export type Stance = 'agg' | 'def' | 'pas';
export const STANCE_NAME: Record<Stance, string> = { agg: 'Agresiva', def: 'Neutral', pas: 'Pasiva' };

export interface Entity {
  id: number;
  cat: 'unit' | 'building' | 'node';
  type: UnitType | BuildingType | NodeType;
  owner: number;
  /** héroe de una historia: nombre propio y se cura solo */
  hero?: string;
  /** reliquia que lleva un monje */
  carryRelic?: number;
  x: number; y: number;
  tx: number; ty: number; size: number;
  /** huella en casillas (ancho y alto); el portón puede ser 3×1 o 1×3 */
  fw: number; fh: number;
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
  stance: Stance;
  /** órdenes en cola (como mantener Shift en el AoE) */
  cmdQueue: Order[];
  lastAtk: number;
  /** ángulo de llegada al objetivo cuerpo a cuerpo (para rodearlo en vez de amontonarse) */
  appAng?: number; appTarget?: number;
  home?: { x: number; y: number };
  /** infantería que va adentro (ariete) */
  cargo?: Entity[];
  // edificios
  locked?: boolean;
  techQueue: TechType[];
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
  civ?: CivId;
  mods: CivMods;
  res: ResBag;
  age: Age;
  techs: Set<TechType>;
  defeated: boolean;
  gatherMult: number;
  explored: Uint8Array; visible: Uint8Array;
  stats: { gathered: ResBag; kills: number; lost: number; trained: number; built: number; killValue: number; techValue: number };
  lastPopMsg: number; lastAttackMsg: number;
  /** soldados sin dueño de las historias: nadie los ataca y se unen al héroe */
  neutral?: boolean;
  /** solo ejército: pierde cuando no le quedan unidades */
  armyOnly?: boolean;
}

export interface Relic { id: number; x: number; y: number; carrier?: number; holder?: number }
export interface ChatMsg { tick: number; from: number; to: 'all' | 'allies' | number; text: string }

export type Command =
  | { t: 'move'; p: number; ids: number[]; x: number; y: number; queue?: boolean }
  | { t: 'attackMove'; p: number; ids: number[]; x: number; y: number; queue?: boolean }
  | { t: 'target'; p: number; ids: number[]; target: number; queue?: boolean }
  | { t: 'build'; p: number; ids: number[]; b: BuildingType; tx: number; ty: number; vertical?: boolean; queue?: boolean }
  | { t: 'stance'; p: number; ids: number[]; stance: Stance }
  | { t: 'gateLock'; p: number; bid: number }
  | { t: 'train'; p: number; bid: number; u: UnitType }
  | { t: 'cancel'; p: number; bid: number; what?: 'tech' | 'unit' }
  | { t: 'age'; p: number; bid: number }
  | { t: 'rally'; p: number; bid: number; x: number; y: number }
  | { t: 'research'; p: number; bid: number; tech: TechType }
  | { t: 'trade'; p: number; res: Res; buy: boolean }
  | { t: 'stop'; p: number; ids: number[] }
  | { t: 'delete'; p: number; ids: number[] }
  | { t: 'relic'; p: number; ids: number[]; relic: number }
  | { t: 'chat'; p: number; to: 'all' | 'allies' | number; text: string }
  | { t: 'tribute'; p: number; to: number; res: Res; n: number }
  | { t: 'unload'; p: number; ids: number[] }
  | { t: 'explore'; p: number; ids: number[] };

export type GEvent =
  | { t: 'shot'; x1: number; y1: number; x2: number; y2: number; kind: Projectile }
  | { t: 'hit'; x: number; y: number }
  | { t: 'blast'; x: number; y: number; r: number }
  | { t: 'death'; x: number; y: number; cat: string; owner: number; naval?: boolean }
  | { t: 'msg'; p: number; text: string }
  | { t: 'attacked'; p: number; x: number; y: number }
  | { t: 'built'; p: number; id: number }
  | { t: 'trained'; p: number; id: number }
  | { t: 'age'; p: number; age: Age }
  | { t: 'tech'; p: number; tech: TechType }
  | { t: 'heal'; x: number; y: number }
  | { t: 'chat'; from: number; to: 'all' | 'allies' | number; text: string }
  | { t: 'relic'; p: number; x: number; y: number };

const INTERACT = 14; // px de distancia para recolectar/construir/depositar
const CELL = TILE * 4; // celda del índice espacial
export const RAM_CAPACITY = 5; // infantería que entra en un ariete

export class World implements Grid {
  readonly w: number; readonly h: number;
  solid: Uint8Array; occ: Int32Array;
  /** Grilla para barcos: sólido = tierra u ocupado */
  nav: Grid;
  /** 0 = tierra, 1 = agua, 2 = vado (se camina y se navega, no se construye) */
  terrain: Uint8Array;
  biome = 'templado';
  mapName = 'continental';
  popLimit = MAX_POP;
  tick = 0;
  entities = new Map<number, Entity>();
  players: Player[] = [];
  events: GEvent[] = [];
  winnerTeam = -1;
  rng: Rng;
  checkDefeat = true;
  relics: Relic[] = [];
  chat: ChatMsg[] = [];
  private nextId = 1;
  private pending: Command[] = [];

  // índices que se recalculan cuando algo cambia
  private dirty = true;
  private ownUnits: Entity[][] = [];
  private ownBuildings: Entity[][] = [];
  private popCache: number[] = [];
  private capCache: number[] = [];
  private farmClaim = new Map<number, number>();
  private buckets = new Map<number, Entity[]>();
  private allBuildings: Entity[] = [];

  constructor(w: number, h: number, seed: number) {
    this.w = w; this.h = h;
    this.solid = new Uint8Array(w * h);
    this.occ = new Int32Array(w * h);
    this.terrain = new Uint8Array(w * h);
    this.nav = { w, h, solid: new Uint8Array(w * h).fill(1) };
    this.rng = new Rng(seed);
  }

  // ---------------------------------------------------------------- setup
  addPlayer(name: string, team: number, color: string, isAI: boolean, civ?: CivId): Player {
    const mods = civ ? CIVS[civ].mods : {};
    const p: Player = {
      id: this.players.length, team, name, color, isAI, civ, mods,
      res: { ...START_RES }, age: 1, techs: new Set(mods.freeTechs ?? []), defeated: false, gatherMult: 1,
      explored: new Uint8Array(this.w * this.h), visible: new Uint8Array(this.w * this.h),
      stats: { gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, kills: 0, lost: 0, trained: 0, built: 0, killValue: 0, techValue: 0 },
      lastPopMsg: -999, lastAttackMsg: -999,
    };
    for (const r of RES_LIST) p.res[r] += mods.startBonus?.[r] ?? 0;
    this.players.push(p);
    this.dirty = true;
    return p;
  }

  private blank(cat: Entity['cat'], type: Entity['type'], owner: number): Entity {
    return {
      id: this.nextId++, cat, type, owner, x: 0, y: 0, tx: 0, ty: 0, size: 0, fw: 0, fh: 0, hp: 1, maxHp: 1, radius: 0,
      path: [], pathKey: '', repathAt: 0, carry: 0, gatherAcc: 0, cooldown: 0, lastHitBy: 0, acquireAt: 0,
      facing: 0, lastNode: 0, stance: 'agg', cmdQueue: [], lastAtk: -999, techQueue: [], progress: 1, queue: [], trainT: 0, ageT: -1, techT: 0, amount: 0,
    };
  }

  spawnUnit(owner: number, type: UnitType, x: number, y: number): Entity {
    const d = UNITS[type];
    const e = this.blank('unit', type, owner);
    e.x = x; e.y = y; e.hp = e.maxHp = Math.round(this.unitMaxHp(owner, type)); e.radius = d.radius;
    e.facing = this.rng.next() * Math.PI * 2;
    // las unidades del jugador nacen en actitud neutral; las de la IA, agresivas
    e.stance = this.players[owner] && !this.players[owner].isAI ? 'def' : 'agg';
    this.entities.set(e.id, e);
    this.dirty = true;
    return e;
  }

  addNode(type: NodeType, tx: number, ty: number): Entity | null {
    if (type === 'fish') {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return null;
      const i = ty * this.w + tx;
      if (this.terrain[i] !== 1 || this.occ[i]) return null;
    } else if (!this.areaFree(tx, ty, 1)) return null;
    const e = this.blank('node', type, -1);
    e.tx = tx; e.ty = ty; e.size = 1; e.fw = 1; e.fh = 1;
    e.x = (tx + 0.5) * TILE; e.y = (ty + 0.5) * TILE;
    e.amount = NODES[type].amount;
    e.radius = 12;
    this.entities.set(e.id, e);
    this.occupy(e, true);
    return e;
  }

  /** Huella de un edificio: el portón mide 3 de largo (horizontal o vertical) */
  footprint(type: BuildingType, vertical = false): [number, number] {
    if (type === 'gate') return vertical ? [1, 3] : [3, 1];
    const s = BUILDINGS[type].size; return [s, s];
  }

  placeBuilding(owner: number, type: BuildingType, tx: number, ty: number, complete: boolean, vertical = false): Entity {
    const d = BUILDINGS[type];
    const e = this.blank('building', type, owner);
    const [fw, fh] = this.footprint(type, vertical);
    e.tx = tx; e.ty = ty; e.size = Math.max(fw, fh); e.fw = fw; e.fh = fh;
    e.x = (tx + fw / 2) * TILE; e.y = (ty + fh / 2) * TILE;
    e.maxHp = Math.round(d.hp * this.buildingHpMult(owner, type));
    e.progress = complete ? 1 : 0;
    e.hp = complete ? e.maxHp : Math.max(1, e.maxHp * 0.05);
    e.amount = complete ? d.food ?? 0 : 0;
    e.radius = d.size * TILE * 0.5;
    this.entities.set(e.id, e);
    this.occupy(e, true);
    this.dirty = true;
    return e;
  }

  /** Quita una entidad sin efectos (para preparar escenarios) */
  remove(id: number) {
    const e = this.entities.get(id);
    if (!e) return;
    this.entities.delete(id);
    if (e.cat !== 'unit') this.occupy(e, false);
    this.dirty = true;
  }

  private refreshCell(i: number) {
    const o = this.occ[i] ? this.entities.get(this.occ[i]) : undefined;
    const t = this.terrain[i];
    this.solid[i] = t === 1 || (o && o.type !== 'farm') ? 1 : 0;
    this.nav.solid[i] = t === 0 || o ? 1 : 0;
    // las puertas se abren solo para su equipo
    const gateTeam = o && o.type === 'gate' && o.owner >= 0 && !o.locked && this.gateDoor(o) === i ? this.players[o.owner]?.team : undefined;
    for (const [team, g] of this.teamGrids) g.solid[i] = gateTeam !== undefined && gateTeam === team ? 0 : this.solid[i];
  }

  /** Casilla del medio del portón: el arco por donde se pasa (las torres de los costados no se atraviesan) */
  gateDoor(e: Entity): number { return (e.ty + (e.fh > 1 ? 1 : 0)) * this.w + e.tx + (e.fw > 1 ? 1 : 0); }

  private teamGrids = new Map<number, Grid>();
  /** Recursos que un equipo no puede alcanzar (se olvida cada minuto) */
  private unreachable = new Map<number, Set<number>>();
  /** Grilla de caminos para un equipo (sus puertas son pasables) */
  teamGrid(team: number): Grid {
    let g = this.teamGrids.get(team);
    if (!g) {
      g = { w: this.w, h: this.h, solid: this.solid.slice() };
      for (const e of this.entities.values())
        if (e.type === 'gate' && e.owner >= 0 && !e.locked && this.players[e.owner].team === team)
          g.solid[this.gateDoor(e)] = 0;
      this.teamGrids.set(team, g);
    }
    return g;
  }

  private occupy(e: Entity, on: boolean) {
    for (let y = e.ty; y < e.ty + e.fh; y++)
      for (let x = e.tx; x < e.tx + e.fw; x++) {
        const i = y * this.w + x;
        this.occ[i] = on ? e.id : 0;
        this.refreshCell(i);
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

  /** ¿Se puede poner un muelle acá? Todo agua profunda y tocando la costa. */
  dockSpotOk(tx: number, ty: number): boolean {
    const s = BUILDINGS.dock.size;
    for (let y = ty; y < ty + s; y++)
      for (let x = tx; x < tx + s; x++) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
        const i = y * this.w + x;
        if (this.terrain[i] !== 1 || this.occ[i]) return false;
      }
    let shore = false, sea = false;
    for (let y = ty - 1; y <= ty + s; y++)
      for (let x = tx - 1; x <= tx + s; x++) {
        if (x >= tx && x < tx + s && y >= ty && y < ty + s) continue;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        const i = y * this.w + x;
        if (this.terrain[i] === 0 && !this.occ[i]) shore = true;
        if (this.terrain[i] !== 0 && !this.occ[i]) sea = true;
      }
    return shore && sea;
  }

  setWater(x: number, y: number, kind: 1 | 2) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    const e = this.get(this.occ[i]);
    if (e && e.cat === 'node') this.kill(e);
    else if (e) return;
    this.terrain[i] = kind;
    this.refreshCell(i);
  }

  setLand(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.terrain[i] = 0;
    this.refreshCell(i);
  }

  /** Quita árboles y convierte agua en vado (para abrir caminos al generar el mapa) */
  clearTile(x: number, y: number) {
    if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) return;
    const i = y * this.w + x;
    const e = this.get(this.occ[i]);
    if (e && e.cat === 'node' && e.type !== 'goldmine' && e.type !== 'stonemine') this.kill(e);
    if (this.terrain[i] === 1) this.terrain[i] = 2;
    this.refreshCell(i);
  }

  // --------------------------------------------------- reglas y bonos de civ
  hasTech(p: number, t: TechType): boolean { return p >= 0 && this.players[p].techs.has(t); }
  mods(p: number): CivMods { return p >= 0 ? this.players[p].mods : {}; }

  unitCost(p: number, u: UnitType): Partial<ResBag> {
    const m = this.mods(p).unitDiscount?.[u] ?? 1;
    return scale(UNITS[u].cost, m);
  }
  buildingCost(p: number, b: BuildingType): Partial<ResBag> {
    const m = this.mods(p);
    let k = 1;
    if (b === 'castle') k *= m.castleDiscount ?? 1;
    if (b === 'mill' || b === 'lumbercamp' || b === 'miningcamp') k *= m.dropDiscount ?? 1;
    return scale(BUILDINGS[b].cost, k);
  }
  techCost(p: number, t: TechType): Partial<ResBag> { return scale(TECHS[t].cost, this.mods(p).techDiscount ?? 1); }
  ageCost(p: number, age: 2 | 3 | 4): Partial<ResBag> { return scale(AGE_UPS[age].cost, this.mods(p).ageDiscount?.[age] ?? 1); }

  /** Qué entrena un edificio para este jugador (el castillo suma la unidad única) */
  trainsOf(p: number, b: BuildingType): UnitType[] {
    const civ = this.players[p]?.civ;
    const lacks = civ ? CIVS[civ].lacks ?? [] : [];
    const base = (BUILDINGS[b].trains ?? []).filter((u) => !lacks.includes(u));
    if (b === 'castle' && civ) return [CIVS[civ].unique, ...base];
    return base;
  }

  unitMaxHp(p: number, t: UnitType): number {
    const d = UNITS[t], m = this.mods(p);
    let hp = d.hp;
    if (d.cls === 'cavalry' || d.mounted) hp *= m.cavHp ?? 1;
    if (d.cls === 'infantry' && !d.heals) hp *= m.infantryHp ?? 1;
    if (d.gunpowder) hp *= m.gunpowderHp ?? 1;
    if (d.naval && !d.gathers) hp *= m.shipHp ?? 1;
    if (t === 'fishship') hp *= m.fishShipHp ?? 1;
    if (d.cls === 'siege') hp *= m.siegeHp ?? 1;
    if (t === 'villager' && this.hasTech(p, 'loom')) hp += 15;
    if (this.hasTech(p, `up_${t}`)) hp *= 1.2;
    return hp;
  }
  buildingHpMult(p: number, b: BuildingType): number {
    const m = this.mods(p);
    let k = m.buildingHp ?? 1;
    if (b === 'towncenter' || b === 'dock') k *= m.tcHp ?? 1;
    if (this.hasTech(p, 'masonry')) k *= 1.1;
    if (this.hasTech(p, 'architecture')) k *= 1.1;
    return k;
  }

  /** Nombre de la unidad para ese jugador: cambia cuando investiga su mejora (Espadachín → Espada larga) */
  unitName(p: number, u: UnitType): string {
    const t = `up_${u}` as TechType;
    return p >= 0 && this.players[p]?.techs.has(t) ? TECHS[t].unitName ?? UNITS[u].name : UNITS[u].name;
  }
  isNaval(u: Entity): boolean { return u.cat === 'unit' && !!UNITS[u.type as UnitType].naval; }
  speedOf(u: Entity): number {
    const d = UNITS[u.type as UnitType];
    let s = d.speed;
    if (u.type === 'villager' && this.hasTech(u.owner, 'wheelbarrow')) s *= 1.15;
    if (d.mounted) s *= this.mods(u.owner).mountedSpeed ?? 1;
    if (d.trade && this.hasTech(u.owner, `up_${u.type as UnitType}`)) s *= 1.2;
    if (u.cargo?.length) s *= 1 + 0.08 * u.cargo.length; // la infantería empuja el ariete
    return s;
  }
  rangeOf(u: Entity): number {
    const d = UNITS[u.type as UnitType];
    let r = d.range;
    if (d.atkType === 'pierce' && !d.gunpowder && d.cls !== 'siege') {
      if (this.hasTech(u.owner, 'fletching')) r += TILE;
      if (d.cls === 'archer' && !d.mounted) r += this.mods(u.owner).footArcherRange ?? 0;
    }
    if (d.cls === 'siege' && r > TILE && this.hasTech(u.owner, 'siegeeng')) r += TILE;
    return r;
  }
  cooldownOf(u: Entity): number {
    const d = UNITS[u.type as UnitType], m = this.mods(u.owner);
    let k = 1;
    if (d.cls === 'infantry' && d.atkType === 'melee') k *= m.infantryAtkSpeed ?? 1;
    if (d.gunpowder) k *= m.gunpowderAtkSpeed ?? 1;
    if (d.mounted && d.cls === 'archer') k *= m.cavArcherAtkSpeed ?? 1;
    if (d.atkType === 'pierce' && d.range > TILE && this.hasTech(u.owner, 'ballistics')) k *= 1.1;
    return d.cooldown / k;
  }
  attackOf(u: Entity): number {
    const d = UNITS[u.type as UnitType];
    let a = d.atk;
    if (a && this.hasTech(u.owner, `up_${u.type as UnitType}`)) a += upAtk(u.type as UnitType);
    if (u.type === 'villager' || d.cls === 'siege' || a === 0) return a;
    if (d.atkType === 'melee' && d.range <= TILE) a += this.hasTech(u.owner, 'forge') ? 1 : 0;
    if (d.atkType === 'pierce' && !d.gunpowder) a += this.hasTech(u.owner, 'fletching') ? 1 : 0;
    if (d.atkType === 'pierce') a += this.hasTech(u.owner, 'chemistry') ? 1 : 0;
    return a;
  }
  carryCap(u: Entity): number {
    if (u.type === 'fishship') return SHIP_CARRY;
    return CARRY + (this.hasTech(u.owner, 'wheelbarrow') ? 5 : 0);
  }
  isResearching(p: number, t?: TechType): boolean {
    for (const b of this.buildingsOf(p)) if ((b.tech && (!t || b.tech === t)) || (t ? b.techQueue.includes(t) : b.techQueue.length)) return true;
    return false;
  }
  /** ¿Puede `u` atacar a `t`? (p. ej. la infantería no alcanza a los barcos) */
  canTarget(u: Entity, t: Entity): boolean {
    if (t.cat === 'node' || t.hp <= 0) return false;
    const d = UNITS[u.type as UnitType];
    if (d.atk === 0 || d.heals) return false;
    if (d.onlyBuildings && t.cat !== 'building') return false;
    if (t.cat === 'unit' && UNITS[t.type as UnitType].naval && !d.naval && this.rangeOf(u) < TILE * 1.5) return false;
    if (d.naval && t.cat === 'unit' && !UNITS[t.type as UnitType].naval && this.rangeOf(u) < TILE * 1.5) return false;
    return true;
  }

  canPlace(p: number, type: BuildingType, tx: number, ty: number, vertical = false): string | null {
    const d = BUILDINGS[type];
    const pl = this.players[p];
    const [fw, fh] = this.footprint(type, vertical);
    if (pl.age < d.age) return `Requiere la ${AGE_NAME[d.age]}`;
    if (type === 'farm' && !this.buildingsOf(p, 'mill', true).length) return 'Primero construí un molino';
    if (d.onWater) { if (!this.dockSpotOk(tx, ty)) return 'El muelle va en el agua, pegado a la costa'; }
    else if (d.onWall) {
      for (let y = ty; y < ty + fh; y++)
        for (let x = tx; x < tx + fw; x++) {
          if (this.ownWallAt(p, x, y)) continue;
          if (!this.areaFree(x, y, 1)) return 'El portón va sobre tu muralla o en un lugar libre';
        }
    } else if (!this.areaFree(tx, ty, d.size)) return 'No se puede construir ahí';
    for (let y = ty; y < ty + fh; y++)
      for (let x = tx; x < tx + fw; x++) if (!pl.explored[y * this.w + x]) return 'Terreno sin explorar';
    return null;
  }

  ownWallAt(p: number, tx: number, ty: number): Entity | undefined {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return undefined;
    const e = this.get(this.occ[ty * this.w + tx]);
    return e && e.owner === p && (e.type === 'wall' || e.type === 'stonewall') ? e : undefined;
  }

  // ------------------------------------------------------------ utilidades
  get(id: number | undefined): Entity | undefined { return id ? this.entities.get(id) : undefined; }
  isEnemy(a: number, b: number): boolean {
    if (a < 0 || b < 0) return false;
    if (this.players[a].neutral || this.players[b].neutral) return false;
    return this.players[a].team !== this.players[b].team;
  }
  canAfford(p: number, cost: Partial<ResBag>): boolean {
    const r = this.players[p].res;
    return RES_LIST.every((k) => (cost[k] ?? 0) <= r[k]);
  }
  pay(p: number, cost: Partial<ResBag>) { for (const k of RES_LIST) this.players[p].res[k] -= cost[k] ?? 0; }
  refund(p: number, cost: Partial<ResBag>) { for (const k of RES_LIST) this.players[p].res[k] += cost[k] ?? 0; }

  /** Recalcula índices por jugador, población, granjas ocupadas y celdas espaciales */
  private index() {
    if (!this.dirty) return;
    this.dirty = false;
    const n = this.players.length;
    this.ownUnits = Array.from({ length: n }, () => []);
    this.ownBuildings = Array.from({ length: n }, () => []);
    this.popCache = new Array(n).fill(0);
    this.capCache = new Array(n).fill(0);
    this.buckets.clear();
    this.allBuildings = [];
    const tcSeen: number[] = [];
    for (const e of this.entities.values()) {
      if (e.owner < 0) continue;
      if (e.cat === 'unit') {
        this.ownUnits[e.owner].push(e);
        this.popCache[e.owner] += 1 + (e.cargo?.length ?? 0);
        const k = Math.floor(e.x / CELL) * 4096 + Math.floor(e.y / CELL);
        let b = this.buckets.get(k); if (!b) this.buckets.set(k, (b = [])); b.push(e);
      } else if (e.cat === 'building') {
        this.ownBuildings[e.owner].push(e);
        this.allBuildings.push(e);
        if (e.progress >= 1) {
          let pop = BUILDINGS[e.type as BuildingType].pop ?? 0;
          if (e.type === 'towncenter' && (tcSeen[e.owner] = (tcSeen[e.owner] ?? 0) + 1) > 1) pop = 25; // centros urbanos nuevos: +25
          if (e.type === 'house') pop += this.mods(e.owner).housePop ?? 0;
          this.capCache[e.owner] += pop;
          if (e.queue.length && e.trainT > 0) this.popCache[e.owner]++;
        }
      }
    }
  }
  /** Recorre unidades cerca de (x,y) usando el índice espacial */
  forUnitsNear(x: number, y: number, r: number, fn: (e: Entity) => void) {
    this.index();
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(cx * 4096 + cy);
        if (b) for (const e of b) fn(e);
      }
  }

  popOf(p: number): number { this.index(); return this.popCache[p] ?? 0; }
  popCap(p: number): number { this.index(); return Math.min(this.popLimit, this.capCache[p] ?? 0); }
  unitsOf(p: number, type?: UnitType): Entity[] {
    this.index();
    const l = this.ownUnits[p] ?? [];
    return l.filter((e) => e.hp > 0 && (!type || e.type === type));
  }
  buildingsOf(p: number, type?: BuildingType, onlyDone = false): Entity[] {
    this.index();
    const l = this.ownBuildings[p] ?? [];
    return l.filter((e) => e.hp > 0 && (!type || e.type === type) && (!onlyDone || e.progress >= 1));
  }

  edgeDist(u: Entity, t: Entity): number {
    if (t.cat === 'unit') return Math.hypot(u.x - t.x, u.y - t.y) - u.radius - t.radius;
    const x0 = t.tx * TILE, y0 = t.ty * TILE, x1 = x0 + t.fw * TILE, y1 = y0 + t.fh * TILE;
    const cx = Math.max(x0, Math.min(u.x, x1)), cy = Math.max(y0, Math.min(u.y, y1));
    return Math.hypot(u.x - cx, u.y - cy) - u.radius;
  }

  tileSolid(tx: number, ty: number, grid: Grid = this): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return grid.solid[ty * this.w + tx] === 1;
  }

  /** Casilla libre más cercana a (tx,ty) */
  nearestFree(tx: number, ty: number, maxR = 12, naval: Grid = this): { x: number; y: number } | null {
    if (!this.tileSolid(tx, ty, naval)) return { x: tx, y: ty };
    for (let r = 1; r <= maxR; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.tileSolid(tx + dx, ty + dy, naval)) return { x: tx + dx, y: ty + dy };
        }
    return null;
  }

  // -------------------------------------------------------------- comandos
  issue(c: Command) { this.pending.push(c); }

  private applyCommand(c: Command) {
    const pl = this.players[c.p];
    if (!pl || pl.defeated) return;
    const own = (ids: number[]) => ids.map((id) => this.entities.get(id)).filter((e): e is Entity => !!e && e.owner === c.p && e.cat === 'unit');
    const msg = (text: string) => this.events.push({ t: 'msg', p: c.p, text });
    switch (c.t) {
      case 'move':
      case 'attackMove': {
        const us = own(c.ids);
        const slots = formation(us.length);
        us.forEach((u, i) => {
          const x = c.x + slots[i][0], y = c.y + slots[i][1];
          this.give(u, c.t === 'move' ? { t: 'move', x, y } : { t: 'attackMove', x, y }, c.queue);
        });
        break;
      }
      case 'relic': {
        const r = this.relics.find((x) => x.id === c.relic);
        if (!r || r.holder) return;
        for (const u of own(c.ids)) if (UNITS[u.type as UnitType].heals) this.give(u, { t: 'relic', relic: r.id }, false);
        break;
      }
      case 'chat': {
        const text = String(c.text).slice(0, 140);
        this.chat.push({ tick: this.tick, from: c.p, to: c.to, text });
        if (this.chat.length > 200) this.chat.splice(0, this.chat.length - 200);
        this.events.push({ t: 'chat', from: c.p, to: c.to, text });
        break;
      }
      case 'tribute': {
        const to = this.players[c.to];
        if (!to || to.id === c.p || to.team !== pl.team) return;
        const n = Math.max(0, Math.min(Math.floor(c.n), Math.floor(pl.res[c.res])));
        if (!n) return;
        pl.res[c.res] -= n; to.res[c.res] += n;
        this.events.push({ t: 'msg', p: to.id, text: `${pl.name} te mandó ${n} de ${RES_NAME[c.res].toLowerCase()}` });
        break;
      }
      case 'unload':
        for (const u of own(c.ids)) this.unload(u);
        break;
      case 'explore':
        for (const u of own(c.ids)) if (World.canExplore(u)) { u.cmdQueue = []; this.setOrder(u, this.exploreOrder(u)); }
        break;
      case 'delete':
        for (const id of c.ids) { const e = this.entities.get(id); if (e && e.owner === c.p && e.cat !== 'node') e.hp = 0; }
        break;
      case 'stop':
        for (const u of own(c.ids)) { u.cmdQueue = []; this.setOrder(u, undefined); }
        break;
      case 'target': {
        const t = this.entities.get(c.target);
        if (!t) return;
        for (const u of own(c.ids)) this.give(u, this.orderFor(u, t), c.queue);
        break;
      }
      case 'stance':
        for (const u of own(c.ids)) { u.stance = c.stance; u.home = undefined; if (c.stance === 'pas' && u.order?.t === 'attack' && u.order.auto) this.setOrder(u, undefined); }
        break;
      case 'gateLock': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p || b.type !== 'gate') return;
        b.locked = !b.locked;
        for (let y = b.ty; y < b.ty + b.fh; y++) for (let x = b.tx; x < b.tx + b.fw; x++) this.refreshCell(y * this.w + x);
        msg(b.locked ? 'Portón bloqueado' : 'Portón abierto para tu equipo');
        break;
      }
      case 'build': {
        const us = own(c.ids).filter((u) => u.type === 'villager');
        if (!us.length) return;
        const why = this.canPlace(c.p, c.b, c.tx, c.ty, c.vertical);
        if (why) { msg(why); return; }
        const cost = this.buildingCost(c.p, c.b);
        if (!this.canAfford(c.p, cost)) { msg('Recursos insuficientes'); return; }
        this.pay(c.p, cost);
        if (BUILDINGS[c.b].onWall) {
          const [fw, fh] = this.footprint(c.b, c.vertical);
          for (let y = c.ty; y < c.ty + fh; y++) for (let x = c.tx; x < c.tx + fw; x++) { const old = this.ownWallAt(c.p, x, y); if (old) this.remove(old.id); }
        }
        const b = this.placeBuilding(c.p, c.b, c.tx, c.ty, false, c.vertical);
        for (const u of us) this.give(u, { t: 'build', target: b.id }, c.queue);
        break;
      }
      case 'train': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p || b.cat !== 'building' || b.progress < 1) return;
        const ud = UNITS[c.u];
        if (!this.trainsOf(c.p, b.type as BuildingType).includes(c.u)) return;
        if (pl.age < ud.age) { msg(`Requiere la ${AGE_NAME[ud.age]}`); return; }
        if (ud.requires && !pl.techs.has(ud.requires)) { msg(`Requiere ${TECHS[ud.requires].name}`); return; }
        if (b.queue.length >= 10) return;
        if (ud.trade && !this.tradePartners(c.p, ud.naval ? 'dock' : 'market').length) { msg(ud.naval ? 'El comercio solo funciona con un aliado que tenga muelle' : 'El comercio solo funciona con un aliado que tenga mercado'); return; }
        const cost = this.unitCost(c.p, c.u);
        if (!this.canAfford(c.p, cost)) { msg('Recursos insuficientes'); return; }
        this.pay(c.p, cost);
        b.queue.push(c.u);
        break;
      }
      case 'cancel': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p) return;
        if (c.what === 'tech') {
          const q = b.techQueue.pop();
          if (q) { this.refund(c.p, this.techCost(c.p, q)); return; }
          if (b.tech) { this.refund(c.p, this.techCost(c.p, b.tech)); b.tech = undefined; b.techT = 0; }
          return;
        }
        if (b.ageT >= 0 && !b.queue.length) { b.ageT = -1; this.refund(c.p, this.ageCost(c.p, (pl.age + 1) as 2 | 3 | 4)); return; }
        const u = b.queue.pop();
        if (u) { this.refund(c.p, this.unitCost(c.p, u)); if (!b.queue.length) b.trainT = 0; this.dirty = true; }
        break;
      }
      case 'age': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p || b.type !== 'towncenter' || b.progress < 1) return;
        if (pl.age >= 4 || this.isResearchingAge(c.p)) return;
        const cost = this.ageCost(c.p, (pl.age + 1) as 2 | 3 | 4);
        if (!this.canAfford(c.p, cost)) { msg('Recursos insuficientes'); return; }
        this.pay(c.p, cost);
        b.ageT = 0;
        break;
      }
      case 'research': {
        const b = this.entities.get(c.bid);
        if (!b || b.owner !== c.p || b.cat !== 'building' || b.progress < 1 || b.techQueue.length >= 5) return;
        const td = TECHS[c.tech];
        const okHere = td.unit ? this.trainsOf(c.p, b.type as BuildingType).includes(td.unit) : BUILDINGS[b.type as BuildingType].research?.includes(c.tech);
        if (!okHere) return;
        if (pl.techs.has(c.tech) || this.isResearching(c.p, c.tech)) return;
        if (pl.age < td.age) return;
        const cost = this.techCost(c.p, c.tech);
        if (!this.canAfford(c.p, cost)) { msg('Recursos insuficientes'); return; }
        this.pay(c.p, cost);
        if (!b.tech) { b.tech = c.tech; b.techT = 0; } else b.techQueue.push(c.tech);
        break;
      }
      case 'trade': {
        if (!this.buildingsOf(c.p, 'market', true).length) return;
        if (c.res === 'gold') return;
        if (c.buy) {
          if (pl.res.gold < TRADE.buy) { msg('Falta oro'); return; }
          pl.res.gold -= TRADE.buy; pl.res[c.res] += TRADE.lot;
        } else {
          if (pl.res[c.res] < TRADE.lot) { msg('No tenés suficiente para vender'); return; }
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

  /** Puntuación al estilo AoE */
  score(p: number) {
    const st = this.players[p].stats;
    const eco = Math.floor((st.gathered.food + st.gathered.wood + st.gathered.gold + st.gathered.stone) / 10);
    const mil = Math.floor(st.killValue / 5);
    const tech = Math.floor(st.techValue / 5);
    return { eco, mil, tech, total: eco + mil + tech };
  }

  isResearchingAge(p: number): boolean {
    for (const b of this.buildingsOf(p, 'towncenter')) if (b.ageT >= 0) return true;
    return false;
  }

  /** Da una orden; con `queue` se agrega al final de la cola */
  give(u: Entity, o: Order | undefined, queue?: boolean) {
    u.home = undefined;
    if (queue && (u.order || u.cmdQueue.length)) { if (o) u.cmdQueue.push(o); return; }
    u.cmdQueue = [];
    this.setOrder(u, o);
  }

  /** ¿La granja está libre para este aldeano? (una granja, un aldeano) */
  farmFree(f: Entity, u: Entity): boolean {
    const c = this.farmClaim.get(f.id);
    if (!c || c === u.id) return true;
    const cu = this.entities.get(c);
    return !cu || cu.hp <= 0 || cu.order?.t !== 'gather' || cu.order.target !== f.id;
  }

  /** Orden contextual: recolectar, construir, atacar o moverse según el objetivo. */
  orderOnTarget(u: Entity, t: Entity) { this.setOrder(u, this.orderFor(u, t)); }

  orderFor(u: Entity, t: Entity): Order | undefined {
    const d = UNITS[u.type as UnitType];
    const isVill = u.type === 'villager';
    const near: Order = { t: 'move', x: t.x, y: t.y + (t.cat === 'building' ? t.fh * TILE * 0.5 + 12 : TILE) };
    if (d.trade) {
      const kind = d.naval ? 'dock' : 'market';
      if (t.cat === 'building' && t.type === kind && t.owner !== u.owner && !this.isEnemy(u.owner, t.owner) && !this.players[t.owner].neutral) {
        const home = this.nearestOwn(u, kind);
        if (home) return { t: 'trade', home: home.id, dest: t.id, leg: 'go' };
      }
      return near;
    }
    if (d.heals) return t.cat === 'unit' && !this.isEnemy(u.owner, t.owner) && t.id !== u.id ? { t: 'heal', target: t.id } : near;
    if (t.cat === 'node') {
      const isFish = t.type === 'fish';
      if ((isVill && !isFish) || (d.gathers && isFish)) return { t: 'gather', target: t.id, res: NODES[t.type as NodeType].res, phase: 'go' };
      return near;
    }
    if (this.isEnemy(u.owner, t.owner)) return this.canTarget(u, t) ? { t: 'attack', target: t.id } : near;
    if (t.type === 'ram' && t.owner === u.owner && World.canBoard(u)) return { t: 'board', target: t.id };
    if (t.cat === 'building' && isVill && this.players[t.owner].team === this.players[u.owner].team) {
      if (t.progress < 1 || t.hp < t.maxHp) return { t: 'build', target: t.id };
      if (t.type === 'farm' && t.owner === u.owner) {
        if (this.farmFree(t, u)) return { t: 'gather', target: t.id, res: 'food', phase: 'go' };
        const other = this.findNode(u, 'food', 8 * TILE, true);
        if (other) return { t: 'gather', target: other.id, res: 'food', phase: 'go' };
        this.events.push({ t: 'msg', p: u.owner, text: 'Esa granja ya tiene un granjero' });
        return near;
      }
      const drop = BUILDINGS[t.type as BuildingType].drop;
      if (u.carry > 0 && u.carryRes && drop?.includes(u.carryRes) && t.owner === u.owner && t.type !== 'dock') {
        const node = this.entities.get(u.lastNode);
        return { t: 'gather', target: node ? node.id : 0, res: u.carryRes, phase: 'return' };
      }
    }
    if (t.cat === 'building' && t.type === 'dock' && d.gathers && t.owner === u.owner && u.carry > 0) return { t: 'gather', target: u.lastNode, res: 'food', phase: 'return' };
    return near;
  }

  setOrder(u: Entity, o: Order | undefined) {
    if (!o && u.cmdQueue?.length) o = u.cmdQueue.shift();
    u.order = o;
    u.path = []; u.pathKey = ''; u.repathAt = 0;
    if (o?.t === 'gather') {
      const f = this.entities.get(o.target);
      if (f && f.type === 'farm') this.farmClaim.set(f.id, u.id);
    }
  }

  // ------------------------------------------------------------ simulación
  step() {
    for (const c of this.pending) this.applyCommand(c);
    this.pending = [];
    this.tick++;
    this.dirty = true;
    for (const e of this.entities.values()) {
      if (e.hp <= 0) continue;
      if (e.cat === 'unit') this.updateUnit(e);
      else if (e.cat === 'building') this.updateBuilding(e);
    }
    this.updateRelics();
    this.separate();
    let dead = false;
    for (const e of this.entities.values()) if (e.hp <= 0) { dead = true; break; }
    if (dead) for (const e of [...this.entities.values()]) if (e.hp <= 0) this.kill(e);
    if (this.tick % 10 === 0) this.refreshVisibility();
    if (this.tick % (TICK_RATE * 60) === 0) this.unreachable.clear();
    if (this.tick % 20 === 0 && this.checkDefeat) this.updateDefeat();
  }

  private kill(e: Entity) {
    if (!this.entities.has(e.id)) return;
    if (e.cargo?.length) this.unload(e);
    this.entities.delete(e.id);
    this.dirty = true;
    if (e.cat !== 'unit') this.occupy(e, false);
    if (e.cat !== 'node') {
      this.events.push({ t: 'death', x: e.x, y: e.y, cat: e.cat, owner: e.owner, naval: this.isNaval(e) });
      if (e.owner >= 0) this.players[e.owner].stats.lost++;
    }
  }

  /** Otorga una investigación sin costo ni puntos (modo Combate imperial) */
  grantTech(p: number, t: TechType) {
    const pl = this.players[p];
    if (pl.techs.has(t)) return;
    pl.techs.add(t);
    if (t === 'masonry' || t === 'architecture') for (const b of this.buildingsOf(p)) { b.maxHp = Math.round(b.maxHp * 1.1); b.hp = b.maxHp; }
    if (t === 'loom') for (const v of this.unitsOf(p, 'villager')) { v.maxHp += 15; v.hp += 15; }
    const up = TECHS[t].unit;
    if (up) for (const v of this.unitsOf(p, up)) { v.maxHp = Math.round(v.maxHp * 1.2); v.hp *= 1.2; }
  }

  private finishTech(p: number, t: TechType) {
    const pl = this.players[p];
    pl.techs.add(t);
    pl.stats.techValue += sumCost(this.techCost(p, t));
    if (t === 'masonry' || t === 'architecture') {
      for (const b of this.buildingsOf(p)) { b.maxHp = Math.round(b.maxHp * 1.1); b.hp *= 1.1; }
    }
    if (t === 'loom') for (const v of this.unitsOf(p, 'villager')) { v.maxHp += 15; v.hp += 15; }
    const up = TECHS[t].unit;
    if (up) for (const v of this.unitsOf(p, up)) { v.maxHp = Math.round(v.maxHp * 1.2); v.hp *= 1.2; }
    this.events.push({ t: 'tech', p, tech: t });
    this.events.push({ t: 'msg', p, text: `Investigación lista: ${TECHS[t].name}` });
  }

  private updateBuilding(b: Entity) {
    if (b.progress < 1) return;
    const bd = BUILDINGS[b.type as BuildingType];
    const pl = this.players[b.owner];
    // las investigaciones corren en paralelo al entrenamiento, una tras otra por edificio
    if (!b.tech && b.techQueue.length) { b.tech = b.techQueue.shift(); b.techT = 0; }
    if (b.tech) {
      b.techT += DT;
      if (b.techT >= TECHS[b.tech].time) {
        const t = b.tech;
        b.tech = undefined; b.techT = 0;
        this.finishTech(b.owner, t);
      }
    }
    if (b.ageT >= 0) {
      b.ageT += DT;
      const next = (pl.age + 1) as 2 | 3 | 4;
      if (b.ageT >= AGE_UPS[next].time) {
        b.ageT = -1; pl.age = next;
        pl.stats.techValue += sumCost(this.ageCost(b.owner, next));
        this.events.push({ t: 'age', p: b.owner, age: next });
        this.events.push({ t: 'msg', p: b.owner, text: `¡Avanzaste a la ${AGE_NAME[next]}!` });
      }
    } else if (b.queue.length) {
      const ut = b.queue[0];
      if (this.popOf(b.owner) - (b.trainT > 0 ? 1 : 0) < this.popCap(b.owner)) {
        if (b.trainT === 0) this.dirty = true;
        const m = this.mods(b.owner);
        const speed = b.type === 'range' ? m.rangeTrainSpeed ?? 1 : b.type === 'dock' ? m.dockTrainSpeed ?? 1 : 1;
        b.trainT += DT * speed;
        if (b.trainT >= UNITS[ut].trainTime) {
          b.trainT = 0; b.queue.shift();
          const spot = this.spawnSpot(b, UNITS[ut].naval ? this.nav : this.teamGrid(pl.team));
          const u = this.spawnUnit(b.owner, ut, spot.x, spot.y);
          pl.stats.trained++;
          this.events.push({ t: 'trained', p: b.owner, id: u.id });
          if (UNITS[ut].trade) {
            const dest = this.tradePartners(b.owner, b.type === 'dock' ? 'dock' : 'market').sort((a2, b2) => Math.hypot(b2.x - b.x, b2.y - b.y) - Math.hypot(a2.x - b.x, a2.y - b.y))[0];
            if (dest) this.setOrder(u, { t: 'trade', home: b.id, dest: dest.id, leg: 'go' });
          } else if (b.rally) {
            const t = this.get(b.rally.target);
            if (t) this.orderOnTarget(u, t);
            else this.setOrder(u, { t: 'move', x: b.rally.x, y: b.rally.y });
          }
        }
      } else if (this.tick - pl.lastPopMsg > TICK_RATE * 8) {
        pl.lastPopMsg = this.tick;
        this.events.push({ t: 'msg', p: b.owner, text: this.popCap(b.owner) >= this.popLimit ? 'Llegaste al límite de población' : 'Necesitás más casas' });
      }
    }
    // Ataque de torres, castillos y centros urbanos
    if (bd.attack) {
      b.cooldown -= DT;
      if (b.cooldown <= 0) {
        let best: Entity | undefined, bd2 = Infinity;
        const range = bd.attack.range + (this.hasTech(b.owner, 'fletching') ? TILE : 0);
        this.forUnitsNear(b.x, b.y, range + b.size * TILE, (e) => {
          if (e.hp <= 0 || !this.isEnemy(b.owner, e.owner)) return;
          const d = this.edgeDist(e, b) + e.radius;
          if (d <= range && d < bd2) { bd2 = d; best = e; }
        });
        if (best) {
          const tgt = best as Entity;
          b.cooldown = bd.attack.cooldown;
          const atk = bd.attack.atk + (this.hasTech(b.owner, 'murderholes') ? 3 : 0) + (this.hasTech(b.owner, 'fletching') ? 1 : 0);
          this.dealDamage(b, tgt, atk, 'pierce', undefined);
          this.events.push({ t: 'shot', x1: b.x, y1: b.y - 10, x2: tgt.x, y2: tgt.y, kind: 'arrow' });
        } else b.cooldown = 0.3;
      }
    }
  }

  private spawnSpot(b: Entity, naval: Grid): { x: number; y: number } {
    const goal = b.rally ?? { x: b.x, y: b.y + 999 };
    let best = { x: b.x, y: b.y + b.size * TILE }, bd = Infinity;
    for (let r = 0; r < 5; r++) {
      const x0 = b.tx - 1 - r, y0 = b.ty - 1 - r, s = b.size + 2 + r * 2;
      for (let y = y0; y < y0 + s; y++)
        for (let x = x0; x < x0 + s; x++) {
          if (x !== x0 && x !== x0 + s - 1 && y !== y0 && y !== y0 + s - 1) continue;
          if (this.tileSolid(x, y, naval)) continue;
          const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
          const d = Math.hypot(px - goal.x, py - goal.y);
          if (d < bd) { bd = d; best = { x: px + (this.rng.next() - 0.5) * 6, y: py + (this.rng.next() - 0.5) * 6 }; }
        }
      if (bd < Infinity) break;
    }
    return best;
  }

  private damageOf(atk: number, type: 'melee' | 'pierce', bonus: Partial<Record<ArmorClass, number>> | undefined, t: Entity, src?: Entity): number {
    let armor: number, cls: ArmorClass;
    if (t.cat === 'building') {
      armor = BUILDING_ARMOR[type] + (this.hasTech(t.owner, 'masonry') ? 1 : 0) + (this.hasTech(t.owner, 'architecture') ? 1 : 0);
      cls = 'building';
    } else {
      const d = UNITS[t.type as UnitType];
      armor = type === 'melee' ? d.armorMelee : d.armorPierce; cls = d.cls;
      if (d.cls === 'infantry' && !d.heals && this.hasTech(t.owner, 'mail')) armor += 1;
      if (d.cls === 'cavalry' || d.mounted) armor += this.hasTech(t.owner, 'barding') ? (type === 'melee' ? 1 : 2) : 0;
      if (t.type === 'villager' && this.hasTech(t.owner, 'loom')) armor += type === 'melee' ? 1 : 2;
      if (this.hasTech(t.owner, `up_${t.type as UnitType}`)) armor += 1;
    }
    let dmg = atk + (bonus?.[cls] ?? 0);
    if (t.cat === 'unit' && bonus) for (const tag of UNITS[t.type as UnitType].tags ?? []) dmg += bonus[tag] ?? 0;
    if (src?.cargo?.length) dmg *= 1 + 0.1 * src.cargo.length; // la infantería adentro empuja el ariete
    if (cls === 'building' && src && src.cat === 'unit' && UNITS[src.type as UnitType].cls === 'siege' && this.hasTech(src.owner, 'siegeeng')) dmg *= 1.2;
    return Math.max(1, dmg - armor);
  }

  private dealDamage(src: Entity, t: Entity, atk: number, type: 'melee' | 'pierce', bonus: Partial<Record<ArmorClass, number>> | undefined) {
    if (t.hp <= 0) return;
    t.hp -= this.damageOf(atk, type, bonus, t, src) * (t.hero ? 0.5 : 1); // los héroes resisten el doble
    t.lastHitBy = src.id;
    this.events.push({ t: 'hit', x: t.x, y: t.y });
    const tp = this.players[t.owner];
    if (tp && this.tick - tp.lastAttackMsg > TICK_RATE * 15) {
      tp.lastAttackMsg = this.tick;
      this.events.push({ t: 'attacked', p: t.owner, x: t.x, y: t.y });
    }
    if (t.hp <= 0 && src.owner >= 0) {
      const st = this.players[src.owner].stats;
      st.kills++;
      st.killValue += sumCost(t.cat === 'unit' ? UNITS[t.type as UnitType].cost : BUILDINGS[t.type as BuildingType].cost);
    }
  }

  // ---------------------------------------------------------- unidades
  private updateUnit(u: Entity) {
    const d = UNITS[u.type as UnitType];
    if (u.cooldown > 0) u.cooldown -= DT;
    if ((d.regen || u.hero) && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + (d.regen ?? 0) * DT + (u.hero ? 3 * DT : 0));
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
            sub = this.findEnemy(u, Math.max(d.sight * TILE, this.rangeOf(u) + TILE));
            if (sub) { o.sub = sub.id; u.path = []; u.pathKey = ''; }
          }
        }
        if (sub) {
          if (!this.attackStep(u, d, sub)) { o.sub = undefined; u.acquireAt = this.tick + 40; u.path = []; u.pathKey = ''; }
        } else if (this.moveTo(u, o.x, o.y)) this.setOrder(u, undefined);
        break;
      }
      case 'attack': {
        const t = this.get(o.target);
        if (!t || t.hp <= 0) { this.setOrder(u, undefined); break; }
        // modo neutral: no perseguir lejos de su puesto
        if (o.auto && u.stance === 'def' && u.home && Math.hypot(u.x - u.home.x, u.y - u.home.y) > 6 * TILE) {
          this.setOrder(u, { t: 'move', x: u.home.x, y: u.home.y });
          break;
        }
        if (!this.attackStep(u, d, t)) this.setOrder(u, undefined);
        break;
      }
      case 'gather': this.gatherStep(u, o); break;
      case 'build': this.buildStep(u, o); break;
      case 'relic': {
        const r = this.relics.find((x) => x.id === o.relic);
        if (!r || r.holder || (r.carrier && r.carrier !== u.id)) { this.setOrder(u, undefined); break; }
        if (u.carryRelic === r.id) {
          const mon = this.nearestOwn(u, 'monastery');
          if (!mon) { this.setOrder(u, undefined); break; }
          if (this.edgeDist(u, mon) <= INTERACT + 4) {
            r.holder = mon.id; r.carrier = undefined; u.carryRelic = undefined;
            r.x = mon.x; r.y = mon.y;
            this.events.push({ t: 'msg', p: u.owner, text: 'Reliquia guardada en el monasterio: +1 de oro por segundo' });
            this.setOrder(u, undefined);
          } else if (!this.approach(u, mon, INTERACT)) this.setOrder(u, undefined);
          break;
        }
        if (Math.hypot(u.x - r.x, u.y - r.y) < 22) {
          if (u.carryRelic) { this.setOrder(u, undefined); break; }
          r.carrier = u.id; u.carryRelic = r.id;
          this.events.push({ t: 'relic', p: u.owner, x: r.x, y: r.y });
          u.path = []; u.pathKey = '';
        } else if (this.moveTo(u, r.x, r.y) && Math.hypot(u.x - r.x, u.y - r.y) >= 22) this.setOrder(u, undefined);
        break;
      }
      case 'trade': {
        const home = this.get(o.home), dest = this.get(o.dest);
        if (!home || !dest || home.owner !== u.owner || this.isEnemy(u.owner, dest.owner) || dest.owner === u.owner) { this.setOrder(u, undefined); break; }
        const tgt = o.leg === 'go' ? dest : home;
        if (this.edgeDist(u, tgt) <= INTERACT) {
          if (o.leg === 'go') {
            const tiles = Math.hypot(home.x - dest.x, home.y - dest.y) / TILE;
            u.carry = Math.max(5, Math.round(tiles * 0.8 + (tiles * tiles) / 250));
            u.carryRes = 'gold';
            o.leg = 'back';
          } else {
            const pl = this.players[u.owner];
            pl.res.gold += u.carry; pl.stats.gathered.gold += u.carry;
            u.carry = 0;
            o.leg = 'go';
          }
          u.path = []; u.pathKey = '';
        } else if (!this.approach(u, tgt, INTERACT - 2)) this.setOrder(u, undefined);
        break;
      }
      case 'board': {
        const r = this.entities.get(o.target);
        if (!r || r.hp <= 0 || r.owner !== u.owner || (r.cargo?.length ?? 0) >= RAM_CAPACITY) { this.setOrder(u, undefined); break; }
        if (Math.hypot(u.x - r.x, u.y - r.y) <= r.radius + u.radius + 10) { this.board(u, r); break; }
        this.moveTo(u, r.x, r.y);
        break;
      }
      case 'explore': {
        if (this.tick > o.until || this.moveTo(u, o.x, o.y)) u.order = this.exploreOrder(u);
        else if (this.tick % 20 === 0 && this.players[u.owner].explored[Math.floor(o.y / TILE) * this.w + Math.floor(o.x / TILE)]) u.order = this.exploreOrder(u);
        break;
      }
      case 'heal': {
        const t = this.get(o.target);
        if (!t || t.hp <= 0 || t.hp >= t.maxHp) { this.setOrder(u, undefined); break; }
        if (this.edgeDist(u, t) <= d.range) {
          u.path = [];
          u.facing = Math.atan2(t.y - u.y, t.x - u.x);
          t.hp = Math.min(t.maxHp, t.hp + 4 * DT * (this.hasTech(u.owner, 'up_monk') ? 1.5 : 1));
          if (this.tick % 10 === 0) this.events.push({ t: 'heal', x: t.x, y: t.y });
        } else if (!this.approach(u, t, d.range * 0.8)) this.setOrder(u, undefined);
        break;
      }
    }
  }

  private idleBehaviour(u: Entity, d: UnitDef) {
    if (this.tick < u.acquireAt) return;
    u.acquireAt = this.tick + 10;
    if (d.trade) return;
    if (u.carryRelic) { if (this.nearestOwn(u, 'monastery')) this.setOrder(u, { t: 'relic', relic: u.carryRelic }); return; }
    if (u.type === 'villager' || d.gathers) return;
    if (u.stance === 'pas' && !d.heals) return;
    if (u.stance === 'def' && !u.home) u.home = { x: u.x, y: u.y };
    if (d.heals) {
      let best: Entity | undefined, bd = d.sight * TILE;
      this.forUnitsNear(u.x, u.y, bd, (e) => {
        if (e.id === u.id || e.hp >= e.maxHp || e.hp <= 0 || this.isEnemy(u.owner, e.owner) || e.owner < 0) return;
        const dist = Math.hypot(e.x - u.x, e.y - u.y);
        if (dist < bd) { bd = dist; best = e; }
      });
      if (best) this.setOrder(u, { t: 'heal', target: (best as Entity).id });
      return;
    }
    // Agresiva: ataca todo lo que ve. Neutral: solo responde a quien la ataca (y lo persigue hasta cierta distancia).
    const reach = u.stance === 'def' ? Math.max(d.sight * TILE, this.rangeOf(u)) + 4 * TILE : Math.max(d.sight * TILE, this.rangeOf(u));
    const hitter = this.get(u.lastHitBy);
    if (hitter && hitter.hp > 0 && this.isEnemy(u.owner, hitter.owner) && this.canTarget(u, hitter) && (u.stance === 'agg' || this.edgeDist(u, hitter) < reach + TILE)) {
      this.setOrder(u, { t: 'attack', target: hitter.id, auto: true });
      u.lastHitBy = 0;
      return;
    }
    const e = u.stance === 'def' ? undefined : this.findEnemy(u, reach);
    if (e) this.setOrder(u, { t: 'attack', target: e.id, auto: true });
    else if (u.stance === 'def' && u.home && Math.hypot(u.x - u.home.x, u.y - u.home.y) > TILE) this.setOrder(u, { t: 'move', x: u.home.x, y: u.home.y });
  }

  findEnemy(u: Entity, range: number): Entity | undefined {
    const d = UNITS[u.type as UnitType];
    let best: Entity | undefined, bd = Infinity;
    if (!d.onlyBuildings) {
      this.forUnitsNear(u.x, u.y, range + 20, (e) => {
        if (e.hp <= 0 || !this.isEnemy(u.owner, e.owner) || !this.canTarget(u, e)) return;
        const dist = this.edgeDist(u, e);
        if (dist < range && dist < bd) { bd = dist; best = e; }
      });
    }
    this.index();
    for (const e of this.allBuildings) {
      if (e.hp <= 0 || !this.isEnemy(u.owner, e.owner) || !this.canTarget(u, e)) continue;
      if (Math.abs(e.x - u.x) > range + 80 || Math.abs(e.y - u.y) > range + 80) continue;
      const dist = this.edgeDist(u, e) + (d.onlyBuildings || e.type === 'wall' || e.type === 'stonewall' ? 0 : 40);
      if (dist < range && dist < bd) { bd = dist; best = e; }
    }
    return best;
  }

  /** Devuelve false si el objetivo no se puede alcanzar */
  private attackStep(u: Entity, d: UnitDef, t: Entity): boolean {
    if (!this.canTarget(u, t)) return false;
    const range = this.rangeOf(u);
    const dist = this.edgeDist(u, t);
    if (dist <= range) {
      u.path = [];
      u.facing = Math.atan2(t.y - u.y, t.x - u.x);
      if (u.cooldown <= 0) {
        u.cooldown = this.cooldownOf(u);
        u.lastAtk = this.tick;
        const atk = this.attackOf(u);
        this.dealDamage(u, t, atk, d.atkType, d.bonus);
        if (d.projectile && d.projectile !== 'fire') this.events.push({ t: 'shot', x1: u.x, y1: u.y, x2: t.x, y2: t.y, kind: d.projectile });
        if (d.projectile === 'fire') this.events.push({ t: 'shot', x1: u.x, y1: u.y, x2: t.x, y2: t.y, kind: 'fire' });
        if (d.splash) {
          this.events.push({ t: 'blast', x: t.x, y: t.y, r: d.splash });
          this.forUnitsNear(t.x, t.y, d.splash + 16, (e) => {
            if (e === t || e.hp <= 0 || !this.isEnemy(u.owner, e.owner)) return;
            if (Math.hypot(e.x - t.x, e.y - t.y) - e.radius > d.splash!) return;
            this.dealDamage(u, e, atk * 0.6, d.atkType, d.bonus);
          });
        }
        if (d.multishot) {
          let n = d.multishot;
          this.forUnitsNear(t.x, t.y, 60, (e) => {
            if (n <= 0 || e === t || e.hp <= 0 || !this.isEnemy(u.owner, e.owner) || !this.canTarget(u, e)) return;
            if (Math.hypot(e.x - t.x, e.y - t.y) > 60) return;
            n--;
            this.dealDamage(u, e, atk, d.atkType, d.bonus);
            this.events.push({ t: 'shot', x1: u.x, y1: u.y, x2: e.x, y2: e.y, kind: 'bolt' });
          });
        }
      }
      return true;
    }
    // cuerpo a cuerpo: golpe de oportunidad, persecución directa y rodear al objetivo
    if (range <= TILE && !d.projectile && !this.isNaval(u)) {
      if (t.cat === 'unit') {
        let alt: Entity | undefined, ad = range;
        this.forUnitsNear(u.x, u.y, 48, (e) => {
          if (e === t || e.hp <= 0 || !this.isEnemy(u.owner, e.owner) || !this.canTarget(u, e) || this.isNaval(e)) return;
          const de = this.edgeDist(u, e);
          if (de <= ad) { ad = de; alt = e; }
        });
        const o = u.order;
        if (alt && o && (o.t === 'attack' || o.t === 'attackMove') && (o.t === 'attackMove' || o.auto || dist > 2 * TILE)) {
          if (o.t === 'attack') o.target = alt.id; else o.sub = alt.id;
          return this.attackStep(u, d, alt);
        }
      }
      const grid = this.gridOf(u);
      const dc = Math.hypot(t.x - u.x, t.y - u.y);
      if (t.cat === 'unit' && dc < 5 * TILE && lineClear(grid, TILE, u.x, u.y, t.x, t.y)) {
        if (u.appTarget !== t.id) { u.appTarget = t.id; u.appAng = Math.atan2(u.y - t.y, u.x - t.x) + ((u.id % 5) - 2) * 0.4; }
        u.path = []; u.pathKey = '';
        const rr = t.radius + u.radius + 1;
        // lejos: directo al objetivo; cerca: a su lugar alrededor
        const k = Math.max(0, Math.min(1, (2.5 * TILE - dc) / (1.5 * TILE)));
        const ang = Math.atan2(u.y - t.y, u.x - t.x) * (1 - k) + this.lerpAng(Math.atan2(u.y - t.y, u.x - t.x), u.appAng!) * k;
        this.stepToward(u, t.x + Math.cos(ang) * rr, t.y + Math.sin(ang) * rr);
        return true;
      }
    }
    if (this.approach(u, t, range)) return true;
    // ¿lo tapa una muralla o puerta enemiga? entonces atacarla primero
    if (!this.isNaval(u)) {
      const b = this.findBlocker(u, t, range);
      if (b && b !== t) {
        const o = u.order;
        if (o?.t === 'attack') this.setOrder(u, { t: 'attack', target: b.id });
        else if (o?.t === 'attackMove') { o.sub = b.id; u.path = []; u.pathKey = ''; }
        return true;
      }
    }
    return false;
  }

  private isWallLike(e: Entity): boolean { return e.type === 'wall' || e.type === 'stonewall' || e.type === 'gate'; }

  /** Primera muralla/puerta enemiga que corta el camino hacia `t` */
  findBlocker(u: Entity, t: Entity, range: number): Entity | undefined {
    this.index();
    const base = this.gridOf(u).solid;
    const open = base.slice();
    let any = false;
    for (const b of this.allBuildings)
      if (this.isWallLike(b) && this.isEnemy(u.owner, b.owner)) {
        for (let y = b.ty; y < b.ty + b.fh; y++) for (let x = b.tx; x < b.tx + b.fw; x++) open[y * this.w + x] = 0;
        any = true;
      }
    if (!any) return undefined;
    const goalR = range + TILE * 0.75;
    const x0 = t.cat === 'unit' ? t.x : t.tx * TILE, y0 = t.cat === 'unit' ? t.y : t.ty * TILE;
    const x1 = t.cat === 'unit' ? t.x : x0 + t.fw * TILE, y1 = t.cat === 'unit' ? t.y : y0 + t.fh * TILE;
    const tiles = findPath({ w: this.w, h: this.h, solid: open }, Math.floor(u.x / TILE), Math.floor(u.y / TILE), (x, y) => {
      const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
      const cx = Math.max(x0, Math.min(px, x1)), cy = Math.max(y0, Math.min(py, y1));
      return Math.hypot(px - cx, py - cy) <= goalR;
    }, Math.floor(t.x / TILE), Math.floor(t.y / TILE));
    if (!pathFound()) return undefined;
    for (const p of tiles) {
      const i = p.y * this.w + p.x;
      if (!base[i]) continue;
      const e = this.get(this.occ[i]);
      if (e && this.isWallLike(e) && this.isEnemy(u.owner, e.owner)) return e;
    }
    return undefined;
  }

  private gatherStep(u: Entity, o: Extract<Order, { t: 'gather' }>) {
    const pl = this.players[u.owner];
    const naval = this.isNaval(u);
    if (u.carry > 0 && u.carryRes !== o.res) o.phase = 'return';
    const cap = this.carryCap(u);
    if (u.carry >= cap) o.phase = 'return';
    if (o.phase === 'return') {
      if (u.carry <= 0) { o.phase = 'go'; return; }
      const drop = this.nearestDrop(u, u.carryRes!);
      if (!drop) {
        if (this.tick % (TICK_RATE * 10) === 0) this.events.push({ t: 'msg', p: u.owner, text: naval ? 'Construí un muelle para descargar la pesca' : 'No hay depósito cerca para ese recurso' });
        this.setOrder(u, undefined);
        return;
      }
      if (this.edgeDist(u, drop) <= INTERACT) {
        pl.res[u.carryRes!] += u.carry;
        pl.stats.gathered[u.carryRes!] += u.carry;
        u.carry = 0;
        o.phase = 'go';
        u.path = []; u.pathKey = '';
      } else if (!this.approach(u, drop, INTERACT)) this.setOrder(u, undefined);
      return;
    }
    let node = this.get(o.target);
    const valid = (n: Entity | undefined) => !!n && n.hp > 0 && n.amount > 0 &&
      ((n.cat === 'node' && (n.type === 'fish') === naval) || (!naval && n.type === 'farm' && n.owner === u.owner && n.progress >= 1 && this.farmFree(n, u)));
    if (!valid(node)) {
      node = this.findNode(u, o.res, 10 * TILE);
      if (!node) {
        if (u.carry > 0) { o.phase = 'return'; return; }
        this.setOrder(u, undefined);
        return;
      }
      o.target = node.id;
      if (node.type === 'farm') this.farmClaim.set(node.id, u.id);
      u.path = []; u.pathKey = '';
    }
    const n = node!;
    const atFarm = n.type === 'farm' && this.insideRect(u, n) && Math.abs(u.x - n.x) < n.fw * TILE / 2 - 6 && Math.abs(u.y - n.y) < n.fh * TILE / 2 - 6;
    if ((n.type !== 'farm' && this.edgeDist(u, n) <= INTERACT) || atFarm) {
      u.path = [];
      u.lastNode = n.id;
      if (n.type === 'farm') {
        // el granjero recorre los surcos dentro de su parcela
        const w = n.fw * TILE - 20, rows = 3, rowH = (n.fh * TILE - 20) / (rows - 1);
        const ph = ((this.tick + u.id * 37) * 0.35) % (w * rows * 2);
        const row = Math.floor(ph / (w * 2)) % rows, along = ph % (w * 2);
        const gx = n.tx * TILE + 10 + (along < w ? along : w * 2 - along), gy = n.ty * TILE + 10 + row * rowH;
        if (Math.hypot(gx - u.x, gy - u.y) > 2) { const sp = Math.min(Math.hypot(gx - u.x, gy - u.y), 9 * DT); const a2 = Math.atan2(gy - u.y, gx - u.x); u.x += Math.cos(a2) * sp; u.y += Math.sin(a2) * sp; u.facing = a2; }
      } else u.facing = Math.atan2(n.y - u.y, n.x - u.x);
      const m = pl.mods;
      let rate = (n.cat === 'node' ? NODES[n.type as NodeType].rate : FARM_RATE) * pl.gatherMult;
      if ((o.res === 'wood' && pl.techs.has('axe')) || (o.res === 'food' && !naval && pl.techs.has('plow')) ||
        ((o.res === 'gold' || o.res === 'stone') && pl.techs.has('mining'))) rate *= 1.2;
      if (o.res === 'gold') rate *= m.goldRate ?? 1;
      if (n.type === 'fish') rate *= m.fishRate ?? 1;
      if (n.type === 'farm') rate *= m.farmRate ?? 1;
      if (naval && this.hasTech(u.owner, 'up_fishship')) rate *= 1.25;
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
      if (n.type === 'farm') this.moveTo(u, n.x, n.y);
      else if (!this.approach(u, n, INTERACT)) {
        const team = this.players[u.owner].team;
        let set = this.unreachable.get(team); if (!set) this.unreachable.set(team, (set = new Set()));
        set.add(n.id);
        o.target = 0;
      }
    }
  }

  private insideRect(u: Entity, b: Entity): boolean {
    return u.x >= b.tx * TILE && u.x <= (b.tx + b.fw) * TILE && u.y >= b.ty * TILE && u.y <= (b.ty + b.fh) * TILE;
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
        const dp = DT / bd.buildTime * (this.mods(u.owner).buildSpeed ?? 1);
        b.progress = Math.min(1, b.progress + dp);
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * dp * 0.95);
        if (b.progress >= 1) {
          b.hp = Math.max(b.hp, b.maxHp * 0.98);
          if (b.type === 'farm') b.amount = bd.food!;
          this.players[b.owner].stats.built++;
          this.dirty = true;
          this.events.push({ t: 'built', p: b.owner, id: b.id });
          this.afterBuild(u, b);
        }
      } else {
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * DT / (bd.buildTime * 3)); // reparar
      }
    } else if (b.type === 'farm') this.moveTo(u, b.x, b.y);
    else if (!this.approach(u, b, INTERACT)) this.setOrder(u, undefined);
  }

  private afterBuild(u: Entity, b: Entity) {
    if (u.cmdQueue.length) { this.setOrder(u, undefined); return; }
    if (b.type === 'farm' && b.owner === u.owner) {
      if (this.farmFree(b, u)) { this.setOrder(u, { t: 'gather', target: b.id, res: 'food', phase: 'go' }); return; }
      const other = this.findNode(u, 'food', 8 * TILE, true);
      if (other) { this.setOrder(u, { t: 'gather', target: other.id, res: 'food', phase: 'go' }); return; }
    }
    const drop = BUILDINGS[b.type as BuildingType].drop;
    if (drop && b.type !== 'towncenter' && b.type !== 'dock') {
      for (const r of drop) {
        const n = this.findNode(b, r, 9 * TILE);
        if (n) { this.setOrder(u, { t: 'gather', target: n.id, res: r, phase: 'go' }); return; }
      }
    }
    // ¿otra obra cerca? (las murallas se encadenan)
    let best: Entity | undefined, bd = 8 * TILE;
    for (const e of this.buildingsOf(u.owner)) {
      if (e.progress >= 1) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < bd) { bd = d; best = e; }
    }
    this.setOrder(u, best ? { t: 'build', target: best.id } : undefined);
  }

  nearestDrop(u: Entity, r: Res): Entity | undefined {
    const naval = this.isNaval(u);
    let best: Entity | undefined, bd = Infinity;
    for (const e of this.buildingsOf(u.owner, undefined, true)) {
      if ((e.type === 'dock') !== naval) continue;
      if (!BUILDINGS[e.type as BuildingType].drop?.includes(r)) continue;
      const d = this.edgeDist(u, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  findNode(from: Entity, r: Res, range: number, onlyFarms = false): Entity | undefined {
    const naval = this.isNaval(from);
    this.index();
    const bad = from.owner >= 0 ? this.unreachable.get(this.players[from.owner].team) : undefined;
    let best: Entity | undefined, bd = range;
    for (const e of this.entities.values()) {
      if (e.amount <= 0 || bad?.has(e.id)) continue;
      if (Math.abs(e.x - from.x) > bd || Math.abs(e.y - from.y) > bd) continue;
      let ok = false;
      if (e.cat === 'node') ok = !onlyFarms && NODES[e.type as NodeType].res === r && (e.type === 'fish') === naval;
      else if (!naval && r === 'food' && e.type === 'farm' && e.owner === from.owner && e.progress >= 1) ok = this.farmFree(e, from);
      if (!ok) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  farmBusy(f: Entity): boolean { const c = this.farmClaim.get(f.id); const cu = c ? this.entities.get(c) : undefined; return !!cu && cu.order?.t === 'gather' && cu.order.target === f.id; }

  // ---------------------------------------------------------- movimiento
  gridOf(u: Entity): Grid { return this.isNaval(u) ? this.nav : this.teamGrid(this.players[u.owner].team); }

  private lerpAng(a: number, b: number): number {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d;
  }

  /** Mercados o muelles de aliados (otro jugador del mismo equipo) */
  tradePartners(p: number, kind: 'market' | 'dock'): Entity[] {
    const pl = this.players[p];
    const out: Entity[] = [];
    for (const o of this.players) if (o.id !== p && !o.neutral && !o.defeated && o.team === pl.team) out.push(...this.buildingsOf(o.id, kind, true));
    return out;
  }

  nearestOwn(u: Entity, type: BuildingType): Entity | undefined {
    let best: Entity | undefined, bd = Infinity;
    for (const b of this.buildingsOf(u.owner, type, true)) { const d = Math.hypot(b.x - u.x, b.y - u.y); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  /** Cambia de dueño una unidad (soldados sin dueño que se unen al héroe) */
  static canBoard(u: Entity): boolean {
    const d = UNITS[u.type as UnitType];
    return u.cat === 'unit' && d.cls === 'infantry' && !d.heals && !d.mounted && !u.hero && d.range <= 1.5 * TILE;
  }
  static canExplore(u: Entity): boolean { return u.type === 'scout' || u.type === 'eagle'; }
  /** Sube una unidad al ariete: deja el mapa y viaja adentro */
  private board(u: Entity, r: Entity) {
    if (!r.cargo) r.cargo = [];
    if (r.cargo.length >= RAM_CAPACITY) return;
    this.entities.delete(u.id);
    u.order = undefined; u.cmdQueue = []; u.path = []; u.pathKey = '';
    r.cargo.push(u);
    this.dirty = true;
  }
  /** Baja a toda la infantería alrededor del ariete */
  unload(r: Entity) {
    const list = r.cargo ?? [];
    r.cargo = undefined;
    list.forEach((u, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      const tx = Math.floor((r.x + Math.cos(a) * 22) / TILE), ty = Math.floor((r.y + Math.sin(a) * 22) / TILE);
      const spot = this.nearestFree(tx, ty) ?? { x: Math.floor(r.x / TILE), y: Math.floor(r.y / TILE) };
      u.x = spot.x * TILE + TILE / 2; u.y = spot.y * TILE + TILE / 2;
      this.entities.set(u.id, u);
    });
    this.dirty = true;
  }
  /** Explorar: elige un punto sin descubrir, tirando a los más cercanos (como en el AoE2) */
  private exploreOrder(u: Entity): Order {
    const ex = this.players[u.owner].explored;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let k = 0; k < 40; k++) {
      const tx = Math.floor(this.rng.next() * this.w), ty = Math.floor(this.rng.next() * this.h);
      if (this.tileSolid(tx, ty) || ex[ty * this.w + tx]) continue;
      const d = Math.hypot(tx * TILE - u.x, ty * TILE - u.y) * (0.6 + this.rng.next() * 0.8);
      if (d < bd) { bd = d; best = { x: tx, y: ty }; }
    }
    if (!best) {
      for (let k = 0; k < 40 && !best; k++) {
        const tx = Math.floor(this.rng.next() * this.w), ty = Math.floor(this.rng.next() * this.h);
        if (!this.tileSolid(tx, ty)) best = { x: tx, y: ty };
      }
    }
    const b = best ?? { x: Math.floor(u.x / TILE), y: Math.floor(u.y / TILE) };
    return { t: 'explore', x: b.x * TILE + TILE / 2, y: b.y * TILE + TILE / 2, until: this.tick + 30 * TICK_RATE };
  }

  convert(e: Entity, p: number) {
    if (e.cargo?.length) this.unload(e);
    e.owner = p; e.order = undefined; e.cmdQueue = []; e.path = []; e.pathKey = ''; e.stance = 'agg'; e.home = undefined;
    this.dirty = true;
  }

  /** Reliquias: siguen al monje que las lleva, caen si muere y dan oro guardadas */
  private updateRelics() {
    for (const r of this.relics) {
      if (r.carrier) {
        const m = this.entities.get(r.carrier);
        if (!m || m.hp <= 0 || m.carryRelic !== r.id) { r.carrier = undefined; if (m) m.carryRelic = undefined; }
        else { r.x = m.x; r.y = m.y; }
      } else if (r.holder) {
        const b = this.entities.get(r.holder);
        if (!b || b.hp <= 0) { r.holder = undefined; r.y += 20; }
        else { const pl = this.players[b.owner]; pl.res.gold += DT; pl.stats.gathered.gold += DT; }
      }
    }
  }

  relicsOf(p: number): number { return this.relics.filter((r) => r.holder && this.entities.get(r.holder)?.owner === p).length; }

  /** Acercarse a una entidad hasta `range` px de su borde. Devuelve false si es inalcanzable. */
  private approach(u: Entity, t: Entity, range: number): boolean {
    const key = t.cat === 'unit' ? `u${t.id}:${Math.floor(t.x / TILE / 2)},${Math.floor(t.y / TILE / 2)}` : `e${t.id}`;
    if (u.pathKey !== key || (u.path.length === 0 && this.tick >= u.repathAt)) {
      u.pathKey = key;
      u.repathAt = this.tick + 10;
      const sx = Math.floor(u.x / TILE), sy = Math.floor(u.y / TILE);
      const goalR = Math.max(range, 0) + TILE * 0.75;
      const x0 = t.cat === 'unit' ? t.x : t.tx * TILE, y0 = t.cat === 'unit' ? t.y : t.ty * TILE;
      const x1 = t.cat === 'unit' ? t.x : x0 + t.fw * TILE, y1 = t.cat === 'unit' ? t.y : y0 + t.fh * TILE;
      const tiles = findPath(this.gridOf(u), sx, sy, (x, y) => {
        const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
        const cx = Math.max(x0, Math.min(px, x1)), cy = Math.max(y0, Math.min(py, y1));
        return Math.hypot(px - cx, py - cy) <= goalR;
      }, Math.floor(t.x / TILE), Math.floor(t.y / TILE));
      if (!pathFound()) { u.path = []; return false; }
      u.path = this.smooth(u, tiles);
    }
    if (u.path.length) this.followPath(u);
    else {
      let px = t.x, py = t.y;
      if (t.cat !== 'unit') {
        px = Math.max(t.tx * TILE, Math.min(u.x, (t.tx + t.fw) * TILE));
        py = Math.max(t.ty * TILE, Math.min(u.y, (t.ty + t.fh) * TILE));
      }
      this.stepToward(u, px, py);
    }
    return true;
  }

  /** Moverse a un punto. Devuelve true al llegar (o si no se puede llegar más cerca). */
  private moveTo(u: Entity, x: number, y: number): boolean {
    if (Math.hypot(u.x - x, u.y - y) < 4) return true;
    const naval = this.isNaval(u);
    const key = `p${Math.round(x)},${Math.round(y)}`;
    if (u.pathKey !== key) {
      u.pathKey = key;
      let gx = Math.floor(x / TILE), gy = Math.floor(y / TILE);
      const free = this.nearestFree(Math.max(0, Math.min(this.w - 1, gx)), Math.max(0, Math.min(this.h - 1, gy)), naval ? 24 : 12, this.gridOf(u));
      if (!free) return true;
      const changed = free.x !== gx || free.y !== gy;
      gx = free.x; gy = free.y;
      const tiles = findPath(this.gridOf(u), Math.floor(u.x / TILE), Math.floor(u.y / TILE), (a, b) => a === gx && b === gy, gx, gy);
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
    return !u.path.length;
  }

  private smooth(u: Entity, tiles: { x: number; y: number }[]): { x: number; y: number }[] {
    const pts = tiles.map((t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE }));
    if (pts.length < 2) return pts;
    const grid = this.gridOf(u);
    const out: { x: number; y: number }[] = [];
    let ax = u.x, ay = u.y, i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 24);
      while (j > i && !lineClear(grid, TILE, ax, ay, pts[j].x, pts[j].y)) j--;
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
    const naval = this.gridOf(u);
    const inSolid = this.tileSolid(Math.floor(u.x / TILE), Math.floor(u.y / TILE), naval);
    const cx = Math.floor(u.x / TILE), cy = Math.floor(u.y / TILE);
    const ok = (x: number, y: number) => {
      if (inSolid) return true;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (this.tileSolid(tx, ty, naval)) return false;
      // no colarse en diagonal entre dos casillas que se tocan por la esquina (murallas en escalera)
      if (tx !== cx && ty !== cy && (this.tileSolid(tx, cy, naval) || this.tileSolid(cx, ty, naval))) return false;
      return true;
    };
    if (ok(nx, ny)) { u.x = nx; u.y = ny; return; }
    if (ok(nx, u.y)) { u.x = nx; return; }
    if (ok(u.x, ny)) { u.y = ny; }
  }

  private separate() {
    const units: Entity[] = [];
    for (const e of this.entities.values()) if (e.cat === 'unit' && e.hp > 0) units.push(e);
    const cell = TILE * 2;
    const buckets = new Map<number, Entity[]>();
    for (const u of units) {
      const k = Math.floor(u.x / cell) * 4096 + Math.floor(u.y / cell);
      let b = buckets.get(k); if (!b) buckets.set(k, (b = [])); b.push(u);
    }
    for (const a of units) {
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      const an = this.isNaval(a);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const b = buckets.get((cx + dx) * 4096 + cy + dy);
        if (!b) continue;
        for (const o of b) {
          if (o.id <= a.id || this.isNaval(o) !== an) continue;
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
      const pl = this.players[e.owner];
      if (pl.defeated) continue;
      const vis = teams.get(pl.team)!;
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
      if (p.defeated || p.neutral) continue;
      const lost = p.armyOnly ? this.unitsOf(p.id).length === 0 : this.buildingsOf(p.id, 'towncenter', true).length === 0;
      if (lost) {
        p.defeated = true;
        this.events.push({ t: 'msg', p: -1, text: `${p.name} fue derrotado` });
        for (const e of [...this.entities.values()]) if (e.owner === p.id) e.hp = 0;
        for (const e of [...this.entities.values()]) if (e.hp <= 0) this.kill(e);
      }
    }
    const aliveTeams = new Set(this.players.filter((p) => !p.defeated && !p.neutral).map((p) => p.team));
    if (aliveTeams.size === 1 && this.winnerTeam < 0) this.winnerTeam = [...aliveTeams][0];
    if (aliveTeams.size === 0 && this.winnerTeam < 0) this.winnerTeam = 99;
  }
}

function sumCost(c: Partial<ResBag>): number { return (c.food ?? 0) + (c.wood ?? 0) + (c.gold ?? 0) + (c.stone ?? 0); }

function scale(c: Partial<ResBag>, k: number): Partial<ResBag> {
  if (k === 1) return c;
  const out: Partial<ResBag> = {};
  for (const r of RES_LIST) if (c[r]) out[r] = Math.round(c[r]! * k);
  return out;
}

/** Posiciones relativas de una formación compacta */
export function formation(n: number): [number, number][] {
  const out: [number, number][] = [];
  const cols = Math.ceil(Math.sqrt(n));
  const sp = 22;
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push([(c - (cols - 1) / 2) * sp, (r - (Math.ceil(n / cols) - 1) / 2) * sp]);
  }
  return out;
}
