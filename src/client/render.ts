// Dibujo del mundo con Canvas 2D. Sin imágenes externas: todo se dibuja con código
// (terreno, árboles y minas se pre-dibujan una vez como "sprites" para ir rápido en el celular).
import { BUILDINGS, BuildingType, NodeType, TILE, UnitType, Res } from '../sim/data.js';
import { Entity, World } from '../sim/world.js';

export interface Camera { x: number; y: number; zoom: number }
export interface Fx { kind: 'shot' | 'hit' | 'death' | 'mark' | 'heal' | 'smoke'; x: number; y: number; x2?: number; y2?: number; t: number; life: number; color?: string }

const RES_COLOR: Record<Res, string> = { food: '#e74c3c', wood: '#8d6e63', gold: '#f1c40f', stone: '#b0bec5' };

interface BiomePal {
  ground: [number, number, number]; ground2: [number, number, number];
  decal: string[]; water: string; waterDeep: string; shore: string; shallow: string;
  crop: string; cropRipe: string;
}
const BIOME: Record<string, BiomePal> = {
  templado: { ground: [96, 146, 64], ground2: [120, 160, 70], decal: ['#3f7a2f', '#a8c46a', '#f2e27a', '#ffffff'], water: '#3b7fb8', waterDeep: '#285f94', shore: '#c9b77e', shallow: '#6fa6c4', crop: '#9ccc65', cropRipe: '#e3c565' },
  desierto: { ground: [214, 184, 126], ground2: [196, 160, 104], decal: ['#b48a52', '#e8d3a0', '#8f7a4a', '#a3a35a'], water: '#2a9bb0', waterDeep: '#1d7a8f', shore: '#e9d7a5', shallow: '#68c2c8', crop: '#b9c46a', cropRipe: '#e8c06a' },
  nieve: { ground: [226, 232, 240], ground2: [200, 212, 226], decal: ['#ffffff', '#b8c8da', '#9fb3c8', '#e9f1f8'], water: '#4b84b0', waterDeep: '#36668e', shore: '#d8e0e8', shallow: '#8fb4d0', crop: '#a7b98a', cropRipe: '#cdbf7a' },
  tropical: { ground: [62, 138, 58], ground2: [86, 160, 64], decal: ['#2c6b2a', '#8fd16a', '#ff7aa8', '#ffd84a'], water: '#1fa3b5', waterDeep: '#137f96', shore: '#ead9a0', shallow: '#5fd0d4', crop: '#7fd05a', cropRipe: '#d7d05a' },
  otono: { ground: [138, 136, 70], ground2: [158, 140, 72], decal: ['#c2662a', '#e0a23a', '#8a4b22', '#d9c46a'], water: '#3c6c90', waterDeep: '#2b5272', shore: '#c9b07a', shallow: '#7aa0b8', crop: '#c8b25a', cropRipe: '#e09a3a' },
};

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function mkCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

/** Ruido suave (value noise) para manchas grandes de terreno */
function valueNoise(seed: number) {
  const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
  };
}

/** Terreno pre-dibujado una sola vez, incluida el agua y las costas */
export function makeGround(w: World): HTMLCanvasElement {
  const pal = BIOME[w.biome] ?? BIOME.templado;
  const [c, g] = mkCanvas(w.w * TILE, w.h * TILE);
  let seed = 1234;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n1 = valueNoise(7), n2 = valueNoise(19);
  // base: mezcla de dos tonos con ruido, por bloques de 8px para un look pintado
  const B = 8;
  for (let y = 0; y < c.height; y += B)
    for (let x = 0; x < c.width; x += B) {
      const t = n1(x / 180, y / 180) * 0.7 + n2(x / 60, y / 60) * 0.3;
      const k = 0.94 + rnd() * 0.06;
      const col = pal.ground.map((v, i) => Math.round((v + (pal.ground2[i] - v) * t) * k));
      g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      g.fillRect(x, y, B, B);
    }
  // detalles del bioma
  for (let i = 0; i < w.w * w.h * 1.4; i++) {
    const x = rnd() * c.width, y = rnd() * c.height;
    const k = rnd();
    g.globalAlpha = 0.35 + rnd() * 0.35;
    g.fillStyle = pal.decal[k < 0.55 ? 0 : k < 0.85 ? 1 : k < 0.95 ? 2 : 3];
    if (w.biome === 'desierto' && k < 0.4) { g.fillRect(x, y, 6 + rnd() * 8, 1.2); continue; } // ondas de arena
    if (k < 0.55) { g.fillRect(x, y, 1.5, 3 + rnd() * 3); g.fillRect(x + 2, y + 1, 1.5, 2 + rnd() * 3); }
    else { g.beginPath(); g.arc(x, y, 1 + rnd() * 1.4, 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
  // agua: costa, poco profundo y profundo
  const water = (x: number, y: number) => x >= 0 && y >= 0 && x < w.w && y < w.h && w.terrain[y * w.w + x] !== 0;
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      if (!water(x, y)) continue;
      g.fillStyle = pal.shore;
      g.beginPath(); g.arc((x + 0.5) * TILE, (y + 0.5) * TILE, TILE * 0.85, 0, 7); g.fill();
    }
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      const t = w.terrain[y * w.w + x];
      if (!t) continue;
      g.fillStyle = t === 2 ? pal.shallow : pal.water;
      g.beginPath(); g.arc((x + 0.5) * TILE, (y + 0.5) * TILE, TILE * 0.72, 0, 7); g.fill();
    }
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      if (w.terrain[y * w.w + x] !== 1) continue;
      let deep = true;
      for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) if (!water(x + dx, y + dy)) { deep = false; break; }
      if (deep) { g.fillStyle = pal.waterDeep; g.beginPath(); g.arc((x + 0.5) * TILE, (y + 0.5) * TILE, TILE * 0.62, 0, 7); g.fill(); }
    }
  // piedritas en los vados
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      if (w.terrain[y * w.w + x] !== 2) continue;
      g.fillStyle = 'rgba(230,220,190,0.55)';
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(x * TILE + 4 + rnd() * 24, y * TILE + 4 + rnd() * 24, 3, 2, 0, 0, 7); g.fill(); }
    }
  // viñeta suave en los bordes del mapa
  const grd = g.createRadialGradient(c.width / 2, c.height / 2, c.width * 0.35, c.width / 2, c.height / 2, c.width * 0.75);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  return c;
}

