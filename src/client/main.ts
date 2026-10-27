// Punto de entrada: menú principal y arranque de partidas.
import { DIFF_NAME, Difficulty } from '../sim/ai.js';
import { MatchConfig, Mode } from '../sim/match.js';
import { Game } from './game.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const menu = document.getElementById('menu')!;
let game: Game | null = null;
(window as unknown as { imperios: () => Game | null }).imperios = () => game; // para depurar desde la consola
let difficulty: Difficulty = (localStorage.getItem('dif') as Difficulty) || 'normal';

function renderMenu() {
  menu.hidden = false;
  menu.innerHTML = `
  <div class="menu-inner">
    <div class="logo">
      <div class="crest">⚜️</div>
      <h1>Imperios <span>Rápidos</span></h1>
      <p>Estrategia en tiempo real · partidas de 10 a 15 minutos</p>
    </div>
    <div class="modes">
      <button class="mode" data-m="tutorial"><i>📜</i><div><b>Historia: La Crónica de Varnia</b><small>Tutorial guiado · 10 minutos</small></div></button>
      <button class="mode" data-m="skirmish"><i>⚔️</i><div><b>Escaramuza contra la IA</b><small>1 contra 1 · mapa chico</small></div></button>
      <button class="mode" data-m="coop"><i>🤝</i><div><b>Cooperativo 2 contra 2</b><small>Vos + aliado IA contra 2 IA</small></div></button>
      <button class="mode soon" data-m="ranked" disabled><i>🏆</i><div><b>Competitivo online</b><small>Próximamente · partidas clasificatorias</small></div></button>
    </div>
    <div class="diff">
      <span>Dificultad de la IA</span>
      <div class="seg">${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<button data-d="${d}" class="${d === difficulty ? 'on' : ''}">${DIFF_NAME[d]}</button>`).join('')}</div>
    </div>
    <button class="howto" data-m="howto">¿Cómo se juega?</button>
    <div class="rotate">📱↻ Girá el teléfono para jugar mejor</div>
  </div>`;
  menu.onclick = (e) => {
    const t = e.target as HTMLElement;
    const d = t.closest('[data-d]')?.getAttribute('data-d') as Difficulty | null;
    if (d) { difficulty = d; localStorage.setItem('dif', d); renderMenu(); return; }
    const m = t.closest('[data-m]')?.getAttribute('data-m');
    if (m === 'howto') { showHowTo(); return; }
    if (m === 'tutorial' || m === 'skirmish' || m === 'coop') start({ mode: m as Mode, difficulty, seed: Math.floor(Math.random() * 99999) });
  };
}

function showHowTo() {
  menu.innerHTML = `<div class="menu-inner howto-page">
    <h2>Cómo se juega</h2>
    <ul>
      <li><b>Objetivo:</b> destruí el 🏰 Centro Urbano enemigo y protegé el tuyo.</li>
      <li><b>Tocar</b> una unidad la selecciona. <b>Doble toque</b> selecciona todas las de ese tipo en pantalla.</li>
      <li>Con unidades elegidas, <b>tocá</b> el suelo para moverlas, un recurso para juntarlo o un enemigo para atacarlo.</li>
      <li><b>Arrastrá</b> con un dedo para mover la cámara y <b>pellizcá</b> para zoom. El botón ▢ activa selección por área.</li>
      <li>💤 busca aldeanos sin trabajo y 🛡️ selecciona todo tu ejército.</li>
      <li>Hacé 🏠 casas para crecer, y pasá a la 👑 Era de los Reinos para desbloquear jinetes, arietes y torres.</li>
      <li><b>Piedra, papel o tijera:</b> lanceros 🔱 &gt; jinetes 🐎 &gt; arqueros 🏹 &gt; infantería 🗡️. Los arietes 🐏 rompen edificios.</li>
      <li>En computadora: clic izquierdo selecciona, clic derecho ordena, arrastrar selecciona por área, flechas mueven la cámara.</li>
    </ul>
    <button class="big" data-back>Volver</button>
  </div>`;
  menu.onclick = (e) => { if ((e.target as HTMLElement).hasAttribute('data-back')) renderMenu(); };
}

function start(cfg: MatchConfig) {
  menu.hidden = true;
  tryFullscreen();
  game = new Game(canvas, cfg, () => { game = null; renderMenu(); });
}

async function tryFullscreen() {
  try {
    if (matchMedia('(pointer:coarse)').matches && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
      await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    }
  } catch { /* algunos navegadores no lo permiten */ }
}

window.addEventListener('start-match', (e) => start((e as CustomEvent<MatchConfig>).detail));

// Modo de prueba: ?demo=coop&dif=hard arranca directo
const q = new URLSearchParams(location.search);
if (q.get('demo')) start({ mode: q.get('demo') as Mode, difficulty: (q.get('dif') as Difficulty) || 'normal', seed: Number(q.get('seed') || 1) });
else renderMenu();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
