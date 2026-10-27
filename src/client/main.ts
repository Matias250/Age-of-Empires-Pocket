// Punto de entrada: menú principal y arranque de partidas.
import { DIFF_NAME, Difficulty } from '../sim/ai.js';
import { BIOMES, Biome, MAPS, MapType, MatchConfig, Mode, PLAYER_COLORS } from '../sim/match.js';
import { Game } from './game.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const menu = document.getElementById('menu')!;
let game: Game | null = null;
(window as unknown as { imperios: () => Game | null }).imperios = () => game; // para depurar desde la consola
const store = {
  get(k: string, d: string): string { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
let difficulty = store.get('dif', 'normal') as Difficulty;
let color = Number(store.get('color', '0'));
let mapSel = store.get('map', 'random') as MapType | 'random';
let biomeSel = store.get('biome', 'random') as Biome | 'random';

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
      <button class="mode" data-m="skirmish"><i>⚔️</i><div><b>Escaramuza contra la IA</b><small>1 contra 1 · elegí mapa, bioma y color</small></div></button>
      <button class="mode" data-m="coop"><i>🤝</i><div><b>Cooperativo 2 contra 2</b><small>Vos + aliado IA contra 2 IA</small></div></button>
      <button class="mode soon" data-m="ranked" disabled><i>🏆</i><div><b>Competitivo online</b><small>Próximamente · partidas clasificatorias</small></div></button>
    </div>
    <div class="diff">
      <span>Tu color</span>
      <div class="swatches">${PLAYER_COLORS.map((_, i) => swatch(i)).join('')}</div>
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
    const c = t.closest('[data-c]')?.getAttribute('data-c');
    if (c) { color = Number(c); store.set('color', c); renderMenu(); return; }
    const d = t.closest('[data-d]')?.getAttribute('data-d') as Difficulty | null;
    if (d) { difficulty = d; store.set('dif', d); renderMenu(); return; }
    const m = t.closest('[data-m]')?.getAttribute('data-m');
    if (m === 'howto') { showHowTo(); return; }
    if (m === 'tutorial') start({ mode: 'tutorial', difficulty, color, biome: biomeSel, seed: Math.floor(Math.random() * 99999) });
    if (m === 'skirmish' || m === 'coop') showSetup(m);
  };
}

const swatch = (i: number) => `<button class="swatch ${i === color ? 'on' : ''}" data-c="${i}" style="--c:${PLAYER_COLORS[i].hex}" aria-label="${PLAYER_COLORS[i].name}"></button>`;

function showSetup(mode: Mode) {
  const mapsHtml = (['random', ...Object.keys(MAPS)] as (MapType | 'random')[]).map((k) =>
    `<button class="opt ${k === mapSel ? 'on' : ''}" data-map="${k}"><b>${k === 'random' ? '🎲 Al azar' : MAPS[k as MapType].name}</b><small>${k === 'random' ? 'Sorpresa en cada partida' : MAPS[k as MapType].desc}</small></button>`).join('');
  const biomesHtml = (['random', ...Object.keys(BIOMES)] as (Biome | 'random')[]).map((k) =>
    `<button class="chip ${k === biomeSel ? 'on' : ''}" data-biome="${k}">${k === 'random' ? '🎲 Al azar' : BIOME_ICON[k as Biome] + ' ' + BIOMES[k as Biome]}</button>`).join('');
  menu.innerHTML = `<div class="menu-inner setup">
    <h2>${mode === 'coop' ? '🤝 Cooperativo 2 contra 2' : '⚔️ Escaramuza contra la IA'}</h2>
    <section><h3>Color de tu ejército</h3><div class="swatches">${PLAYER_COLORS.map((_, i) => swatch(i)).join('')}</div>
      <p class="dim">Elegiste: <b style="color:${PLAYER_COLORS[color].hex}">${PLAYER_COLORS[color].name}</b></p></section>
    <section><h3>Mapa</h3><div class="opts">${mapsHtml}</div></section>
    <section><h3>Bioma</h3><div class="chips">${biomesHtml}</div></section>
    <section><h3>Dificultad de la IA</h3><div class="seg">${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<button data-d="${d}" class="${d === difficulty ? 'on' : ''}">${DIFF_NAME[d]}</button>`).join('')}</div></section>
    <div class="setup-actions"><button class="big ghost" data-back>Volver</button><button class="big" data-go>¡A jugar!</button></div>
  </div>`;
  menu.onclick = (e) => {
    const t = e.target as HTMLElement;
    const c = t.closest('[data-c]')?.getAttribute('data-c');
    if (c) { color = Number(c); store.set('color', c); return showSetup(mode); }
    const mp = t.closest('[data-map]')?.getAttribute('data-map');
    if (mp) { mapSel = mp as MapType; store.set('map', mp); return showSetup(mode); }
    const bi = t.closest('[data-biome]')?.getAttribute('data-biome');
    if (bi) { biomeSel = bi as Biome; store.set('biome', bi); return showSetup(mode); }
    const d = t.closest('[data-d]')?.getAttribute('data-d');
    if (d) { difficulty = d as Difficulty; store.set('dif', d); return showSetup(mode); }
    if (t.closest('[data-back]')) return renderMenu();
    if (t.closest('[data-go]')) start({ mode, difficulty, color, map: mapSel, biome: biomeSel, seed: Math.floor(Math.random() * 99999) });
  };
}

const BIOME_ICON: Record<Biome, string> = { templado: '🌳', desierto: '🏜️', nieve: '❄️', tropical: '🌴', otono: '🍂' };

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
if (q.get('demo')) start({ mode: q.get('demo') as Mode, difficulty: (q.get('dif') as Difficulty) || 'normal', seed: Number(q.get('seed') || 1),
  map: (q.get('map') as MapType) || 'continental', biome: (q.get('biome') as Biome) || 'templado', color: Number(q.get('color') || 0) });
else renderMenu();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
