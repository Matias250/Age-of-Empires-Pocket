// Controlador de una partida en curso: bucle, cámara, input táctil/mouse y selección.
import { AGE_NAME, BUILDINGS, BuildingType, isLandArmy, NODES, NodeType, TICK_RATE, TILE, UNITS, UnitType } from '../sim/data.js';
import { createMatch, Match, MatchConfig } from '../sim/match.js';
import { Entity, World } from '../sim/world.js';
import { Camera, Renderer } from './render.js';
import { Hud } from './hud.js';
import { Tutorial } from './tutorial.js';
import { AchTracker } from './achievements.js';

export type InputMode = 'normal' | 'attack' | 'rally' | 'box';

interface Ptr { x: number; y: number; sx: number; sy: number; t: number; button: number; type: string }

export class Game {
  match: Match;
  world: World;
  me: number;
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  placedInQueue = 0;
  sel: number[] = [];
  mode: InputMode = 'normal';
  placing: BuildingType | null = null;
  ghost: { tx: number; ty: number } | null = null;
  wallStart: { tx: number; ty: number } | null = null;
  ghostVertical = false;
  gateRotated = false;
  /** botón ➕ En cola: las órdenes se suman al final en vez de reemplazar */
  queueMode = false;
  buildMenu = false;
  paused = false;
  speed = 1;
  over = false;
  time = 0;
  hud: Hud;
  tutorial?: Tutorial;
  ach: AchTracker;
  renderer: Renderer;

  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private vw = 0; private vh = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private ptrs = new Map<number, Ptr>();
  private dragging: 'pan' | 'box' | 'pinch' | null = null;
  private pinch = { d: 0, zoom: 1, mx: 0, my: 0 };
  private box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private lastTap = { t: 0, id: 0 };
  private keys = new Set<string>();
  private minimapAt = 0;
  private listeners: [EventTarget, string, EventListener][] = [];

  constructor(private canvas: HTMLCanvasElement, cfg: MatchConfig, private onExit: () => void) {
    this.match = createMatch(cfg);
    this.world = this.match.world;
    this.me = this.match.human;
    this.ctx = canvas.getContext('2d')!;
    this.renderer = new Renderer(this.ctx, this.world);
    this.hud = new Hud(this);
    this.ach = new AchTracker(this);
    if (cfg.mode === 'tutorial') this.tutorial = new Tutorial(this);
    this.resize();
    const tc = this.world.buildingsOf(this.me, 'towncenter')[0];
    if (tc) this.centerOn(tc.x, tc.y);
    this.cam.zoom = Math.min(1.3, Math.max(0.7, Math.min(this.vw, this.vh) / 480));
    if (tc) this.centerOn(tc.x, tc.y);
    this.bindInput();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    this.tutorial?.start();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    for (const [t, n, f] of this.listeners) t.removeEventListener(n, f);
    this.hud.destroy();
    this.tutorial?.destroy();
  }

  exit() { this.destroy(); this.onExit(); }

