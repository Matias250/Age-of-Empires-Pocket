// IA de computadora. Solo "juega" emitiendo los mismos comandos que un humano.
import { Age, BUILDINGS, BuildingType, isLandArmy, NODES, NodeType, Res, TECHS, TechType, TICK_RATE, TILE, UNITS, UnitType } from './data.js';
import { CIVS } from './civs.js';
import { Entity, World } from './world.js';

export type Difficulty = 'novice' | 'easy' | 'normal' | 'hard';
export const DIFF_NAME: Record<Difficulty, string> = { novice: 'Principiante', easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
export const DIFF_LIST: Difficulty[] = ['novice', 'easy', 'normal', 'hard'];

interface Profile {
  think: number; gather: number; maxVill: number; firstAttack: number; armyAttack: number;
  maxAge: Age; ageVills: [number, number, number]; ageTime: [number, number, number];
  towers: number; barracksAt: number; techs: TechType[];
  castle: boolean; university: boolean; monks: number; fish: number; warships: number; extraProd: boolean; siege: number;
  /** tope de ejército (Principiante juega tranquilo) */
  maxArmy?: number;
}
const PROFILES: Record<Difficulty, Profile> = {
  // Para aprender: economía lenta, casi no ataca y nunca pasa de la Edad Media
  novice: {
    think: 4, gather: 0.6, maxVill: 10, firstAttack: 1080, armyAttack: 5, maxAge: 2, ageVills: [10, 99, 99], ageTime: [480, 99999, 99999],
    towers: 0, barracksAt: 10, techs: [], castle: false, university: false, monks: 0, fish: 1, warships: 0, extraProd: false, siege: 0, maxArmy: 6,
  },
  easy: {
    think: 3, gather: 0.8, maxVill: 16, firstAttack: 480, armyAttack: 7, maxAge: 3, ageVills: [12, 18, 99], ageTime: [150, 450, 99999],
    towers: 0, barracksAt: 9, techs: ['axe', 'forge'], castle: false, university: false, monks: 0, fish: 2, warships: 1, extraProd: false, siege: 1,
  },
  normal: {
    think: 1.5, gather: 1, maxVill: 24, firstAttack: 330, armyAttack: 10, maxAge: 4, ageVills: [13, 19, 24], ageTime: [120, 330, 600],
    towers: 0, barracksAt: 8, techs: ['axe', 'loom', 'forge', 'fletching', 'wheelbarrow', 'plow', 'mail', 'barding', 'chemistry'],
    castle: true, university: false, monks: 0, fish: 3, warships: 3, extraProd: false, siege: 2,
  },
  hard: {
    think: 0.75, gather: 1.35, maxVill: 32, firstAttack: 260, armyAttack: 12, maxAge: 4, ageVills: [12, 18, 24], ageTime: [90, 250, 480],
    towers: 1, barracksAt: 7,
    techs: ['loom', 'wheelbarrow', 'axe', 'plow', 'mining', 'forge', 'fletching', 'mail', 'barding', 'ballistics', 'masonry', 'chemistry', 'siegeeng', 'murderholes'],
    castle: true, university: true, monks: 2, fish: 5, warships: 5, extraProd: true, siege: 4,
  },
};

export class AI {
  readonly p: number;
  readonly prof: Profile;
  private next = 0;
  private attacking = false;
  private wave = 0;
  private waveSize = 0;
  private attackTarget = 0;
  private rebalanceAt = 0;
  private dockCheckAt = 0;
  private busy = new Set<number>(); // aldeanos ya usados en este ciclo de decisión
  private enemyMix = { cav: 0, arch: 0, inf: 0, total: 0 };
  private techReserve: Partial<Record<Res, number>> = {};

  constructor(private w: World, p: number, readonly diff: Difficulty) {
    this.p = p;
    this.prof = PROFILES[diff];
    w.players[p].gatherMult = this.prof.gather;
    this.next = p * 3; // desfasar IAs
  }

  update() {
    const w = this.w;
    if (w.players[this.p].defeated || w.tick < this.next) return;
    this.next = w.tick + Math.round(this.prof.think * TICK_RATE);
    const tc = w.buildingsOf(this.p, 'towncenter', true)[0];
    if (!tc) return;
    this.busy.clear();
    this.scanEnemies();
    this.assignOrphanBuildings();
    this.economy(tc);
    this.buildings(tc);
    this.research();
    this.navy(tc);
    this.army(tc);
  }

  private get time() { return this.w.tick / TICK_RATE; }
  private get pl() { return this.w.players[this.p]; }

  private scanEnemies() {
    const m = { cav: 0, arch: 0, inf: 0, total: 0 };
    for (const o of this.w.players) {
      if (!this.w.isEnemy(this.p, o.id)) continue;
      for (const u of this.w.unitsOf(o.id)) {
        const d = UNITS[u.type as UnitType];
        if (!isLandArmy(u.type as UnitType)) continue;
        m.total++;
        if (d.cls === 'cavalry') m.cav++;
        else if (d.cls === 'archer') m.arch++;
        else if (d.cls === 'infantry') m.inf++;
      }
    }
    this.enemyMix = m;
  }

  // ------------------------------------------------------------------ economía
  private nextAge(): 2 | 3 | 4 | null { return this.pl.age < 4 ? (this.pl.age + 1) as 2 | 3 | 4 : null; }

  private savingForAge(vills: number): boolean {
    const pl = this.pl, a = pl.age;
    if (a >= this.prof.maxAge || this.w.isResearchingAge(this.p)) return false;
    return vills >= this.prof.ageVills[a - 1] && this.time >= this.prof.ageTime[a - 1];
  }

  private economy(tc: Entity) {
    const w = this.w, pl = this.pl;
    const vills = w.unitsOf(this.p, 'villager');
    const saving = this.savingForAge(vills.length);
    const next = this.nextAge();
    const ageCost = next ? w.ageCost(this.p, next) : {};

    // Aldeanos
    const queued = w.buildingsOf(this.p, 'towncenter', true).reduce((n, b) => n + b.queue.filter((q) => q === 'villager').length, 0);
    const ageReady = saving && w.canAfford(this.p, ageCost);
    const foodNeed = (ageCost.food ?? 0) + 50;
    if (!ageReady && !(saving && pl.res.food < foodNeed) && vills.length + queued < this.prof.maxVill && tc.ageT < 0 && !tc.tech && tc.queue.length < 2 &&
      w.canAfford(this.p, w.unitCost(this.p, 'villager')))
      w.issue({ t: 'train', p: this.p, bid: tc.id, u: 'villager' });

    // Subir de edad
    if (saving && tc.ageT < 0 && !tc.tech && w.canAfford(this.p, ageCost)) w.issue({ t: 'age', p: this.p, bid: tc.id });

    // Casas
    const pop = w.popOf(this.p), cap = w.popCap(this.p);
    const housesBuilding = w.buildingsOf(this.p, 'house').filter((b) => b.progress < 1).length;
    if (cap < w.popLimit && cap - pop <= (pop > 20 ? 6 : 3) && housesBuilding === 0) this.construct('house', tc, 3, 10);

    // Depósitos
    if (vills.length >= 5 && this.campFar('lumbercamp', 'tree', 3)) this.campNear('lumbercamp', 'tree', tc);
    if (vills.length >= 10 && this.campFar('miningcamp', 'goldmine', 2)) this.campNear('miningcamp', 'goldmine', tc);
    if (pl.age >= 3 && this.prof.castle && vills.length >= 16 && this.campFar('miningcamp', 'stonemine', 3)) this.campNear('miningcamp', 'stonemine', tc);

    // Repartir aldeanos ociosos según la edad
    const noBarracks = w.buildingsOf(this.p, 'barracks').length === 0;
    const wantStone = (this.prof.castle && pl.age >= 3 && !w.buildingsOf(this.p, 'castle').length) || (this.prof.towers && pl.age === 2) ? 0.12 : pl.age >= 3 ? 0.05 : 0.02;
    const want: Record<Res, number> = pl.age === 1 && noBarracks
      ? { food: 0.55, wood: 0.4, gold: 0.05, stone: 0 }
      : pl.age <= 2 ? { food: 0.45, wood: 0.32, gold: 0.2, stone: wantStone }
        : { food: 0.4, wood: 0.27, gold: 0.28, stone: wantStone };
    for (const r of Object.keys(want) as Res[]) {
      if (pl.res[r] > 600) want[r] *= 0.1;
      else if (pl.res[r] > 350 && r !== 'food') want[r] *= 0.5;
    }
    if (pl.res.food < 100) want.food *= 1.3;
    if (pl.res.wood < 100) want.wood *= 1.3;
    if (saving && (ageCost.gold ?? 0) > pl.res.gold) want.gold *= 1.6;
    const total = want.food + want.wood + want.gold + want.stone;
    for (const r of Object.keys(want) as Res[]) want[r] /= total;
    const count: Record<Res, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const v of vills) if (v.order?.t === 'gather') count[v.order.res]++;
    const surplus = (Object.keys(want) as Res[]).find((r) => pl.res[r] > 300 && count[r] - want[r] * vills.length > 2);
    if (surplus && w.tick >= this.rebalanceAt) {
      this.rebalanceAt = w.tick + TICK_RATE * 8;
      const v = vills.find((u) => u.order?.t === 'gather' && u.order.res === surplus && u.carry === 0);
      if (v) { w.issue({ t: 'stop', p: this.p, ids: [v.id] }); count[surplus]--; this.busy.add(v.id); }
    }
    for (const v of vills) {
      if (v.order || this.busy.has(v.id)) continue;
      const order = (Object.keys(want) as Res[]).sort((a, b) => (count[a] - want[a] * vills.length) - (count[b] - want[b] * vills.length));
      for (const r of order) {
        if (want[r] === 0) continue;
        const n = w.findNode(tc, r, (r === 'food' ? 11 : 24) * TILE);
        if (n) {
          w.issue({ t: 'target', p: this.p, ids: [v.id], target: n.id });
          count[r]++;
          break;
        }
        if (r === 'food' && w.canAfford(this.p, w.buildingCost(this.p, 'farm'))) {
          if (this.construct('farm', tc, 0, 6, v)) { count.food++; break; }
        }
      }
    }
  }

  private buildings(tc: Entity) {
    const w = this.w, pl = this.pl, P = this.prof;
    const vills = w.unitsOf(this.p, 'villager').length;
    const have = (t: BuildingType) => w.buildingsOf(this.p, t).length;
    const a = pl.age;
    if (vills >= P.barracksAt && !have('barracks')) this.construct('barracks', tc, 4, 12);
    else if (a >= 2 && !have('range')) this.construct('range', tc, 4, 12);
    else if (a >= 2 && P.techs.length > 2 && !have('blacksmith')) this.construct('blacksmith', tc, 4, 12);
    else if (a >= 2 && this.diff !== 'easy' && this.diff !== 'novice' && !have('stable')) this.construct('stable', tc, 4, 13);
    else if (a >= 2 && have('tower') < P.towers) this.construct('tower', tc, 3, 6);
    else if (a >= 3 && P.castle && !have('castle') && w.canAfford(this.p, w.buildingCost(this.p, 'castle'))) this.construct('castle', tc, 5, 13);
    else if (a >= 3 && !have('workshop') && this.time > P.firstAttack) this.construct('workshop', tc, 4, 13);
    else if (a >= 3 && P.university && !have('university')) this.construct('university', tc, 4, 13);
    else if (a >= 3 && P.monks && !have('monastery')) this.construct('monastery', tc, 4, 13);
    else if (P.extraProd && vills >= 22 && have('barracks') < 2) this.construct('barracks', tc, 5, 15);
    else if (P.extraProd && a >= 2 && vills >= 26 && have('range') < 2) this.construct('range', tc, 5, 15);
    else if (P.extraProd && a >= 3 && vills >= 28 && have('stable') < 2) this.construct('stable', tc, 5, 15);
  }

  private research() {
    const w = this.w, pl = this.pl;
    this.techReserve = {};
    const next = this.nextAge();
    const reserve = next && this.savingForAge(w.unitsOf(this.p, 'villager').length) ? w.ageCost(this.p, next) : {};
    for (const t of this.prof.techs) {
      if (pl.techs.has(t) || w.isResearching(this.p, t)) continue;
      const cost = w.techCost(this.p, t);
      const b = w.buildingsOf(this.p, undefined, true).find((x) => BUILDINGS[x.type as BuildingType].research?.includes(t) && !x.tech && x.ageT < 0 &&
        (x.type === 'towncenter' ? x.queue.length <= 1 : !x.queue.length));
      if (!b || pl.age < TECHS[t].age) continue;
      this.techReserve = cost;
      const total = { food: (cost.food ?? 0) + (reserve.food ?? 0), wood: (cost.wood ?? 0) + (reserve.wood ?? 0), gold: (cost.gold ?? 0) + (reserve.gold ?? 0), stone: (cost.stone ?? 0) + (reserve.stone ?? 0) };
      if (!w.canAfford(this.p, total)) return;
      w.issue({ t: 'research', p: this.p, bid: b.id, tech: t });
      this.techReserve = {};
      return;
    }
  }

  // ------------------------------------------------------------------ flota
  private navy(tc: Entity) {
    const w = this.w, pl = this.pl, P = this.prof;
    if (!P.fish && !P.warships) return;
    const docks = w.buildingsOf(this.p, 'dock');
    const vills = w.unitsOf(this.p, 'villager').length;
    if (!docks.length) {
      if (vills >= 8 && w.tick >= this.dockCheckAt && w.canAfford(this.p, w.buildingCost(this.p, 'dock'))) {
        this.dockCheckAt = w.tick + TICK_RATE * 45;
        const spot = this.findDockSpot(tc);
        if (spot) {
          const v = this.pickBuilder(spot.x * TILE, spot.y * TILE);
          if (v) { w.issue({ t: 'build', p: this.p, ids: [v.id], b: 'dock', tx: spot.x, ty: spot.y }); this.busy.add(v.id); }
        }
      }
      return;
    }
    const dock = docks.find((d) => d.progress >= 1);
    if (!dock) return;
    const fishers = w.unitsOf(this.p, 'fishship');
    const ships = w.unitsOf(this.p).filter((u) => UNITS[u.type as UnitType].naval && !UNITS[u.type as UnitType].gathers);
    const queued = dock.queue.length;
    // producción
    if (queued < 2) {
      const fishLeft = w.findNode(fishers[0] ?? ({ ...dock, cat: 'unit', type: 'fishship' } as Entity), 'food', 26 * TILE);
      if (fishers.length < P.fish && fishLeft && w.canAfford(this.p, w.unitCost(this.p, 'fishship'))) w.issue({ t: 'train', p: this.p, bid: dock.id, u: 'fishship' });
      else if (pl.age >= 2 && ships.length < P.warships && !this.savingForAge(vills)) {
        const opts = w.trainsOf(this.p, 'dock').filter((u) => u !== 'fishship' && UNITS[u].age <= pl.age && (!UNITS[u].requires || pl.techs.has(UNITS[u].requires!)));
        const u = opts.length ? opts[Math.floor(w.rng.next() * opts.length)] : undefined;
        if (u && w.canAfford(this.p, w.unitCost(this.p, u))) w.issue({ t: 'train', p: this.p, bid: dock.id, u });
      }
    }
    // pescadores ociosos
    for (const f of fishers) {
      if (f.order) continue;
      const n = w.findNode(f, 'food', 30 * TILE);
      if (n) w.issue({ t: 'target', p: this.p, ids: [f.id], target: n.id });
    }
    // barcos de guerra: atacar flota o muelles enemigos
    if (ships.length >= 2) {
      let target: Entity | undefined, bd = Infinity;
      for (const o of w.players) {
        if (!w.isEnemy(this.p, o.id)) continue;
        for (const e of [...w.buildingsOf(o.id, 'dock'), ...w.unitsOf(o.id).filter((u) => UNITS[u.type as UnitType].naval)]) {
          const d = Math.hypot(e.x - dock.x, e.y - dock.y);
          if (d < bd) { bd = d; target = e; }
        }
      }
      const idle = ships.filter((s) => !s.order).map((s) => s.id);
      if (target && idle.length && ships.length >= Math.min(3, P.warships)) w.issue({ t: 'attackMove', p: this.p, ids: idle, x: target.x, y: target.y });
    }
  }

  private findDockSpot(tc: Entity): { x: number; y: number } | null {
    const w = this.w;
    const cx = Math.floor(tc.x / TILE), cy = Math.floor(tc.y / TILE);
    for (let r = 3; r <= 20; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!w.canPlace(this.p, 'dock', cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
        }
    return null;
  }

  // ------------------------------------------------------------------ ejército
  private pickUnit(b: Entity): UnitType | null {
    const w = this.w, pl = this.pl, mix = this.enemyMix;
    const civ = pl.civ ? CIVS[pl.civ] : undefined;
    const opts = w.trainsOf(this.p, b.type as BuildingType).filter((u) => {
      const d = UNITS[u];
      if (u === 'villager' || d.naval) return false;
      if (d.age > pl.age || (d.requires && !pl.techs.has(d.requires))) return false;
      return true;
    });
    if (!opts.length) return null;
    const army = w.unitsOf(this.p);
    const siegeCount = army.filter((u) => UNITS[u.type as UnitType].cls === 'siege').length;
    const monks = army.filter((u) => u.type === 'monk').length;
    const weights = opts.map((u) => {
      const d = UNITS[u];
      let k = 1 + (d.age - 1) * 0.8;
      if (civ && civ.unique === u) k *= 3;
      if (d.cls === 'siege') {
        if (siegeCount >= this.prof.siege || army.length < 8) return 0;
        if (u === 'trebuchet' && army.some((x) => x.type === 'trebuchet')) return 0;
      }
      if (d.heals) return monks >= this.prof.monks ? 0 : 2;
      if (u === 'scout' && pl.age >= 3) k *= 0.3;
      if (u === 'militia' && pl.age >= 4) k *= 0.3;
      const f = (n: number) => (mix.total ? n / mix.total : 0);
      if (d.bonus?.cavalry && f(mix.cav) > 0.3) k *= 4;
      if (d.bonus?.archer && f(mix.arch) > 0.3) k *= 3;
      if (d.bonus?.infantry && f(mix.inf) > 0.4) k *= 2;
      return k;
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return null;
    let r = w.rng.next() * sum;
    for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) return opts[i]; }
    return opts[opts.length - 1];
  }

  private army(tc: Entity) {
    const w = this.w, pl = this.pl;
    const saving = this.savingForAge(w.unitsOf(this.p, 'villager').length);
    const next = this.nextAge();
    const ageCost = next && saving ? w.ageCost(this.p, next) : {};
    const army0 = w.unitsOf(this.p).filter((u) => isLandArmy(u.type as UnitType)).length;
    const tr = army0 >= 6 && !this.findThreat() ? this.techReserve : {};
    const reserve = { food: ((ageCost.food ?? 0) || 50) + (tr.food ?? 0), gold: (ageCost.gold ?? 0) + (tr.gold ?? 0) };
    if (army0 >= (this.prof.maxArmy ?? 999)) return this.armyOrders(tc);
    for (const b of w.buildingsOf(this.p, undefined, true)) {
      if (b.type === 'towncenter' || b.type === 'dock' || b.queue.length >= 2 || !BUILDINGS[b.type as BuildingType].trains) continue;
      const u = this.pickUnit(b);
      if (!u) continue;
      const c = w.unitCost(this.p, u);
      if (pl.res.food - (c.food ?? 0) < reserve.food || pl.res.gold - (c.gold ?? 0) < reserve.gold) continue;
      if (w.canAfford(this.p, c)) w.issue({ t: 'train', p: this.p, bid: b.id, u });
    }
    this.armyOrders(tc);
  }

  private armyOrders(tc: Entity) {
    const w = this.w;
    const army = w.unitsOf(this.p).filter((u) => isLandArmy(u.type as UnitType) || u.type === 'monk');
    const fighters = army.filter((u) => u.type !== 'monk');
    const threat = this.findThreat();
    if (threat) {
      const ids = army.filter((u) => u.order?.t !== 'attack').map((u) => u.id);
      if (ids.length) w.issue({ t: 'attackMove', p: this.p, ids, x: threat.x, y: threat.y });
      return;
    }
    const needed = this.prof.armyAttack + this.wave * 3;
    if (!this.attacking && this.time >= this.prof.firstAttack && fighters.length >= Math.min(needed, 30)) {
      this.attacking = true;
      this.waveSize = fighters.length;
      this.wave++;
    }
    if (this.attacking) {
      if (fighters.length < Math.max(3, this.waveSize * 0.35)) {
        this.attacking = false;
        const home = army.map((u) => u.id);
        if (home.length) w.issue({ t: 'move', p: this.p, ids: home, x: tc.x, y: tc.y + 3 * TILE });
        return;
      }
      let target = w.get(this.attackTarget);
      if (!target || target.hp <= 0) {
        target = this.pickTarget(tc);
        this.attackTarget = target?.id ?? 0;
      }
      if (!target) return;
      const idle = army.filter((u) => !u.order).map((u) => u.id);
      if (idle.length) w.issue({ t: 'attackMove', p: this.p, ids: idle, x: target.x, y: target.y });
    } else {
      const enemyDir = this.pickTarget(tc);
      const gx = enemyDir ? tc.x + Math.sign(enemyDir.x - tc.x) * 4 * TILE : tc.x;
      const gy = enemyDir ? tc.y + Math.sign(enemyDir.y - tc.y) * 4 * TILE : tc.y + 4 * TILE;
      const idle = army.filter((u) => !u.order && Math.hypot(u.x - gx, u.y - gy) > 3 * TILE).map((u) => u.id);
      if (idle.length) w.issue({ t: 'move', p: this.p, ids: idle, x: gx, y: gy });
    }
  }

  private findThreat(): Entity | undefined {
    const w = this.w;
    const mine = w.buildingsOf(this.p).filter((b) => b.type !== 'dock' && b.type !== 'wall' && b.type !== 'stonewall');
    for (const o of w.players) {
      if (!w.isEnemy(this.p, o.id)) continue;
      for (const e of w.unitsOf(o.id)) {
        if (UNITS[e.type as UnitType].naval) continue;
        for (const b of mine) if (Math.abs(e.x - b.x) < 9 * TILE && Math.abs(e.y - b.y) < 9 * TILE) return e;
      }
    }
    return undefined;
  }

  private pickTarget(tc: Entity): Entity | undefined {
    let best: Entity | undefined, bd = Infinity;
    for (const o of this.w.players) {
      if (!this.w.isEnemy(this.p, o.id) || o.defeated) continue;
      for (const e of this.w.buildingsOf(o.id, 'towncenter')) {
        const d = Math.hypot(e.x - tc.x, e.y - tc.y);
        if (d < bd) { bd = d; best = e; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ construcción
  /** ¿Hace falta un depósito nuevo? (no hay, o los recursos quedaron lejos de todos) */
  private campFar(type: BuildingType, node: NodeType, max: number): boolean {
    const w = this.w;
    const camps = w.buildingsOf(this.p, type);
    if (!camps.length) return true;
    if (camps.length >= max || camps.some((c) => c.progress < 1)) return false;
    const tc = w.buildingsOf(this.p, 'towncenter')[0];
    for (const e of w.entities.values()) {
      if (e.cat !== 'node' || e.type !== node) continue;
      if (tc && Math.hypot(e.x - tc.x, e.y - tc.y) > 18 * TILE) continue;
      if (camps.some((c) => Math.hypot(e.x - c.x, e.y - c.y) < 6 * TILE)) return false;
    }
    return true;
  }

  private campNear(type: BuildingType, node: NodeType, tc: Entity) {
    const w = this.w;
    const camps = w.buildingsOf(this.p, type);
    let best: Entity | undefined, bd = 18 * TILE;
    for (const e of w.entities.values()) {
      if (e.cat !== 'node' || e.type !== node) continue;
      if (camps.some((c) => Math.hypot(e.x - c.x, e.y - c.y) < 6 * TILE)) continue;
      const d = Math.hypot(e.x - tc.x, e.y - tc.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) this.construct(type, best, 1, 4);
  }

  /** Busca lugar alrededor de `near` y manda a un aldeano a construir. */
  private construct(type: BuildingType, near: Entity, minR: number, maxR: number, builder?: Entity): boolean {
    const w = this.w;
    const d = BUILDINGS[type];
    if (!w.canAfford(this.p, w.buildingCost(this.p, type)) || this.pl.age < d.age) return false;
    if (type !== 'farm' && w.buildingsOf(this.p, type).some((b) => b.progress < 1)) return false;
    const spot = this.findSpot(type, near, minR, maxR);
    if (!spot) return false;
    const v = builder ?? this.pickBuilder(spot.x * TILE, spot.y * TILE);
    if (!v) return false;
    w.issue({ t: 'build', p: this.p, ids: [v.id], b: type, tx: spot.x, ty: spot.y });
    this.busy.add(v.id);
    return true;
  }

  /** Obras sin nadie construyéndolas: mandar al aldeano más cercano. */
  private assignOrphanBuildings() {
    const w = this.w;
    const vills = w.unitsOf(this.p, 'villager');
    for (const b of w.buildingsOf(this.p)) {
      if (b.progress >= 1) continue;
      if (vills.some((v) => v.order?.t === 'build' && v.order.target === b.id)) continue;
      const v = this.pickBuilder(b.x, b.y);
      if (v) { w.issue({ t: 'target', p: this.p, ids: [v.id], target: b.id }); this.busy.add(v.id); }
    }
  }

  private pickBuilder(x: number, y: number): Entity | undefined {
    const vills = this.w.unitsOf(this.p, 'villager');
    let best: Entity | undefined, bd = Infinity;
    for (const v of vills) {
      if (v.order?.t === 'build' || this.busy.has(v.id)) continue;
      const pen = v.order?.t === 'gather' && v.order.res !== 'wood' ? 200 : 0;
      const d = Math.hypot(v.x - x, v.y - y) + pen;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  private findSpot(type: BuildingType, near: Entity, minR: number, maxR: number): { x: number; y: number } | null {
    const w = this.w, size = BUILDINGS[type].size;
    const margin = type === 'farm' ? 0 : 1;
    const cx = Math.floor(near.x / TILE), cy = Math.floor(near.y / TILE);
    const half = Math.floor(size / 2);
    const nearHalf = near.cat === 'building' ? Math.ceil(near.size / 2) : 0;
    for (let r = minR + nearHalf; r <= maxR + nearHalf; r++) {
      const cands: { x: number; y: number }[] = [];
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          cands.push({ x: cx + dx - half, y: cy + dy - half });
        }
      const off = Math.floor(w.rng.next() * cands.length);
      for (let i = 0; i < cands.length; i++) {
        const c = cands[(i + off) % cands.length];
        if (w.canPlace(this.p, type, c.x, c.y)) continue;
        if (margin && !w.areaFree(c.x, c.y, size, margin)) continue;
        if (this.blocksResource(type, c.x, c.y, size)) continue;
        return c;
      }
    }
    return null;
  }

  private blocksResource(type: BuildingType, x: number, y: number, size: number): boolean {
    if (type === 'lumbercamp' || type === 'miningcamp' || type === 'farm') return false;
    const w = this.w;
    for (let ty = y - 1; ty <= y + size; ty++)
      for (let tx = x - 1; tx <= x + size; tx++) {
        if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) continue;
        const e = w.get(w.occ[ty * w.w + tx]);
        if (e && e.cat === 'node' && NODES[e.type as NodeType].res !== 'wood') return true;
      }
    return false;
  }
}