// --------------------------------------------------------------- sprites
function treeSprite(biome: string, v: number): HTMLCanvasElement {
  const [c, g] = mkCanvas(48, 56);
  const x = 24, y = 40;
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x + 4, y + 6, 15, 6, 0, 0, 7); g.fill();
  const leaf = (base: string, hi: string, r: number) => {
    const grad = g.createRadialGradient(x - r * 0.35, y - 16 - r * 0.4, 1, x, y - 14, r * 1.2);
    grad.addColorStop(0, hi); grad.addColorStop(1, base);
    return grad;
  };
  if (biome === 'nieve') {
    g.fillStyle = '#4e342e'; g.fillRect(x - 2, y - 4, 4, 9);
    for (let i = 0; i < 3; i++) {
      const w = 16 - i * 4 + v * 2, yy = y - 2 - i * 9;
      g.fillStyle = i % 2 ? '#1f5135' : '#24603d';
      g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 16); g.lineTo(x + w, yy); g.closePath(); g.fill();
      g.fillStyle = '#f4f8fb';
      g.beginPath(); g.moveTo(x - w * 0.55, yy - 7); g.lineTo(x, yy - 16); g.lineTo(x + w * 0.4, yy - 9); g.closePath(); g.fill();
    }
  } else if (biome === 'desierto') {
    g.strokeStyle = '#8d6e47'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y + 2); g.quadraticCurveTo(x + 6 * (v - 0.5) * 2, y - 14, x + 3, y - 26); g.stroke();
    g.strokeStyle = '#2e7d32'; g.lineWidth = 3.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + v;
      g.beginPath(); g.moveTo(x + 3, y - 26); g.quadraticCurveTo(x + 3 + Math.cos(a) * 10, y - 32 + Math.sin(a) * 3, x + 3 + Math.cos(a) * 16, y - 22 + Math.sin(a) * 6); g.stroke();
    }
    g.fillStyle = '#6d4c2e'; g.beginPath(); g.arc(x + 3, y - 25, 3, 0, 7); g.fill();
  } else {
    g.fillStyle = '#5d4037'; g.fillRect(x - 2.5, y - 8, 5, 13);
    const sets: Record<string, [string, string][]> = {
      templado: [['#2e6b2e', '#5cae4a'], ['#2f7a35', '#6cbf55'], ['#285e2a', '#4f9c43']],
      tropical: [['#1b6e2a', '#47c25a'], ['#1f7d3b', '#5ed16e'], ['#16612a', '#3fae4c']],
      otono: [['#a8461c', '#e8823a'], ['#b8761a', '#f0b43a'], ['#8f3418', '#d8602e']],
    };
    const [base, hi] = (sets[biome] ?? sets.templado)[Math.floor(v * 3) % 3];
    const r = 12 + v * 3;
    g.fillStyle = leaf(base, hi, r);
    if (biome === 'tropical') {
      for (const [dx, dy, rr] of [[-7, -12, 9], [7, -13, 9], [0, -20, 10], [0, -10, 8]]) { g.beginPath(); g.arc(x + dx, y + dy, rr + v * 2, 0, 7); g.fill(); }
    } else {
      g.beginPath(); g.arc(x, y - 15, r, 0, 7); g.fill();
      g.beginPath(); g.arc(x - 7, y - 10, r * 0.7, 0, 7); g.fill();
      g.beginPath(); g.arc(x + 7, y - 10, r * 0.7, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(x - 4, y - 20, r * 0.35, 0, 7); g.fill();
  }
  return c;
}

function mineSprite(gold: boolean, snow: boolean): HTMLCanvasElement {
  const [c, g] = mkCanvas(40, 36);
  const x = 20, y = 20;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 2, y + 9, 16, 6, 0, 0, 7); g.fill();
  const rock = (pts: number[][], col: string) => { g.fillStyle = col; g.beginPath(); g.moveTo(x + pts[0][0], y + pts[0][1]); for (const p of pts.slice(1)) g.lineTo(x + p[0], y + p[1]); g.closePath(); g.fill(); };
  rock([[-15, 9], [-10, -6], [0, -11], [12, -6], [15, 6], [8, 11], [-8, 11]], '#6e6a66');
  rock([[-10, -6], [0, -11], [3, -1], [-5, 2]], '#8e8a85');
  rock([[3, -1], [12, -6], [15, 6], [6, 4]], '#5a5753');
  if (snow) rock([[-9, -6], [0, -11], [8, -8], [0, -6]], '#f1f5f9');
  g.fillStyle = gold ? '#ffd23f' : '#e3e8ec';
  for (const [dx, dy, r] of [[-6, 3, 2.6], [-1, 6, 2.2], [5, 2, 2.8], [9, 7, 2], [-3, -3, 2]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); }
  if (gold) { g.fillStyle = '#fff8c4'; g.beginPath(); g.arc(x + 4, y + 1, 1, 0, 7); g.fill(); }
  return c;
}

function bushSprite(biome: string): HTMLCanvasElement {
  const [c, g] = mkCanvas(36, 32);
  const x = 18, y = 18;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + 2, y + 7, 13, 5, 0, 0, 7); g.fill();
  const leaf = biome === 'desierto' ? '#6b8a3a' : biome === 'nieve' ? '#3f6b48' : biome === 'otono' ? '#7a6a2a' : '#2f6b2f';
  g.fillStyle = leaf;
  for (const [dx, dy, r] of [[-5, 1, 8], [5, 1, 8], [0, -4, 8]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); }
  g.fillStyle = shade(leaf, 0.25); g.beginPath(); g.arc(x - 2, y - 5, 5, 0, 7); g.fill();
  return c;
}

