// A* sobre la grilla de casillas, 8 direcciones sin cortar esquinas.
// Si no llega a la meta devuelve el camino al nodo más cercano encontrado.

export interface Grid { w: number; h: number; solid: Uint8Array }

class Heap {
  private items: number[] = [];
  private pri: number[] = [];
  get size() { return this.items.length; }
  push(item: number, p: number) {
    const a = this.items, b = this.pri;
    a.push(item); b.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (b[par] <= b[i]) break;
      [a[par], a[i]] = [a[i], a[par]];
      [b[par], b[i]] = [b[i], b[par]];
      i = par;
    }
  }
  pop(): number {
    const a = this.items, b = this.pri;
    const top = a[0];
    const lastI = a.pop()!, lastP = b.pop()!;
    if (a.length > 0) {
      a[0] = lastI; b[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [b[m], b[i]] = [b[i], b[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

// Buffers reutilizables
let gBuf = new Float32Array(0);
let fromBuf = new Int32Array(0);
let stamp = new Uint32Array(0);
let closedStamp = new Uint32Array(0);
let curStamp = 1;
let lastFound = false;
/** ¿La última búsqueda llegó a la meta? */
export function pathFound(): boolean { return lastFound; }

export function findPath(
  grid: Grid, sx: number, sy: number,
  isGoal: (x: number, y: number) => boolean,
  hx: number, hy: number, maxNodes = 9000,
): { x: number; y: number }[] {
  const { w, h, solid } = grid;
  const n = w * h;
  if (gBuf.length !== n) {
    gBuf = new Float32Array(n); fromBuf = new Int32Array(n);
    stamp = new Uint32Array(n); closedStamp = new Uint32Array(n);
  }
  curStamp++;
  const start = sy * w + sx;
  const heur = (x: number, y: number) => {
    const dx = Math.abs(x - hx), dy = Math.abs(y - hy);
    return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
  };
  const open = new Heap();
  gBuf[start] = 0; fromBuf[start] = -1; stamp[start] = curStamp;
  open.push(start, heur(sx, sy));
  let best = start, bestH = heur(sx, sy), found = -1, expanded = 0;
  while (open.size > 0 && expanded < maxNodes) {
    const cur = open.pop();
    if (closedStamp[cur] === curStamp) continue;
    closedStamp[cur] = curStamp;
    expanded++;
    const cx = cur % w, cy = (cur / w) | 0;
    if (isGoal(cx, cy)) { found = cur; break; }
    const hc = heur(cx, cy);
    if (hc < bestH) { bestH = hc; best = cur; }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (solid[ni]) continue;
      if (dx !== 0 && dy !== 0 && (solid[cy * w + nx] || solid[ny * w + cx])) continue;
      if (closedStamp[ni] === curStamp) continue;
      const g = gBuf[cur] + cost;
      if (stamp[ni] !== curStamp || g < gBuf[ni]) {
        stamp[ni] = curStamp; gBuf[ni] = g; fromBuf[ni] = cur;
        open.push(ni, g + heur(nx, ny) * 1.001);
      }
    }
  }
  // sin meta pero con el área alcanzable agotada => realmente inalcanzable
  lastFound = found >= 0 || (open.size > 0 && expanded >= maxNodes);
  let end = found >= 0 ? found : best;
  const out: { x: number; y: number }[] = [];
  while (end !== start && end >= 0) {
    out.push({ x: end % w, y: (end / w) | 0 });
    end = fromBuf[end];
  }
  out.reverse();
  return out;
}

/** ¿Línea recta libre entre dos puntos en px? (muestreo cada 8px) */
export function lineClear(grid: Grid, tile: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / 8);
  let px = Math.floor(x0 / tile), py = Math.floor(y0 / tile);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tx = Math.floor((x0 + (x1 - x0) * t) / tile), ty = Math.floor((y0 + (y1 - y0) * t) / tile);
    if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return false;
    if (grid.solid[ty * grid.w + tx]) return false;
    // cruce en diagonal por una esquina: las dos casillas de al lado tienen que estar libres
    if (tx !== px && ty !== py && (grid.solid[py * grid.w + tx] || grid.solid[ty * grid.w + px])) return false;
    px = tx; py = ty;
  }
  return true;
}
