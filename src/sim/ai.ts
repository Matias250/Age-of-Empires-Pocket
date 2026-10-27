// IA de computadora. Solo "juega" emitiendo los mismos comandos que un humano.
import { AGE_UP, BUILDINGS, BuildingType, NODES, NodeType, Res, TICK_RATE, TILE, UNITS, UnitType } from './data.js';
import { Entity, World } from './world.js';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFF_NAME: Record<Difficulty, string> = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };

interface Profile {
  think: number; gather: number; maxVill: number; firstAttack: number; armyAttack: number;
  ageUpAt: number; stable: boolean; ram: boolean; towers: number; barracksAt: number; rangeAt: number;
}
const PROFILES: Record<Difficulty, Profile> = {
  easy: { think: 3, gather: 0.75, maxVill: 14, firstAttack: 480, armyAttack: 6, ageUpAt: 14, stable: false, ram: false, towers: 0, barracksAt: 9, rangeAt: 99 },
  normal: { think: 1.5, gather: 1, maxVill: 22, firstAttack: 330, armyAttack: 9, ageUpAt: 17, stable: true, ram: true, towers: 0, barracksAt: 8, rangeAt: 13 },
  hard: { think: 0.75, gather: 1.2, maxVill: 30, firstAttack: 230, armyAttack: 10, ageUpAt: 19, stable: true, ram: true, towers: 1, barracksAt: 7, rangeAt: 11 },
};