export class Renderer {
  ground: HTMLCanvasElement;
  fx: Fx[] = [];
  private trees: HTMLCanvasElement[];
  private gold: HTMLCanvasElement; private stone: HTMLCanvasElement; private bush: HTMLCanvasElement;
  private pal: BiomePal;
  private fogC: HTMLCanvasElement; private fogG: CanvasRenderingContext2D; private fogImg: ImageData;
  private waterTiles: number[] = [];

  constructor(private ctx: CanvasRenderingContext2D, private w: World) {
    this.ground = makeGround(w);
    this.pal = BIOME[w.biome] ?? BIOME.templado;
    this.trees = [0.1, 0.45, 0.8].map((v) => treeSprite(w.biome, v));
    this.gold = mineSprite(true, w.biome === 'nieve');
    this.stone = mineSprite(false, w.biome === 'nieve');
    this.bush = bushSprite(w.biome);
    [this.fogC, this.fogG] = mkCanvas(w.w, w.h);
    this.fogImg = this.fogG.createImageData(w.w, w.h);
    for (let i = 0; i < w.terrain.length; i++) if (w.terrain[i] === 1) this.waterTiles.push(i);
  }

  draw(cam: Camera, viewW: number, viewH: number, dpr: number, me: number, sel: Set<number>, time: number, extra: (g: CanvasRenderingContext2D) => void) {
    const g = this.ctx, w = this.w;
    const pl = w.players[me];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b0f14';
    g.fillRect(0, 0, viewW * dpr, viewH * dpr);
    g.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * dpr * cam.zoom, -cam.y * dpr * cam.zoom);
    const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + viewW / cam.zoom, vy1 = cam.y + viewH / cam.zoom;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.ground, 0, 0);
    this.waterAnim(time, vx0, vy0, vx1, vy1);

    const visible = (e: Entity) => {
      const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
      const i = ty * w.w + tx;
      if (e.cat === 'unit') return e.owner === me || !w.isEnemy(me, e.owner) || pl.visible[i] === 1;
      for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++) if (pl.explored[y * w.w + x]) return true;
      return false;
    };

    const list: Entity[] = [];
    for (const e of w.entities.values()) {
      const r = e.cat === 'unit' ? 24 : e.size * TILE + 20;
      if (e.x + r < vx0 || e.x - r > vx1 || e.y + r < vy0 || e.y - r > vy1) continue;
      if (!visible(e)) continue;
      list.push(e);
    }
    const depth = (e: Entity) => (e.type === 'farm' ? -1e6 : 0) + (e.cat === 'unit' ? e.y : (e.ty + e.size) * TILE - 6);
    list.sort((a, b) => depth(a) - depth(b));

    for (const e of list) if (sel.has(e.id)) this.selRing(e, e.owner === me ? '#7CFC8A' : w.isEnemy(me, e.owner) ? '#ff6b6b' : '#ffe08a', time);

    for (const e of list) {
      if (e.cat === 'node') this.node(e, time);
      else if (e.cat === 'building') this.building(e, time);
      else this.unit(e, time);
    }
    for (const e of list) {
      if (e.cat === 'node' || e.type === 'wall') continue;
      if (sel.has(e.id) || (e.hp < e.maxHp && e.cat === 'unit') || (e.cat === 'building' && (e.progress < 1 || e.hp < e.maxHp * 0.98))) this.hpBar(e);
    }
    this.drawFx(time);
    extra(g);
    this.fog(pl.explored, pl.visible);
  }

  private waterAnim(time: number, x0: number, y0: number, x1: number, y1: number) {
    const g = this.ctx, w = this.w;
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1.2; g.lineCap = 'round';
    g.beginPath();
    for (const i of this.waterTiles) {
      const tx = i % w.w, ty = (i / w.w) | 0;
      const px = tx * TILE, py = ty * TILE;
      if (px + TILE < x0 || px > x1 || py + TILE < y0 || py > y1) continue;
      const ph = time * 1.6 + tx * 0.9 + ty * 1.7;
      const o = Math.sin(ph) * 4;
      const a = (Math.sin(ph * 0.7) + 1) / 2;
      if (a < 0.35) continue;
      g.moveTo(px + 8 + o, py + 12); g.lineTo(px + 15 + o, py + 12);
      g.moveTo(px + 17 - o, py + 22); g.lineTo(px + 24 - o, py + 22);
    }
    g.stroke();
  }

  private selRing(e: Entity, color: string, time: number) {
    const g = this.ctx;
    g.strokeStyle = color; g.lineWidth = 2;
    g.beginPath();
    if (e.cat === 'unit') {
      const p = 1 + Math.sin(time * 6) * 0.06;
      g.ellipse(e.x, e.y + e.radius * 0.6, (e.radius + 4) * p, (e.radius + 4) * 0.55 * p, 0, 0, 7);
    } else g.rect(e.tx * TILE - 2, e.ty * TILE - 2, e.size * TILE + 4, e.size * TILE + 4);
    g.stroke();
  }

  private hpBar(e: Entity) {
    const g = this.ctx;
    const wdt = e.cat === 'unit' ? 22 : Math.min(80, e.size * TILE * 0.8);
    const x = e.x - wdt / 2, y = e.cat === 'unit' ? e.y - e.radius - 14 : e.ty * TILE - 16;
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - 1, y - 1, wdt + 2, 5);
    const f = Math.max(0, e.hp / e.maxHp);
    g.fillStyle = f > 0.6 ? '#4ade80' : f > 0.3 ? '#facc15' : '#ef4444';
    g.fillRect(x, y, wdt * f, 3);
    if (e.cat === 'building' && e.progress < 1) {
      g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - 1, y + 5, wdt + 2, 4);
      g.fillStyle = '#60a5fa'; g.fillRect(x, y + 6, wdt * e.progress, 2);
    }
  }

  private node(e: Entity, time: number) {
    const g = this.ctx;
    const v = ((e.id * 9301 + 49297) % 233280) / 233280;
    switch (e.type as NodeType) {
      case 'tree': {
        const spr = this.trees[Math.floor(v * 3)];
        const sway = Math.sin(time * 1.2 + e.id) * 0.6;
        g.drawImage(spr, e.x - 24 + sway, e.y - 34 + (v - 0.5) * 4);
        break;
      }
      case 'berries': {
        g.drawImage(this.bush, e.x - 18, e.y - 18);
        const n = Math.ceil((e.amount / 150) * 7);
        g.fillStyle = this.w.biome === 'desierto' ? '#f59e0b' : '#d6336c';
        for (let i = 0; i < n; i++) { const a = i * 2.1 + e.id; g.beginPath(); g.arc(e.x + Math.cos(a) * 7, e.y - 1 + Math.sin(a) * 5, 2.2, 0, 7); g.fill(); }
        break;
      }
      case 'goldmine': g.drawImage(this.gold, e.x - 20, e.y - 20); break;
      case 'stonemine': g.drawImage(this.stone, e.x - 20, e.y - 20); break;
    }
  }

  // --------------------------------------------------------------- edificios
  /** Caja en 3/4: pared frontal + techo a dos aguas */
  private box(x0: number, y0: number, s: number, wallH: number, wall: string, roof: string, opts: { stone?: boolean; flatRoof?: boolean } = {}) {
    const g = this.ctx;
    const top = y0 + s - wallH; // donde empieza la pared frontal
    // pared frontal
    g.fillStyle = wall; g.fillRect(x0 + 3, top, s - 6, wallH - 3);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x0 + s - 10, top, 7, wallH - 3); // lado en sombra
    if (opts.stone) {
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
      for (let yy = top + 6; yy < y0 + s - 4; yy += 6) { g.beginPath(); g.moveTo(x0 + 3, yy); g.lineTo(x0 + s - 3, yy); g.stroke(); }
    }
    // techo
    if (opts.flatRoof) {
      g.fillStyle = roof; g.fillRect(x0 + 1, y0 + 4, s - 2, top - y0 - 2);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0 + 1, y0 + 4, s - 2, 4);
    } else {
      const ridgeY = y0 + 4, eave = top + 2;
      g.fillStyle = shade(roof, -0.18);
      g.beginPath(); g.moveTo(x0, eave); g.lineTo(x0 + s * 0.18, ridgeY); g.lineTo(x0 + s * 0.82, ridgeY); g.lineTo(x0 + s, eave); g.closePath(); g.fill();
      g.fillStyle = roof;
      g.beginPath(); g.moveTo(x0, eave); g.lineTo(x0 + s * 0.18, ridgeY); g.lineTo(x0 + s * 0.5, ridgeY); g.lineTo(x0 + s * 0.5, eave); g.closePath(); g.fill();
      g.strokeStyle = shade(roof, -0.35); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x0 + s * 0.18, ridgeY); g.lineTo(x0 + s * 0.82, ridgeY); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
      for (let xx = x0 + 6; xx < x0 + s - 4; xx += 6) { g.beginPath(); g.moveTo(xx, eave); g.lineTo(xx + (x0 + s / 2 - xx) * 0.15, ridgeY + 2); g.stroke(); }
    }
    return top;
  }

  private door(cx: number, bottom: number, w: number, h: number) {
    const g = this.ctx;
    g.fillStyle = '#3e2a1a';
    g.beginPath(); g.moveTo(cx - w / 2, bottom); g.lineTo(cx - w / 2, bottom - h + w / 2); g.arc(cx, bottom - h + w / 2, w / 2, Math.PI, 0); g.lineTo(cx + w / 2, bottom); g.closePath(); g.fill();
  }
  private windowAt(x: number, y: number) {
    const g = this.ctx;
    g.fillStyle = '#2b2018'; g.fillRect(x, y, 6, 6);
    g.fillStyle = 'rgba(255,214,120,0.55)'; g.fillRect(x + 1, y + 1, 4, 4);
  }
  private banner(x: number, y: number, col: string, time: number, h = 16) {
    const g = this.ctx;
    g.strokeStyle = '#3a2f22'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    const wave = Math.sin(time * 4 + x) * 2;
    g.fillStyle = col;
    g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + 11, y - h + 3 + wave); g.lineTo(x, y - h + 7); g.closePath(); g.fill();
  }
  private crenels(x0: number, y: number, w: number, col: string) {
    const g = this.ctx;
    g.fillStyle = col;
    for (let x = x0; x < x0 + w - 3; x += 7) g.fillRect(x, y - 4, 4, 5);
  }

  private building(e: Entity, time: number) {
    const g = this.ctx;
    const t = e.type as BuildingType;
    const col = this.w.players[e.owner]?.color ?? '#888';
    const s = e.size * TILE, x0 = e.tx * TILE, y0 = e.ty * TILE;
    const done = e.progress >= 1;
    const cx = x0 + s / 2, bottom = y0 + s - 3;
    const timber = '#d8c8a2', stone = '#a3a09a', stoneD = '#8c8984';

    if (t === 'farm') {
      g.fillStyle = done ? '#7a5634' : '#8a7356';
      g.fillRect(x0 + 2, y0 + 2, s - 4, s - 4);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 7; i++) g.fillRect(x0 + 4, y0 + 7 + i * 12.5, s - 8, 3);
      if (done) {
        const f = e.amount / (BUILDINGS.farm.food ?? 600);
        g.fillStyle = f > 0.35 ? this.pal.crop : this.pal.cropRipe;
        for (let i = 0; i < 7; i++) for (let j = 0; j < 9; j++) {
          const h = 2 + f * 3;
          g.fillRect(x0 + 6 + j * 9.5, y0 + 8 + i * 12.5 - h, 2.5, h);
        }
      }
      g.strokeStyle = shade(col, -0.1); g.lineWidth = 2; g.strokeRect(x0 + 2, y0 + 2, s - 4, s - 4);
      return;
    }
    if (t === 'wall') {
      this.wallPiece(e, col);
      return;
    }

    g.save();
    if (!done) g.globalAlpha = 0.5 + e.progress * 0.45;
    // sombra proyectada
    g.fillStyle = t === 'market' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.28)';
    g.beginPath(); g.moveTo(x0 + 4, y0 + s - 2); g.lineTo(x0 + s + 6, y0 + s - 2); g.lineTo(x0 + s + 10, y0 + s * 0.4); g.lineTo(x0 + s - 2, y0 + s * 0.3); g.closePath(); g.fill();

    switch (t) {
      case 'house': {
        const top = this.box(x0, y0, s, s * 0.48, timber, col);
        g.strokeStyle = '#6b4a2a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x0 + 3, top + 1); g.lineTo(x0 + s - 3, top + 1); g.moveTo(cx - 9, top); g.lineTo(cx - 9, bottom); g.moveTo(cx + 9, top); g.lineTo(cx + 9, bottom); g.stroke();
        this.door(cx, bottom, 8, 14);
        this.windowAt(x0 + 7, top + 6); this.windowAt(x0 + s - 13, top + 6);
        break;
      }
      case 'towncenter': {
        // base de piedra + salón de madera + gran techo
        g.fillStyle = stone; g.fillRect(x0 + 2, y0 + s * 0.5, s - 4, s * 0.5 - 2);
        g.fillStyle = stoneD; g.fillRect(x0 + s - 12, y0 + s * 0.5, 10, s * 0.5 - 2);
        this.crenels(x0 + 3, y0 + s * 0.5, s - 6, stone);
        const top = this.box(x0 + 10, y0 + 2, s - 20, s * 0.32, timber, col);
        g.strokeStyle = '#6b4a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 13, top + 1); g.lineTo(x0 + s - 13, top + 1); g.stroke();
        this.windowAt(x0 + 18, top + 7); this.windowAt(x0 + s - 24, top + 7); this.windowAt(cx - 3, top + 7);
        this.door(cx, bottom, 14, 20);
        this.windowAt(x0 + 10, y0 + s * 0.65); this.windowAt(x0 + s - 16, y0 + s * 0.65);
        this.banner(x0 + 6, y0 + s * 0.5 - 2, col, time, 18); this.banner(x0 + s - 8, y0 + s * 0.5 - 2, col, time, 18);
        break;
      }
      case 'barracks': case 'range': case 'stable': case 'workshop': {
        const top = this.box(x0, y0, s, s * 0.46, t === 'workshop' ? '#b9a17a' : timber, col, { stone: t === 'barracks' });
        this.door(cx, bottom, t === 'stable' || t === 'workshop' ? 22 : 14, t === 'stable' || t === 'workshop' ? 22 : 18);
        // emblema en un escudo
        const ex = x0 + 16, ey = top + 14;
        g.fillStyle = '#efe4c8'; g.beginPath(); g.moveTo(ex - 8, ey - 8); g.lineTo(ex + 8, ey - 8); g.lineTo(ex + 8, ey + 2); g.lineTo(ex, ey + 9); g.lineTo(ex - 8, ey + 2); g.closePath(); g.fill();
        g.strokeStyle = '#3a2f22'; g.fillStyle = '#3a2f22'; g.lineWidth = 2; g.lineCap = 'round';
        if (t === 'barracks') { g.beginPath(); g.moveTo(ex - 5, ey - 5); g.lineTo(ex + 5, ey + 5); g.moveTo(ex + 5, ey - 5); g.lineTo(ex - 5, ey + 5); g.stroke(); }
        if (t === 'range') { g.beginPath(); g.arc(ex, ey - 1, 5, 0, 7); g.stroke(); g.beginPath(); g.arc(ex, ey - 1, 1.8, 0, 7); g.fill(); }
        if (t === 'stable') { g.beginPath(); g.arc(ex, ey - 1, 5, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke(); }
        if (t === 'workshop') { g.beginPath(); g.arc(ex, ey - 1, 4, 0, 7); g.stroke(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(ex + Math.cos(a) * 4, ey - 1 + Math.sin(a) * 4); g.lineTo(ex + Math.cos(a) * 7, ey - 1 + Math.sin(a) * 7); g.stroke(); } }
        if (t === 'stable') { g.fillStyle = '#e1c15a'; g.beginPath(); g.ellipse(x0 + s - 16, bottom - 6, 9, 6, 0, 0, 7); g.fill(); }
        this.windowAt(x0 + s - 16, top + 8);
        break;
      }
      case 'mill': {
        g.fillStyle = stone; g.fillRect(cx - 10, y0 + 18, 20, s - 21);
        g.fillStyle = stoneD; g.fillRect(cx + 4, y0 + 18, 6, s - 21);
        g.fillStyle = col; g.beginPath(); g.moveTo(cx - 13, y0 + 20); g.lineTo(cx, y0 + 6); g.lineTo(cx + 13, y0 + 20); g.closePath(); g.fill();
        this.door(cx, bottom, 8, 12);
        const a = time * (done ? 1.6 : 0);
        g.strokeStyle = '#efe7d5'; g.lineWidth = 3;
        for (let i = 0; i < 4; i++) { const b = a + i * Math.PI / 2; g.beginPath(); g.moveTo(cx, y0 + 18); g.lineTo(cx + Math.cos(b) * 20, y0 + 18 + Math.sin(b) * 20); g.stroke(); }
        g.fillStyle = '#6b4a2a'; g.beginPath(); g.arc(cx, y0 + 18, 3, 0, 7); g.fill();
        break;
      }
      case 'lumbercamp': case 'miningcamp': {
        // cobertizo abierto
        g.fillStyle = '#6b4a2a'; g.fillRect(x0 + 6, y0 + 22, 3, s - 25); g.fillRect(x0 + s - 9, y0 + 22, 3, s - 25);
        g.fillStyle = col; g.beginPath(); g.moveTo(x0 + 2, y0 + 26); g.lineTo(x0 + 10, y0 + 8); g.lineTo(x0 + s - 2, y0 + 8); g.lineTo(x0 + s - 2, y0 + 26); g.closePath(); g.fill();
        g.fillStyle = shade(col, -0.25); g.fillRect(x0 + 2, y0 + 24, s - 4, 3);
        if (t === 'lumbercamp') {
          g.fillStyle = '#8d6e4a';
          for (let r = 0; r < 2; r++) for (let i = 0; i < 4 - r; i++) { g.beginPath(); g.arc(x0 + 18 + i * 9 + r * 4.5, bottom - 5 - r * 7, 4.5, 0, 7); g.fill(); }
          g.fillStyle = '#c9a77a'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x0 + 18 + i * 9, bottom - 5, 2, 0, 7); g.fill(); }
        } else {
          g.fillStyle = '#5d4037'; g.fillRect(x0 + 16, bottom - 14, 26, 10);
          g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x0 + 24, bottom - 15, 3, 0, 7); g.arc(x0 + 32, bottom - 16, 3, 0, 7); g.fill();
          g.fillStyle = '#212121'; g.beginPath(); g.arc(x0 + 20, bottom - 3, 3, 0, 7); g.arc(x0 + 38, bottom - 3, 3, 0, 7); g.fill();
        }
        break;
      }
      case 'blacksmith': {
        const top = this.box(x0, y0, s, s * 0.5, stone, col, { stone: true });
        g.fillStyle = stoneD; g.fillRect(x0 + s - 16, y0 - 2, 9, 18);
        if (done && Math.random() < 0.06) this.fx.push({ kind: 'smoke', x: x0 + s - 11, y: y0 - 4, t: time, life: 2 });
        g.fillStyle = '#ff9a3c'; g.fillRect(x0 + 8, top + 10, 10, 8);
        g.fillStyle = '#3a3a3a'; g.fillRect(x0 + 34, bottom - 9, 14, 4); g.fillRect(x0 + 38, bottom - 5, 6, 5);
        break;
      }
      case 'market': {
        // tres puestos con toldos a rayas
        for (let i = 0; i < 3; i++) {
          const px = x0 + 4 + i * 30, py = y0 + 26 + (i % 2) * 18;
          g.fillStyle = '#8d6e4a'; g.fillRect(px + 2, py + 6, 22, 14);
          for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#f5efe0' : col; g.fillRect(px + k * 6.5, py - 4, 6.5, 10); }
          g.fillStyle = ['#e74c3c', '#f1c40f', '#8bc34a'][i]; g.beginPath(); g.arc(px + 8, py + 10, 3, 0, 7); g.arc(px + 16, py + 11, 3, 0, 7); g.fill();
        }
        this.banner(cx, y0 + 22, col, time, 18);
        break;
      }
      case 'monastery': {
        const top = this.box(x0, y0 + 6, s, s * 0.42, '#efe8dc', col);
        g.fillStyle = '#e6dccb'; g.fillRect(x0 + s - 26, y0 - 8, 18, s * 0.6);
        g.fillStyle = col; g.beginPath(); g.moveTo(x0 + s - 29, y0 - 6); g.lineTo(x0 + s - 17, y0 - 20); g.lineTo(x0 + s - 5, y0 - 6); g.closePath(); g.fill();
        g.fillStyle = '#c9a227'; g.beginPath(); g.arc(x0 + s - 17, y0 + 4, 4, 0, 7); g.fill();
        this.door(cx - 8, bottom, 12, 18);
        this.windowAt(x0 + 10, top + 10);
        break;
      }
      case 'castle': {
        // muralla + 4 torres + torre del homenaje
        g.fillStyle = stone; g.fillRect(x0 + 6, y0 + s * 0.42, s - 12, s * 0.58 - 3);
        g.fillStyle = stoneD; g.fillRect(x0 + s - 18, y0 + s * 0.42, 12, s * 0.58 - 3);
        this.crenels(x0 + 6, y0 + s * 0.42, s - 12, stone);
        g.fillStyle = '#b4b0a8'; g.fillRect(cx - 20, y0 + 6, 40, s * 0.5);
        this.crenels(cx - 20, y0 + 6, 40, '#b4b0a8');
        g.fillStyle = col; g.fillRect(cx - 20, y0 + 16, 40, 6);
        for (const [tx, ty] of [[x0 + 4, y0 + s * 0.36], [x0 + s - 20, y0 + s * 0.36], [x0 + 4, y0 + s - 30], [x0 + s - 20, y0 + s - 30]]) {
          g.fillStyle = '#9b978f'; g.fillRect(tx, ty, 16, 28);
          this.crenels(tx, ty, 16, '#9b978f');
          this.windowAt(tx + 5, ty + 8);
        }
        this.door(cx, bottom, 18, 24);
        this.banner(cx - 12, y0 + 2, col, time, 16); this.banner(cx + 12, y0 + 2, col, time, 16);
        break;
      }
      case 'tower': {
        g.fillStyle = stone; g.fillRect(x0 + 6, y0 - 14, s - 12, s + 10);
        g.fillStyle = stoneD; g.fillRect(x0 + s - 12, y0 - 14, 6, s + 10);
        g.fillStyle = '#b4b0a8'; g.fillRect(x0 + 3, y0 - 20, s - 6, 8);
        this.crenels(x0 + 3, y0 - 20, s - 6, '#b4b0a8');
        g.fillStyle = col; g.fillRect(x0 + 6, y0 - 4, s - 12, 4);
        this.windowAt(x0 + s / 2 - 3, y0 + 6);
        break;
      }
    }
    g.restore();
    if (!done) {
      g.strokeStyle = 'rgba(110,75,40,0.95)'; g.lineWidth = 2;
      const h = s * (1 - e.progress);
      for (let i = 4; i <= s - 4; i += 12) { g.beginPath(); g.moveTo(x0 + i, y0 + s); g.lineTo(x0 + i, y0 + h); g.stroke(); }
      for (let yy = y0 + s - 10; yy > y0 + h; yy -= 14) { g.beginPath(); g.moveTo(x0 + 2, yy); g.lineTo(x0 + s - 2, yy); g.stroke(); }
    }
    if (done && (e.ageT >= 0 || e.queue.length || e.tech)) {
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(x0 + s - 6, y0 + 6, 3.5 + Math.sin(time * 6), 0, 7); g.fill();
    }
  }

  private wallPiece(e: Entity, col: string) {
    const g = this.ctx, w = this.w;
    const x0 = e.tx * TILE, y0 = e.ty * TILE;
    const isWall = (x: number, y: number) => { const o = w.get(w.occ[y * w.w + x]); return !!o && o.type === 'wall' && o.owner === e.owner; };
    const alpha = e.progress < 1 ? 0.5 : 1;
    g.globalAlpha = alpha;
    // estacas
    const stake = (x: number, y: number) => {
      g.fillStyle = '#7a5634'; g.fillRect(x - 3, y - 14, 6, 16);
      g.fillStyle = '#9b7348'; g.fillRect(x - 3, y - 14, 2, 16);
      g.fillStyle = '#5d3f22'; g.beginPath(); g.moveTo(x - 3, y - 14); g.lineTo(x, y - 19); g.lineTo(x + 3, y - 14); g.fill();
    };
    const cx = x0 + 16, cy = y0 + 20;
    if (isWall(e.tx + 1, e.ty)) { for (let i = 6; i < 32; i += 7) stake(cx + i, cy); }
    if (isWall(e.tx, e.ty + 1)) { for (let i = 6; i < 32; i += 7) stake(cx, cy + i); }
    stake(cx - 5, cy); stake(cx + 1, cy);
    g.fillStyle = col; g.fillRect(cx - 7, cy - 8, 10, 2);
    g.globalAlpha = 1;
  }

  // --------------------------------------------------------------- unidades
  private unit(e: Entity, time: number) {
    const g = this.ctx;
    const t = e.type as UnitType;
    const col = this.w.players[e.owner].color;
    const x = e.x, y = e.y, r = e.radius;
    const moving = e.path.length > 0;
    const bob = moving ? Math.abs(Math.sin(time * 12 + e.id)) * 1.6 : 0;
    const fx = Math.cos(e.facing), fy = Math.sin(e.facing);
    const flip = fx < 0 ? -1 : 1;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(x, y + r * 0.75, r * 0.95, r * 0.42, 0, 0, 7); g.fill();
    if (t === 'ram') {
      g.save(); g.translate(x, y); g.rotate(e.facing);
      g.fillStyle = '#5d4037'; g.fillRect(-15, -10, 30, 20);
      g.fillStyle = col; g.beginPath(); g.moveTo(-15, -10); g.lineTo(0, -15); g.lineTo(15, -10); g.closePath(); g.fill();
      g.fillStyle = '#3e2a1a'; g.fillRect(10, -3, 10, 6);
      g.fillStyle = '#9e9e9e'; g.fillRect(18, -4, 4, 8);
      g.fillStyle = '#212121'; for (const [a, b] of [[-9, -11], [6, -11], [-9, 11], [6, 11]]) { g.beginPath(); g.arc(a, b, 3.2, 0, 7); g.fill(); }
      g.restore();
      return;
    }
    if (t === 'knight') {
      // caballo visto de costado
      const hy = y + 1;
      g.fillStyle = '#7b5232';
      g.beginPath(); g.ellipse(x, hy, 12, 6, 0, 0, 7); g.fill();
      g.fillRect(x - 9, hy + 2, 2.5, 7 - bob); g.fillRect(x + 7, hy + 2, 2.5, 7 + bob - 1.5);
      g.beginPath(); g.ellipse(x + flip * 12, hy - 5, 4, 6, flip * 0.5, 0, 7); g.fill();
      g.fillStyle = col; g.fillRect(x - 8, hy - 4, 16, 4);
    }
    const by = y - (t === 'knight' ? 9 : 2) - bob;
    const body = t === 'monk' ? '#7a5a3a' : t === 'champion' ? '#b0b7bf' : col;
    // piernas
    if (t !== 'knight' && t !== 'monk') {
      g.fillStyle = '#4a3a2a';
      const st = moving ? Math.sin(time * 12 + e.id) * 2 : 0;
      g.fillRect(x - 3.5 + st * 0.5, y + 1, 2.5, 5); g.fillRect(x + 1 - st * 0.5, y + 1, 2.5, 5);
    }
    // cuerpo
    g.fillStyle = shade(body, -0.4);
    g.beginPath(); g.ellipse(x, by, r * 0.62 + 1, r * 0.78 + 1, 0, 0, 7); g.fill();
    g.fillStyle = body;
    g.beginPath(); g.ellipse(x, by, r * 0.62, r * 0.78, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(x - r * 0.2, by - r * 0.25, r * 0.25, r * 0.35, 0, 0, 7); g.fill();
    if (t === 'monk' || t === 'champion' || t === 'villager') { g.fillStyle = col; g.fillRect(x - r * 0.6, by + 1, r * 1.2, 2.5); }
    // cabeza
    const hx = x + flip * 1, hy2 = by - r * 0.85;
    g.fillStyle = '#f0c8a0'; g.beginPath(); g.arc(hx, hy2, r * 0.38, 0, 7); g.fill();
    if (t === 'villager') { g.fillStyle = '#c9a25a'; g.beginPath(); g.ellipse(hx, hy2 - 2.5, r * 0.55, 2, 0, 0, 7); g.fill(); }
    else if (t === 'monk') { g.fillStyle = '#5d4030'; g.beginPath(); g.arc(hx, hy2 - 1, r * 0.4, Math.PI, 0); g.fill(); }
    else { g.fillStyle = '#9aa4ad'; g.beginPath(); g.arc(hx, hy2 - 0.5, r * 0.4, Math.PI, 0); g.fill(); if (t === 'champion' || t === 'knight') { g.fillStyle = col; g.fillRect(hx - 1, hy2 - r * 0.4 - 5, 2, 5); } }
    // arma / herramienta
    g.lineCap = 'round';
    const ax = x + flip * r * 0.55, ay = by;
    switch (t) {
      case 'villager': {
        const swing = e.order && e.path.length === 0 && (e.order.t === 'gather' || e.order.t === 'build') ? Math.sin(time * 10 + e.id) * 0.9 : 0;
        const a = (flip > 0 ? -0.9 : Math.PI + 0.9) + swing * flip;
        g.strokeStyle = '#6d4c41'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + Math.cos(a) * 9, ay + Math.sin(a) * 9); g.stroke();
        g.fillStyle = '#9e9e9e'; g.beginPath(); g.arc(ax + Math.cos(a) * 9, ay + Math.sin(a) * 9, 2, 0, 7); g.fill();
        if (e.carry > 0 && e.carryRes) { g.fillStyle = RES_COLOR[e.carryRes]; g.fillRect(x - flip * 6 - 3, by - 4, 6, 6); }
        break;
      }
      case 'militia': case 'champion':
        g.strokeStyle = '#e8eef3'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + fx * 8, ay + fy * 8 - 6); g.stroke();
        this.shield(x - flip * r * 0.55, by + 1, col, t === 'champion' ? 5 : 4);
        break;
      case 'spearman':
        g.strokeStyle = '#8d6e63'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax - fx * 6, ay + 4); g.lineTo(ax + fx * 12, ay - 10); g.stroke();
        g.fillStyle = '#cfd8dc'; g.beginPath(); g.arc(ax + fx * 12, ay - 10, 2.2, 0, 7); g.fill();
        this.shield(x - flip * r * 0.55, by + 1, col, 3.5);
        break;
      case 'archer':
        g.strokeStyle = '#8d6e63'; g.lineWidth = 2;
        g.beginPath(); g.arc(ax, ay, 7, e.facing - 1.2, e.facing + 1.2); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(ax + Math.cos(e.facing - 1.2) * 7, ay + Math.sin(e.facing - 1.2) * 7); g.lineTo(ax + Math.cos(e.facing + 1.2) * 7, ay + Math.sin(e.facing + 1.2) * 7); g.stroke();
        g.fillStyle = '#6d4c41'; g.fillRect(x - flip * 5 - 1.5, by - 6, 3, 8);
        break;
      case 'knight':
        g.strokeStyle = '#e8eef3'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + flip * 13, ay - 4); g.stroke();
        this.shield(x - flip * r * 0.4, by + 1, col, 4);
        break;
      case 'monk':
        g.strokeStyle = '#b08850'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax, ay + 7); g.lineTo(ax, ay - 11); g.stroke();
        g.fillStyle = '#ffd86b'; g.beginPath(); g.arc(ax, ay - 12, 2.5, 0, 7); g.fill();
        break;
    }
  }

  private shield(x: number, y: number, col: string, r: number) {
    const g = this.ctx;
    g.fillStyle = shade(col, -0.35); g.beginPath(); g.arc(x, y, r + 1, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = '#f5e6b8'; g.beginPath(); g.arc(x, y, r * 0.35, 0, 7); g.fill();
  }

  private drawFx(time: number) {
    const g = this.ctx;
    this.fx = this.fx.filter((f) => time - f.t < f.life);
    for (const f of this.fx) {
      const k = (time - f.t) / f.life;
      if (f.kind === 'shot') {
        const px = f.x + (f.x2! - f.x) * k, py = f.y + (f.y2! - f.y) * k - Math.sin(k * Math.PI) * 18;
        const ang = Math.atan2(f.y2! - f.y - Math.cos(k * Math.PI) * 18, f.x2! - f.x);
        g.strokeStyle = '#2b1d14'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(px - Math.cos(ang) * 6, py - Math.sin(ang) * 6); g.lineTo(px + Math.cos(ang) * 4, py + Math.sin(ang) * 4); g.stroke();
      } else if (f.kind === 'hit') {
        g.fillStyle = `rgba(255,240,200,${0.7 * (1 - k)})`;
        g.beginPath(); g.arc(f.x, f.y, 4 + k * 6, 0, 7); g.fill();
      } else if (f.kind === 'death') {
        g.fillStyle = `rgba(120,100,80,${0.6 * (1 - k)})`;
        g.beginPath(); g.arc(f.x, f.y, 8 + k * 22, 0, 7); g.fill();
      } else if (f.kind === 'heal') {
        g.fillStyle = `rgba(250,230,120,${0.9 * (1 - k)})`;
        g.font = 'bold 11px sans-serif'; g.fillText('+', f.x + 4, f.y - 10 - k * 14);
      } else if (f.kind === 'smoke') {
        g.fillStyle = `rgba(90,90,90,${0.35 * (1 - k)})`;
        g.beginPath(); g.arc(f.x + Math.sin(k * 6) * 4, f.y - k * 26, 3 + k * 7, 0, 7); g.fill();
      } else if (f.kind === 'mark') {
        g.strokeStyle = f.color ?? '#7CFC8A'; g.globalAlpha = 1 - k; g.lineWidth = 2;
        g.beginPath(); g.ellipse(f.x, f.y, 14 * (1 - k * 0.6), 7 * (1 - k * 0.6), 0, 0, 7); g.stroke();
        g.globalAlpha = 1;
      }
    }
  }

  /** Niebla de guerra suave: una imagen de 1 pixel por casilla escalada con suavizado */
  private fog(explored: Uint8Array, vis: Uint8Array) {
    const d = this.fogImg.data;
    for (let i = 0; i < explored.length; i++) {
      const a = !explored[i] ? 255 : !vis[i] ? 120 : 0;
      d[i * 4] = 6; d[i * 4 + 1] = 8; d[i * 4 + 2] = 12; d[i * 4 + 3] = a;
    }
    this.fogG.putImageData(this.fogImg, 0, 0);
    const g = this.ctx;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fogC, -0.5 * TILE, -0.5 * TILE, (this.w.w + 1) * TILE, (this.w.h + 1) * TILE);
    // bordes del mundo sin niebla dibujada
  }

  minimap(c: HTMLCanvasElement, me: number, cam: Camera, vw: number, vh: number) {
    const g = c.getContext('2d')!, w = this.w;
    const sx = c.width / w.w, sy = c.height / w.h;
    const pl = w.players[me];
    const p = this.pal;
    g.fillStyle = `rgb(${p.ground[0]},${p.ground[1]},${p.ground[2]})`; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < w.terrain.length; i++) if (w.terrain[i]) { g.fillStyle = w.terrain[i] === 1 ? p.water : p.shallow; g.fillRect((i % w.w) * sx, ((i / w.w) | 0) * sy, sx + 0.5, sy + 0.5); }
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
