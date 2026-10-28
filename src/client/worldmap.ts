// Mapa antiguo de la campaña (estilo pergamino): costas simplificadas y los lugares de cada escenario.
import type { Campaign } from '../sim/campaigns.js';

type P = [number, number]; // [longitud, latitud]

// Costas muy simplificadas (longitud, latitud)
const LANDS: P[][] = [
  // Eurasia
  [[-9, 37], [-6, 36], [-2, 36.7], [0, 38.5], [3, 42.5], [5, 43.3], [8, 44], [10, 44], [12.5, 41.8], [15.6, 38], [16.5, 39.5], [18.5, 40.2], [16, 41.5], [13.5, 43.6], [12.3, 45.3], [13.7, 45.6], [15, 44.5], [17.5, 43], [19.5, 41.8], [20, 39.6], [21, 38], [22.5, 36.5], [23.5, 38], [22.9, 40.6], [26, 40.8], [26.2, 40], [27, 38.5], [27.5, 37], [29, 36.5], [32, 36.1], [36, 36.5], [35.5, 33.5], [34.5, 31.5], [32.5, 30], [34.9, 29.5], [39, 22], [43, 13], [52, 16], [56, 22], [56.5, 26.5], [50, 29.5], [51.5, 27.9], [56.5, 27], [61, 25], [67, 24.8], [72.8, 21], [73, 18], [76, 10], [77.5, 8], [80, 13], [80.3, 15.5], [87, 21.5], [91.5, 22.5], [94, 16], [98, 16], [98.3, 8], [100.4, 3.8], [103.5, 1.4], [103, 5], [100.5, 13.5], [102.5, 12], [104.8, 8.8], [106.8, 10.5], [109.2, 12], [108, 16], [106, 19], [108, 21.5], [110, 21], [113, 22.3], [117, 23.5], [120, 26.5], [122, 30], [121, 32], [120, 34.5], [119, 35.2], [122.5, 37.4], [118, 38], [117.5, 39], [121, 40.8], [121.3, 39], [124.3, 40], [126, 37.5], [126.5, 34.5], [129.3, 35.2], [129.5, 37.5], [128, 39], [130, 42.5], [133, 42.8], [135.5, 43.9], [140, 48.5], [141, 52], [137, 54], [143, 59.3], [151, 59.6], [160, 61.5], [160, 76], [130, 73], [110, 76], [80, 73], [70, 72], [60, 70], [50, 68], [44, 68.5], [40, 66], [35, 69], [30, 70], [25, 71], [17, 69], [13, 67.5], [10, 64], [5, 62], [5, 60], [6, 58.2], [8, 58], [10.6, 59.5], [11.5, 58.2], [12.8, 56], [14.5, 56.2], [16.5, 57.5], [18, 59.3], [21, 63], [25.4, 65], [22.5, 60.2], [25, 60.2], [30, 59.9], [28, 59.4], [24, 59.4], [23.5, 58], [21.6, 57.4], [21, 56.5], [20.5, 54.9], [18.6, 54.4], [14.2, 53.9], [12, 54.2], [10.9, 54.4], [10, 55], [10.5, 57.5], [9.5, 57.6], [8.1, 56.5], [8.6, 55], [8.6, 53.9], [7, 53.5], [4.8, 52.9], [3.5, 51.5], [1.6, 50.9], [0, 49.4], [-1.6, 49.6], [-1.5, 48.6], [-4.7, 48.4], [-2.2, 47.2], [-1.2, 46.2], [-1.5, 43.5], [-3.8, 43.4], [-8, 43.7], [-9.2, 43], [-8.8, 41], [-9.5, 38.7]],
  // África (norte)
  [[-17, 14.7], [-17, 21], [-13, 27.7], [-10, 29.5], [-9.8, 31.4], [-6.8, 34], [-5.9, 35.8], [-2, 35.1], [3, 36.8], [10, 37.3], [11, 35.5], [10.5, 34], [11.5, 33], [15, 32.4], [19.5, 30.5], [20, 32], [23, 32.6], [25, 31.6], [29.9, 31.2], [32.3, 31.2], [34.2, 31.3], [32.5, 29.9], [33.5, 27.5], [35.5, 23.5], [37.3, 19], [39, 15.5], [43, 12.5], [51, 11.8], [51, 5], [-15, 5]],
  // Gran Bretaña
  [[-5.7, 50.1], [-3, 50.6], [1.4, 51.1], [1.7, 52.6], [0, 53.5], [-0.5, 54.5], [-1.6, 55.6], [-1.8, 57.5], [-3.2, 58.6], [-5, 58.6], [-6, 57.5], [-5.6, 56], [-4.9, 55], [-3.2, 54.8], [-3, 53.4], [-4.6, 53.3], [-4.2, 52.3], [-5.2, 51.7], [-3.3, 51.4], [-4.2, 51.2]],
  // Irlanda
  [[-6, 52.2], [-6, 54], [-5.6, 55.2], [-7.3, 55.4], [-10, 54.2], [-9.5, 52.5], [-10.3, 51.8], [-8.2, 51.6]],
  // Islandia
  [[-22.5, 63.8], [-18, 63.4], [-14, 64.5], [-13.5, 65.5], [-15, 66.5], [-18, 66.2], [-22, 66.4], [-24, 65.5]],
  // Groenlandia
  [[-44, 60], [-42, 61], [-40, 64.5], [-37, 65.5], [-32, 68], [-25, 70], [-22, 73], [-20, 76], [-70, 76], [-58, 72], [-55, 70], [-53, 68], [-52, 66], [-50, 63], [-48, 61]],
  // América del Norte (costa noreste)
  [[-80, 30], [-80, 76], [-75, 64], [-70, 61], [-64.5, 60.3], [-61.5, 56.5], [-57, 52.5], [-55.6, 51.5], [-56, 49.5], [-52.8, 47.6], [-53.5, 46.6], [-59.3, 47.6], [-61, 46], [-64, 45.6], [-66, 44.5], [-70, 41.5], [-74, 40.5], [-76, 37], [-76, 35], [-80, 31]],
  // Japón
  [[130, 33.5], [130.5, 31.3], [131.6, 32], [132, 33.8], [135, 33.5], [136.8, 34.4], [138.8, 34.7], [140, 35], [140.9, 36.5], [141, 38.3], [142, 39.6], [141.4, 41.4], [140, 40.6], [139.8, 39], [139, 38], [137, 36.9], [136, 35.7], [133, 35.5], [131, 34.4]],
  [[140, 41.5], [141.5, 42.5], [143.3, 42], [145.5, 43.3], [144.5, 44], [141.8, 45.4], [141.3, 43.3]],
  // Sicilia y Cerdeña, Creta, Chipre
  [[12.4, 38], [15.6, 38.3], [15.1, 36.7]], [[8.4, 41], [9.8, 41], [9.6, 39], [8.4, 39]], [[23.5, 35.6], [26.3, 35.3], [24, 35]], [[32.3, 35], [34.6, 35.6], [33.5, 34.6]],
];
// Mares interiores (se pintan como agua encima de la tierra)
const SEAS: P[][] = [
  [[28, 41.2], [28.6, 43.4], [30.5, 46.5], [33.5, 44.5], [36.5, 45.3], [38, 47], [39.5, 47.3], [41.5, 41.6], [36, 41.7], [32, 41.9], [29, 41.2]],
  [[47, 45.5], [50, 46.5], [53, 45], [51, 43], [53, 41], [54, 37.5], [51, 36.7], [49, 38.3], [49.5, 40.5], [47.5, 43]],
];
const RIVERS: P[][] = [
  [[8.5, 47.6], [13, 48.5], [16.4, 48.2], [19, 47.5], [19, 45.5], [21, 44.8], [25, 43.8], [28, 44.5], [29.6, 45.2]], // Danubio
  [[4.5, 47.3], [3, 47.6], [1.9, 47.9], [0.7, 47.4], [-1.5, 47.2]], // Loira
  [[4.8, 46], [4.8, 44], [4.7, 43.4]], // Ródano
  [[-0.4, 42.9], [-0.9, 41.65], [0.8, 40.7]], // Ebro
  [[67, 40], [64.4, 39.8], [62, 41.5], [60, 43.5]], // Amu Daria
  [[110, 49.5], [114, 50], [118, 51]], // Onón
  [[96, 35], [104, 36], [106, 38.5], [111, 40.6], [111, 36], [114, 35], [119, 37.7]], // Río Amarillo
];