  // ------------------------------------------------------------- bucle
  private frame(now: number) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const w = this.world;
    if (!this.paused && !this.over) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= 1 / TICK_RATE && steps < 8) {
        for (const ai of this.match.ais) ai.update();
        w.step();
        this.acc -= 1 / TICK_RATE;
        steps++;
      }
      this.consumeEvents();
      this.tutorial?.update();
      this.ach.update();
      if (w.winnerTeam >= 0 && !this.over) {
        this.over = true;
        setTimeout(() => this.hud.showEnd(w.winnerTeam === w.players[this.me].team), 900);
      }
    }
    this.keyPan(dt);
    // limpiar selección de muertos
    this.sel = this.sel.filter((id) => w.entities.has(id));
    this.renderer.draw(this.cam, this.vw, this.vh, this.dpr, this.me, new Set(this.sel), this.time, (g) => this.drawOverlay(g));
    if (now - this.minimapAt > 400) { this.minimapAt = now; this.renderer.minimap(this.hud.minimap, this.me, this.cam, this.vw, this.vh); }
    this.hud.update();
  }

  private consumeEvents() {
    const w = this.world, R = this.renderer;
    for (const e of w.events) {
      switch (e.t) {
        case 'shot': {
          const d = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
          const life = e.kind === 'stone' ? 0.25 + d / 500 : e.kind === 'ball' ? 0.12 + d / 1400 : e.kind === 'fire' ? 0.25 : 0.2 + d / 900;
          if (R.fx.length < 260) R.fx.push({ kind: 'shot', proj: e.kind, x: e.x1, y: e.y1, x2: e.x2, y2: e.y2, t: this.time, life });
          break;
        }
        case 'blast': R.fx.push({ kind: 'blast', x: e.x, y: e.y, r: e.r, t: this.time, life: 0.5 }); break;
        case 'heal': R.fx.push({ kind: 'heal', x: e.x, y: e.y, t: this.time, life: 0.8 }); break;
        case 'hit': if (R.fx.length < 200) R.fx.push({ kind: 'hit', x: e.x, y: e.y, t: this.time, life: 0.18 }); break;
        case 'death': R.fx.push({ kind: e.naval ? 'sink' : 'death', x: e.x, y: e.y, t: this.time, life: e.cat === 'building' ? 1.2 : e.naval ? 1.4 : 0.6 }); break;
        case 'msg': if (e.p === this.me || e.p === -1) this.hud.toast(e.text); break;
        case 'attacked': if (e.p === this.me) { this.hud.toast('⚔️ ¡Te están atacando!', true); this.hud.ping(e.x, e.y); } break;
        case 'built': if (e.p === this.me) { const b = w.get(e.id); if (b) this.hud.toast(`Construcción terminada: ${BUILDINGS[b.type as BuildingType].name}`); } break;
        case 'age': if (e.p !== this.me) this.hud.toast(`${w.isEnemy(this.me, e.p) ? '⚠️ ' : '🤝 '}${w.players[e.p].name} llegó a la ${AGE_NAME[e.age]}`); break;
      }
    }
    this.tutorial?.onEvents(w.events);
    w.events.length = 0;
  }

  private drawOverlay(g: CanvasRenderingContext2D) {
    const w = this.world;
    // punto de reunión
    if (this.sel.length === 1) {
      const b = w.get(this.sel[0]);
      if (b && b.cat === 'building' && b.owner === this.me && b.rally) {
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.setLineDash([4, 4]); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.rally.x, b.rally.y); g.stroke(); g.setLineDash([]);
        g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(b.rally.x, b.rally.y); g.lineTo(b.rally.x, b.rally.y - 18); g.stroke();
        g.fillStyle = w.players[this.me].color; g.fillRect(b.rally.x, b.rally.y - 18, 10, 7);
      }
    }
    // fantasma de construcción
    if (this.placing && this.ghost) {
      const d = BUILDINGS[this.placing];
      const tiles = d.line ? this.wallTiles() : [this.ghost];
      const [fw, fh] = w.footprint(this.placing, this.ghostVertical);
      for (const t of tiles) {
        const ok = !w.canPlace(this.me, this.placing, t.tx, t.ty, this.ghostVertical);
        g.fillStyle = ok ? 'rgba(80,220,120,0.35)' : 'rgba(240,80,80,0.4)';
        g.strokeStyle = ok ? '#5ee28a' : '#f05050'; g.lineWidth = 2;
        g.fillRect(t.tx * TILE, t.ty * TILE, fw * TILE, fh * TILE);
        g.strokeRect(t.tx * TILE, t.ty * TILE, fw * TILE, fh * TILE);
      }
    }
    if (this.box) {
      const a = this.screenToWorld(this.box.x0, this.box.y0), b = this.screenToWorld(this.box.x1, this.box.y1);
      g.strokeStyle = '#7CFC8A'; g.lineWidth = 1.5 / this.cam.zoom;
      g.fillStyle = 'rgba(124,252,138,0.12)';
      g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
  }

  // ------------------------------------------------------------- cámara
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.canvas.style.width = this.vw + 'px';
    this.canvas.style.height = this.vh + 'px';
    this.clampCam();
  }
  centerOn(x: number, y: number) {
    this.cam.x = x - this.vw / this.cam.zoom / 2;
    this.cam.y = y - this.vh / this.cam.zoom / 2;
    this.clampCam();
  }
  private clampCam() {
    const W = this.world.w * TILE, H = this.world.h * TILE;
    const vw = this.vw / this.cam.zoom, vh = this.vh / this.cam.zoom;
    const m = 120;
    this.cam.x = vw > W + m * 2 ? (W - vw) / 2 : Math.max(-m, Math.min(W - vw + m, this.cam.x));
    this.cam.y = vh > H + m * 2 ? (H - vh) / 2 : Math.max(-m, Math.min(H - vh + m + 120, this.cam.y));
  }
  screenToWorld(sx: number, sy: number) { return { x: this.cam.x + sx / this.cam.zoom, y: this.cam.y + sy / this.cam.zoom }; }
  private zoomAt(sx: number, sy: number, z: number) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = Math.max(0.45, Math.min(2.2, z));
    this.cam.x = before.x - sx / this.cam.zoom;
    this.cam.y = before.y - sy / this.cam.zoom;
    this.clampCam();
  }
  private keyPan(dt: number) {
    const s = 600 * dt / this.cam.zoom;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) this.cam.x -= s;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) this.cam.x += s;
    if (this.keys.has('ArrowUp') || this.keys.has('w')) this.cam.y -= s;
    if (this.keys.has('ArrowDown') || this.keys.has('s')) this.cam.y += s;
    if (this.keys.size) this.clampCam();
  }

  // ------------------------------------------------------------- input
  private on(t: EventTarget, n: string, f: EventListener, opt?: AddEventListenerOptions) {
    t.addEventListener(n, f, opt); this.listeners.push([t, n, f]);
  }
  private bindInput() {
    const c = this.canvas;
    this.on(window, 'resize', () => this.resize());
    this.on(c, 'contextmenu', (e) => e.preventDefault());
    this.on(c, 'pointerdown', (ev) => {
      const e = ev as PointerEvent;
      c.setPointerCapture(e.pointerId);
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, type: e.pointerType });
      if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()];
        this.dragging = 'pinch'; this.box = null;
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.cam.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      }
    });
    this.on(c, 'pointermove', (ev) => {
      const e = ev as PointerEvent;
      const p = this.ptrs.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse' && this.placing) this.setGhost(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.dragging === 'pinch') {
        const [a, b] = [...this.ptrs.values()];
        if (!a || !b) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.cam.x -= (mx - this.pinch.mx) / this.cam.zoom; this.cam.y -= (my - this.pinch.my) / this.cam.zoom;
        this.pinch.mx = mx; this.pinch.my = my;
        this.zoomAt(mx, my, this.pinch.zoom * d / this.pinch.d);
        return;
      }
      if (!this.dragging && Math.hypot(p.x - p.sx, p.y - p.sy) > 9) {
        const wantBox = this.mode === 'box' || (p.type === 'mouse' && p.button === 0 && !this.placing);
        this.dragging = wantBox ? 'box' : 'pan';
        if (wantBox) this.box = { x0: p.sx, y0: p.sy, x1: p.x, y1: p.y };
      }
      if (this.dragging === 'pan') {
        if (this.placing && p.type !== 'mouse' && this.ghost && this.ptrs.size === 1 && this.ghostUnder(p.sx, p.sy)) {
          this.setGhost(p.x, p.y); // arrastrar el fantasma
        } else {
          this.cam.x -= dx / this.cam.zoom; this.cam.y -= dy / this.cam.zoom; this.clampCam();
        }
      } else if (this.dragging === 'box' && this.box) { this.box.x1 = p.x; this.box.y1 = p.y; }
    });
    const up = (ev: Event) => {
      const e = ev as PointerEvent;
      const p = this.ptrs.get(e.pointerId);
      this.ptrs.delete(e.pointerId);
      if (!p) return;
      if (this.dragging === 'pinch') { if (this.ptrs.size === 0) this.dragging = null; return; }
      if (this.dragging === 'box' && this.box) {
        this.boxSelect(this.box);
        this.box = null; this.dragging = null;
        if (this.mode === 'box') this.mode = 'normal';
        return;
      }
      if (this.dragging === 'pan') { this.dragging = null; return; }
      this.dragging = null;
      if (ev.type === 'pointercancel') return;
      this.tap(p.x, p.y, p.type === 'mouse' && p.button === 2, p.type === 'mouse');
    };
    this.on(c, 'pointerup', up);
    this.on(c, 'pointercancel', up);
    this.on(c, 'wheel', (ev) => {
      const e = ev as WheelEvent; e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, this.cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
    }, { passive: false });
    this.on(window, 'keydown', (ev) => {
      const e = ev as KeyboardEvent;
      this.keys.add(e.key);
      if (e.key === 'Escape') this.cancelModes();
      if (e.key === ' ') this.hud.togglePause();
      if (e.key === '.') this.selectIdleVillager();
    });
    this.on(window, 'keyup', (ev) => this.keys.delete((ev as KeyboardEvent).key));
  }

  cancelModes() {
    this.placing = null; this.ghost = null; this.wallStart = null; this.mode = 'normal'; this.buildMenu = false;
  }

  private ghostUnder(sx: number, sy: number): boolean {
    if (!this.ghost || !this.placing) return false;
    const w = this.screenToWorld(sx, sy);
    const [fw, fh] = this.world.footprint(this.placing, this.ghostVertical);
    return w.x >= this.ghost.tx * TILE - 16 && w.x <= (this.ghost.tx + fw) * TILE + 16 && w.y >= this.ghost.ty * TILE - 16 && w.y <= (this.ghost.ty + fh) * TILE + 16;
  }

  setGhost(sx: number, sy: number) {
    if (!this.placing) return;
    const p = this.screenToWorld(sx, sy);
    if (this.placing === 'gate' && !this.gateRotated) {
      // orientar el portón según la muralla que hay debajo
      const cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE), w = this.world;
      const wall = (x: number, y: number) => !!w.ownWallAt(this.me, x, y);
      if (wall(cx, cy - 1) || wall(cx, cy + 1)) this.ghostVertical = !(wall(cx - 1, cy) || wall(cx + 1, cy));
      else this.ghostVertical = false;
    }
    const [fw, fh] = this.world.footprint(this.placing, this.ghostVertical);
    this.ghost = { tx: Math.round(p.x / TILE - fw / 2), ty: Math.round(p.y / TILE - fh / 2) };
  }

  rotateGhost() {
    if (this.placing !== 'gate' || !this.ghost) return;
    const [fw, fh] = this.world.footprint('gate', this.ghostVertical);
    const cx = this.ghost.tx + fw / 2, cy = this.ghost.ty + fh / 2;
    this.ghostVertical = !this.ghostVertical; this.gateRotated = true;
    const [nw, nh] = this.world.footprint('gate', this.ghostVertical);
    this.ghost = { tx: Math.round(cx - nw / 2), ty: Math.round(cy - nh / 2) };
  }

  /** ¿Las próximas órdenes se agregan a la cola? (botón ➕ o tecla Shift) */
  get queuing(): boolean { return this.queueMode || this.keys.has('Shift'); }

  /** Casillas de la empalizada entre el primer y el segundo toque */
  wallTiles(): { tx: number; ty: number }[] {
    if (!this.ghost) return [];
    const a = this.wallStart ?? this.ghost, b = this.ghost;
    const n = Math.max(Math.abs(b.tx - a.tx), Math.abs(b.ty - a.ty));
    const out: { tx: number; ty: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const tx = Math.round(a.tx + (b.tx - a.tx) * (n ? i / n : 0)), ty = Math.round(a.ty + (b.ty - a.ty) * (n ? i / n : 0));
      if (!out.some((t) => t.tx === tx && t.ty === ty)) out.push({ tx, ty });
    }
    return out.slice(0, 40);
  }

  openBuildMenu() {
    if (!this.selUnits().some((u) => u.type === 'villager')) {
      const vills = this.world.unitsOf(this.me, 'villager');
      if (!vills.length) { this.hud.toast('No tenés aldeanos'); return; }
      const c = this.screenToWorld(this.vw / 2, this.vh / 2);
      const idle = vills.filter((v) => !v.order);
      const pool = idle.length ? idle : vills;
      pool.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
      this.select([pool[0].id]);
      this.hud.toast(`Aldeano elegido para construir`);
    }
    this.placing = null; this.ghost = null;
    this.buildMenu = true;
  }

  confirmPlacement() {
    if (!this.placing || !this.ghost) return;
    if (BUILDINGS[this.placing].line) {
      const b = this.placing;
      const vills = this.selUnits().filter((u) => u.type === 'villager').map((u) => u.id);
      const tiles = this.wallTiles().filter((t) => !this.world.canPlace(this.me, b, t.tx, t.ty));
      if (!tiles.length) { this.hud.toast('No se puede construir ahí'); return; }
      // el primer tramo se ordena al final para que los aldeanos arranquen por ahí
      tiles.forEach((t, i) => this.world.issue({ t: 'build', p: this.me, ids: vills, b, tx: t.tx, ty: t.ty, queue: i > 0 || this.queuing }));
      this.placing = null; this.ghost = null; this.wallStart = null;
      return;
    }
    const why = this.world.canPlace(this.me, this.placing, this.ghost.tx, this.ghost.ty, this.ghostVertical);
    if (why) { this.hud.toast(why); return; }
    const vills = this.selUnits().filter((u) => u.type === 'villager').map((u) => u.id);
    this.world.issue({ t: 'build', p: this.me, ids: vills, b: this.placing, tx: this.ghost.tx, ty: this.ghost.ty, vertical: this.ghostVertical, queue: this.queuing });
    const [fw, fh] = this.world.footprint(this.placing, this.ghostVertical);
    this.mark((this.ghost.tx + fw / 2) * TILE, (this.ghost.ty + fh / 2) * TILE, '#7CFC8A');
    if (this.queuing) {
      // como Shift en el original: seguís ubicando el mismo edificio hasta tocar "Listo"
      this.hud.toast('Agregado a la cola · ubicá otro o tocá Listo');
      this.placedInQueue++;
      this.ghost = { tx: this.ghost.tx + fw, ty: this.ghost.ty };
      return;
    }
    this.placing = null; this.ghost = null;
  }

  /** Tocar el mapa */
  private tap(sx: number, sy: number, rightClick: boolean, isMouse: boolean) {
    const p = this.screenToWorld(sx, sy);
    const w = this.world;
    if (this.placing) {
      if (rightClick) { this.placing = null; this.ghost = null; this.wallStart = null; return; }
      this.setGhost(sx, sy);
      if (BUILDINGS[this.placing].line) {
        if (!this.wallStart) { this.wallStart = this.ghost; this.hud.toast('Ahora tocá dónde termina la muralla'); return; }
        if (isMouse) this.confirmPlacement();
        return;
      }
      if (isMouse) this.confirmPlacement();
      return;
    }
    const hit = this.pick(p.x, p.y);
    if (this.mode === 'rally') {
      const b = w.get(this.sel[0]);
      if (b) { w.issue({ t: 'rally', p: this.me, bid: b.id, x: p.x, y: p.y }); this.mark(p.x, p.y, '#fff'); }
      this.mode = 'normal';
      return;
    }
    const units = this.selUnits();
    if (units.length && (rightClick || this.shouldCommand(hit, units))) {
      if (!hit) {
        const attack = this.mode === 'attack';
        w.issue({ t: attack ? 'attackMove' : 'move', p: this.me, ids: units.map((u) => u.id), x: p.x, y: p.y, queue: this.queuing });
        this.mark(p.x, p.y, attack ? '#ff6b6b' : '#7CFC8A');
      } else {
        w.issue({ t: 'target', p: this.me, ids: units.map((u) => u.id), target: hit.id, queue: this.queuing });
        this.mark(hit.x, hit.y, w.isEnemy(this.me, hit.owner) ? '#ff6b6b' : '#ffe08a');
      }
      this.mode = 'normal';
      return;
    }
    if (rightClick && this.sel.length === 1) {
      const b = w.get(this.sel[0]);
      if (b && b.cat === 'building' && b.owner === this.me) { w.issue({ t: 'rally', p: this.me, bid: b.id, x: p.x, y: p.y }); this.mark(p.x, p.y, '#fff'); return; }
    }
    // selección
    if (!hit) { if (this.sel.length && !units.length) this.select([]); return; }
    const now = performance.now();
    if (hit.cat === 'unit' && hit.owner === this.me && this.lastTap.id === hit.id && now - this.lastTap.t < 350) {
      // doble toque: todas las de ese tipo en pantalla
      const all: number[] = [];
      for (const e of w.entities.values())
        if (e.cat === 'unit' && e.owner === this.me && e.type === hit.type && this.onScreen(e)) all.push(e.id);
      this.select(all);
    } else this.select([hit.id]);
    this.lastTap = { t: now, id: hit.id };
  }

  private shouldCommand(hit: Entity | undefined, units: Entity[]): boolean {
    const w = this.world;
    if (!hit) return true;
    if (hit.cat === 'node') return true;
    if (w.isEnemy(this.me, hit.owner)) return true;
    if (hit.cat === 'unit') return false;
    // edificio propio o aliado
    const vills = units.some((u) => u.type === 'villager');
    if (!vills) return false;
    if (hit.progress < 1 || hit.hp < hit.maxHp) return true;
    if (hit.type === 'farm' && hit.owner === this.me) return true;
    const drop = BUILDINGS[hit.type as BuildingType].drop;
    return !!drop && units.some((u) => u.carry > 0 && u.carryRes && drop.includes(u.carryRes));
  }

  private onScreen(e: Entity) {
    return e.x > this.cam.x && e.y > this.cam.y && e.x < this.cam.x + this.vw / this.cam.zoom && e.y < this.cam.y + this.vh / this.cam.zoom;
  }

  pick(x: number, y: number): Entity | undefined {
    const w = this.world, pl = w.players[this.me];
    const slack = 10 / this.cam.zoom;
    let best: Entity | undefined, bd = Infinity;
    for (const e of w.entities.values()) {
      if (e.cat !== 'unit') continue;
      if (w.isEnemy(this.me, e.owner) && !pl.visible[Math.floor(e.y / TILE) * w.w + Math.floor(e.x / TILE)]) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.radius;
      if (d < slack && d < bd) { bd = d; best = e; }
    }
    if (best) return best;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h || !pl.explored[ty * w.w + tx]) return undefined;
    return w.get(w.occ[ty * w.w + tx]);
  }

  private boxSelect(b: { x0: number; y0: number; x1: number; y1: number }) {
    const a = this.screenToWorld(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1));
    const c = this.screenToWorld(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
    const ids: number[] = [];
    for (const e of this.world.entities.values())
      if (e.cat === 'unit' && e.owner === this.me && e.x >= a.x && e.x <= c.x && e.y >= a.y && e.y <= c.y) ids.push(e.id);
    if (ids.length) this.select(ids);
  }

  select(ids: number[]) {
    this.sel = ids;
    this.buildMenu = false;
    if (this.mode !== 'box') this.mode = 'normal';
    this.placing = null; this.ghost = null;
  }

  selUnits(): Entity[] {
    return this.sel.map((id) => this.world.get(id)).filter((e): e is Entity => !!e && e.cat === 'unit' && e.owner === this.me);
  }

  mark(x: number, y: number, color: string) {
    this.renderer.fx.push({ kind: 'mark', x, y, t: this.time, life: 0.6, color });
  }

  // ------------------------------------------------------------ acciones del HUD
  selectIdleVillager() {
    const idle = this.world.unitsOf(this.me, 'villager').filter((v) => !v.order);
    if (!idle.length) { this.hud.toast('No hay aldeanos ociosos'); return; }
    const cur = this.sel.length === 1 ? idle.findIndex((v) => v.id === this.sel[0]) : -1;
    const v = idle[(cur + 1) % idle.length];
    this.select([v.id]);
    this.centerOn(v.x, v.y);
  }
  selectArmy() {
    const army = this.world.unitsOf(this.me).filter((u) => isLandArmy(u.type as UnitType) || u.type === 'monk');
    if (!army.length) { this.hud.toast('No tenés ejército'); return; }
    this.select(army.map((u) => u.id));
  }
  selectNavy() {
    const navy = this.world.unitsOf(this.me).filter((u) => UNITS[u.type as UnitType].naval && u.type !== 'fishship');
    if (!navy.length) { this.hud.toast('No tenés barcos de guerra'); return; }
    this.select(navy.map((u) => u.id));
    this.centerOn(navy[0].x, navy[0].y);
  }
  startPlacing(b: BuildingType) {
    const d = BUILDINGS[b];
    if (this.world.players[this.me].age < d.age) { this.hud.toast(`Requiere la ${AGE_NAME[d.age]}`); return; }
    if (!this.world.canAfford(this.me, this.world.buildingCost(this.me, b))) { this.hud.toast('Recursos insuficientes'); return; }
    this.placing = b; this.buildMenu = false; this.wallStart = null; this.ghostVertical = false; this.gateRotated = false;
    if (d.line) { this.ghost = null; this.hud.toast('Tocá dónde empieza la muralla'); return; }
    // fantasma inicial: lugar válido más cercano al centro de la pantalla
    this.setGhost(this.vw / 2, this.vh * 0.42);
    const g0 = this.ghost!;
    if (b === 'gate') {
      // buscar el tramo de muralla propia más cercano donde entre el portón
      for (let r = 0; r < 14; r++)
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = g0.tx + dx, cy = g0.ty + dy;
          if (!this.world.ownWallAt(this.me, cx, cy)) continue;
          for (const v of [false, true]) {
            const tx = v ? cx : cx - 1, ty = v ? cy - 1 : cy;
            if (!this.world.canPlace(this.me, 'gate', tx, ty, v)) { this.ghost = { tx, ty }; this.ghostVertical = v; return; }
          }
        }
    }
    for (let r = 0; r < (d.onWater ? 24 : 10); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!this.world.canPlace(this.me, b, g0.tx + dx, g0.ty + dy)) { this.ghost = { tx: g0.tx + dx, ty: g0.ty + dy }; return; }
      }
    }
  }
  train(u: UnitType) {
    const b = this.world.get(this.sel[0]);
    if (b) this.world.issue({ t: 'train', p: this.me, bid: b.id, u });
  }
  nodeName(e: Entity) { return NODES[e.type as NodeType].name; }
  get view() { return { w: this.vw, h: this.vh }; }
}