export class AI {
  readonly p: number;
  readonly prof: Profile;
  private next = 0;
  private attacking = false;
  private wave = 0;
  private attackTarget = 0;
  private busy = new Set<number>(); // aldeanos ya usados en este ciclo de decisión

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
    this.assignOrphanBuildings();
    this.economy(tc);
    this.buildings(tc);
    this.army(tc);
  }

  private get time() { return this.w.tick / TICK_RATE; }

  // ------------------------------------------------------------------
  private economy(tc: Entity) {
    const w = this.w, pl = w.players[this.p];
    const vills = w.unitsOf(this.p, 'villager');
    const saving = this.savingForAge(vills.length);

    // Aldeanos
    const queued = w.buildingsOf(this.p, 'towncenter', true).reduce((n, b) => n + b.queue.length, 0);
    const ageReady = saving && w.canAfford(this.p, AGE_UP.cost);
    if (!ageReady && !(saving && pl.res.food < 450) && vills.length + queued < this.prof.maxVill && tc.ageT < 0 && tc.queue.length < 2 && w.canAfford(this.p, UNITS.villager.cost))
      w.issue({ t: 'train', p: this.p, bid: tc.id, u: 'villager' });

    // Subir de era
    if (saving && tc.ageT < 0 && w.canAfford(this.p, AGE_UP.cost)) w.issue({ t: 'age', p: this.p, bid: tc.id });

    // Casas
    const pop = w.popOf(this.p), cap = w.popCap(this.p);
    const housesBuilding = w.buildingsOf(this.p, 'house').filter((b) => b.progress < 1).length;
    if (cap < 125 && cap - pop <= (pop > 20 ? 5 : 3) && housesBuilding === 0) this.construct('house', tc, 3, 9);

    // Depósitos
    if (vills.length >= 5 && !w.buildingsOf(this.p, 'lumbercamp').length) this.campNear('lumbercamp', 'tree', tc);
    if (vills.length >= 10 && !w.buildingsOf(this.p, 'miningcamp').length) this.campNear('miningcamp', 'goldmine', tc);

    // Repartir aldeanos ociosos
    const want = pl.age === 1 && w.buildingsOf(this.p, 'barracks').length === 0
      ? { food: 0.5, wood: 0.4, gold: 0.1, stone: 0 }
      : { food: 0.45, wood: 0.3, gold: 0.21, stone: 0.04 };
    // Si sobra un recurso, bajar su prioridad; si falta comida, subirla
    for (const r of Object.keys(want) as Res[]) if (pl.res[r] > 600) want[r] *= 0.3;
    if (pl.res.food < 100) want.food *= 1.3;
    const count: Record<Res, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const v of vills) if (v.order?.t === 'gather') count[v.order.res]++;
    // Rebalanceo lento: liberar un aldeano del recurso más sobrado
    const surplus = (Object.keys(want) as Res[]).find((r) => count[r] - want[r] * vills.length > 2.5);
    if (surplus && w.tick % (TICK_RATE * 6) < this.prof.think * TICK_RATE) {
      const v = vills.find((u) => u.order?.t === 'gather' && u.order.res === surplus && u.carry === 0);
      if (v) { w.issue({ t: 'stop', p: this.p, ids: [v.id] }); count[surplus]--; }
    }
    for (const v of vills) {
      if (v.order || this.busy.has(v.id)) continue;
      const order = (Object.keys(want) as Res[]).sort((a, b) => (count[a] - want[a] * vills.length) - (count[b] - want[b] * vills.length));
      for (const r of order) {
        if (want[r] === 0) continue;
        const n = w.findNode(tc, r, (r === 'food' ? 11 : 22) * TILE);
        if (n) {
          w.issue({ t: 'target', p: this.p, ids: [v.id], target: n.id });
          count[r]++;
          break;
        }
        if (r === 'food' && w.canAfford(this.p, BUILDINGS.farm.cost)) {
          if (this.construct('farm', tc, 0, 5, v)) { count.food++; break; }
        }
      }
    }
  }

  private savingForAge(vills: number): boolean {
    const pl = this.w.players[this.p];
    return pl.age === 1 && vills >= this.prof.ageUpAt && !this.w.isResearchingAge(this.p) && this.time > 120;
  }

  private buildings(tc: Entity) {
    const w = this.w, pl = w.players[this.p];
    const vills = w.unitsOf(this.p, 'villager').length;
    const have = (t: BuildingType) => w.buildingsOf(this.p, t).length;
    if (vills >= this.prof.barracksAt && !have('barracks')) this.construct('barracks', tc, 4, 12);
    else if (vills >= this.prof.rangeAt && !have('range')) this.construct('range', tc, 4, 12);
    else if (pl.age === 2 && this.prof.stable && !have('stable')) this.construct('stable', tc, 4, 13);
    else if (pl.age === 2 && this.prof.ram && this.time > this.prof.firstAttack && !have('workshop')) this.construct('workshop', tc, 4, 13);
    else if (pl.age === 2 && have('tower') < this.prof.towers) this.construct('tower', tc, 3, 6);
    else if (pl.age === 2 && this.diff === 'hard' && vills >= 24 && have('barracks') < 2) this.construct('barracks', tc, 5, 14);
  }

  private army(tc: Entity) {
    const w = this.w, pl = w.players[this.p];
    const saving = this.savingForAge(w.unitsOf(this.p, 'villager').length);
    const reserve = saving ? { food: 400, gold: 150 } : { food: 50, gold: 0 };
    // Producción
    const enemyKnights = w.players.some((o) => w.isEnemy(this.p, o.id) && w.unitsOf(o.id, 'knight').length > 2);
    for (const b of w.buildingsOf(this.p, undefined, true)) {
      const bd = BUILDINGS[b.type as BuildingType];
      if (!bd.trains || b.type === 'towncenter' || b.queue.length >= 2) continue;
      let u: UnitType = bd.trains[0];
      if (b.type === 'barracks') u = enemyKnights || w.rng.next() < 0.35 ? 'spearman' : 'militia';
      if (b.type === 'workshop' && w.unitsOf(this.p, 'ram').length >= 2) continue;
      if (UNITS[u].age > pl.age) continue;
      const c = UNITS[u].cost;
      if (pl.res.food - (c.food ?? 0) < reserve.food || pl.res.gold - (c.gold ?? 0) < reserve.gold) continue;
      if (w.canAfford(this.p, c)) w.issue({ t: 'train', p: this.p, bid: b.id, u });
    }

    const army = w.unitsOf(this.p).filter((u) => u.type !== 'villager');
    // Defensa: enemigos cerca de mis edificios
    const threat = this.findThreat();
    if (threat) {
      const ids = army.filter((u) => u.order?.t !== 'attack').map((u) => u.id);
      if (ids.length) w.issue({ t: 'attackMove', p: this.p, ids, x: threat.x, y: threat.y });
      return;
    }
    // Ataque
    const needed = this.prof.armyAttack + this.wave * 2;
    if (!this.attacking && this.time >= this.prof.firstAttack && army.length >= Math.min(needed, 24)) {
      this.attacking = true;
      this.wave++;
    }
    if (this.attacking) {
      if (army.length < 3) { this.attacking = false; return; }
      let target = w.get(this.attackTarget);
      if (!target || target.hp <= 0) {
        target = this.pickTarget(tc);
        this.attackTarget = target?.id ?? 0;
      }
      if (!target) return;
      const idle = army.filter((u) => !u.order).map((u) => u.id);
      if (idle.length) w.issue({ t: 'attackMove', p: this.p, ids: idle, x: target.x, y: target.y });
    } else {
      // reunir el ejército frente al centro urbano
      const enemyDir = this.pickTarget(tc);
      const gx = enemyDir ? tc.x + Math.sign(enemyDir.x - tc.x) * 4 * TILE : tc.x;
      const gy = enemyDir ? tc.y + Math.sign(enemyDir.y - tc.y) * 4 * TILE : tc.y + 4 * TILE;
      const idle = army.filter((u) => !u.order && Math.hypot(u.x - gx, u.y - gy) > 3 * TILE).map((u) => u.id);
      if (idle.length) w.issue({ t: 'move', p: this.p, ids: idle, x: gx, y: gy });
    }
  }

  private findThreat(): Entity | undefined {
    const w = this.w;
    const mine = w.buildingsOf(this.p);
    for (const e of w.entities.values()) {
      if (e.cat !== 'unit' || !w.isEnemy(this.p, e.owner)) continue;
      for (const b of mine) if (Math.hypot(e.x - b.x, e.y - b.y) < 9 * TILE) return e;
    }
    return undefined;
  }

  private pickTarget(tc: Entity): Entity | undefined {
    let best: Entity | undefined, bd = Infinity;
    for (const e of this.w.entities.values()) {
      if (e.cat !== 'building' || e.type !== 'towncenter' || !this.w.isEnemy(this.p, e.owner)) continue;
      const d = Math.hypot(e.x - tc.x, e.y - tc.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------------
  private campNear(type: BuildingType, node: NodeType, tc: Entity) {
    const w = this.w;
    let best: Entity | undefined, bd = 18 * TILE;
    for (const e of w.entities.values()) {
      if (e.cat !== 'node' || e.type !== node) continue;
      const d = Math.hypot(e.x - tc.x, e.y - tc.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) this.construct(type, best, 1, 4);
  }

  /** Busca lugar alrededor de `near` y manda a un aldeano a construir. */
  private construct(type: BuildingType, near: Entity, minR: number, maxR: number, builder?: Entity): boolean {
    const w = this.w;
    const d = BUILDINGS[type];
    if (!w.canAfford(this.p, d.cost) || w.players[this.p].age < d.age) return false;
    // no duplicar obras del mismo tipo sin terminar
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
      // orden pseudoaleatorio determinista
      const off = Math.floor(w.rng.next() * cands.length);
      for (let i = 0; i < cands.length; i++) {
        const c = cands[(i + off) % cands.length];
        if (w.canPlace(this.p, type, c.x, c.y)) continue;
        if (margin && !w.areaFree(c.x, c.y, size, margin)) continue;
        if (!w.areaFree(c.x, c.y, size, 0)) continue;
        if (this.blocksResource(type, c.x, c.y, size)) continue;
        return c;
      }
    }
    return null;
  }

  private blocksResource(type: BuildingType, x: number, y: number, size: number): boolean {
    if (type === 'lumbercamp' || type === 'miningcamp' || type === 'farm') return false;
    // evitar tapar recursos: no pegarse a nodos
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