export function drawWorldMap(cv: HTMLCanvasElement, camp: Campaign, sel: number, isDone: (id: string) => boolean, isOpen: (i: number) => boolean, time = 0) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 360, H = cv.clientHeight || 240;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // encuadre: alrededor de los lugares de la campaña
  const pts = camp.scenarios.map((s) => s.at);
  let lo0 = Math.min(...pts.map((p) => p[0])), lo1 = Math.max(...pts.map((p) => p[0]));
  let la0 = Math.min(...pts.map((p) => p[1])), la1 = Math.max(...pts.map((p) => p[1]));
  const kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  let cw = Math.max(16, (lo1 - lo0) * 1.5 + 8), ch = Math.max(10, (la1 - la0) * 1.5 + 6);
  // conservar proporción del lienzo
  if ((cw * kx) / ch > W / H) ch = (cw * kx * H) / W; else cw = (ch * W) / (H * kx);
  const clo = (lo0 + lo1) / 2, cla = (la0 + la1) / 2;
  lo0 = clo - cw / 2; lo1 = clo + cw / 2; la0 = cla - ch / 2; la1 = cla + ch / 2;
  const X = (lon: number) => ((lon - lo0) / (lo1 - lo0)) * W;
  const Y = (lat: number) => ((la1 - lat) / (la1 - la0)) * H;
  const poly = (p: P[]) => { g.beginPath(); p.forEach(([lo, la], i) => (i ? g.lineTo(X(lo), Y(la)) : g.moveTo(X(lo), Y(la)))); g.closePath(); };

  // mar
  const sea = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.75);
  sea.addColorStop(0, '#b7c7b4'); sea.addColorStop(1, '#8fa595');
  g.fillStyle = sea; g.fillRect(0, 0, W, H);
  // líneas de oleaje
  g.strokeStyle = 'rgba(60,80,70,0.18)'; g.lineWidth = 1;
  for (let y = 8; y < H; y += 14) for (let x = (y * 7) % 40; x < W; x += 40) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 5, y - 3, x + 10, y); g.stroke(); }
  // tierra con sombra de costa
  for (const land of LANDS) {
    poly(land);
    g.save(); g.shadowColor = 'rgba(70,50,20,0.55)'; g.shadowBlur = 6; g.fillStyle = '#e6d5a8'; g.fill(); g.restore();
    g.strokeStyle = '#7a5c34'; g.lineWidth = 1.2; g.stroke();
  }
  for (const s of SEAS) { poly(s); g.fillStyle = '#a3b8a6'; g.fill(); g.strokeStyle = '#7a5c34'; g.lineWidth = 1; g.stroke(); }
  g.strokeStyle = 'rgba(70,110,120,0.7)'; g.lineWidth = 1.4;
  for (const r of RIVERS) { g.beginPath(); r.forEach(([lo, la], i) => (i ? g.lineTo(X(lo), Y(la)) : g.moveTo(X(lo), Y(la)))); g.stroke(); }
  // textura de pergamino
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = 'rgba(90,60,20,0.06)';
  for (let i = 0; i < 420; i++) g.fillRect(rnd() * W, rnd() * H, 2, 2);
  const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
  vig.addColorStop(0, 'rgba(60,35,10,0)'); vig.addColorStop(1, 'rgba(60,35,10,0.45)');
  g.fillStyle = vig; g.fillRect(0, 0, W, H);

  // ruta de la campaña
  g.setLineDash([5, 5]); g.strokeStyle = '#8b1e1e'; g.lineWidth = 2;
  g.beginPath(); pts.forEach(([lo, la], i) => (i ? g.lineTo(X(lo), Y(la)) : g.moveTo(X(lo), Y(la)))); g.stroke();
  g.setLineDash([]);
  g.textAlign = 'center';
  // lugares (separar marcadores encimados y ubicar etiquetas sin pisarse)
  g.textAlign = 'center';
  const pos: P[] = [];
  camp.scenarios.forEach((s) => {
    let x = X(s.at[0]), y = Y(s.at[1]);
    for (let k = 0; k < 6 && pos.some(([px, py]) => Math.hypot(px - x, py - y) < 22); k++) { x += 16; y -= 8; }
    pos.push([x, y]);
  });
  camp.scenarios.forEach((s, i) => {
    const [x, y] = pos[i];
    const done = isDone(s.id), open = isOpen(i);
    if (i === sel) {
      g.strokeStyle = `rgba(212,160,23,${0.55 + Math.sin(time * 4) * 0.35})`; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 15, 0, 7); g.stroke();
    }
    g.fillStyle = done ? '#2f6b2f' : open ? '#8b1e1e' : '#7d7466';
    g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill();
    g.strokeStyle = '#f3e3b5'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#fff6dc'; g.font = 'bold 11px Inter, sans-serif';
    g.fillText(done ? '✓' : String(i + 1), x, y + 4);
  });
  g.font = 'italic 600 11px Cinzel, Georgia, serif';
  const rects: number[][] = pos.map(([x, y]) => [x - 11, y - 11, 22, 22]);
  const hit = (r: number[]) => rects.some((o) => r[0] < o[0] + o[2] && r[0] + r[2] > o[0] && r[1] < o[1] + o[3] && r[1] + r[3] > o[1]);
  camp.scenarios.forEach((s, i) => {
    const [x, y] = pos[i];
    const tw = g.measureText(s.place).width + 6;
    const cands = [[x - tw / 2, y + 13], [x - tw / 2, y - 28], [x + 14, y - 7], [x - 14 - tw, y - 7], [x - tw / 2, y + 30]];
    const c = cands.find(([cx, cy]) => !hit([cx, cy, tw, 14]) && cx > 6 && cx + tw < W - 6 && cy > 6 && cy + 14 < H - 6) ?? cands[0];
    rects.push([c[0], c[1], tw, 14]);
    g.fillStyle = 'rgba(243,227,181,0.8)'; g.fillRect(c[0], c[1], tw, 14);
    g.fillStyle = '#3b2610'; g.fillText(s.place, c[0] + tw / 2, c[1] + 11);
  });
  // ruta encima del mar, debajo de nada más: ya dibujada
  // rosa de los vientos
  const rx = W - 26, ry = H - 28;
  g.fillStyle = '#7a5c34';
  for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 - Math.PI / 2; g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + Math.cos(a - 0.35) * 6, ry + Math.sin(a - 0.35) * 6); g.lineTo(rx + Math.cos(a) * 18, ry + Math.sin(a) * 18); g.lineTo(rx + Math.cos(a + 0.35) * 6, ry + Math.sin(a + 0.35) * 6); g.closePath(); g.fill(); }
  g.font = 'bold 10px Cinzel, Georgia, serif'; g.fillText('N', rx, ry - 20);
  // marco
  g.strokeStyle = '#5a3d1c'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
  g.strokeStyle = '#c9a86a'; g.lineWidth = 1; g.strokeRect(7, 7, W - 14, H - 14);
}
