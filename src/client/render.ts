// Dibujo del mundo con Canvas 2D. Sin imágenes externas: todo son formas,
// así el juego pesa muy poco y carga al instante en el celular.
import { BUILDINGS, BuildingType, NodeType, TILE, UnitType, Res } from '../sim/data.js';
import { Entity, World } from '../sim/world.js';

export interface Camera { x: number; y: number; zoom: number }
export interface Fx { kind: 'shot' | 'hit' | 'death' | 'mark'; x: number; y: number; x2?: number; y2?: number; t: number; life: number; color?: string }

const RES_COLOR: Record<Res, string> = { food: '#e74c3c', wood: '#8d6e63', gold: '#f1c40f', stone: '#95a5a6' };

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Terreno pre-dibujado una sola vez */
export function makeGround(w: World): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w.w * TILE; c.height = w.h * TILE;
  const g = c.getContext('2d')!;
  let seed = 1234;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      const v = 0.92 + rnd() * 0.12 + Math.sin(x * 0.35) * 0.02 + Math.cos(y * 0.27) * 0.02;
      g.fillStyle = `rgb(${Math.round(92 * v)},${Math.round(140 * v)},${Math.round(62 * v)})`;
      g.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  // manchas y pasto
  for (let i = 0; i < w.w * w.h * 0.6; i++) {
    const x = rnd() * c.width, y = rnd() * c.height;
    g.fillStyle = rnd() < 0.5 ? 'rgba(40,80,30,0.18)' : 'rgba(170,190,90,0.15)';
    g.fillRect(x, y, 2, 4 + rnd() * 3);
  }
  for (let i = 0; i < 25; i++) {
    const x = rnd() * c.width, y = rnd() * c.height, r = 40 + rnd() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(150,130,80,0.18)'); grad.addColorStop(1, 'rgba(150,130,80,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return c;
}

export class Renderer {
  ground: HTMLCanvasElement;
  fx: Fx[] = [];
  constructor(private ctx: CanvasRenderingContext2D, private w: World) {
    this.ground = makeGround(w);
  }

  draw(cam: Camera, viewW: number, viewH: number, dpr: number, me: number, sel: Set<number>, time: number, extra: (g: CanvasRenderingContext2D) => void) {
    const g = this.ctx, w = this.w;
    const pl = w.players[me];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b0f14';
    g.fillRect(0, 0, viewW * dpr, viewH * dpr);
    g.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * dpr * cam.zoom, -cam.y * dpr * cam.zoom);
    const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + viewW / cam.zoom, vy1 = cam.y + viewH / cam.zoom;
    g.drawImage(this.ground, 0, 0);

    const visible = (e: Entity) => {
      const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
      const i = ty * w.w + tx;
      if (e.cat === 'unit') return e.owner === me || !w.isEnemy(me, e.owner) || pl.visible[i] === 1;
      // edificios y recursos: con que alguna casilla esté explorada
      for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++) if (pl.explored[y * w.w + x]) return true;
      return false;
    };

    const list: Entity[] = [];
    for (const e of w.entities.values()) {
      const r = e.cat === 'unit' ? 20 : e.size * TILE;
      if (e.x + r < vx0 || e.x - r > vx1 || e.y + r < vy0 || e.y - r > vy1) continue;
      if (!visible(e)) continue;
      list.push(e);
    }
    // granjas primero (en el piso), después por profundidad
    list.sort((a, b) => (a.type === 'farm' ? -1e6 : 0) + (a.cat === 'unit' ? a.y : a.y + a.size * 8) - ((b.type === 'farm' ? -1e6 : 0) + (b.cat === 'unit' ? b.y : b.y + b.size * 8)));

    // anillos de selección (debajo)
    for (const e of list) if (sel.has(e.id)) this.selRing(e, e.owner === me ? '#7CFC8A' : w.isEnemy(me, e.owner) ? '#ff6b6b' : '#ffe08a');

    for (const e of list) {
      if (e.cat === 'node') this.node(e, time);
      else if (e.cat === 'building') this.building(e, time);
      else this.unit(e, time);
    }
    // barras de vida
    for (const e of list) {
      if (e.cat === 'node') continue;
      if (sel.has(e.id) || (e.hp < e.maxHp && e.cat === 'unit') || (e.cat === 'building' && e.progress < 1)) this.hpBar(e);
    }
    // efectos
    this.drawFx(time);
    extra(g);
    // niebla
    this.fog(cam, viewW, viewH, pl.explored, pl.visible);
  }

  private selRing(e: Entity, color: string) {
    const g = this.ctx;
    g.strokeStyle = color; g.lineWidth = 2;
    g.beginPath();
    if (e.cat === 'unit') g.ellipse(e.x, e.y + e.radius * 0.6, e.radius + 4, (e.radius + 4) * 0.55, 0, 0, 7);
    else g.rect(e.tx * TILE - 2, e.ty * TILE - 2, e.size * TILE + 4, e.size * TILE + 4);
    g.stroke();
  }

  private hpBar(e: Entity) {
    const g = this.ctx;
    const wdt = e.cat === 'unit' ? 22 : e.size * TILE * 0.8;
    const x = e.x - wdt / 2, y = e.cat === 'unit' ? e.y - e.radius - 12 : e.ty * TILE - 8;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 1, y - 1, wdt + 2, 5);
    const f = Math.max(0, e.hp / e.maxHp);
    g.fillStyle = f > 0.6 ? '#4ade80' : f > 0.3 ? '#facc15' : '#ef4444';
    g.fillRect(x, y, wdt * f, 3);
    if (e.cat === 'building' && e.progress < 1) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 1, y + 5, wdt + 2, 4);
      g.fillStyle = '#60a5fa'; g.fillRect(x, y + 6, wdt * e.progress, 2);
    }
  }

  private node(e: Entity, time: number) {
    const g = this.ctx;
    const x = e.x, y = e.y;
    const v = (e.id * 9301 + 49297) % 233280 / 233280;
    switch (e.type as NodeType) {
      case 'tree': {
        const sway = Math.sin(time * 1.3 + e.id) * 0.8;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.ellipse(x + 3, y + 10, 12, 5, 0, 0, 7); g.fill();
        g.fillStyle = '#5d4037'; g.fillRect(x - 2, y + 2, 4, 9);
        const r = 11 + v * 4;
        g.fillStyle = shade('#2e7d32', -0.15 - v * 0.2);
        g.beginPath(); g.arc(x + sway, y - 4, r, 0, 7); g.fill();
        g.fillStyle = shade('#43a047', -v * 0.15);
        g.beginPath(); g.arc(x - 3 + sway, y - 7, r * 0.65, 0, 7); g.fill();
        break;
      }
      case 'berries': {
        g.fillStyle = '#2f6b2f';
        g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill();
        g.fillStyle = '#3f8a3a';
        g.beginPath(); g.arc(x - 3, y - 3, 8, 0, 7); g.fill();
        const n = Math.ceil((e.amount / 150) * 7);
        g.fillStyle = '#d6336c';
        for (let i = 0; i < n; i++) { const a = i * 2.1 + e.id; g.beginPath(); g.arc(x + Math.cos(a) * 7, y + Math.sin(a) * 6, 2.3, 0, 7); g.fill(); }
        break;
      }
      case 'goldmine':
      case 'stonemine': {
        const gold = e.type === 'goldmine';
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + 2, y + 8, 14, 6, 0, 0, 7); g.fill();
        g.fillStyle = '#6b6b6b';
        g.beginPath(); g.moveTo(x - 14, y + 8); g.lineTo(x - 8, y - 8); g.lineTo(x + 4, y - 11); g.lineTo(x + 14, y + 2); g.lineTo(x + 10, y + 9); g.closePath(); g.fill();
        g.fillStyle = '#8a8a8a';
        g.beginPath(); g.moveTo(x - 8, y - 8); g.lineTo(x + 4, y - 11); g.lineTo(x + 2, y - 1); g.lineTo(x - 6, y + 1); g.closePath(); g.fill();
        g.fillStyle = gold ? '#f5c518' : '#cfd8dc';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x - 6 + i * 4.5, y + 1 + (i % 2) * 4, gold ? 2.5 : 3, 0, 7); g.fill(); }
        break;
      }
    }
  }

  private building(e: Entity, time: number) {
    const g = this.ctx;
    const t = e.type as BuildingType;
    const col = this.w.players[e.owner]?.color ?? '#888';
    const s = e.size * TILE, x0 = e.tx * TILE, y0 = e.ty * TILE;
    const done = e.progress >= 1;
    if (t === 'farm') {
      g.fillStyle = done ? '#7a5a36' : '#8a7356';
      g.fillRect(x0 + 2, y0 + 2, s - 4, s - 4);
      if (done) {
        const f = e.amount / (BUILDINGS.farm.food ?? 300);
        g.strokeStyle = f > 0.3 ? '#9ccc65' : '#d4c35a'; g.lineWidth = 3;
        for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x0 + 8, y0 + 10 + i * 14); g.lineTo(x0 + s - 8, y0 + 10 + i * 14); g.stroke(); }
      }
      g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(x0 + 2, y0 + 2, s - 4, s - 4);
      return;
    }
    g.save();
    if (!done) g.globalAlpha = 0.45 + e.progress * 0.5;
    // sombra
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x0 + 6, y0 + 8, s - 6, s - 6);
    const wall = '#c8b593', wallD = '#a28f6c', roof = shade(col, -0.15), roofL = shade(col, 0.15);
    const pad = t === 'tower' ? 4 : 3;
    // base
    g.fillStyle = t === 'towncenter' || t === 'tower' ? '#9e9e9e' : wall;
    g.fillRect(x0 + pad, y0 + s * 0.35, s - pad * 2, s * 0.65 - pad);
    g.fillStyle = t === 'towncenter' || t === 'tower' ? '#7d7d7d' : wallD;
    g.fillRect(x0 + pad, y0 + s - pad - 4, s - pad * 2, 4);
    // techo
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(x0 + pad - 2, y0 + s * 0.4); g.lineTo(x0 + s / 2, y0 + pad - (t === 'towncenter' ? 6 : 0)); g.lineTo(x0 + s - pad + 2, y0 + s * 0.4); g.closePath();
    g.fill();
    g.fillStyle = roofL;
    g.beginPath(); g.moveTo(x0 + pad - 2, y0 + s * 0.4); g.lineTo(x0 + s / 2, y0 + pad - (t === 'towncenter' ? 6 : 0)); g.lineTo(x0 + s / 2, y0 + s * 0.4); g.closePath(); g.fill();
    // símbolo del edificio
    const cx = x0 + s / 2, cy = y0 + s * 0.7;
    g.strokeStyle = '#3a2f22'; g.fillStyle = '#3a2f22'; g.lineWidth = 2.5; g.lineCap = 'round';
    switch (t) {
      case 'towncenter': {
        g.fillStyle = '#5a4630'; g.fillRect(cx - 7, cy - 4, 14, 16);
        // bandera
        const fy = y0 - 10, wave = Math.sin(time * 4) * 2;
        g.strokeStyle = '#3a2f22'; g.beginPath(); g.moveTo(cx, y0 + pad - 6); g.lineTo(cx, fy - 10); g.stroke();
        g.fillStyle = col; g.beginPath(); g.moveTo(cx, fy - 10); g.lineTo(cx + 14, fy - 7 + wave); g.lineTo(cx, fy - 2); g.closePath(); g.fill();
        break;
      }
      case 'house': g.fillStyle = '#5a4630'; g.fillRect(cx - 4, cy - 2, 8, 10); break;
      case 'barracks':
        g.beginPath(); g.moveTo(cx - 9, cy - 9); g.lineTo(cx + 9, cy + 9); g.moveTo(cx + 9, cy - 9); g.lineTo(cx - 9, cy + 9); g.stroke(); break;
      case 'range':
        g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill(); break;
      case 'stable':
        g.beginPath(); g.arc(cx, cy - 2, 8, Math.PI * 0.1, Math.PI * 0.9, true); g.stroke(); break;
      case 'workshop':
        g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.stroke();
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); g.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11); g.stroke(); }
        break;
      case 'mill': {
        const a = time * (done ? 1.5 : 0);
        g.strokeStyle = '#eee'; g.lineWidth = 3;
        for (let i = 0; i < 4; i++) { const b = a + i * Math.PI / 2; g.beginPath(); g.moveTo(cx, y0 + s * 0.38); g.lineTo(cx + Math.cos(b) * 14, y0 + s * 0.38 + Math.sin(b) * 14); g.stroke(); }
        break;
      }
      case 'lumbercamp':
        g.fillStyle = '#795548'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx - 7 + i * 7, cy + 3, 3.5, 0, 7); g.fill(); }
        g.beginPath(); g.arc(cx - 3.5, cy - 3, 3.5, 0, 7); g.fill(); g.beginPath(); g.arc(cx + 3.5, cy - 3, 3.5, 0, 7); g.fill(); break;
      case 'miningcamp':
        g.beginPath(); g.moveTo(cx - 8, cy + 8); g.lineTo(cx + 6, cy - 6); g.stroke();
        g.beginPath(); g.arc(cx + 6, cy - 6, 7, Math.PI * 0.6, Math.PI * 1.9); g.stroke(); break;
      case 'tower':
        g.fillStyle = '#7d7d7d';
        for (let i = 0; i < 3; i++) g.fillRect(x0 + 5 + i * 8, y0 + s * 0.28, 5, 5);
        break;
    }
    g.restore();
    if (!done) {
      // andamios
      g.strokeStyle = 'rgba(90,60,30,0.9)'; g.lineWidth = 1.5;
      for (let i = 0; i <= s; i += 12) { g.beginPath(); g.moveTo(x0 + i, y0 + s); g.lineTo(x0 + i, y0 + s * (1 - e.progress)); g.stroke(); }
    }
    if (e.ageT >= 0 || (e.queue.length && done)) {
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(x0 + s - 6, y0 + 6, 4 + Math.sin(time * 6) * 1, 0, 7); g.fill();
    }
  }

  private unit(e: Entity, time: number) {
    const g = this.ctx;
    const t = e.type as UnitType;
    const col = this.w.players[e.owner].color;
    const x = e.x, y = e.y, r = e.radius;
    const moving = e.path.length > 0;
    const bob = moving ? Math.sin(time * 14 + e.id) * 1.2 : 0;
    const fx = Math.cos(e.facing), fy = Math.sin(e.facing);
    // sombra
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(x, y + r * 0.7, r * 0.95, r * 0.45, 0, 0, 7); g.fill();
    if (t === 'ram') {
      g.save(); g.translate(x, y); g.rotate(e.facing);
      g.fillStyle = '#6d4c41'; g.fillRect(-14, -9, 28, 18);
      g.fillStyle = col; g.fillRect(-14, -9, 28, 4);
      g.fillStyle = '#4e342e'; g.fillRect(8, -3, 10, 6);
      g.fillStyle = '#212121'; for (const [a, b] of [[-9, -11], [6, -11], [-9, 9], [6, 9]]) { g.beginPath(); g.arc(a, b, 3, 0, 7); g.fill(); }
      g.restore();
      return;
    }
    if (t === 'knight') {
      g.save(); g.translate(x, y + 2); g.rotate(e.facing);
      g.fillStyle = '#6d4c41'; g.beginPath(); g.ellipse(0, 0, 13, 6.5, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(12, 0, 5, 3.5, 0, 0, 7); g.fill();
      g.restore();
    }
    const by = y - (t === 'knight' ? 6 : 0) + bob;
    // cuerpo
    g.fillStyle = shade(col, -0.35);
    g.beginPath(); g.arc(x, by, r * 0.78 + 1, 0, 7); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.arc(x, by, r * 0.78, 0, 7); g.fill();
    // cabeza
    g.fillStyle = t === 'villager' ? '#f0c8a0' : '#b0bec5';
    g.beginPath(); g.arc(x + fx * 1.5, by - r * 0.55, r * 0.42, 0, 7); g.fill();
    // arma / herramienta
    g.lineCap = 'round';
    const hx = x + fx * r * 0.7, hy = by + fy * r * 0.5;
    switch (t) {
      case 'villager': {
        const swing = e.order && e.path.length === 0 && (e.order.t === 'gather' || e.order.t === 'build') ? Math.sin(time * 10 + e.id) * 0.8 : 0;
        const a = e.facing - 0.6 + swing;
        g.strokeStyle = '#6d4c41'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(a) * 8, hy + Math.sin(a) * 8); g.stroke();
        if (e.carry > 0 && e.carryRes) { g.fillStyle = RES_COLOR[e.carryRes]; g.fillRect(x - fx * 6 - 3, by - 3, 6, 6); }
        break;
      }
      case 'militia':
        g.strokeStyle = '#e0e0e0'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + fx * 10, hy + fy * 10 - 4); g.stroke(); break;
      case 'spearman':
        g.strokeStyle = '#8d6e63'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(hx - fx * 6, hy - fy * 6); g.lineTo(hx + fx * 14, hy + fy * 14); g.stroke();
        g.fillStyle = '#cfd8dc'; g.beginPath(); g.arc(hx + fx * 14, hy + fy * 14, 2.2, 0, 7); g.fill(); break;
      case 'archer':
        g.strokeStyle = '#8d6e63'; g.lineWidth = 2;
        g.beginPath(); g.arc(hx, hy, 7, e.facing - 1.1, e.facing + 1.1); g.stroke(); break;
      case 'knight':
        g.strokeStyle = '#e0e0e0'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + fx * 14, hy + fy * 14 - 3); g.stroke(); break;
    }
  }

  private drawFx(time: number) {
    const g = this.ctx;
    this.fx = this.fx.filter((f) => time - f.t < f.life);
    for (const f of this.fx) {
      const k = (time - f.t) / f.life;
      if (f.kind === 'shot') {
        const px = f.x + (f.x2! - f.x) * k, py = f.y + (f.y2! - f.y) * k - Math.sin(k * Math.PI) * 18;
        const ang = Math.atan2(f.y2! - f.y - Math.cos(k * Math.PI) * 18, f.x2! - f.x);
        g.strokeStyle = '#3e2723'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(px - Math.cos(ang) * 6, py - Math.sin(ang) * 6); g.lineTo(px + Math.cos(ang) * 4, py + Math.sin(ang) * 4); g.stroke();
      } else if (f.kind === 'hit') {
        g.fillStyle = `rgba(255,240,200,${0.7 * (1 - k)})`;
        g.beginPath(); g.arc(f.x, f.y, 4 + k * 6, 0, 7); g.fill();
      } else if (f.kind === 'death') {
        g.fillStyle = `rgba(120,100,80,${0.6 * (1 - k)})`;
        g.beginPath(); g.arc(f.x, f.y, 8 + k * 20, 0, 7); g.fill();
      } else if (f.kind === 'mark') {
        g.strokeStyle = f.color ?? '#7CFC8A'; g.globalAlpha = 1 - k; g.lineWidth = 2;
        g.beginPath(); g.ellipse(f.x, f.y, 14 * (1 - k * 0.6), 7 * (1 - k * 0.6), 0, 0, 7); g.stroke();
        g.globalAlpha = 1;
      }
    }
  }

  private fog(cam: Camera, vw: number, vh: number, explored: Uint8Array, vis: Uint8Array) {
    const g = this.ctx, w = this.w;
    const x0 = Math.max(0, Math.floor(cam.x / TILE)), y0 = Math.max(0, Math.floor(cam.y / TILE));
    const x1 = Math.min(w.w - 1, Math.ceil((cam.x + vw / cam.zoom) / TILE)), y1 = Math.min(w.h - 1, Math.ceil((cam.y + vh / cam.zoom) / TILE));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w.w + x;
        if (!explored[i]) { g.fillStyle = '#05070a'; g.fillRect(x * TILE - 0.5, y * TILE - 0.5, TILE + 1, TILE + 1); }
        else if (!vis[i]) { g.fillStyle = 'rgba(5,7,10,0.42)'; g.fillRect(x * TILE, y * TILE, TILE, TILE); }
      }
  }

  /** Minimapa */
  minimap(c: HTMLCanvasElement, me: number, cam: Camera, vw: number, vh: number) {
    const g = c.getContext('2d')!, w = this.w;
    const sx = c.width / w.w, sy = c.height / w.h;
    const pl = w.players[me];
    g.fillStyle = '#4f7a36'; g.fillRect(0, 0, c.width, c.height);
    for (const e of w.entities.values()) {
      if (e.cat === 'unit' && w.isEnemy(me, e.owner) && !pl.visible[Math.floor(e.y / TILE) * w.w + Math.floor(e.x / TILE)]) continue;
      if (e.cat !== 'unit' && !pl.explored[e.ty * w.w + e.tx]) continue;
      if (e.cat === 'node') g.fillStyle = e.type === 'tree' ? '#1f4d22' : e.type === 'goldmine' ? '#f5c518' : e.type === 'berries' ? '#d6336c' : '#cfd8dc';
      else g.fillStyle = w.players[e.owner].color;
      if (e.cat === 'unit') g.fillRect(e.x / TILE * sx - 1, e.y / TILE * sy - 1, 2.5, 2.5);
      else g.fillRect(e.tx * sx, e.ty * sy, Math.max(2, e.size * sx), Math.max(2, e.size * sy));
    }
    g.fillStyle = '#05070a';
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (!pl.explored[y * w.w + x]) g.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
    g.strokeStyle = '#fff'; g.lineWidth = 1;
    g.strokeRect(cam.x / TILE * sx, cam.y / TILE * sy, vw / cam.zoom / TILE * sx, vh / cam.zoom / TILE * sy);
  }
}
