// Dibujo del mundo con Canvas 2D. Sin imágenes externas: todo se dibuja con código
// (terreno, árboles y minas se pre-dibujan una vez como "sprites" para ir rápido en el celular).
import { BUILDINGS, BuildingType, NODES, NodeType, Projectile, Res, TILE, UNITS, UnitType } from '../sim/data.js';
import { Entity, World } from '../sim/world.js';
import { settings } from './settings.js';

export interface Camera { x: number; y: number; zoom: number }
export interface Fx { kind: 'shot' | 'hit' | 'death' | 'mark' | 'heal' | 'smoke' | 'blast' | 'sink'; x: number; y: number; x2?: number; y2?: number; t: number; life: number; color?: string; proj?: Projectile; r?: number }

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
  // base: mezcla suave de dos tonos con ruido (se pinta chico y se agranda con suavizado)
  const B = 4, sw = Math.ceil(c.width / B), sh = Math.ceil(c.height / B);
  const [lo, lg] = mkCanvas(sw, sh);
  const img = lg.createImageData(sw, sh);
  const n3 = valueNoise(31);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const px = x * B, py = y * B;
      const t = Math.min(1, Math.max(0, n1(px / 200, py / 200) * 0.6 + n2(px / 70, py / 70) * 0.3 + n3(px / 18, py / 18) * 0.1));
      const k = 0.96 + n3(px / 7, py / 7) * 0.07;
      const o = (y * sw + x) * 4;
      for (let i = 0; i < 3; i++) img.data[o + i] = Math.round((pal.ground[i] + (pal.ground2[i] - pal.ground[i]) * t) * k);
      img.data[o + 3] = 255;
    }
  lg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(lo, 0, 0, c.width, c.height);
  // manchas de tierra donde el ruido es bajo (caminos naturales)
  if (w.biome !== 'nieve') {
    const nd = valueNoise(53);
    g.fillStyle = w.biome === 'desierto' ? 'rgba(150,110,60,0.10)' : 'rgba(120,96,58,0.16)';
    for (let y = 0; y < c.height; y += 6) for (let x = 0; x < c.width; x += 6) {
      const v = nd(x / 90, y / 90);
      if (v < 0.22) { g.beginPath(); g.arc(x + rnd() * 6, y + rnd() * 6, 2 + (0.22 - v) * 18 * rnd(), 0, 7); g.fill(); }
    }
  }
  // matas de pasto: hojitas finas con luz arriba
  if (w.biome !== 'desierto' && w.biome !== 'nieve') {
    for (let i = 0; i < w.w * w.h * 2.2; i++) {
      const x = rnd() * c.width, y = rnd() * c.height;
      const dark = rnd() < 0.6;
      g.strokeStyle = dark ? `rgba(30,60,20,${0.18 + rnd() * 0.18})` : `rgba(200,230,140,${0.12 + rnd() * 0.14})`;
      g.lineWidth = 0.9;
      g.beginPath();
      for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 1.1, l = 2.5 + rnd() * 3.5; g.moveTo(x + k * 1.2, y); g.lineTo(x + k * 1.2 + Math.cos(a) * l, y + Math.sin(a) * l); }
      g.stroke();
    }
    // florcitas sueltas
    for (let i = 0; i < w.w * w.h * 0.08; i++) {
      const x = rnd() * c.width, y = rnd() * c.height;
      g.fillStyle = ['#f3e9a8', '#e8b4d8', '#ffffff', '#b8d4f5'][Math.floor(rnd() * 4)];
      g.globalAlpha = 0.7; g.beginPath(); g.arc(x, y, 1.1, 0, 7); g.fill(); g.globalAlpha = 1;
    }
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
  // agua con costas suaves (marching squares sobre campos difuminados)
  const W = w.w, H = w.h;
  const field = (pred: (t: number) => boolean, r: number) => {
    const raw = new Float32Array(W * H);
    for (let i = 0; i < raw.length; i++) raw[i] = pred(w.terrain[i]) ? 1 : 0;
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let sum = 0, n = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy));
          sum += raw[yy * W + xx]; n++;
        }
        out[y * W + x] = sum / n;
      }
    return out;
  };
  if (w.terrain.some((t) => t !== 0)) {
    const any1 = field((t) => t !== 0, 1), any2 = field((t) => t !== 0, 2);
    isoFill(g, any2, W, H, 0.1, pal.shore);
    isoFill(g, any1, W, H, 0.42, pal.shallow);
    isoFill(g, any1, W, H, 0.6, pal.water);
    isoFill(g, field((t) => t === 1, 2), W, H, 0.8, pal.waterDeep);
    isoFill(g, field((t) => t === 2, 1), W, H, 0.4, pal.shallow);
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

/** Rellena la región donde el campo supera `thr`, con bordes interpolados */
function isoFill(g: CanvasRenderingContext2D, f: Float32Array, W: number, H: number, thr: number, color: string) {
  const v = (x: number, y: number) => f[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  g.beginPath();
  const cx = [0, 1, 1, 0], cy = [0, 0, 1, 1];
  const vals = [0, 0, 0, 0];
  for (let y = -1; y < H; y++)
    for (let x = -1; x < W; x++) {
      let any = false;
      for (let k = 0; k < 4; k++) { vals[k] = v(x + cx[k], y + cy[k]); if (vals[k] >= thr) any = true; }
      if (!any) continue;
      let first = true;
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        const ax = x + cx[k], ay = y + cy[k], bx = x + cx[k2], by = y + cy[k2];
        const ia = vals[k] >= thr, ib = vals[k2] >= thr;
        if (ia) { const px = (ax + 0.5) * TILE, py = (ay + 0.5) * TILE; if (first) { g.moveTo(px, py); first = false; } else g.lineTo(px, py); }
        if (ia !== ib) {
          const t = (thr - vals[k]) / (vals[k2] - vals[k]);
          const px = (ax + (bx - ax) * t + 0.5) * TILE, py = (ay + (by - ay) * t + 0.5) * TILE;
          if (first) { g.moveTo(px, py); first = false; } else g.lineTo(px, py);
        }
      }
      g.closePath();
    }
  g.fillStyle = color;
  g.fill();
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
    // tronco con corteza y raíces
    const tg = g.createLinearGradient(x - 3, 0, x + 3, 0); tg.addColorStop(0, '#3e2a1e'); tg.addColorStop(0.5, '#6d4c38'); tg.addColorStop(1, '#3a281c');
    g.fillStyle = tg; g.beginPath(); g.moveTo(x - 3, y + 5); g.lineTo(x - 2, y - 10); g.lineTo(x + 2, y - 10); g.lineTo(x + 3.5, y + 5); g.closePath(); g.fill();
    g.fillStyle = '#4a3326'; g.beginPath(); g.ellipse(x, y + 5, 5, 1.6, 0, 0, 7); g.fill();
    // copa: varios racimos, los de abajo más oscuros, borde definido
    let sd = Math.floor(v * 1000) + 7;
    const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const blobs: [number, number, number][] = biome === 'tropical'
      ? [[-7, -12, 9], [7, -13, 9], [0, -20, 10], [0, -10, 8]]
      : [[0, -16, r * 0.82], [-7, -11, r * 0.66], [7, -11, r * 0.66], [-4, -21, r * 0.55], [5, -21, r * 0.55], [0, -8, r * 0.6]];
    g.fillStyle = shade(base, -0.35);
    for (const [dx, dy, br] of blobs) { g.beginPath(); g.arc(x + dx, y + dy, br + 1.3, 0, 7); g.fill(); }
    for (const [dx, dy, br] of blobs.sort((a, b) => b[1] - a[1])) {
      const gr = g.createRadialGradient(x + dx - br * 0.35, y + dy - br * 0.45, 0.5, x + dx, y + dy, br * 1.1);
      gr.addColorStop(0, hi); gr.addColorStop(0.65, base); gr.addColorStop(1, shade(base, -0.2));
      g.fillStyle = gr; g.beginPath(); g.arc(x + dx, y + dy, br, 0, 7); g.fill();
    }
    // hojitas sueltas en el borde y brillos
    for (let i = 0; i < 26; i++) {
      const a = rr() * Math.PI * 2, d = r * (0.5 + rr() * 0.6);
      g.fillStyle = rr() < 0.5 ? shade(hi, 0.1) : shade(base, -0.25);
      g.globalAlpha = 0.55; g.beginPath(); g.arc(x + Math.cos(a) * d, y - 14 + Math.sin(a) * d * 0.8, 1.3 + rr(), 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    void leaf;
  }
  return c;
}

function mineSprite(gold: boolean, snow: boolean): HTMLCanvasElement {
  const [c, g] = mkCanvas(40, 36);
  const x = 20, y = 20;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 2, y + 9, 16, 6, 0, 0, 7); g.fill();
  const rock = (pts: number[][], col: string) => { g.fillStyle = col; g.beginPath(); g.moveTo(x + pts[0][0], y + pts[0][1]); for (const p of pts.slice(1)) g.lineTo(x + p[0], y + p[1]); g.closePath(); g.fill(); };
  rock([[-15, 9], [-10, -6], [0, -11], [12, -6], [15, 6], [8, 11], [-8, 11]], '#6e6a66');
  g.strokeStyle = 'rgba(30,26,22,.65)'; g.lineWidth = 1.2; g.stroke();
  rock([[-15, 9], [-8, 11], [8, 11], [15, 6], [6, 4], [-5, 5]], '#57534f');
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 10, y - 6); g.lineTo(x, y - 11); g.lineTo(x + 12, y - 6); g.stroke();
  rock([[-10, -6], [0, -11], [3, -1], [-5, 2]], '#8e8a85');
  rock([[3, -1], [12, -6], [15, 6], [6, 4]], '#5a5753');
  if (snow) rock([[-9, -6], [0, -11], [8, -8], [0, -6]], '#f1f5f9');
  void gold;
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
    if (settings.grid) {
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1 / cam.zoom;
      g.beginPath();
      const gx0 = Math.max(0, Math.floor(vx0 / TILE)), gx1 = Math.min(w.w, Math.ceil(vx1 / TILE));
      const gy0 = Math.max(0, Math.floor(vy0 / TILE)), gy1 = Math.min(w.h, Math.ceil(vy1 / TILE));
      for (let x = gx0; x <= gx1; x++) { g.moveTo(x * TILE, gy0 * TILE); g.lineTo(x * TILE, gy1 * TILE); }
      for (let y = gy0; y <= gy1; y++) { g.moveTo(gx0 * TILE, y * TILE); g.lineTo(gx1 * TILE, y * TILE); }
      g.stroke();
    }

    const visible = (e: Entity) => {
      const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
      const i = ty * w.w + tx;
      if (e.cat === 'unit') return e.owner === me || !w.isEnemy(me, e.owner) || this.exOf(pl.visible)[i] === 1;
      for (let y = e.ty; y < e.ty + e.fh; y++) for (let x = e.tx; x < e.tx + e.fw; x++) if (this.exOf(pl.explored)[y * w.w + x]) return true;
      return false;
    };

    const list: Entity[] = [];
    for (const e of w.entities.values()) {
      const r = e.cat === 'unit' ? 24 : e.size * TILE + 40;
      if (e.x + r < vx0 || e.x - r > vx1 || e.y + r < vy0 || e.y - r > vy1) continue;
      if (!visible(e)) continue;
      list.push(e);
    }
    const depth = (e: Entity) => (e.type === 'farm' ? -1e6 : 0) + (e.cat === 'unit' ? e.y : (e.ty + e.fh) * TILE - 6);
    list.sort((a, b) => depth(a) - depth(b));

    for (const e of list) if (sel.has(e.id)) this.selRing(e, e.owner === me ? '#7CFC8A' : w.isEnemy(me, e.owner) ? '#ff6b6b' : '#ffe08a', time);

    for (const e of list) {
      if (e.cat === 'node') this.node(e, time);
      else if (e.cat === 'building') this.building(e, time);
      else this.unit(e, time);
    }
    this.drawRelics(this.exOf(pl.explored), time, vx0, vy0, vx1, vy1);
    for (const e of list) {
      if (e.cat === 'node' || e.type === 'wall') continue;
      if (sel.has(e.id) || (e.cat === 'unit' && (e.hp < e.maxHp || (settings.hpBars && e.owner === me))) || (e.cat === 'building' && (e.progress < 1 || e.hp < e.maxHp * 0.98))) this.hpBar(e);
    }
    this.drawFx(time);
    extra(g);
    this.fog(this.exOf(pl.explored), this.exOf(pl.visible));
  }

  /** Reliquias: cofre dorado en el suelo, en la espalda del monje o en el monasterio */
  /** Sin niebla (repeticiones): todo se ve */
  noFog = false;
  private ones?: Uint8Array;
  private exOf(a: Uint8Array): Uint8Array {
    if (!this.noFog) return a;
    if (!this.ones || this.ones.length !== a.length) this.ones = new Uint8Array(a.length).fill(1);
    return this.ones;
  }

  private drawRelics(explored: Uint8Array, time: number, x0: number, y0: number, x1: number, y1: number) {
    const g = this.ctx, w = this.w;
    for (const r of w.relics) {
      if (r.x < x0 - 40 || r.x > x1 + 40 || r.y < y0 - 40 || r.y > y1 + 40) continue;
      if (!explored[Math.floor(r.y / TILE) * w.w + Math.floor(r.x / TILE)]) continue;
      let x = r.x, y = r.y, k = 1;
      if (r.carrier) { y -= 22; x -= 6; k = 0.7; }
      else if (r.holder) {
        const b = w.get(r.holder);
        if (!b) continue;
        const i = w.relics.filter((o) => o.holder === r.holder).indexOf(r);
        x = b.tx * TILE + 10 + i * 12; y = (b.ty + b.fh) * TILE - 4; k = 0.6;
      }
      if (!r.carrier && !r.holder) {
        const glow = 0.35 + Math.sin(time * 3 + r.id) * 0.15;
        const gr = g.createRadialGradient(x, y, 2, x, y, 22);
        gr.addColorStop(0, `rgba(255,230,120,${glow})`); gr.addColorStop(1, 'rgba(255,230,120,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill();
      }
      this.relicShrine(x, y, k, time + r.id);
    }
  }

  /** Relicario: cofrecito de oro con techo a dos aguas, gemas y una cruz, sobre un paño */
  private relicShrine(x: number, y: number, k: number, t: number) {
    const g = this.ctx;
    g.save(); g.translate(x, y); g.scale(k, k);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 6, 11, 3.6, 0, 0, 7); g.fill();
    g.fillStyle = '#7a1f2b'; g.beginPath(); g.moveTo(-11, 5); g.lineTo(11, 5); g.lineTo(8, 7.5); g.lineTo(-8, 7.5); g.closePath(); g.fill();
    const gold = g.createLinearGradient(-8, 0, 8, 0);
    gold.addColorStop(0, '#8a5a12'); gold.addColorStop(0.35, '#f3cf5a'); gold.addColorStop(0.55, '#fff0a8'); gold.addColorStop(1, '#9a6a16');
    // cuerpo
    g.fillStyle = gold; g.fillRect(-8, -3, 16, 8);
    g.strokeStyle = '#4a3008'; g.lineWidth = 0.8; g.strokeRect(-8, -3, 16, 8);
    // arcos laterales grabados
    g.strokeStyle = 'rgba(90,55,10,.8)'; g.lineWidth = 0.7;
    for (const ax of [-4.5, 0, 4.5]) { g.beginPath(); g.arc(ax, 2.5, 1.6, Math.PI, 0); g.lineTo(ax + 1.6, 4.4); g.moveTo(ax - 1.6, 2.5); g.lineTo(ax - 1.6, 4.4); g.stroke(); }
    // techo
    const roof = g.createLinearGradient(0, -9, 0, -3);
    roof.addColorStop(0, '#fff0a8'); roof.addColorStop(1, '#b8861e');
    g.fillStyle = roof; g.beginPath(); g.moveTo(-9.5, -3); g.lineTo(-5, -8.5); g.lineTo(5, -8.5); g.lineTo(9.5, -3); g.closePath(); g.fill();
    g.strokeStyle = '#4a3008'; g.stroke();
    // gemas
    g.fillStyle = '#c0182c'; g.beginPath(); g.arc(0, -5.6, 1.4, 0, 7); g.fill();
    g.fillStyle = '#1d5fbf'; g.beginPath(); g.arc(-4.8, -4.5, 0.9, 0, 7); g.arc(4.8, -4.5, 0.9, 0, 7); g.fill();
    // cruz
    g.fillStyle = '#ffe9a0'; g.fillRect(-0.7, -13.5, 1.4, 5.2); g.fillRect(-2.3, -12, 4.6, 1.3);
    // destello
    const sp = (Math.sin(t * 2.3) + 1) / 2;
    g.fillStyle = `rgba(255,255,255,${0.35 + sp * 0.5})`;
    g.beginPath(); g.moveTo(5, -10 - sp * 2); g.lineTo(5.6, -8.4); g.lineTo(7.2, -7.8); g.lineTo(5.6, -7.2); g.lineTo(5, -5.6 + sp * 0); g.lineTo(4.4, -7.2); g.lineTo(2.8, -7.8); g.lineTo(4.4, -8.4); g.closePath(); g.fill();
    g.restore();
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
    } else g.rect(e.tx * TILE - 2, e.ty * TILE - 2, e.fw * TILE + 4, e.fh * TILE + 4);
    g.stroke();
  }

  private hpBar(e: Entity) {
    const g = this.ctx;
    const wdt = e.cat === 'unit' ? 22 : Math.min(80, e.fw * TILE * 0.8);
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
      case 'goldmine': g.drawImage(this.gold, e.x - 20, e.y - 20); this.nuggets(e, '#ffd23f', '#fff8c4'); break;
      case 'fish': {
        const ph = time * 1.5 + e.id;
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(e.x, e.y, 9 + Math.sin(ph) * 2, 4 + Math.sin(ph) * 1, 0, 0, 7); g.stroke();
        g.fillStyle = 'rgba(20,40,60,0.55)';
        for (let i = 0; i < 3; i++) {
          const a = ph * 0.6 + i * 2.1;
          const fx = e.x + Math.cos(a) * 6, fy = e.y + Math.sin(a) * 3;
          g.beginPath(); g.ellipse(fx, fy, 4, 1.8, a + Math.PI / 2, 0, 7); g.fill();
        }
        break;
      }
      case 'stonemine': g.drawImage(this.stone, e.x - 20, e.y - 20); this.nuggets(e, '#e3e8ec', '#ffffff'); break;
    }
  }

  /** Pepitas/bloques que van desapareciendo a medida que se extrae la mina */
  private nuggets(e: Entity, col: string, hi: string) {
    const g = this.ctx;
    const max = NODES[e.type as NodeType].amount;
    const SPOTS = [[-6, 3, 2.6], [5, 2, 2.8], [-1, 6, 2.2], [9, 7, 2], [-3, -3, 2], [-10, 6, 2], [2, -5, 2.2], [10, -1, 1.8], [-7, -1, 1.8], [4, 8, 2]];
    const n = Math.ceil((e.amount / max) * SPOTS.length);
    // vetas de mineral incrustadas en la roca: facetas con sombra, luz y un borde oscuro
    for (let i = 0; i < n; i++) {
      const [dx, dy, r0] = SPOTS[i], r = r0 * 0.8, cx = e.x + dx, cy = e.y + dy;
      g.fillStyle = shade(col, -0.45);
      g.beginPath(); g.moveTo(cx - r, cy + r * 0.3); g.lineTo(cx - r * 0.3, cy - r); g.lineTo(cx + r, cy - r * 0.4); g.lineTo(cx + r * 0.7, cy + r * 0.8); g.lineTo(cx - r * 0.4, cy + r); g.closePath(); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.moveTo(cx - r * 0.7, cy + r * 0.1); g.lineTo(cx - r * 0.2, cy - r * 0.75); g.lineTo(cx + r * 0.7, cy - r * 0.3); g.lineTo(cx + r * 0.2, cy + r * 0.4); g.closePath(); g.fill();
      g.fillStyle = hi; g.fillRect(cx - r * 0.25, cy - r * 0.55, 0.9, 0.9);
    }
  }

  // --------------------------------------------------------------- edificios
  /** Caja en 3/4: pared frontal + techo a dos aguas */
  private box(x0: number, y0: number, s: number, wallH: number, wall: string, roof: string, opts: { stone?: boolean; flatRoof?: boolean; trim?: string; braces?: boolean } = {}) {
    const g = this.ctx;
    const top = y0 + s - wallH; // donde empieza la pared frontal
    const wx0 = x0 + 3, wx1 = x0 + s - 3, wb = y0 + s - 3;
    // pared frontal con luz de arriba y textura de revoque o piedra
    const wg = g.createLinearGradient(0, top, 0, wb);
    wg.addColorStop(0, shade(wall, 0.08)); wg.addColorStop(1, shade(wall, -0.12));
    g.fillStyle = wg; g.fillRect(wx0, top, wx1 - wx0, wb - top);
    {
      let sd = Math.floor(x0 * 7 + y0 * 13) % 2147483646 + 1;
      const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const n = Math.round((wx1 - wx0) * (wb - top) / 18);
      for (let i = 0; i < n; i++) {
        g.fillStyle = rr() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
        g.fillRect(wx0 + rr() * (wx1 - wx0), top + rr() * (wb - top), 1 + rr() * 2.5, 1 + rr() * 1.5);
      }
    }
    g.beginPath();
    if (opts.stone) {
      // sillares
      g.strokeStyle = 'rgba(40,30,20,0.2)'; g.lineWidth = 0.8;
      for (let yy = wb - 5, row = 0; yy > top; yy -= 5, row++) {
        g.moveTo(wx0, yy); g.lineTo(wx1, yy);
        for (let xx = wx0 + (row % 2 ? 5 : 0) + 5; xx < wx1; xx += 10) { g.moveTo(xx, yy); g.lineTo(xx, yy + 5); }
      }
    } else {
      // entramado de madera: tablones + vigas
      g.strokeStyle = 'rgba(60,40,20,0.18)'; g.lineWidth = 0.8;
      for (let xx = wx0 + 4; xx < wx1; xx += 4) { g.moveTo(xx, top); g.lineTo(xx, wb); }
    }
    g.stroke();
    if (!opts.stone) {
      // entramado: vigas de madera oscura y cruces de San Andrés
      g.strokeStyle = '#5a3d22'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(wx0, top + 1); g.lineTo(wx1, top + 1);
      g.moveTo(wx0 + 1, top); g.lineTo(wx0 + 1, wb); g.moveTo(wx1 - 1, top); g.lineTo(wx1 - 1, wb);
      const mid = (top + wb) / 2;
      g.moveTo(wx0, mid); g.lineTo(wx1, mid);
      if (opts.braces !== false && wx1 - wx0 > 40) { g.moveTo(wx0 + 2, wb - 4); g.lineTo(wx0 + 12, mid); g.moveTo(wx1 - 2, wb - 4); g.lineTo(wx1 - 12, mid); }
      g.stroke();
      // zócalo de piedra
      g.fillStyle = '#9a958c'; g.fillRect(wx0 - 1, wb - 5, wx1 - wx0 + 2, 5);
      g.strokeStyle = 'rgba(40,30,20,0.3)'; g.lineWidth = 0.8; g.beginPath();
      for (let xx = wx0 + 5; xx < wx1; xx += 7) { g.moveTo(xx, wb - 5); g.lineTo(xx, wb); }
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(wx1 - 7, top, 7, wb - top); // lado en sombra
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(wx0, wb - 2, wx1 - wx0, 2);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(wx0, top, wx1 - wx0, 4); // sombra del alero
    // techo
    if (opts.flatRoof) {
      g.fillStyle = roof; g.fillRect(x0 + 1, y0 + 4, s - 2, top - y0 - 2);
      g.strokeStyle = 'rgba(0,0,0,0.1)'; g.lineWidth = 0.8; g.beginPath();
      for (let yy = y0 + 9; yy < top; yy += 5) { g.moveTo(x0 + 1, yy); g.lineTo(x0 + s - 1, yy); }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0 + 1, y0 + 4, s - 2, 4);
    } else {
      const ridgeY = y0 + 4, eave = top + 2;
      const L = x0 + s * 0.18, R = x0 + s * 0.82;
      // faldón trasero/derecho en sombra y faldón iluminado
      g.fillStyle = shade(roof, -0.18);
      g.beginPath(); g.moveTo(x0, eave); g.lineTo(L, ridgeY); g.lineTo(R, ridgeY); g.lineTo(x0 + s, eave); g.closePath(); g.fill();
      g.fillStyle = roof;
      g.beginPath(); g.moveTo(x0, eave); g.lineTo(L, ridgeY); g.lineTo(x0 + s * 0.5, ridgeY); g.lineTo(x0 + s * 0.5, eave); g.closePath(); g.fill();
      // tejas: hileras con juntas alternadas
      g.save();
      g.beginPath(); g.moveTo(x0, eave); g.lineTo(L, ridgeY); g.lineTo(R, ridgeY); g.lineTo(x0 + s, eave); g.closePath(); g.clip();
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 0.9; g.beginPath();
      for (let yy = eave - 4, row = 0; yy > ridgeY; yy -= 4, row++) {
        g.moveTo(x0, yy); g.lineTo(x0 + s, yy);
        for (let xx = x0 + (row % 2 ? 3 : 0); xx < x0 + s; xx += 6) { g.moveTo(xx, yy); g.lineTo(xx, yy + 4); }
      }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.07)';
      for (let yy = eave - 4; yy > ridgeY; yy -= 8) g.fillRect(x0, yy - 4, s, 2);
      // tejas sueltas de otro tono: el techo no se ve liso
      {
        let sd = Math.floor(x0 * 11 + y0 * 3) % 2147483646 + 1;
        const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
        for (let yy = eave - 4, row = 0; yy > ridgeY; yy -= 4, row++)
          for (let xx = x0 + (row % 2 ? 3 : 0); xx < x0 + s; xx += 6) {
            const q = rr();
            if (q < 0.18) { g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(xx + 0.5, yy + 0.5, 5, 3); }
            else if (q > 0.86) { g.fillStyle = 'rgba(255,240,220,0.13)'; g.fillRect(xx + 0.5, yy + 0.5, 5, 3); }
          }
      }
      // sombra que el techo proyecta sobre sí mismo cerca del alero
      const eg = g.createLinearGradient(0, eave - 6, 0, eave);
      eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = eg; g.fillRect(x0, eave - 6, s, 6);
      g.restore();
      // cumbrera (con el color del jugador como remate)
      g.strokeStyle = opts.trim ?? shade(roof, -0.35); g.lineWidth = opts.trim ? 3 : 1.5;
      g.beginPath(); g.moveTo(L, ridgeY); g.lineTo(R, ridgeY); g.stroke();
      g.strokeStyle = shade(roof, -0.4); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x0, eave); g.lineTo(L, ridgeY); g.moveTo(x0 + s, eave); g.lineTo(R, ridgeY); g.stroke();
      g.strokeStyle = shade(roof, -0.3); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0, eave); g.lineTo(x0 + s, eave); g.stroke();
    }
    // contorno: define la silueta del edificio sobre el pasto
    g.strokeStyle = 'rgba(20,12,6,0.45)'; g.lineWidth = 1;
    g.strokeRect(wx0 + 0.5, top + 0.5, wx1 - wx0 - 1, wb - top - 1);
    return top;
  }

  private door(cx: number, bottom: number, w: number, h: number) {
    const g = this.ctx;
    const shape = () => { g.beginPath(); g.moveTo(cx - w / 2, bottom); g.lineTo(cx - w / 2, bottom - h + w / 2); g.arc(cx, bottom - h + w / 2, w / 2, Math.PI, 0); g.lineTo(cx + w / 2, bottom); g.closePath(); };
    // marco de piedra, puerta de tablones con herrajes
    g.fillStyle = '#8a8378'; g.save(); g.translate(0, 0); shape(); g.lineWidth = 3; g.strokeStyle = '#8a8378'; g.stroke(); g.restore();
    g.fillStyle = '#5b3b22'; shape(); g.fill();
    g.save(); shape(); g.clip();
    g.strokeStyle = 'rgba(25,15,8,0.55)'; g.lineWidth = 0.8; g.beginPath();
    for (let xx = cx - w / 2 + w / 4; xx < cx + w / 2; xx += w / 4) { g.moveTo(xx, bottom - h); g.lineTo(xx, bottom); }
    g.stroke();
    g.fillStyle = '#2a2622'; g.fillRect(cx - w / 2, bottom - h * 0.72, w, 1.4); g.fillRect(cx - w / 2, bottom - h * 0.3, w, 1.4);
    g.restore();
    g.fillStyle = '#c9a227'; g.beginPath(); g.arc(cx + w * 0.22, bottom - h * 0.48, 0.9, 0, 7); g.fill();
  }
  private windowAt(x: number, y: number) {
    const g = this.ctx;
    g.fillStyle = '#3a2a1c'; g.fillRect(x - 1, y - 1, 8, 8); // marco
    g.fillStyle = 'rgba(255,214,120,0.6)'; g.fillRect(x + 0.5, y + 0.5, 5, 5);
    g.strokeStyle = '#3a2a1c'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + 3, y); g.lineTo(x + 3, y + 6); g.moveTo(x, y + 3); g.lineTo(x + 6, y + 3); g.stroke();
    g.fillStyle = '#8a8378'; g.fillRect(x - 1.5, y + 7, 9, 1.4); // alféizar
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
    const timber = '#e2d3ae', stone = '#a3a09a', stoneD = '#8c8984';
    const SHINGLE = '#8b5a3c', TERRA = '#a14e2e', SLATE = '#5c6670', WOODR = '#7d5a3a';

    if (t === 'farm') {
      // parcela arada con surcos, trigo que se va cosechando hilera por hilera y cerco de madera
      const fx0 = x0 + 3, fy0 = y0 + 3, fw = s - 6, fh = s - 6;
      g.fillStyle = done ? '#6e4b2a' : '#86684a';
      g.fillRect(fx0, fy0, fw, fh);
      const rows = 6, rh = fh / rows;
      for (let i = 0; i < rows; i++) {
        g.fillStyle = 'rgba(255,230,190,0.10)'; g.fillRect(fx0, fy0 + i * rh, fw, rh * 0.45);
        g.fillStyle = 'rgba(40,20,5,0.22)'; g.fillRect(fx0, fy0 + i * rh + rh * 0.7, fw, rh * 0.3);
      }
      if (done) {
        const f = Math.max(0, e.amount / (BUILDINGS.farm.food ?? 600));
        const full = Math.ceil(f * rows);
        const ripe = this.pal.cropRipe, green = this.pal.crop;
        const stalks = new Path2D(), heads = new Path2D();
        g.fillStyle = 'rgba(214,180,110,0.55)';
        for (let i = 0; i < rows; i++) {
          const yy = fy0 + (i + 0.75) * rh;
          if (i >= rows - full) {
            // trigo en pie
            const h = 5 + (i % 2);
            for (let xx = fx0 + 2.5; xx < fx0 + fw - 1; xx += 3.2) {
              const sway = Math.sin(time * 2 + xx * 0.3 + i) * 0.6;
              stalks.moveTo(xx, yy); stalks.lineTo(xx + sway, yy - h);
              heads.moveTo(xx + sway + 1.1, yy - h); heads.ellipse(xx + sway, yy - h, 1.1, 1.9, 0, 0, 7);
            }
          } else for (let xx = fx0 + 3; xx < fx0 + fw - 1; xx += 4) g.fillRect(xx, yy - 1.5, 1, 1.5); // rastrojo
        }
        g.strokeStyle = shade(green, -0.15); g.lineWidth = 1.1; g.stroke(stalks);
        g.fillStyle = ripe; g.fill(heads);
      }
      // cerco
      g.strokeStyle = '#7a5634'; g.lineWidth = 1.3;
      g.strokeRect(fx0 - 1, fy0 - 1, fw + 2, fh + 2);
      g.fillStyle = '#5d3f22';
      for (let k = 0; k <= 4; k++) {
        const px = fx0 - 1 + ((fw + 2) * k) / 4, py = fy0 - 1 + ((fh + 2) * k) / 4;
        g.fillRect(px - 1, fy0 - 3, 2, 4); g.fillRect(px - 1, fy0 + fh - 1, 2, 4);
        g.fillRect(fx0 - 3, py - 1, 4, 2); g.fillRect(fx0 + fw - 1, py - 1, 4, 2);
      }
      // banderín del dueño
      g.strokeStyle = '#3a2f22'; g.lineWidth = 1; g.beginPath(); g.moveTo(fx0, fy0); g.lineTo(fx0, fy0 - 9); g.stroke();
      g.fillStyle = col; g.beginPath(); g.moveTo(fx0, fy0 - 9); g.lineTo(fx0 + 6, fy0 - 7); g.lineTo(fx0, fy0 - 5); g.fill();
      return;
    }
    if (t === 'wall' || t === 'stonewall') {
      this.wallPiece(e, col);
      return;
    }
    if (t === 'gate') { this.gatePiece(e, col, time); return; }

    g.save();
    if (!done) g.globalAlpha = 0.5 + e.progress * 0.45;
    // sombra proyectada
    g.fillStyle = t === 'market' || t === 'dock' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.28)';
    g.beginPath(); g.moveTo(x0 + 4, y0 + s - 2); g.lineTo(x0 + s + 6, y0 + s - 2); g.lineTo(x0 + s + 10, y0 + s * 0.4); g.lineTo(x0 + s - 2, y0 + s * 0.3); g.closePath(); g.fill();

    switch (t) {
      case 'house': {
        const top = this.box(x0, y0, s, s * 0.48, timber, SHINGLE, { trim: col, braces: false });
        g.fillStyle = '#7d6b5a'; g.fillRect(x0 + s - 14, y0 + 2, 6, 10); g.fillStyle = '#5a4a3c'; g.fillRect(x0 + s - 15, y0 + 1, 8, 2);
        this.door(cx, bottom, 8, 14);
        this.windowAt(x0 + 7, top + 6); this.windowAt(x0 + s - 13, top + 6);
        break;
      }
      case 'towncenter': {
        // base de piedra + salón de madera + gran techo
        g.fillStyle = stone; g.fillRect(x0 + 2, y0 + s * 0.5, s - 4, s * 0.5 - 2);
        g.fillStyle = stoneD; g.fillRect(x0 + s - 12, y0 + s * 0.5, 10, s * 0.5 - 2);
        this.crenels(x0 + 3, y0 + s * 0.5, s - 6, stone);
        const top = this.box(x0 + 10, y0 + 2, s - 20, s * 0.32, timber, TERRA, { trim: col });
        g.strokeStyle = '#6b4a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 13, top + 1); g.lineTo(x0 + s - 13, top + 1); g.stroke();
        this.windowAt(x0 + 18, top + 7); this.windowAt(x0 + s - 24, top + 7); this.windowAt(cx - 3, top + 7);
        this.door(cx, bottom, 14, 20);
        this.windowAt(x0 + 10, y0 + s * 0.65); this.windowAt(x0 + s - 16, y0 + s * 0.65);
        this.banner(x0 + 6, y0 + s * 0.5 - 2, col, time, 18); this.banner(x0 + s - 8, y0 + s * 0.5 - 2, col, time, 18);
        break;
      }
      case 'barracks': case 'range': case 'stable': case 'workshop': {
        const top = this.box(x0, y0, s, s * 0.46, t === 'workshop' ? '#c9b18a' : timber, t === 'barracks' ? SLATE : WOODR, { stone: t === 'barracks', trim: col });
        this.banner(x0 + s - 6, top - 2, col, time, 14);
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
        g.fillStyle = WOODR; g.beginPath(); g.moveTo(cx - 13, y0 + 20); g.lineTo(cx, y0 + 6); g.lineTo(cx + 13, y0 + 20); g.closePath(); g.fill();
        g.fillStyle = shade(WOODR, -0.25); g.beginPath(); g.moveTo(cx, y0 + 6); g.lineTo(cx + 13, y0 + 20); g.lineTo(cx + 3, y0 + 20); g.closePath(); g.fill();
        g.fillStyle = col; g.fillRect(cx - 10, y0 + 30, 20, 3);
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
        g.fillStyle = WOODR; g.beginPath(); g.moveTo(x0 + 2, y0 + 26); g.lineTo(x0 + 10, y0 + 8); g.lineTo(x0 + s - 2, y0 + 8); g.lineTo(x0 + s - 2, y0 + 26); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.9; g.beginPath(); for (let yy = y0 + 12; yy < y0 + 26; yy += 4) { g.moveTo(x0 + 4, yy); g.lineTo(x0 + s - 2, yy); } g.stroke();
        g.fillStyle = col; g.fillRect(x0 + 2, y0 + 24, s - 4, 3);
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
        const top = this.box(x0, y0, s, s * 0.5, stone, SLATE, { stone: true, trim: col });
        g.fillStyle = stoneD; g.fillRect(x0 + s - 16, y0 - 2, 9, 18);
        if (done && Math.random() < 0.06) this.fx.push({ kind: 'smoke', x: x0 + s - 11, y: y0 - 4, t: time, life: 2 });
        g.fillStyle = '#ff9a3c'; g.fillRect(x0 + 8, top + 10, 10, 8);
        g.fillStyle = '#3a3a3a'; g.fillRect(x0 + 34, bottom - 9, 14, 4); g.fillRect(x0 + 38, bottom - 5, 6, 5);
        break;
      }
      case 'market': {
        // plaza empedrada con aljibe, puestos con toldos, mercadería, barriles y cajones
        g.fillStyle = '#c9b58f'; g.beginPath(); g.roundRect(x0 + 3, y0 + 8, s - 6, s - 11, 6); g.fill();
        g.strokeStyle = 'rgba(90,70,40,0.18)'; g.lineWidth = 0.8; g.beginPath();
        for (let yy = y0 + 14; yy < y0 + s - 4; yy += 7) { g.moveTo(x0 + 4, yy); g.lineTo(x0 + s - 4, yy); }
        for (let yy = y0 + 8, r = 0; yy < y0 + s - 4; yy += 7, r++) for (let xx = x0 + 4 + (r % 2) * 5; xx < x0 + s - 4; xx += 10) { g.moveTo(xx, yy); g.lineTo(xx, yy + 7); }
        g.stroke();
        const goods = [['#d64541', '#e86a5a', '#c0392b'], ['#c58b4a', '#a86b32', '#d9a066'], ['#4a7bc8', '#e2c044', '#8e44ad'], ['#7cb342', '#9ccc65', '#f5d76e']];
        const stall = (px: number, py: number, w: number, k: number) => {
          // mostrador
          g.fillStyle = '#7a5634'; g.fillRect(px, py, w, 9);
          g.fillStyle = '#5d3f22'; g.fillRect(px, py + 7, w, 2);
          g.strokeStyle = 'rgba(40,25,10,0.35)'; g.lineWidth = 0.7; g.beginPath(); for (let xx = px + 4; xx < px + w; xx += 4) { g.moveTo(xx, py + 2); g.lineTo(xx, py + 7); } g.stroke();
          // mercadería
          const gc = goods[k % goods.length];
          for (let i = 0; i < 5; i++) { g.fillStyle = gc[i % 3]; g.beginPath(); g.ellipse(px + 4 + i * ((w - 8) / 4), py - 1, 2.6, 2, 0, 0, 7); g.fill(); }
          // postes
          g.fillStyle = '#4e351c'; g.fillRect(px, py - 15, 1.8, 15); g.fillRect(px + w - 1.8, py - 15, 1.8, 15);
          // toldo a rayas con volado
          const ay = py - 22;
          for (let i = 0; i < 6; i++) {
            const sx0 = px - 3 + (i * (w + 6)) / 6, sx1 = px - 3 + ((i + 1) * (w + 6)) / 6;
            g.fillStyle = i % 2 ? '#f4ecd8' : col;
            g.beginPath(); g.moveTo(sx0 + 2, ay); g.lineTo(sx1 + 2, ay); g.lineTo(sx1, ay + 8); g.lineTo(sx0, ay + 8); g.closePath(); g.fill();
            g.beginPath(); g.arc((sx0 + sx1) / 2, ay + 8, (sx1 - sx0) / 2, 0, Math.PI); g.fill();
          }
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(px - 3, ay + 8, w + 6, 1.5);
        };
        // aljibe central
        const wx = cx, wy = y0 + s * 0.55;
        stall(x0 + 8, y0 + 30, 30, 0); stall(x0 + s - 38, y0 + 30, 30, 1);
        g.fillStyle = '#8f8a81'; g.beginPath(); g.ellipse(wx, wy, 9, 5.5, 0, 0, 7); g.fill();
        g.fillStyle = '#a9a39a'; g.fillRect(wx - 9, wy - 4, 18, 4);
        g.fillStyle = '#3b7fb8'; g.beginPath(); g.ellipse(wx, wy - 4, 6.5, 3, 0, 0, 7); g.fill();
        g.fillStyle = '#4e351c'; g.fillRect(wx - 8, wy - 16, 1.6, 12); g.fillRect(wx + 6.4, wy - 16, 1.6, 12);
        g.fillStyle = '#7d5a3a'; g.beginPath(); g.moveTo(wx - 11, wy - 15); g.lineTo(wx, wy - 22); g.lineTo(wx + 11, wy - 15); g.closePath(); g.fill();
        stall(x0 + 10, y0 + s - 14, 28, 2); stall(x0 + s - 40, y0 + s - 14, 28, 3);
        // barriles y cajones
        for (const [bx, by] of [[x0 + 8, y0 + s * 0.52], [x0 + 14, y0 + s * 0.58]]) {
          g.fillStyle = '#8d6e4a'; g.beginPath(); g.ellipse(bx, by, 4, 5, 0, 0, 7); g.fill();
          g.strokeStyle = '#3e2a1a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(bx - 4, by - 2); g.lineTo(bx + 4, by - 2); g.moveTo(bx - 4, by + 2); g.lineTo(bx + 4, by + 2); g.stroke();
        }
        g.fillStyle = '#a07a50'; g.fillRect(x0 + s - 18, y0 + s * 0.5, 9, 8); g.fillRect(x0 + s - 14, y0 + s * 0.5 - 6, 8, 6);
        g.strokeStyle = '#5d3f22'; g.lineWidth = 0.8; g.strokeRect(x0 + s - 18, y0 + s * 0.5, 9, 8); g.strokeRect(x0 + s - 14, y0 + s * 0.5 - 6, 8, 6);
        this.banner(cx, y0 + 12, col, time, 16);
        break;
      }
      case 'monastery': {
        const top = this.box(x0, y0 + 6, s, s * 0.42, '#efe8dc', TERRA, { trim: col, stone: true });
        g.fillStyle = '#e6dccb'; g.fillRect(x0 + s - 26, y0 - 8, 18, s * 0.6);
        g.fillStyle = TERRA; g.beginPath(); g.moveTo(x0 + s - 29, y0 - 6); g.lineTo(x0 + s - 17, y0 - 20); g.lineTo(x0 + s - 5, y0 - 6); g.closePath(); g.fill();
        g.fillStyle = col; g.fillRect(x0 + s - 26, y0 - 6, 18, 2.5);
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
      case 'dock': {
        // muelle de madera sobre el agua (2x2)
        g.fillStyle = '#6d4c2e';
        for (const [px, py] of [[x0 + 4, y0 + 10], [x0 + s - 8, y0 + 10], [x0 + 4, y0 + s - 10], [x0 + s - 8, y0 + s - 10]]) g.fillRect(px, py, 4, 9);
        g.fillStyle = '#9b7a52'; g.fillRect(x0 + 2, y0 + 12, s - 4, s - 20);
        g.strokeStyle = 'rgba(60,40,20,0.45)'; g.lineWidth = 1;
        for (let xx = x0 + 8; xx < x0 + s - 2; xx += 6) { g.beginPath(); g.moveTo(xx, y0 + 12); g.lineTo(xx, y0 + s - 8); g.stroke(); }
        g.fillStyle = timber; g.fillRect(x0 + 6, y0 + 4, 24, 15);
        g.fillStyle = SHINGLE; g.beginPath(); g.moveTo(x0 + 3, y0 + 6); g.lineTo(x0 + 18, y0 - 5); g.lineTo(x0 + 33, y0 + 6); g.closePath(); g.fill();
        g.fillStyle = col; g.fillRect(x0 + 6, y0 + 5, 24, 2);
        this.door(x0 + 18, y0 + 19, 7, 10);
        g.strokeStyle = '#c9b48a'; g.lineWidth = 1.2; g.beginPath(); g.arc(x0 + s - 14, y0 + s - 16, 4, 0, 7); g.stroke();
        this.banner(x0 + s - 6, y0 + 14, col, time, 16);
        break;
      }
      case 'university': {
        const top = this.box(x0, y0 + 6, s, s * 0.45, '#e6dcc6', SLATE, { stone: true, trim: col });
        g.fillStyle = '#d8ccb0'; g.beginPath(); g.arc(cx, y0 + 12, 13, Math.PI, 0); g.fill();
        g.fillStyle = '#b9ad92'; g.beginPath(); g.arc(cx, y0 + 12, 13, Math.PI, Math.PI * 1.5); g.lineTo(cx, y0 + 12); g.fill();
        g.fillStyle = col; g.fillRect(cx - 13, y0 + 11, 26, 2.5);
        g.fillStyle = '#efe7d5'; for (let i = 0; i < 4; i++) g.fillRect(x0 + 12 + i * 20, top + 4, 5, s * 0.45 - 8);
        this.door(cx, bottom, 12, 18);
        g.fillStyle = '#c9a227'; g.beginPath(); g.arc(cx, y0 - 2, 2.5, 0, 7); g.fill();
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

  /** Prisma extruido: base en el suelo (polígono) + altura H. Dibuja las caras visibles y la tapa. */
  private prism(pts: number[][], H: number, face: string, top: string, tex: 'brick' | 'plank' | null = null) {
    const g = this.ctx;
    const n = pts.length;
    // orientación del polígono para que la normal apunte hacia afuera
    let area = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = (dy / len) * sgn, ny = (-dx / len) * sgn;
      if (ny <= 0.05) continue;
      const light = 0.12 * nx - 0.05;
      g.fillStyle = shade(face, light);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(b[0], b[1] - H); g.lineTo(a[0], a[1] - H); g.closePath(); g.fill();
      if (tex) {
        g.save(); g.clip();
        g.strokeStyle = tex === 'brick' ? 'rgba(40,30,20,0.32)' : 'rgba(40,25,10,0.3)'; g.lineWidth = 0.8;
        g.beginPath();
        const steps = Math.max(1, Math.round(len / 8));
        if (tex === 'brick') {
          // piedras con tonos distintos (fijos por posición) para que no se vea liso
          for (let k = 0, row = 0; k < H; k += 5, row++) {
            for (let s2 = row % 2 ? -0.5 : 0; s2 < steps; s2++) {
              const f0 = Math.max(0, s2 / steps), f1 = Math.min(1, (s2 + 1) / steps);
              const hsh = Math.sin((a[0] + s2 * 13.7) * 12.9898 + (a[1] + row * 7.3) * 78.233) * 43758.5453;
              const rnd = hsh - Math.floor(hsh);
              if (rnd > 0.33 && rnd < 0.66) continue;
              g.fillStyle = rnd < 0.33 ? `rgba(0,0,0,${0.05 + rnd * 0.18})` : `rgba(255,255,255,${(rnd - 0.66) * 0.3})`;
              const ax2 = a[0] + dx * f0, ay2 = a[1] + dy * f0, bx2 = a[0] + dx * f1, by2 = a[1] + dy * f1;
              const k1 = Math.min(H, k + 5);
              g.fillRect(Math.min(ax2, bx2), Math.min(ay2, by2) - k1, Math.max(1, Math.abs(bx2 - ax2)), k1 - k + Math.abs(by2 - ay2));
            }
          }
          // sombra al pie y borde de luz arriba
          const ao = g.createLinearGradient(0, Math.max(a[1], b[1]), 0, Math.max(a[1], b[1]) - H);
          ao.addColorStop(0, 'rgba(0,0,0,0.28)'); ao.addColorStop(0.35, 'rgba(0,0,0,0)'); ao.addColorStop(0.92, 'rgba(255,255,255,0)'); ao.addColorStop(1, 'rgba(255,255,255,0.18)');
          g.fillStyle = ao; g.fillRect(Math.min(a[0], b[0]) - 1, Math.min(a[1], b[1]) - H - 1, Math.abs(dx) + 2, Math.abs(dy) + H + 2);
          g.beginPath();
          for (let k = 5, row = 0; k < H; k += 5, row++) {
            g.moveTo(a[0], a[1] - k); g.lineTo(b[0], b[1] - k);
            for (let s = row % 2 ? 0.5 : 0; s < steps; s++) {
              const f = s / steps, px = a[0] + dx * f, py = a[1] + dy * f;
              g.moveTo(px, py - k); g.lineTo(px, py - k + 5);
            }
          }
        } else {
          for (let s = 0; s < steps * 2; s++) { const f = s / (steps * 2), px = a[0] + dx * f, py = a[1] + dy * f; g.moveTo(px, py); g.lineTo(px, py - H); }
        }
        g.stroke(); g.restore();
      }
    }
    g.fillStyle = top;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1] - H);
    for (let i = 1; i < n; i++) g.lineTo(pts[i][0], pts[i][1] - H);
    g.closePath(); g.fill();
  }

  /** Segmento grueso como polígono de suelo */
  private seg(ax: number, ay: number, bx: number, by: number, t: number): number[][] {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * t / 2, ny = (dx / l) * t / 2;
    return [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]];
  }
  private sq(cx: number, cy: number, s: number): number[][] {
    return [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]];
  }
  /** almenas sobre la línea superior frontal de un segmento */
  private crenLine(ax: number, ay: number, bx: number, by: number, col: string) {
    const g = this.ctx;
    const l = Math.hypot(bx - ax, by - ay);
    g.fillStyle = col;
    const k = Math.max(1, Math.round(l / 7));
    for (let i = 0; i < k; i++) {
      const f = (i + 0.5) / k;
      g.fillRect(ax + (bx - ax) * f - 2, ay + (by - ay) * f - 4, 4, 4);
    }
  }

  private wallPiece(e: Entity, col: string) {
    const g = this.ctx, w = this.w;
    const isWall = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) return false;
      const o = w.get(w.occ[y * w.w + x]);
      return !!o && o.owner === e.owner && (o.type === e.type || o.type === 'gate' || (e.type === 'wall' && o.type === 'stonewall') || (e.type === 'stonewall' && o.type === 'wall'));
    };
    g.globalAlpha = e.progress < 1 ? 0.55 : 1;
    const cx = e.tx * TILE + 16, cy = e.ty * TILE + 18;
    const E = isWall(e.tx + 1, e.ty), S = isWall(e.tx, e.ty + 1), W = isWall(e.tx - 1, e.ty);
    const SE = isWall(e.tx + 1, e.ty + 1) && !E && !S;
    const SW = isWall(e.tx - 1, e.ty + 1) && !W && !S;
    const targets: number[][] = [];
    if (S) targets.push([0, 1]);
    if (SE) targets.push([1, 1]);
    if (SW) targets.push([-1, 1]);
    if (E) targets.push([1, 0]);
    // los portones no dibujan tramos hacia afuera: la muralla vecina los alcanza
    const gateAt = (x: number, y: number) => { const o = x >= 0 && y >= 0 && x < w.w && y < w.h ? w.get(w.occ[y * w.w + x]) : undefined; return !!o && o.type === 'gate' && o.owner === e.owner; };
    if (gateAt(e.tx - 1, e.ty)) targets.unshift([-1, 0]);
    if (gateAt(e.tx, e.ty - 1)) targets.unshift([0, -1]);
    if (e.type === 'stonewall') {
      const H = 18, T = 13, face = '#9a958c', top = '#b9b4aa';
      for (const [dx, dy] of targets) {
        const bx = cx + dx * TILE, by = cy + dy * TILE;
        this.prism(this.seg(cx, cy, bx, by, dx && dy ? T * 1.15 : T), H, face, top, 'brick');
        const off = dx === 0 ? 0 : T / 2 - 1;
        this.crenLine(cx, cy + off - H, bx, by + off - H, '#c9c4ba');
      }
      // pilar central
      this.prism(this.sq(cx, cy, 16), H + 5, '#8f8a81', '#b3ada3', 'brick');
      g.fillStyle = '#c9c4ba';
      for (const [ox, oy] of [[-8, -8], [4, -8], [-8, 4], [4, 4]]) g.fillRect(cx + ox, cy + oy - H - 9, 4, 4);
      g.fillStyle = col; g.fillRect(cx - 8, cy + 8 - H * 0.55, 16, 2.5);
    } else {
      const stake = (x: number, y: number, h: number) => {
        g.fillStyle = '#6f4d2c'; g.fillRect(x - 2.6, y - h, 5.2, h + 1);
        g.fillStyle = '#9b7348'; g.fillRect(x - 2.6, y - h, 1.8, h + 1);
        g.fillStyle = '#4e351c'; g.beginPath(); g.moveTo(x - 2.6, y - h); g.lineTo(x, y - h - 5); g.lineTo(x + 2.6, y - h); g.fill();
      };
      const pts: number[][] = [];
      for (const [dx, dy] of targets) {
        const l = dx && dy ? 45 : 32;
        for (let d = 5; d < l - 2; d += 5) pts.push([cx + (dx * d * TILE) / l, cy + (dy * d * TILE) / l]);
      }
      pts.push([cx - 2.5, cy], [cx + 2.5, cy]);
      pts.sort((a, b) => a[1] - b[1]);
      // travesaño
      g.strokeStyle = '#4e351c'; g.lineWidth = 2;
      g.beginPath();
      for (const [dx, dy] of targets) { g.moveTo(cx, cy - 8); g.lineTo(cx + dx * TILE, cy + dy * TILE - 8); }
      g.stroke();
      for (const [x, y] of pts) stake(x, y, 15);
      g.fillStyle = col; g.fillRect(cx - 5, cy - 9, 10, 2);
    }
    g.globalAlpha = 1;
  }

  /** Qué tan levantada está cada reja (0 cerrada, 1 arriba): sube y baja con suavidad */
  private gateLift = new Map<number, { v: number; t: number }>();
  /** Reja levadiza de hierro sobre fondo oscuro; lift 0..1 la sube */
  private portcullis(x: number, y: number, wd: number, ht: number, lift: number) {
    const g = this.ctx;
    g.fillStyle = '#1c1611'; g.fillRect(x, y, wd, ht);
    g.fillStyle = 'rgba(138,122,92,.9)'; g.fillRect(x, y + ht - 3, wd, 3); // piso del pasaje
    const oy = -lift * (ht - 2);
    g.save(); g.translate(0, oy);
    g.strokeStyle = '#3b3833'; g.lineWidth = 1.7;
    g.beginPath();
    for (let xx = x + 2; xx < x + wd; xx += 3.4) { g.moveTo(xx, y); g.lineTo(xx, y + ht); }
    for (let yy = y + 3; yy < y + ht; yy += 4) { g.moveTo(x, yy); g.lineTo(x + wd, yy); }
    g.stroke();
    g.strokeStyle = 'rgba(200,200,190,.35)'; g.lineWidth = 0.6; g.beginPath();
    for (let xx = x + 1.6; xx < x + wd; xx += 3.4) { g.moveTo(xx, y); g.lineTo(xx, y + ht); }
    g.stroke();
    // puntas de las barras
    g.fillStyle = '#3b3833';
    for (let xx = x + 2; xx < x + wd; xx += 3.4) { g.beginPath(); g.moveTo(xx - 1.1, y + ht); g.lineTo(xx + 1.1, y + ht); g.lineTo(xx, y + ht + 2.2); g.fill(); }
    g.restore();
  }

  /** Portón de 3 tramos estilo castillo: torres en los extremos y reja levadiza en el arco */
  private gatePiece(e: Entity, col: string, time: number) {
    const g = this.ctx, w = this.w;
    const vertical = e.fh > e.fw;
    const x0 = e.tx * TILE, y0 = e.ty * TILE;
    const done = e.progress >= 1;
    g.globalAlpha = done ? 1 : 0.55;
    // ¿se abre? (unidad aliada cerca y no bloqueado)
    let open = false;
    if (done && !e.locked) {
      const team = w.players[e.owner]?.team;
      w.forUnitsNear(e.x, e.y, TILE * 2.6, (u) => {
        if (!open && u.hp > 0 && u.owner >= 0 && w.players[u.owner]?.team === team && Math.hypot(u.x - e.x, u.y - e.y) < TILE * 2.4) open = true;
      });
    }
    const face = '#9a958c', top = '#b9b4aa', towerF = '#8d887f', towerT = '#aaa49a';
    const st = this.gateLift.get(e.id) ?? { v: 0, t: time };
    const dtl = Math.min(0.1, Math.max(0, time - st.t));
    st.v = Math.max(0, Math.min(1, st.v + (open ? 1 : -1) * dtl * 2.2)); st.t = time;
    this.gateLift.set(e.id, st);
    const lift = st.v * st.v * (3 - 2 * st.v);
    const H = 22;
    if (!vertical) {
      const cy = y0 + 18;
      const lx = x0 + 16, rx = x0 + 3 * TILE - 16;
      // cuerpo del portón
      this.prism(this.seg(lx, cy, rx, cy, 17), H, face, top, 'brick');
      // arco y puertas en la cara frontal
      const mx = x0 + TILE * 1.5, fy = cy + 8.5;
      const aw = 18, ah = 19;
      const arch = () => { g.beginPath(); g.moveTo(mx - aw / 2, fy); g.lineTo(mx - aw / 2, fy - ah + aw / 2); g.arc(mx, fy - ah + aw / 2, aw / 2, Math.PI, 0); g.lineTo(mx + aw / 2, fy); g.closePath(); };
      g.fillStyle = '#6d6860'; arch(); g.fill();
      g.save(); g.translate(0, 0);
      g.beginPath(); g.moveTo(mx - aw / 2 + 1.5, fy); g.lineTo(mx - aw / 2 + 1.5, fy - ah + aw / 2); g.arc(mx, fy - ah + aw / 2, aw / 2 - 1.5, Math.PI, 0); g.lineTo(mx + aw / 2 - 1.5, fy); g.closePath();
      g.clip();
      this.portcullis(mx - aw / 2, fy - ah, aw, ah, lift);
      g.restore();
      // dovelas del arco
      g.strokeStyle = '#5d584f'; g.lineWidth = 2.2; g.beginPath(); g.arc(mx, fy - ah + aw / 2, aw / 2, Math.PI, 0); g.stroke();
      g.strokeStyle = '#c8c2b6'; g.lineWidth = 0.7; g.beginPath();
      for (let k = 1; k < 6; k++) { const a = Math.PI + (k / 6) * Math.PI; g.moveTo(mx + Math.cos(a) * (aw / 2 - 1.2), fy - ah + aw / 2 + Math.sin(a) * (aw / 2 - 1.2)); g.lineTo(mx + Math.cos(a) * (aw / 2 + 1.2), fy - ah + aw / 2 + Math.sin(a) * (aw / 2 + 1.2)); }
      g.stroke();
      this.crenLine(lx + 8, cy - 8 - H, rx - 8, cy - 8 - H, '#c9c4ba');
      this.crenLine(lx + 8, cy + 8 - H, rx - 8, cy + 8 - H, '#c9c4ba');
      // torres
      for (const tx of [lx, rx]) this.tower(tx, cy, H + 12, towerF, towerT, col);
      if (e.locked) this.padlock(mx, fy - ah - 6);
      if (done) this.banner(mx, cy - H - 2, col, time, 12);
    } else {
      const cx = x0 + 16;
      const ty = y0 + 16, by = y0 + 3 * TILE - 14;
      const my = y0 + TILE * 1.5;
      // camino que cruza la muralla
      g.fillStyle = 'rgba(120,98,66,0.75)'; g.fillRect(cx - 30, my - 8, 60, 16);
      this.prism(this.seg(cx, ty, cx, by, 18), H, face, top, 'brick');
      this.crenLine(cx - 8, ty - H, cx - 8, by - H, '#c9c4ba');
      this.crenLine(cx + 8, ty - H, cx + 8, by - H, '#c9c4ba');
      this.tower(cx, ty, H + 12, towerF, towerT, col);
      // abertura del portón vista desde arriba
      const gy = my - H;
      g.fillStyle = '#6d6860'; g.fillRect(cx - 10, gy - 10, 20, 20);
      // pasaje visto desde arriba: la reja se ve como una franja de barras que se recoge hacia arriba
      g.fillStyle = '#1c1611'; g.fillRect(cx - 9, gy - 8, 18, 16);
      g.fillStyle = 'rgba(138,122,92,.9)'; g.fillRect(cx - 9, gy - 8, 18, 16 * Math.min(1, lift * 1.2));
      const bars = 16 * (1 - lift);
      if (bars > 0.5) {
        g.fillStyle = '#3b3833'; g.fillRect(cx - 9, gy - 1.5 - bars / 2 + bars / 2, 18, 3);
        g.strokeStyle = '#3b3833'; g.lineWidth = 1.6; g.beginPath();
        for (let xx = cx - 7.5; xx <= cx + 8; xx += 3) { g.moveTo(xx, gy - bars / 2); g.lineTo(xx, gy + bars / 2); }
        g.stroke();
      }
      this.tower(cx, by, H + 12, towerF, towerT, col);
      if (e.locked) this.padlock(cx + 14, gy - 4);
    }
    g.globalAlpha = 1;
  }

  private tower(cx: number, cy: number, H: number, face: string, top: string, col: string) {
    const g = this.ctx;
    // torre octogonal
    const r = 12, pts: number[][] = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]); }
    this.prism(pts, H, face, top, 'brick');
    g.fillStyle = '#c9c4ba';
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.fillRect(cx + Math.cos(a) * 10 - 2, cy + Math.sin(a) * 8.5 - H - 4, 4, 4); }
    g.fillStyle = '#2b2018'; g.fillRect(cx - 1.5, cy + 4 - H * 0.6, 3, 6);
    g.fillStyle = col; g.fillRect(cx - 9, cy + 9 - H + 4, 18, 2.5);
  }

  private padlock(x: number, y: number) {
    const g = this.ctx;
    g.strokeStyle = '#e8c547'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y - 3, 3.2, Math.PI, 0); g.stroke();
    g.fillStyle = '#d4a017'; g.fillRect(x - 5, y - 3, 10, 8);
    g.fillStyle = '#3a2a10'; g.fillRect(x - 0.8, y - 1, 1.6, 3.5);
  }

  // --------------------------------------------------------------- unidades
  private unit(e: Entity, time: number) {
    const g = this.ctx;
    const t = e.type as UnitType;
    const d = UNITS[t];
    const col = this.w.players[e.owner].color;
    const x = e.x, y = e.y, r = e.radius;
    const moving = e.path.length > 0;
    if (d.naval) {
      this.ship(e, col, time);
      if (e.cargo?.length) {
        g.fillStyle = 'rgba(20,14,8,.85)'; g.beginPath(); g.arc(x + 26, y - 30, 6.5, 0, 7); g.fill();
        g.fillStyle = '#ffe08a'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(e.cargo.length), x + 26, y - 29.5);
      }
      return;
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(x, y + r * 0.75, r * 0.95, r * 0.42, 0, 0, 7); g.fill();
    if (d.cls === 'siege') {
      this.siege(e, col, time);
      if (e.cargo?.length) { // infantería adentro del ariete
        g.fillStyle = 'rgba(20,14,8,.85)'; g.beginPath(); g.arc(x + r * 0.9, y - r * 1.1, 6, 0, 7); g.fill();
        g.fillStyle = '#ffe08a'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(e.cargo.length), x + r * 0.9, y - r * 1.1 + 0.5);
      }
      return;
    }
    if (t === 'tradecart') { this.tradeCart(e, col, time); return; }
    if (t === 'elephant') { this.elephant(e, col, time); return; }
    // animación de ataque: estocada hacia el objetivo + golpe del arma
    const sw = this.swing(e);
    const lunge = d.range <= 1 ? Math.max(0, sw) * 2.6 : 0;
    g.save(); g.translate(Math.cos(e.facing) * lunge, Math.sin(e.facing) * lunge * 0.6);
    const bob = moving ? Math.abs(Math.sin(time * 12 + e.id)) * 1.6 : 0;
    const fx = Math.cos(e.facing), fy = Math.sin(e.facing);
    const flip = fx < 0 ? -1 : 1;
    if (t === 'camel') this.camelMount(x, y + 1, flip, bob, col);
    else if (d.mounted) this.horse(x, y + 1, flip, bob, t === 'cataphract' || t === 'knight' ? col : null, t === 'cataphract' ? '#8a8f96' : t === 'scout' ? '#a87a4a' : '#7b5232');
    const by = y - (d.mounted ? 9 : 2) - bob;
    const body = t === 'monk' ? '#7a5a3a' : t === 'champion' || t === 'cataphract' || t === 'teutonic' ? '#b0b7bf' : t === 'jaguar' ? '#d9a441' : t === 'eagle' ? '#8a5a2e' : t === 'samurai' ? '#b23a3a' : t === 'janissary' ? '#e8e2d0' : col;
    const skin = t === 'jaguar' || t === 'eagle' || t === 'plumed' ? '#c08a5c' : t === 'samurai' || t === 'chukonu' ? '#e8c39a' : '#e9bf98';
    const metal = t === 'champion' || t === 'cataphract' || t === 'teutonic' || t === 'knight';
    const pants = metal ? '#7c838b' : t === 'villager' ? '#6a5236' : '#4b3c2e';
    const st = moving ? Math.sin(time * 12 + e.id) : 0;
    const top0 = by - r * 0.62, hip = by + r * 0.5;
    g.lineCap = 'round';
    // piernas y botas (a caballo: la pierna cuelga sobre el flanco)
    if (t === 'monk') {
      g.fillStyle = '#2a1f17'; g.beginPath(); g.ellipse(x - 2 + st, y + 5.5, 2, 1.2, 0, 0, 7); g.ellipse(x + 2 - st, y + 5.5, 2, 1.2, 0, 0, 7); g.fill();
    } else if (d.mounted) {
      g.strokeStyle = pants; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x - flip * 0.5, hip - 1); g.lineTo(x + flip * 1.5, hip + 3.5); g.lineTo(x + flip * 0.8, hip + 7); g.stroke();
      g.fillStyle = '#231a12'; g.beginPath(); g.ellipse(x + flip * 1.6, hip + 7.6, 2, 1.2, 0, 0, 7); g.fill();
    } else {
      for (const k of [-1, 1]) {
        const sx = x + k * 1.9, fx2 = x + k * 2.2 + st * 2.4 * k;
        g.strokeStyle = pants; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(sx, hip - 0.5); g.lineTo(fx2, y + 4.6); g.stroke();
        g.fillStyle = '#231a12'; g.beginPath(); g.ellipse(fx2 + flip * 0.8, y + 5.6, 2.1, 1.25, 0, 0, 7); g.fill();
      }
    }
    // brazo de atrás (el del escudo)
    const shBack = { x: x - flip * r * 0.5, y: top0 + 2 };
    g.strokeStyle = shade(body, -0.3); g.lineWidth = 2.8;
    g.beginPath(); g.moveTo(shBack.x, shBack.y); g.lineTo(x - flip * r * 0.62, by + r * 0.3); g.stroke();
    g.fillStyle = skin; g.beginPath(); g.arc(x - flip * r * 0.62, by + r * 0.38, 1.3, 0, 7); g.fill();
    // torso: hombros más anchos que la cintura, con luz de costado y contorno
    const tw = r * 0.7, ww = r * 0.52, bot = t === 'monk' ? y + 5 : hip + 1;
    const bw = t === 'monk' ? r * 0.75 : ww;
    const tor = () => {
      g.beginPath();
      g.moveTo(x - tw, top0 + 2.5); g.quadraticCurveTo(x - tw, top0, x - tw + 2.5, top0);
      g.lineTo(x + tw - 2.5, top0); g.quadraticCurveTo(x + tw, top0, x + tw, top0 + 2.5);
      g.lineTo(x + bw, bot); g.lineTo(x - bw, bot); g.closePath();
    };
    const tg = g.createLinearGradient(x - tw, 0, x + tw, 0);
    tg.addColorStop(0, shade(body, flip > 0 ? -0.28 : 0.12)); tg.addColorStop(0.5, body); tg.addColorStop(1, shade(body, flip > 0 ? 0.12 : -0.28));
    g.fillStyle = tg; tor(); g.fill();
    if (metal) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.6; g.beginPath(); for (let yy = top0 + 3; yy < bot - 1; yy += 2.2) { g.moveTo(x - tw + 1, yy); g.lineTo(x + tw - 1, yy); } g.stroke(); }
    // tabardo con el color del jugador y cinturón
    if (body !== col) { g.fillStyle = col; g.beginPath(); g.moveTo(x - 2.4, top0 + 1); g.lineTo(x + 2.4, top0 + 1); g.lineTo(x + 2, bot); g.lineTo(x - 2, bot); g.closePath(); g.fill(); }
    if (t !== 'monk') { g.fillStyle = '#3a2a1a'; g.fillRect(x - ww - 0.3, hip - 2.6, ww * 2 + 0.6, 1.6); g.fillStyle = '#c9a227'; g.fillRect(x - 0.8, hip - 2.6, 1.6, 1.6); }
    else { g.strokeStyle = '#d8c59a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x - r * 0.45, by + 1); g.lineTo(x + r * 0.45, by + 1); g.stroke(); }
    g.strokeStyle = 'rgba(20,12,6,.55)'; g.lineWidth = 0.8; tor(); g.stroke();
    // cabeza: cuello, cara con sombra y contorno
    const hx = x + flip, hy = by - r * 0.85, hr = r * 0.38;
    g.fillStyle = shade(skin, -0.15); g.fillRect(hx - 1.2, hy + hr - 1, 2.4, 2.2);
    const hg = g.createRadialGradient(hx - flip * hr * 0.3, hy - hr * 0.3, 0.5, hx, hy, hr + 0.5);
    hg.addColorStop(0, shade(skin, 0.12)); hg.addColorStop(1, shade(skin, -0.22));
    g.fillStyle = hg; g.beginPath(); g.arc(hx, hy, hr, 0, 7); g.fill();
    g.strokeStyle = 'rgba(20,12,6,.5)'; g.lineWidth = 0.7; g.stroke();
    g.fillStyle = '#1d1410'; g.beginPath(); g.arc(hx + flip * hr * 0.45, hy - 0.3, 0.55, 0, 7); g.fill();
    switch (t) {
      case 'villager': g.fillStyle = '#c9a25a'; g.beginPath(); g.ellipse(hx, hy - 2.5, r * 0.55, 2, 0, 0, 7); g.fill(); break;
      case 'monk': g.fillStyle = '#5d4030'; g.beginPath(); g.arc(hx, hy - 1, hr + 0.5, Math.PI, 0); g.fill(); break;
      case 'berserker':
        g.fillStyle = '#9aa4ad'; g.beginPath(); g.arc(hx, hy - 0.5, hr + 0.5, Math.PI, 0); g.fill();
        g.strokeStyle = '#efe6d0'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(hx - 3, hy - 2); g.quadraticCurveTo(hx - 7, hy - 5, hx - 6, hy - 9); g.moveTo(hx + 3, hy - 2); g.quadraticCurveTo(hx + 7, hy - 5, hx + 6, hy - 9); g.stroke();
        break;
      case 'samurai': g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(hx, hy - 0.5, hr + 0.8, Math.PI, 0); g.fill(); g.fillStyle = '#d4a017'; g.fillRect(hx - 3, hy - hr - 3, 6, 1.6); break;
      case 'eagle': {
        // casco de cabeza de águila: plumas pardas, cara blanca y pico amarillo
        g.fillStyle = '#6b4a2a'; g.beginPath(); g.arc(hx, hy - 0.5, hr + 1.5, Math.PI * 0.85, Math.PI * 2.15); g.fill();
        g.fillStyle = '#f2ede0'; g.beginPath(); g.arc(hx + flip * 1.2, hy - 1.8, hr * 0.7, 0, 7); g.fill();
        g.fillStyle = '#e0b52a'; g.beginPath(); g.moveTo(hx + flip * (hr + 1), hy - 2.5); g.lineTo(hx + flip * (hr + 5), hy - 0.5); g.lineTo(hx + flip * (hr + 0.5), hy + 0.5); g.closePath(); g.fill();
        g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(hx + flip * 2, hy - 2.5, 0.8, 0, 7); g.fill();
        g.strokeStyle = '#4a321c'; g.lineWidth = 1.3;
        for (const k of [-1, 0, 1]) { g.beginPath(); g.moveTo(hx - flip * 2, hy - hr); g.lineTo(hx - flip * (6 + k), hy - hr - 4 + k * 2.5); g.stroke(); }
        break;
      }
      case 'jaguar':
        g.fillStyle = '#e0a83a'; g.beginPath(); g.arc(hx, hy - 0.5, hr + 1.4, Math.PI * 0.9, Math.PI * 2.1); g.fill();
        g.fillStyle = '#3a2a10'; for (const [ox, oy] of [[-2.5, -2.5], [1.5, -3.5], [3, -1]]) { g.beginPath(); g.arc(hx + ox, hy + oy, 0.8, 0, 7); g.fill(); }
        g.fillStyle = '#f5f0e0'; g.fillRect(hx - 3, hy + 0.5, 6, 1);
        g.fillStyle = '#3a2a10'; for (const ox of [-6, 2, 9]) { g.beginPath(); g.arc(x + ox * 0.5, by + 1, 1, 0, 7); g.fill(); }
        break;
      case 'teutonic':
        g.fillStyle = '#9aa4ad'; g.fillRect(hx - hr - 0.8, hy - hr - 1.5, (hr + 0.8) * 2, hr * 2 + 1.5);
        g.fillStyle = '#2b2b2b'; g.fillRect(hx - hr, hy - 0.5, hr * 2, 1.2);
        g.fillStyle = '#f2f2f2'; g.fillRect(x - 1, by - 4, 2, 8); g.fillRect(x - 3.5, by - 1, 7, 2);
        break;
      case 'plumed':
        g.lineWidth = 1.6;
        ['#2e9e5b', '#e0b52a', '#c23a2a', '#2e9e5b', '#1f6fb5'].forEach((c, k) => { const a = -Math.PI / 2 + (k - 2) * 0.35; g.strokeStyle = c; g.beginPath(); g.moveTo(hx, hy - hr + 1); g.lineTo(hx + Math.cos(a) * 8, hy - hr + 1 + Math.sin(a) * 8); g.stroke(); });
        g.fillStyle = '#c9a227'; g.fillRect(hx - hr, hy - hr, hr * 2, 1.6);
        break;
      case 'tarkan': g.fillStyle = '#6b4a2a'; g.beginPath(); g.arc(hx, hy - 1, hr + 1, Math.PI, 0); g.fill(); g.fillStyle = '#a07a50'; g.fillRect(hx - hr - 1, hy - 1.5, hr * 2 + 2, 2); break;
      case 'huskarl': g.fillStyle = '#8a939b'; g.beginPath(); g.arc(hx, hy - 0.5, hr + 0.6, Math.PI, 0); g.fill(); g.fillRect(hx + flip * 0.5 - 0.7, hy - 1, 1.4, 3.5); break;
      case 'janissary': g.fillStyle = '#f2ede0'; g.fillRect(hx - 2.5, hy - hr - 8, 5, 8); g.fillStyle = '#c9a227'; g.fillRect(hx - 3, hy - hr - 1, 6, 1.5); break;
      case 'conquistador': g.fillStyle = '#b0b7bf'; g.beginPath(); g.ellipse(hx, hy - 2, hr + 2, 2, 0, 0, 7); g.fill(); g.beginPath(); g.arc(hx, hy - 2.5, hr * 0.8, Math.PI, 0); g.fill(); break;
      case 'mangudai': case 'cavarcher': g.fillStyle = t === 'mangudai' ? '#6b4a2a' : '#9aa4ad'; g.beginPath(); g.arc(hx, hy - 1, hr + 0.6, Math.PI, 0); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(hx, hy - hr - 1, 1.6, 0, 7); g.fill(); break;
      case 'longbow': case 'archer': case 'skirmisher': case 'chukonu': g.fillStyle = shade(col, -0.2); g.beginPath(); g.arc(hx, hy - 1, hr + 0.4, Math.PI * 1.05, -0.05); g.fill(); break;
      default:
        g.fillStyle = '#9aa4ad'; g.beginPath(); g.arc(hx, hy - 0.5, hr + 0.4, Math.PI, 0); g.fill();
        if (t === 'champion' || t === 'knight' || t === 'cataphract') { g.fillStyle = col; g.fillRect(hx - 1, hy - hr - 5, 2, 5); }
    }
    // arma
    g.lineCap = 'round';
    const ax = x + flip * r * 0.55, ay = by;
    // brazo del arma: del hombro a la mano
    g.strokeStyle = shade(body, -0.12); g.lineWidth = 2.8;
    g.beginPath(); g.moveTo(x + flip * r * 0.5, top0 + 2); g.lineTo(ax, ay); g.stroke();
    switch (t) {
      case 'villager': {
        const swing = e.order && e.path.length === 0 && (e.order.t === 'gather' || e.order.t === 'build') ? Math.sin(time * 10 + e.id) * 0.9 : 0;
        const a = (flip > 0 ? -0.9 : Math.PI + 0.9) + swing * flip;
        // herramienta según la tarea: oz (comida), pico (oro y piedra), hacha (madera), martillo (construir)
        const o = e.order;
        const res = o?.t === 'gather' ? o.res : !o ? e.carryRes : undefined;
        const tool = o?.t === 'build' ? 'hammer' : res === 'wood' ? 'axe' : res === 'gold' || res === 'stone' ? 'pick' : res === 'food' ? 'sickle' : null;
        if (tool) this.villagerTool(tool, ax, ay, a, flip);
        if (e.carry > 0 && e.carryRes) { g.fillStyle = RES_COLOR[e.carryRes]; g.fillRect(x - flip * 6 - 3, by - 4, 6, 6); }
        break;
      }
      case 'militia': case 'champion': case 'samurai': case 'huskarl': case 'teutonic': {
        const len = t === 'champion' ? 11 : t === 'samurai' ? 12 : t === 'teutonic' ? 13 : 9;
        const a = flip > 0 ? -0.7 + sw * 1.25 : Math.PI + 0.7 - sw * 1.25;
        this.sword(ax, ay, a, len, t === 'samurai' ? 1.5 : t === 'champion' || t === 'teutonic' ? 2.4 : 2, t === 'samurai');
        if (sw > 0.6) { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.arc(ax, ay, len, flip > 0 ? -0.7 : Math.PI - 0.5, flip > 0 ? 0.5 : Math.PI + 0.7); g.stroke(); }
        if (t !== 'samurai') this.shield(x - flip * r * 0.55, by + 1, col, t === 'champion' || t === 'huskarl' || t === 'teutonic' ? 5.5 : 4);
        break;
      }
      case 'spearman': {
        const th = Math.max(0, sw) * 6;
        const tip = sw > 0 ? [ax + fx * (13 + th), ay + fy * (13 + th) - 3] : [ax + fx * 12, ay - 10];
        g.strokeStyle = '#8d6e63'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax - fx * 6 + fx * th, ay + 4); g.lineTo(tip[0], tip[1]); g.stroke();
        g.fillStyle = '#cfd8dc'; g.beginPath(); g.arc(tip[0], tip[1], 2.2, 0, 7); g.fill();
        this.shield(x - flip * r * 0.55, by + 1, col, 3.5);
        break;
      }
      case 'skirmisher':
        g.strokeStyle = '#a58a5a'; g.lineWidth = 1.6;
        for (const o of [-2, 1]) { g.beginPath(); g.moveTo(ax - flip * 3 + o, ay + 5); g.lineTo(ax + flip * 5 + o, ay - 9); g.stroke(); }
        this.shield(x - flip * r * 0.55, by + 1, col, 3.5);
        break;
      case 'archer': case 'longbow': case 'cavarcher': case 'mangudai': case 'plumed': {
        const big = t === 'longbow' ? 10 : 7;
        g.strokeStyle = '#8d6e63'; g.lineWidth = 2;
        g.beginPath(); g.arc(ax, ay, big, e.facing - 1.2, e.facing + 1.2); g.stroke();
        // cuerda: se tensa al disparar
        const pull = sw < 0 ? -sw * 6 : 0;
        const p1x = ax + Math.cos(e.facing - 1.2) * big, p1y = ay + Math.sin(e.facing - 1.2) * big;
        const p2x = ax + Math.cos(e.facing + 1.2) * big, p2y = ay + Math.sin(e.facing + 1.2) * big;
        const mx = (p1x + p2x) / 2 - fx * pull, my = (p1y + p2y) / 2 - fy * pull;
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(p1x, p1y); g.lineTo(mx, my); g.lineTo(p2x, p2y); g.stroke();
        if (pull > 1) { g.strokeStyle = '#d7ccc8'; g.lineWidth = 1; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + fx * (big + 2), my + fy * (big + 2)); g.stroke(); }
        g.fillStyle = '#6d4c41'; g.fillRect(x - flip * 5 - 1.5, by - 6, 3, 8);
        break;
      }
      case 'chukonu':
        g.strokeStyle = '#6d4c41'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(ax - fx * 3, ay); g.lineTo(ax + fx * 8, ay + fy * 8 - 1); g.stroke();
        g.strokeStyle = '#3e2a1a'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(ax + fx * 6 - fy * 5, ay + fy * 6 + fx * 5 - 1); g.lineTo(ax + fx * 6 + fy * 5, ay + fy * 6 - fx * 5 - 1); g.stroke();
        g.fillStyle = '#8d6e63'; g.fillRect(ax + fx * 2 - 2, ay - 5, 4, 3);
        break;
      case 'handcannon': case 'janissary': case 'conquistador':
        g.strokeStyle = '#3a3a3a'; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(ax - fx * 3, ay + 2); g.lineTo(ax + fx * 12, ay + fy * 12 - 2); g.stroke();
        g.strokeStyle = '#6d4c41'; g.lineWidth = 3; g.beginPath(); g.moveTo(ax - fx * 5, ay + 3); g.lineTo(ax, ay + 1); g.stroke();
        break;
      case 'axeman': case 'berserker': case 'jaguar': case 'eagle': {
        const a = flip > 0 ? -0.7 + sw * 1.3 : Math.PI + 0.7 - sw * 1.3;
        g.strokeStyle = '#6d4c41'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + Math.cos(a) * 10, ay + Math.sin(a) * 10); g.stroke();
        g.fillStyle = '#cfd8dc'; g.beginPath(); g.ellipse(ax + Math.cos(a) * 10, ay + Math.sin(a) * 10, 3.5, 2.2, a + Math.PI / 2, 0, 7); g.fill();
        if (t === 'eagle') this.shield(x - flip * r * 0.55, by + 1, '#c9a227', 3.8);
        if (t === 'berserker') this.shield(x - flip * r * 0.55, by + 1, col, 4.5);
        break;
      }
      case 'knight': case 'cataphract': case 'scout': case 'tarkan':
        g.strokeStyle = t === 'cataphract' ? '#8d6e63' : '#e8eef3'; g.lineWidth = t === 'cataphract' ? 2 : 2.5;
        if (t === 'cataphract') {
          const th = Math.max(0, sw) * 6;
          g.beginPath(); g.moveTo(ax - flip * 4 + flip * th, ay + 1); g.lineTo(ax + flip * (17 + th), ay - 4 + Math.max(0, sw) * 3); g.stroke();
        } else {
          const a = flip > 0 ? -0.6 + sw * 1.2 : Math.PI + 0.6 - sw * 1.2;
          this.sword(ax, ay, a, 12, 2, false);
        }
        if (t !== 'scout') this.shield(x - flip * r * 0.4, by + 1, col, 4);
        break;
      case 'monk':
        g.strokeStyle = '#b08850'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax, ay + 7); g.lineTo(ax, ay - 11); g.stroke();
        g.fillStyle = '#ffd86b'; g.beginPath(); g.arc(ax, ay - 12, 2.5, 0, 7); g.fill();
        break;
    }
    // mano sobre la empuñadura
    g.fillStyle = skin; g.beginPath(); g.arc(ax, ay, 1.45, 0, 7); g.fill();
    g.strokeStyle = 'rgba(20,12,6,.45)'; g.lineWidth = 0.5; g.stroke();
    g.restore();
    if (e.hero) this.heroMark(e, time);
  }

  /** Corona y halo dorado sobre el héroe de una historia */
  private heroMark(e: Entity, time: number) {
    const g = this.ctx;
    const d = UNITS[e.type as UnitType];
    const y = e.y - e.radius - (d.mounted ? 30 : 22) + Math.sin(time * 3) * 1.2;
    g.fillStyle = 'rgba(255,215,90,0.22)'; g.beginPath(); g.ellipse(e.x, e.y + e.radius * 0.7, e.radius + 7, (e.radius + 7) * 0.5, 0, 0, 7); g.fill();
    g.fillStyle = '#f5c542'; g.strokeStyle = '#7a5a10'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(e.x - 6, y + 4); g.lineTo(e.x - 6, y - 2); g.lineTo(e.x - 3, y + 1); g.lineTo(e.x, y - 4); g.lineTo(e.x + 3, y + 1); g.lineTo(e.x + 6, y - 2); g.lineTo(e.x + 6, y + 4); g.closePath(); g.fill(); g.stroke();
  }

  /** Fase del golpe: 0 sin ataque; -1 = arma levantada (carga), +1 = impacto */
  private swing(e: Entity): number {
    if (!e.order || e.order.t !== 'attack') return 0;
    const since = (this.w.tick - e.lastAtk) / 20;
    if (since >= 0 && since < 0.3) return 1 - since / 0.3;           // impacto y vuelta
    if (e.path.length === 0 && since < 6 && e.cooldown < 0.35) return -(1 - Math.max(0, e.cooldown) / 0.35); // levanta el arma
    return 0;
  }

  /** Herramientas del aldeano, dibujadas desde la mano (ax, ay) hacia el ángulo a */
  private villagerTool(tool: 'hammer' | 'axe' | 'pick' | 'sickle', x: number, y: number, a: number, flip: number) {
    const g = this.ctx;
    const c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
    const handle = (len: number) => {
      g.strokeStyle = '#7a5532'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(x - c * 2, y - s * 2); g.lineTo(x + c * len, y + s * len); g.stroke();
    };
    const metal = '#c3cbd2', edge = '#3b4148';
    g.lineJoin = 'round';
    if (tool === 'axe') {
      handle(10);
      const hx = x + c * 9, hy = y + s * 9, d = flip; // la hoja mira hacia adelante
      g.fillStyle = metal; g.beginPath();
      g.moveTo(hx - px * 0.5 * d, hy - py * 0.5 * d);
      g.lineTo(hx + px * 4.2 * d + c * 2.4, hy + py * 4.2 * d + s * 2.4);
      g.quadraticCurveTo(hx + px * 5.2 * d, hy + py * 5.2 * d, hx + px * 4.2 * d - c * 2.4, hy + py * 4.2 * d - s * 2.4);
      g.closePath(); g.fill(); g.strokeStyle = edge; g.lineWidth = 0.6; g.stroke();
    } else if (tool === 'pick') {
      handle(10);
      const hx = x + c * 9.5, hy = y + s * 9.5;
      g.strokeStyle = metal; g.lineWidth = 1.9; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(hx - px * 5 + c * 1.6, hy - py * 5 + s * 1.6);
      g.quadraticCurveTo(hx + c * 1.2, hy + s * 1.2, hx + px * 5 + c * 1.6, hy + py * 5 + s * 1.6);
      g.stroke();
      g.strokeStyle = edge; g.lineWidth = 0.5; g.stroke();
    } else if (tool === 'hammer') {
      handle(8);
      const hx = x + c * 8, hy = y + s * 8;
      g.fillStyle = '#8f969c'; g.beginPath();
      g.moveTo(hx - px * 3 - c * 1.6, hy - py * 3 - s * 1.6); g.lineTo(hx + px * 3 - c * 1.6, hy + py * 3 - s * 1.6);
      g.lineTo(hx + px * 3 + c * 1.6, hy + py * 3 + s * 1.6); g.lineTo(hx - px * 3 + c * 1.6, hy - py * 3 + s * 1.6); g.closePath();
      g.fill(); g.strokeStyle = edge; g.lineWidth = 0.6; g.stroke();
    } else {
      // oz: mango corto y hoja en media luna
      handle(3.5);
      const hx = x + c * 3.5, hy = y + s * 3.5;
      const base = Math.atan2(s, c);
      g.strokeStyle = metal; g.lineWidth = 1.5;
      g.beginPath(); g.arc(hx + c * 3, hy + s * 3, 3.1, base + Math.PI, base + Math.PI + flip * 3.2, flip < 0); g.stroke();
      g.strokeStyle = edge; g.lineWidth = 0.45; g.stroke();
    }
    g.lineCap = 'round';
  }

  /** Espada: hoja de acero con filo y lomo, guarda, empuñadura de cuero y pomo */
  private sword(x: number, y: number, a: number, len: number, wd: number, curved: boolean) {
    const g = this.ctx;
    const c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
    const gx = x + c * 2.2, gy = y + s * 2.2; // la guarda queda justo delante de la mano
    const tipx = x + c * len, tipy = y + s * len;
    const bend = curved ? 1.6 : 0;
    g.fillStyle = '#d9e0e6';
    g.beginPath();
    g.moveTo(gx + px * wd / 2, gy + py * wd / 2);
    g.quadraticCurveTo((gx + tipx) / 2 + px * (wd / 2 + bend), (gy + tipy) / 2 + py * (wd / 2 + bend), tipx, tipy);
    g.quadraticCurveTo((gx + tipx) / 2 - px * (wd / 2 - bend), (gy + tipy) / 2 - py * (wd / 2 - bend), gx - px * wd / 2, gy - py * wd / 2);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,48,56,.75)'; g.lineWidth = 0.55; g.stroke();
    // canal central (vaceo) más oscuro
    g.strokeStyle = 'rgba(110,122,134,.85)'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(gx + c * 1, gy + s * 1); g.lineTo(x + c * len * 0.72, y + s * len * 0.72); g.stroke();
    // guarda
    g.strokeStyle = '#8a6a2a'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(gx + px * (wd + 1.6), gy + py * (wd + 1.6)); g.lineTo(gx - px * (wd + 1.6), gy - py * (wd + 1.6)); g.stroke();
    // empuñadura y pomo
    g.strokeStyle = '#4a2f1c'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(gx, gy); g.lineTo(x - c * 2.4, y - s * 2.4); g.stroke();
    g.fillStyle = '#b8902e'; g.beginPath(); g.arc(x - c * 3, y - s * 3, 1.1, 0, 7); g.fill();
  }

  private camelMount(x: number, y: number, flip: number, bob: number, col: string) {
    const g = this.ctx;
    const coat = '#c9a063';
    g.fillStyle = shade(coat, -0.2);
    g.fillRect(x - 9, y + 1, 2.5, 10 - bob); g.fillRect(x + 7, y + 1, 2.5, 9 + bob); g.fillRect(x - 5, y + 1, 2.2, 9 + bob * 0.5); g.fillRect(x + 3, y + 1, 2.2, 10 - bob * 0.5);
    g.fillStyle = coat;
    g.beginPath(); g.ellipse(x, y - 1, 12, 6, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x - flip * 2, y - 6, 6, 5, 0, 0, 7); g.fill(); // joroba
    // cuello largo y cabeza
    g.strokeStyle = coat; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + flip * 9, y - 2); g.quadraticCurveTo(x + flip * 16, y - 4, x + flip * 15, y - 13); g.stroke();
    g.beginPath(); g.ellipse(x + flip * 17, y - 14, 4, 2.6, 0, 0, 7); g.fill();
    g.fillStyle = col; g.fillRect(x - 7, y - 4, 12, 3); // manta con el color del jugador
  }

  private horse(x: number, y: number, flip: number, bob: number, barding: string | null, coat: string) {
    const g = this.ctx;
    g.fillStyle = coat;
    g.beginPath(); g.ellipse(x, y, 12, 6, 0, 0, 7); g.fill();
    g.fillRect(x - 9, y + 2, 2.5, 7 - bob); g.fillRect(x + 7, y + 2, 2.5, 7 + bob - 1.5);
    g.fillRect(x - 5, y + 2, 2.2, 6 + bob * 0.5); g.fillRect(x + 3, y + 2, 2.2, 6 - bob * 0.5);
    g.beginPath(); g.ellipse(x + flip * 12, y - 5, 4, 6, flip * 0.5, 0, 7); g.fill();
    g.fillStyle = shade(coat, -0.4); g.fillRect(x + flip * 9 - 1, y - 9, 2, 6);
    g.strokeStyle = shade(coat, -0.4); g.lineWidth = 2; g.beginPath(); g.moveTo(x - flip * 12, y - 2); g.lineTo(x - flip * 15, y + 4); g.stroke();
    if (barding) { g.fillStyle = barding; g.globalAlpha = 0.85; g.fillRect(x - 9, y - 4, 18, 6); g.globalAlpha = 1; }
  }

  private elephant(e: Entity, col: string, time: number) {
    const g = this.ctx;
    const x = e.x, y = e.y;
    const flip = Math.cos(e.facing) < 0 ? -1 : 1;
    const bob = e.path.length ? Math.sin(time * 6 + e.id) * 1.2 : 0;
    g.fillStyle = '#8c8c8c';
    for (const lx of [-9, -3, 4, 9]) g.fillRect(x + lx - 2.5, y + 2, 5, 8 + (lx % 2 ? bob : -bob));
    g.beginPath(); g.ellipse(x, y - 2, 16, 10, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x + flip * 14, y - 6, 7, 7, 0, 0, 7); g.fill();
    g.strokeStyle = '#8c8c8c'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + flip * 19, y - 4); g.quadraticCurveTo(x + flip * 23, y + 4, x + flip * 20, y + 9); g.stroke();
    g.strokeStyle = '#f5f0e0'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + flip * 17, y - 1); g.lineTo(x + flip * 22, y + 1); g.stroke();
    g.fillStyle = '#6e6e6e'; g.beginPath(); g.ellipse(x + flip * 9, y - 6, 4, 6, 0, 0, 7); g.fill();
    // castillete con el color del jugador
    g.fillStyle = '#7a5634'; g.fillRect(x - 9, y - 18, 16, 8);
    g.fillStyle = col; g.fillRect(x - 10, y - 12, 18, 3);
    g.fillStyle = '#f0c8a0'; g.beginPath(); g.arc(x - 1, y - 20, 3, 0, 7); g.fill();
  }

  private siege(e: Entity, col: string, time: number) {
    const g = this.ctx;
    const t = e.type as UnitType;
    const x = e.x, y = e.y;
    const flip = Math.cos(e.facing) < 0 ? -1 : 1;
    const wheel = (wx: number, wy: number, r: number) => { g.fillStyle = '#3e2a1a'; g.beginPath(); g.arc(wx, wy, r, 0, 7); g.fill(); g.fillStyle = '#8d6e4a'; g.beginPath(); g.arc(wx, wy, r * 0.4, 0, 7); g.fill(); };
    if (t === 'ram') {
      // vista lateral: techo de cueros a dos aguas, ruedas y tronco con punta de hierro
      const since = (this.w.tick - e.lastAtk) / 20;
      const thrust = since >= 0 && since < 0.5 ? Math.sin((since / 0.5) * Math.PI) * 7 : 0;
      const roll = e.path.length ? time * 6 : 0;
      g.save(); g.translate(x, y); g.scale(flip, 1);
      // tronco (debajo del techo, asoma por delante)
      g.fillStyle = '#6d4c2e'; g.fillRect(-14 + thrust, -9, 30, 5);
      g.fillStyle = '#4e351c'; for (const k of [-8, 0, 8]) g.fillRect(k + thrust, -9, 1.2, 5);
      g.fillStyle = '#7d8790'; g.beginPath(); g.moveTo(16 + thrust, -10); g.lineTo(21 + thrust, -6.5); g.lineTo(16 + thrust, -3); g.closePath(); g.fill();
      g.fillStyle = '#5c656d'; g.fillRect(14 + thrust, -10, 2.5, 7);
      // chasis
      g.fillStyle = '#5d4030'; g.fillRect(-16, -4, 30, 5);
      // techo en A cubierto de cueros
      g.fillStyle = '#8a6a48';
      g.beginPath(); g.moveTo(-18, -2); g.lineTo(-12, -21); g.lineTo(9, -21); g.lineTo(15, -2); g.closePath(); g.fill();
      g.fillStyle = '#a5845e';
      g.beginPath(); g.moveTo(-18, -2); g.lineTo(-12, -21); g.lineTo(-1, -21); g.lineTo(-1, -2); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(60,40,20,0.55)'; g.lineWidth = 0.9; g.beginPath();
      for (const yy of [-16, -11, -6]) { g.moveTo(-17 + (yy + 21) * -0.05 + (-2 - yy) * 0.3, yy); g.lineTo(14 - (-2 - yy) * 0.3, yy); }
      for (const xx of [-8, 0, 6]) { g.moveTo(xx, -21); g.lineTo(xx + (xx < 0 ? -2 : 2), -2); }
      g.stroke();
      g.strokeStyle = '#3e2a1a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-12, -21); g.lineTo(9, -21); g.stroke();
      g.fillStyle = col; g.fillRect(-16, -5, 30, 2.5);
      // ruedas con rayos
      for (const wx of [-10, 8]) {
        g.fillStyle = '#3e2a1a'; g.beginPath(); g.arc(wx, 3, 5, 0, 7); g.fill();
        g.strokeStyle = '#8d6e4a'; g.lineWidth = 1; g.beginPath();
        for (let k = 0; k < 3; k++) { const a = roll + (k * Math.PI) / 3; g.moveTo(wx + Math.cos(a) * 4, 3 + Math.sin(a) * 4); g.lineTo(wx - Math.cos(a) * 4, 3 - Math.sin(a) * 4); }
        g.stroke();
        g.fillStyle = '#8d6e4a'; g.beginPath(); g.arc(wx, 3, 1.4, 0, 7); g.fill();
      }
      g.restore();
      return;
    }
    if (t === 'mangonel') {
      g.fillStyle = '#6d4c2e'; g.fillRect(x - 12, y - 4, 24, 8);
      wheel(x - 9, y + 5, 4); wheel(x + 9, y + 5, 4);
      const arm = e.cooldown > 4 ? -1.2 : 0.4;
      g.strokeStyle = '#8d6e4a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x - flip * 2, y - 2); g.lineTo(x - flip * 2 + Math.cos(arm) * flip * -14, y - 2 - Math.abs(Math.sin(arm)) * 14 - 2); g.stroke();
      g.fillStyle = col; g.fillRect(x - 12, y - 4, 24, 2);
      g.fillStyle = '#9e9e9e'; g.beginPath(); g.arc(x - flip * 14, y - 12, 3, 0, 7); g.fill();
      return;
    }
    const since = (this.w.tick - e.lastAtk) / 20;
    const spoked = (wx: number, wy: number, r: number, rot: number) => {
      g.fillStyle = '#3e2a1a'; g.beginPath(); g.arc(wx, wy, r, 0, 7); g.fill();
      g.fillStyle = '#7a5634'; g.beginPath(); g.arc(wx, wy, r - 1.6, 0, 7); g.fill();
      g.strokeStyle = '#3e2a1a'; g.lineWidth = 1.1; g.beginPath();
      for (let k = 0; k < 4; k++) { const a = rot + (k * Math.PI) / 4; g.moveTo(wx + Math.cos(a) * (r - 1.5), wy + Math.sin(a) * (r - 1.5)); g.lineTo(wx - Math.cos(a) * (r - 1.5), wy - Math.sin(a) * (r - 1.5)); }
      g.stroke();
      g.fillStyle = '#9e9e9e'; g.beginPath(); g.arc(wx, wy, 1.6, 0, 7); g.fill();
    };
    const roll = e.path.length ? time * 5 : 0;
    if (t === 'bombard') {
      // cañón de bronce sobre cureña de dos ruedas, con retroceso y humo al disparar
      const recoil = since >= 0 && since < 0.35 ? Math.sin((since / 0.35) * Math.PI) * 3.5 : 0;
      g.save(); g.translate(x, y); g.scale(flip, 1);
      // cureña y contera apoyada en el suelo
      g.fillStyle = '#5d4030';
      g.beginPath(); g.moveTo(-18 - recoil, 6); g.lineTo(-15 - recoil, 3); g.lineTo(4 - recoil, -3); g.lineTo(6 - recoil, 1); g.closePath(); g.fill();
      g.strokeStyle = '#3e2a1a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-14 - recoil, 3.5); g.lineTo(3 - recoil, -1.5); g.stroke();
      g.fillStyle = col; g.fillRect(-12 - recoil, 1, 6, 2.5);
      // caño
      g.save(); g.translate(-recoil, -5); g.rotate(-0.12);
      const grad = g.createLinearGradient(0, -5, 0, 5); grad.addColorStop(0, '#d9a75a'); grad.addColorStop(0.45, '#b07a35'); grad.addColorStop(1, '#6e4a1f');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(-10, -4.5); g.lineTo(16, -3.6); g.lineTo(16, 3.6); g.lineTo(-10, 4.5); g.arc(-10, 0, 4.5, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.fill();
      g.fillStyle = '#8a5d25'; for (const bx of [-6, 2, 10]) g.fillRect(bx, -4.3, 1.8, 8.6);
      g.fillStyle = '#c99752'; g.fillRect(15, -4.6, 3, 9.2);
      g.fillStyle = '#1a1208'; g.beginPath(); g.ellipse(18, 0, 1.2, 3, 0, 0, 7); g.fill();
      if (since >= 0 && since < 0.15) { g.fillStyle = '#ffd36b'; g.beginPath(); g.moveTo(18, -3); g.lineTo(27, 0); g.lineTo(18, 3); g.fill(); }
      g.restore();
      spoked(-2 - recoil, 4, 7, roll);
      g.restore();
      if (since >= 0 && since < 0.05 && Math.random() < 0.9) this.fx.push({ kind: 'smoke', x: x + flip * 20, y: y - 8, t: time, life: 1.2 });
      return;
    }
    if (t === 'trebuchet') {
      // fundíbulo de contrapeso: torre en A, brazo largo con honda y caja de piedras
      const cocked = Math.PI - 0.45, fired = -1.0;
      let th = cocked;
      if (since >= 0 && since < 0.45) { const k = since / 0.45; th = cocked + (fired - cocked) * (1 - Math.pow(1 - k, 3)); }
      else if (since >= 0.45 && since < 2.2) { const k = (since - 0.45) / 1.75; th = fired + (cocked - fired) * k * k; }
      g.save(); g.translate(x, y); g.scale(flip, 1);
      // base
      g.fillStyle = '#5d4030'; g.fillRect(-18, 2, 36, 5);
      g.fillStyle = '#4e351c'; g.fillRect(-18, 2, 36, 1.5);
      g.fillStyle = col; g.fillRect(-12, 4, 24, 2);
      // torres en A (la de atrás más oscura)
      const px = 0, py = -24;
      g.strokeStyle = '#5a3d22'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-11, 3); g.lineTo(px - 1, py); g.lineTo(9, 3); g.stroke();
      g.strokeStyle = '#7a5634'; g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(-12, 4); g.lineTo(px, py + 1); g.lineTo(10, 4); g.moveTo(-6, -8); g.lineTo(5, -8); g.stroke();
      // brazo
      const L = 30, S = 9;
      const ex = px + Math.cos(th) * L, ey = py + Math.sin(th) * L;
      const sx = px - Math.cos(th) * S, sy = py - Math.sin(th) * S;
      g.strokeStyle = '#8d6e4a'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      // contrapeso colgando
      g.strokeStyle = '#3e2a1a'; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, sy + 4); g.stroke();
      g.fillStyle = '#5d4037'; g.fillRect(sx - 5, sy + 4, 10, 9);
      g.fillStyle = '#8e8a85'; g.fillRect(sx - 4, sy + 5, 8, 3);
      g.strokeStyle = '#3e2a1a'; g.lineWidth = 0.8; g.strokeRect(sx - 5, sy + 4, 10, 9);
      // honda con la piedra (solo cargado)
      if (since < 0 || since > 1.6) {
        g.strokeStyle = '#c9b48a'; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + 6, Math.min(5, ey + 7)); g.stroke();
        g.fillStyle = '#8e8a85'; g.beginPath(); g.arc(ex + 6, Math.min(5, ey + 7), 2.6, 0, 7); g.fill();
      }
      g.fillStyle = '#3e2a1a'; g.beginPath(); g.arc(px, py, 2, 0, 7); g.fill();
      spoked(-13, 8, 3.5, roll); spoked(13, 8, 3.5, roll);
      g.restore();
    }
  }

  /** Carreta mercante: un buey tira de un carro con toldo y mercadería */
  private tradeCart(e: Entity, col: string, time: number) {
    const g = this.ctx;
    const flip = Math.cos(e.facing) < 0 ? -1 : 1;
    const moving = e.path.length > 0;
    const step = moving ? Math.sin(time * 9 + e.id) * 1.5 : 0;
    g.save(); g.translate(e.x, e.y); g.scale(flip, 1);
    // buey
    g.fillStyle = '#7b5232';
    g.fillRect(9, 0, 2.2, 6 + step); g.fillRect(16, 0, 2.2, 6 - step);
    g.beginPath(); g.ellipse(13, -2, 7, 4.5, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(20, -4, 3.2, 3, 0, 0, 7); g.fill();
    g.strokeStyle = '#efe6d0'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(20, -7); g.lineTo(22, -9); g.moveTo(19, -7); g.lineTo(17.5, -9); g.stroke();
    // lanza
    g.strokeStyle = '#4e351c'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(3, -1); g.lineTo(9, -2); g.stroke();
    // carro
    g.fillStyle = '#6d4c2e'; g.fillRect(-13, -4, 17, 6);
    g.fillStyle = '#a07a50'; g.fillRect(-12, -9, 6, 5); g.fillRect(-5, -10, 7, 6);
    if (e.carry > 0) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(-8, -11, 2.5, 0, 7); g.arc(-2, -12, 2.5, 0, 7); g.fill(); }
    // toldo con el color del jugador
    g.fillStyle = col; g.beginPath(); g.moveTo(-14, -8); g.quadraticCurveTo(-5, -20, 5, -8); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(-10, -9); g.quadraticCurveTo(-5, -16, 0, -9); g.closePath(); g.fill();
    // ruedas
    for (const wx of [-10, 1]) {
      g.fillStyle = '#3e2a1a'; g.beginPath(); g.arc(wx, 3, 4, 0, 7); g.fill();
      g.fillStyle = '#8d6e4a'; g.beginPath(); g.arc(wx, 3, 1.4, 0, 7); g.fill();
    }
    g.restore();
  }

  private ship(e: Entity, col: string, time: number) {
    const g = this.ctx;
    const t = e.type as UnitType;
    const x = e.x, y = e.y;
    const cg = t === 'cannongalleon';
    const big = cg ? 1.6 : t === 'galleon' ? 1.38 : t === 'transport' ? 1.7 : t === 'fireship' ? 1.2 : t === 'tradecog' ? 1.15 : 0.95;
    const L = 19 * big, Wd = (t === 'transport' ? 10 : 7.5) * big; // medio largo y medio ancho del casco (el transporte es más ancho, tipo barcaza)
    const roll = Math.sin(time * 2 + e.id) * 0.04;
    const moving = e.path.length > 0;
    g.save(); g.translate(x, y); g.rotate(e.facing + roll);
    // estela y ola de proa
    if (moving) {
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.6; g.lineCap = 'round';
      const ph = (time * 3) % 1;
      for (const sd of [-1, 1]) {
        g.beginPath(); g.moveTo(L * 0.9, sd * 2); g.quadraticCurveTo(L * 0.6, sd * (Wd + 3), L * 0.1, sd * (Wd + 4)); g.stroke();
        g.beginPath(); g.moveTo(-L * 0.85, sd * Wd * 0.6); g.quadraticCurveTo(-L * 1.4, sd * (Wd + 2 + ph * 3), -L * 2, sd * (Wd + 6 + ph * 4)); g.stroke();
      }
    }
    g.fillStyle = 'rgba(0,10,30,0.28)'; g.beginPath(); g.ellipse(2, 3, L * 1.05, Wd * 1.05, 0, 0, 7); g.fill();
    // casco: proa en punta y popa cuadrada
    const hullCol = t === 'fireship' ? '#3d2a20' : cg ? '#241c16' : t === 'transport' ? '#7a5a38' : '#8a6440';
    const hull = (k: number) => {
      g.beginPath(); g.moveTo(L * k, 0);
      g.bezierCurveTo(L * 0.7 * k, -Wd * 1.05 * k, -L * 0.3 * k, -Wd * k, -L * 0.92 * k, -Wd * 0.82 * k);
      g.lineTo(-L * k, -Wd * 0.55 * k); g.lineTo(-L * k, Wd * 0.55 * k); g.lineTo(-L * 0.92 * k, Wd * 0.82 * k);
      g.bezierCurveTo(-L * 0.3 * k, Wd * k, L * 0.7 * k, Wd * 1.05 * k, L * k, 0); g.closePath();
    };
    const hg = g.createLinearGradient(0, -Wd, 0, Wd);
    hg.addColorStop(0, shade(hullCol, -0.35)); hg.addColorStop(0.5, shade(hullCol, 0.08)); hg.addColorStop(1, shade(hullCol, -0.4));
    g.fillStyle = hg; hull(1); g.fill();
    g.strokeStyle = 'rgba(15,8,4,.8)'; g.lineWidth = 1.2; g.stroke();
    // franja con el color del jugador a lo largo de la borda
    g.save(); hull(1); g.clip();
    g.strokeStyle = col; g.lineWidth = 2.2 * Math.min(1.3, big);
    hull(0.93); g.stroke();
    g.restore();
    // cubierta de tablones
    const deckCol = cg ? '#7a5634' : t === 'fireship' ? '#5a4030' : '#b8915e';
    g.fillStyle = deckCol; hull(0.8); g.fill();
    g.save(); hull(0.8); g.clip();
    g.strokeStyle = 'rgba(60,36,16,.45)'; g.lineWidth = 0.6; g.beginPath();
    for (let yy = -Wd; yy <= Wd; yy += 2.2) { g.moveTo(-L, yy); g.lineTo(L, yy); }
    let sd = e.id * 97 + 13;
    const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let yy = -Wd; yy <= Wd; yy += 2.2) { const xx = -L + rr() * L * 2; g.moveTo(xx, yy); g.lineTo(xx, yy + 2.2); }
    g.stroke();
    g.fillStyle = 'rgba(255,240,210,.12)'; g.fillRect(-L, -Wd * 0.6, L * 2, Wd * 0.35);
    g.restore();
    // castillo de popa (barcos grandes)
    if (t === 'galleon' || cg || t === 'transport' || t === 'tradecog') {
      const sx = -L * 0.92, sw = L * (cg ? 0.42 : 0.34), sh = Wd * 1.25;
      g.fillStyle = shade(hullCol, cg ? 0.05 : -0.05); g.fillRect(sx, -sh / 2, sw, sh);
      g.strokeStyle = 'rgba(15,8,4,.75)'; g.lineWidth = 0.9; g.strokeRect(sx, -sh / 2, sw, sh);
      g.fillStyle = shade(deckCol, 0.05); g.fillRect(sx + 1.2, -sh / 2 + 1.2, sw - 2.4, sh - 2.4);
      g.strokeStyle = cg ? '#c9a227' : '#4e3420'; g.lineWidth = 0.9; g.strokeRect(sx + 1.2, -sh / 2 + 1.2, sw - 2.4, sh - 2.4);
      g.fillStyle = '#ffd36b'; g.fillRect(sx + 0.4, -1.4, 1, 1.1); g.fillRect(sx + 0.4, 0.5, 1, 1.1); // farolitos
    }
    if (cg) {
      g.strokeStyle = '#c9a227'; g.lineWidth = 1;
      hull(0.97); g.stroke();
      const since = (this.w.tick - e.lastAtk) / 20;
      const rec = since >= 0 && since < 0.3 ? 1.6 : 0;
      for (const side of [-1, 1]) for (let i = -L * 0.35; i <= L * 0.55; i += L * 0.18) {
        g.fillStyle = '#111'; g.fillRect(i - 1.5, side * Wd * 0.93 - 1.2, 3, 2.4);
        g.fillStyle = '#4a4a4a'; g.fillRect(i - 1, side * (Wd * 0.93 + 1.2) - (side < 0 ? 3.6 - rec : rec), 2, 3.6);
      }
      if (since >= 0 && since < 0.5) {
        g.fillStyle = `rgba(210,210,210,${0.7 * (1 - since / 0.5)})`;
        for (let i = -L * 0.35; i <= L * 0.55; i += L * 0.18) for (const side of [-1, 1]) { g.beginPath(); g.arc(i, side * (Wd + 4 + since * 16), 2.6 + since * 7, 0, 7); g.fill(); }
      }
    }
    if (t === 'tradecog') {
      g.fillStyle = '#a07a50'; g.strokeStyle = '#5a3d22'; g.lineWidth = 0.7;
      for (const [cx, cy] of [[-2, -3], [4, 2], [9, -2]]) { g.fillRect(cx * big, cy, 5, 4.5); g.strokeRect(cx * big, cy, 5, 4.5); }
      g.fillStyle = '#6d4c30'; g.beginPath(); g.ellipse(-5 * big, 3, 2.6, 2.6, 0, 0, 7); g.fill();
      if (e.carry > 0) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(4 * big + 2.5, 4.3, 2.2, 0, 7); g.fill(); }
    }
    if (t === 'galleon') {
      for (const i of [-3, 3, 9]) { g.fillStyle = col; g.beginPath(); g.arc(i * big, -Wd * 0.45, 1.6, 0, 7); g.arc(i * big, Wd * 0.45, 1.6, 0, 7); g.fill(); g.fillStyle = '#e9bf98'; g.beginPath(); g.arc(i * big + 0.6, -Wd * 0.45, 0.9, 0, 7); g.arc(i * big + 0.6, Wd * 0.45, 0.9, 0, 7); g.fill(); }
    }
    if (t === 'transport') {
      // rampa en la proa y la gente a bordo
      g.fillStyle = '#6f4e2c'; g.fillRect(L * 0.72, -3, L * 0.32, 6); g.strokeStyle = '#3e2a16'; g.lineWidth = 0.7; g.strokeRect(L * 0.72, -3, L * 0.32, 6);
      const n = e.cargo?.length ?? 0;
      for (let k = 0; k < Math.min(n, 10); k++) {
        const px = (-L * 0.45 + (k % 5) * L * 0.24), py = (k < 5 ? -1 : 1) * Wd * 0.38;
        g.fillStyle = shade(col, -0.2); g.beginPath(); g.arc(px, py, 2.2, 0, 7); g.fill();
        g.fillStyle = '#e9bf98'; g.beginPath(); g.arc(px + 0.7, py, 1.2, 0, 7); g.fill();
      }
    }
    if (t === 'fishship') {
      g.strokeStyle = 'rgba(235,235,225,0.7)'; g.lineWidth = 0.6;
      g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(-L * 0.9, -2 + k * 1.5); g.lineTo(-L * 1.6, -5 + k * 3); } g.stroke();
      g.fillStyle = 'rgba(235,235,225,0.4)'; g.beginPath(); g.arc(-L * 1.6, 0, 4, 0, 7); g.fill();
    }
    g.restore();
    // mástiles y velas (siempre verticales en pantalla)
    const masts = cg ? [-0.5, 0.05, 0.5] : t === 'galleon' ? [-0.35, 0.3] : t === 'transport' ? [-0.15] : t === 'fishship' ? [0.1] : [0];
    const fx = Math.cos(e.facing), fy = Math.sin(e.facing);
    const H = 24 * Math.min(1.35, big);
    for (const m of masts) {
      const mx = x + fx * m * L, my = y + fy * m * L;
      g.strokeStyle = '#3e2a1e'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(mx, my); g.lineTo(mx, my - H - 3); g.stroke();
      // jarcias
      g.strokeStyle = 'rgba(40,28,18,.55)'; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(mx, my - H - 2); g.lineTo(x + fx * L, y + fy * L); g.moveTo(mx, my - H - 2); g.lineTo(x - fx * L * 0.9, y - fy * L * 0.9); g.stroke();
      const billow = Math.sin(time * 2.6 + e.id + m) * 1.6;
      const sw2 = 8.5 * Math.min(1.4, big), top = my - H, bot = my - H * 0.32;
      if (t === 'fishship') {
        // vela latina triangular
        g.fillStyle = '#efe6d2';
        g.beginPath(); g.moveTo(mx, top); g.quadraticCurveTo(mx + 9 + billow, (top + bot) / 2, mx + 1, bot); g.lineTo(mx - 9, bot - 1); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(80,60,40,.5)'; g.lineWidth = 0.7; g.stroke();
      } else {
        // verga y vela cuadrada con costuras y sombra
        g.strokeStyle = '#3e2a1e'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(mx - sw2 - 1.5, top); g.lineTo(mx + sw2 + 1.5, top); g.stroke();
        const sailCol = t === 'fireship' ? '#4a3428' : cg ? '#e4d6b0' : '#f6efdd';
        const sg = g.createLinearGradient(mx - sw2, 0, mx + sw2, 0);
        sg.addColorStop(0, shade(sailCol, -0.18)); sg.addColorStop(0.45, sailCol); sg.addColorStop(1, shade(sailCol, -0.25));
        g.fillStyle = sg;
        g.beginPath(); g.moveTo(mx - sw2, top + 1);
        g.quadraticCurveTo(mx - sw2 - 2 + billow * 0.4, (top + bot) / 2, mx - sw2 + 1, bot);
        g.quadraticCurveTo(mx + billow, bot + 3, mx + sw2 - 1, bot);
        g.quadraticCurveTo(mx + sw2 + 2 + billow * 0.4, (top + bot) / 2, mx + sw2, top + 1);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(70,52,34,.45)'; g.lineWidth = 0.7; g.stroke();
        g.save(); g.clip();
        g.strokeStyle = 'rgba(90,70,50,.22)'; g.lineWidth = 0.6; g.beginPath();
        for (let xx = mx - sw2 + 3.5; xx < mx + sw2; xx += 3.5) { g.moveTo(xx, top); g.lineTo(xx + billow * 0.3, bot + 3); } g.stroke();
        // emblema: franja o cruz con el color del jugador
        g.fillStyle = col; g.globalAlpha = 0.9;
        if (cg) { g.fillRect(mx - 1.4, top, 2.8, bot - top + 3); g.fillRect(mx - sw2, (top + bot) / 2 - 1.4, sw2 * 2, 2.8); }
        else g.fillRect(mx - sw2, (top + bot) / 2 - 1.5, sw2 * 2, 3);
        g.globalAlpha = 1;
        g.restore();
      }
      // banderín en la punta, flameando
      const wv = Math.sin(time * 6 + e.id) * 1.5;
      g.fillStyle = col; g.beginPath(); g.moveTo(mx, my - H - 3); g.quadraticCurveTo(mx + 5, my - H - 4 + wv, mx + 9, my - H - 1.5 + wv); g.lineTo(mx, my - H); g.closePath(); g.fill();
    }
    if (t === 'fireship') {
      for (let i = 0; i < 4; i++) {
        const fl = Math.sin(time * 9 + i * 2 + e.id) * 2;
        g.fillStyle = i % 2 ? 'rgba(255,170,40,0.9)' : 'rgba(255,90,20,0.85)';
        g.beginPath(); g.arc(x + fx * L * 0.85 + fl, y + fy * L * 0.85 - 3 - i * 2.4, 3.4 - i * 0.6, 0, 7); g.fill();
      }
      g.fillStyle = 'rgba(80,80,80,.35)'; g.beginPath(); g.arc(x + fx * L * 0.8 + Math.sin(time * 2) * 2, y + fy * L * 0.8 - 14, 4, 0, 7); g.fill();
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
        const p = f.proj ?? 'arrow';
        const arc = p === 'stone' ? 40 : p === 'ball' ? 4 : p === 'fire' ? 0 : 18;
        const px = f.x + (f.x2! - f.x) * k, py = f.y + (f.y2! - f.y) * k - Math.sin(k * Math.PI) * arc;
        if (p === 'fire') {
          for (let i = 0; i < 3; i++) {
            const kk = Math.max(0, k - i * 0.12);
            g.fillStyle = `rgba(255,${120 + i * 50},30,${0.8 - i * 0.2})`;
            g.beginPath(); g.arc(f.x + (f.x2! - f.x) * kk, f.y + (f.y2! - f.y) * kk, 4 - i, 0, 7); g.fill();
          }
        } else if (p === 'stone' || p === 'ball') {
          g.fillStyle = p === 'stone' ? '#6e6a66' : '#1f1f1f';
          g.beginPath(); g.arc(px, py, p === 'stone' ? 4 : 2.5, 0, 7); g.fill();
          if (p === 'ball' && k < 0.25) { g.fillStyle = `rgba(255,200,80,${0.9 - k * 3})`; g.beginPath(); g.arc(f.x, f.y - 4, 5, 0, 7); g.fill(); g.fillStyle = `rgba(200,200,200,${0.6 - k * 2})`; g.beginPath(); g.arc(f.x, f.y - 8, 7, 0, 7); g.fill(); }
        } else if (p === 'axe') {
          g.save(); g.translate(px, py); g.rotate(time * 20);
          g.fillStyle = '#cfd8dc'; g.fillRect(-3, -1.5, 6, 3); g.fillStyle = '#6d4c41'; g.fillRect(-1, -4, 2, 8);
          g.restore();
        } else {
          const ang = Math.atan2(f.y2! - f.y - Math.cos(k * Math.PI) * arc, f.x2! - f.x);
          g.strokeStyle = p === 'bolt' ? '#4a3a2a' : '#2b1d14'; g.lineWidth = p === 'bolt' ? 1.8 : 1.6;
          const len = p === 'bolt' ? 4 : 6;
          g.beginPath(); g.moveTo(px - Math.cos(ang) * len, py - Math.sin(ang) * len); g.lineTo(px + Math.cos(ang) * 4, py + Math.sin(ang) * 4); g.stroke();
        }
      } else if (f.kind === 'hit') {
        g.fillStyle = `rgba(255,240,200,${0.7 * (1 - k)})`;
        g.beginPath(); g.arc(f.x, f.y, 4 + k * 6, 0, 7); g.fill();
      } else if (f.kind === 'blast') {
        g.fillStyle = `rgba(150,120,80,${0.5 * (1 - k)})`;
        g.beginPath(); g.arc(f.x, f.y, (f.r ?? 20) * (0.5 + k), 0, 7); g.fill();
      } else if (f.kind === 'death') {
        g.fillStyle = `rgba(120,100,80,${0.6 * (1 - k)})`;
        g.beginPath(); g.arc(f.x, f.y, 8 + k * 22, 0, 7); g.fill();
      } else if (f.kind === 'sink') {
        g.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(f.x, f.y, 6 + k * 24, 3 + k * 12, 0, 0, 7); g.stroke();
        g.fillStyle = `rgba(90,60,30,${0.8 * (1 - k)})`; g.fillRect(f.x - 8 * (1 - k), f.y - 4 + k * 6, 16 * (1 - k), 4);
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
      if (e.cat === 'unit' && w.isEnemy(me, e.owner) && !this.exOf(pl.visible)[Math.floor(e.y / TILE) * w.w + Math.floor(e.x / TILE)]) continue;
      if (e.cat !== 'unit' && !this.exOf(pl.explored)[e.ty * w.w + e.tx]) continue;
      if (e.cat === 'node') g.fillStyle = e.type === 'tree' ? '#1f4d22' : e.type === 'goldmine' ? '#f5c518' : e.type === 'berries' ? '#d6336c' : '#cfd8dc';
      else g.fillStyle = w.players[e.owner].color;
      if (e.cat === 'unit') g.fillRect(e.x / TILE * sx - 1, e.y / TILE * sy - 1, 2.5, 2.5);
      else g.fillRect(e.tx * sx, e.ty * sy, Math.max(2, e.fw * sx), Math.max(2, e.fh * sy));
    }
    g.fillStyle = '#05070a';
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (!this.exOf(pl.explored)[y * w.w + x]) g.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
    g.strokeStyle = '#fff'; g.lineWidth = 1;
    g.strokeRect(cam.x / TILE * sx, cam.y / TILE * sy, vw / cam.zoom / TILE * sx, vh / cam.zoom / TILE * sy);
  }
}
