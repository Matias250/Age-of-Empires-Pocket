// Punto de entrada: menú principal y arranque de partidas.
import { DIFF_LIST, DIFF_NAME, Difficulty } from '../sim/ai.js';
import { BIOMES, Biome, createMatch, START_MODES, StartMode, MAP_SIZES, MapSize, MAPS, MapType, MatchConfig, Mode, PLAYER_COLORS, sizeForPlayers, SlotCfg } from '../sim/match.js';
import { TILE } from '../sim/data.js';
import { CIV_LIST, CIVS, CivId } from '../sim/civs.js';
import { UNITS } from '../sim/data.js';
import { saveSettings, settings, Settings } from './settings.js';
import { Game } from './game.js';
import { initI18n, lang, LANGS, setLang } from './i18n/index.js';
import { CAMPAIGNS, findScenario } from '../sim/campaigns.js';
import { campaignCount, storyDone, storyOpen } from './scenario.js';
import { drawWorldMap } from './worldmap.js';
import { ACHIEVEMENTS, achCount, achDone, achProgress, civUnlocked, unlockedCivs } from './achievements.js';

initI18n();
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
let slots: SlotCfg[] = loadSlots();
let sizeSel = (store.get('size', '') || sizeForPlayers(slots.length)) as MapSize;
if (!MAP_SIZES[sizeSel] || MAP_SIZES[sizeSel].players < slots.length) sizeSel = sizeForPlayers(slots.length);
const maxPlayers = () => MAP_SIZES[sizeSel].players;
let nextSeed = Math.floor(Math.random() * 99999); // la vista previa usa la misma semilla que la partida
let mapOpen = false;
let campDiff = store.get('difcamp', 'normal') as Difficulty;
let startSel = store.get('start', 'normal') as StartMode;
if (!START_MODES[startSel]) startSel = 'normal';
const previewCache = new Map<string, string>();

function loadSlots(): SlotCfg[] {
  try {
    const v = JSON.parse(store.get('slots', '')) as SlotCfg[];
    if (Array.isArray(v) && v.length >= 2 && v.length <= 8 && !v[0].ai) return v;
  } catch { /* sin datos guardados */ }
  return preset('1v1');
}
function saveSlots() { store.set('slots', JSON.stringify(slots)); }

function preset(kind: '1v1' | '2v2' | '4v4' | 'ffa', myCiv: CivId | 'random' = 'random'): SlotCfg[] {
  const cols = [color, ...[0, 1, 2, 3, 4, 5, 6, 7].filter((i) => i !== color)];
  const n = kind === '1v1' ? 2 : kind === '2v2' ? 4 : kind === '4v4' ? 8 : 4;
  return Array.from({ length: n }, (_, i) => ({
    ai: i > 0,
    civ: i === 0 ? myCiv : 'random',
    team: kind === 'ffa' ? 0 : kind === '1v1' ? i + 1 : i < n / 2 ? 1 : 2,
    color: cols[i],
    difficulty: kind === '2v2' && i === 1 ? 'normal' : difficulty,
  }));
}

function renderMenu() {
  menu.hidden = false;
  menu.innerHTML = `
  <div class="home">
    <button class="corner left" data-m="howto" aria-label="¿Cómo se juega?">❓</button>
    <button class="corner right" data-m="settings" aria-label="Configuración">⚙️</button>
    <div class="home-top">
      <div class="logo">
        <div class="crest">⚜️</div>
        <h1>Imperios <span>Rápidos</span></h1>
        <p>15 civilizaciones · 25 historias</p>
      </div>
      <div class="home-color"><span>Tu color</span><div class="swatches">${PLAYER_COLORS.map((_, i) => swatch(i)).join('')}</div></div>
    </div>
    <div class="home-main">
      <button class="hbig" data-m="stories"><i>🗺️</i><div><b>Historias</b></div></button>
      <button class="hbig" data-m="skirmish"><i>⚔️</i><div><b>Escaramuza</b><small>Contra la IA, hasta 8 jugadores</small></div></button>
      <div class="htiles">
        <button class="htile" data-m="tutorial"><i>📜</i><b>Tutorial</b></button>
        <button class="htile" data-m="logros"><i>🏅</i><b>Logros ${achCount()}/${ACHIEVEMENTS.length}</b></button>
        <button class="htile" data-m="civs"><i>🏛️</i><b>Civilizaciones</b></button>
        <button class="htile soon" disabled><i>🏆</i><b>Online</b><small>Pronto</small></button>
      </div>
    </div>
  </div>`;
  menu.onchange = null;
  menu.onclick = (e) => {
    const t = e.target as HTMLElement;
    const c = t.closest('[data-c]')?.getAttribute('data-c');
    if (c) { setMyColor(Number(c)); renderMenu(); return; }
    const m = t.closest('[data-m]')?.getAttribute('data-m');
    if (m === 'howto') { showHowTo(); return; }
    if (m === 'civs') { showCivs(); return; }
    if (m === 'logros') { showAchievements(); return; }
    if (m === 'stories') { showStories(); return; }
    if (m === 'settings') { showSettings(); return; }
    if (m === 'tutorial') start({ mode: 'tutorial', difficulty, color, biome: biomeSel, seed: Math.floor(Math.random() * 99999) });
    if (m === 'skirmish') showSetup();
  };
}

function setMyColor(c: number) {
  // si una IA tenía ese color, intercambiar
  const other = slots.find((s, i) => i > 0 && s.color === c);
  if (other) other.color = slots[0].color;
  color = c; slots[0].color = c;
  store.set('color', String(c)); saveSlots();
}

const swatch = (i: number) => `<button class="swatch ${i === color ? 'on' : ''}" data-c="${i}" style="--c:${PLAYER_COLORS[i].hex}" aria-label="${PLAYER_COLORS[i].name}"></button>`;

const civOptions = (sel: CivId | 'random', mine = false) => `<option value="random" ${sel === 'random' ? 'selected' : ''}>🎲 Al azar</option>` +
  CIV_LIST.map((c) => { const lk = mine && !civUnlocked(c); return `<option value="${c}" ${sel === c ? 'selected' : ''} ${lk ? 'disabled' : ''}>${CIVS[c].emblem} ${CIVS[c].name}${lk ? ` 🔒 ${CIVS[c].unlock} logros` : ''}</option>`; }).join('');
const teamOptions = (sel: number) => [0, 1, 2, 3, 4].map((t) => `<option value="${t}" ${sel === t ? 'selected' : ''}>${t ? 'Equipo ' + t : 'Sin equipo'}</option>`).join('');
const difOptions = (sel: Difficulty) => DIFF_LIST.map((d) => `<option value="${d}" ${sel === d ? 'selected' : ''}>${DIFF_NAME[d]}</option>`).join('');

function civCard(c: CivId | 'random'): string {
  if (c === 'random') return `<div class="civcard"><b>🎲 Civilización al azar</b><small>Te toca una de las que tengas desbloqueadas.</small></div>`;
  const d = CIVS[c];
  if (!civUnlocked(c)) return `<div class="civcard locked"><b>🔒 ${d.emblem} ${d.name}</b> <small>${d.region}</small>
    <p>Se desbloquea con <b>${d.unlock} logros</b> (tenés ${achCount()}). Unidad única: <b>${UNITS[d.unique].name}</b>.</p></div>`;
  return `<div class="civcard"><b>${d.emblem} ${d.name}</b> <small>${d.region}</small>
    <ul>${d.bonuses.map((x) => `<li>${x}</li>`).join('')}</ul>
    <p>Unidad única: <b>${UNITS[d.unique].name}</b> — ${UNITS[d.unique].desc.replace(/^Única? de los? [^.]+\. ?/, '')}</p></div>`;
}

/** Lugares para jugar: si tu civilización es al azar, sale de las desbloqueadas (fija por semilla, igual que la vista previa) */
function playSlots(): SlotCfg[] {
  const un = unlockedCivs();
  return slots.map((s, i) => ({ ...s, civ: i === 0 && s.civ === 'random' ? un[nextSeed % un.length] : i === 0 && !civUnlocked(s.civ as CivId) ? 'random' : s.civ }));
}

const LAND: Record<Biome, string> = { templado: '#5f8f3e', desierto: '#c9a86a', nieve: '#dfe7ee', tropical: '#4c9a42', otono: '#8f8a3e' };
/** Miniatura del mapa: genera la partida con la misma semilla y la dibuja en chiquito */
function mapPreview(map: MapType): string {
  const key = [map, sizeSel, nextSeed, biomeSel, JSON.stringify(slots)].join('|');
  const hit = previewCache.get(key);
  if (hit) return hit;
  const m = createMatch({ mode: 'skirmish', difficulty: 'easy', seed: nextSeed, map, biome: biomeSel, size: sizeSel, players: playSlots() });
  const w = m.world, k = 2;
  const c = document.createElement('canvas'); c.width = w.w * k; c.height = w.h * k;
  const g = c.getContext('2d')!;
  g.fillStyle = LAND[w.biome as Biome] ?? LAND.templado; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < w.terrain.length; i++) {
    if (!w.terrain[i]) continue;
    g.fillStyle = w.terrain[i] === 1 ? '#2d6ea8' : '#69a9d0';
    g.fillRect((i % w.w) * k, ((i / w.w) | 0) * k, k, k);
  }
  for (const e of w.entities.values()) {
    if (e.cat === 'unit') continue;
    const col = e.cat === 'node'
      ? ({ tree: w.biome === 'nieve' ? '#3f6b48' : '#2a4f22', goldmine: '#f4c430', stonemine: '#c8c8c8', berries: '#d6336c', fish: '' } as Record<string, string>)[e.type]
      : e.type === 'stonewall' || e.type === 'wall' || e.type === 'gate' ? '#8a857c' : w.players[e.owner]?.color;
    if (!col) continue;
    g.fillStyle = col;
    if (e.type === 'towncenter') { g.beginPath(); g.arc(e.x / TILE * k, e.y / TILE * k, 5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
    else g.fillRect(e.tx * k, e.ty * k, e.fw * k, e.fh * k);
  }
  const url = c.toDataURL();
  previewCache.set(key, url);
  return url;
}
/** Llena las miniaturas de a una para no trabar el menú */
function fillPreviews() {
  const imgs = [...menu.querySelectorAll<HTMLImageElement>('img[data-prev]')].filter((i) => !i.src);
  let i = 0;
  const step = () => {
    const img = imgs[i++];
    if (!img || !img.isConnected) return;
    img.src = mapPreview(img.getAttribute('data-prev') as MapType);
    setTimeout(step, 0);
  };
  setTimeout(step, 30);
}
const RANDOM_IMG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#3d2e20"/><text x="32" y="44" font-size="34" text-anchor="middle">🎲</text></svg>');

function showSetup() {
  const mapCard = (k: MapType | 'random', big = false) => {
    const name = k === 'random' ? '🎲 Al azar' : MAPS[k as MapType].name;
    const desc = k === 'random' ? 'Sorpresa en cada partida' : MAPS[k as MapType].desc;
    const img = k === 'random' ? `<img src="${RANDOM_IMG}" alt="">` : `<img data-prev="${k}" alt="">`;
    return big
      ? `<button class="mapdd" data-mapdd>${img}<div><b>${name}</b><small>${desc}</small></div><span class="caret">${mapOpen ? '▴' : '▾'}</span></button>`
      : `<button class="mapcard ${k === mapSel ? 'on' : ''}" data-map="${k}">${img}<b>${name}</b><small>${desc}</small></button>`;
  };
  const mapsHtml = mapCard(mapSel, true) + (mapOpen ? `<div class="maplist">${(['random', ...Object.keys(MAPS)] as (MapType | 'random')[]).map((k) => mapCard(k)).join('')}</div>` : '')
    + `<button class="chip reroll" data-reroll>🔄 Otra variante</button>`;
  const biomesHtml = (['random', ...Object.keys(BIOMES)] as (Biome | 'random')[]).map((k) =>
    `<button class="chip ${k === biomeSel ? 'on' : ''}" data-biome="${k}">${k === 'random' ? '🎲 Al azar' : BIOME_ICON[k as Biome] + ' ' + BIOMES[k as Biome]}</button>`).join('');
  const rows = slots.map((s, i) => `
    <div class="slot">
      <button class="swatch sm" data-slotcolor="${i}" style="--c:${PLAYER_COLORS[s.color].hex}" aria-label="Cambiar color"></button>
      <b class="sname">${i === 0 ? 'Vos' : 'IA ' + i}</b>
      <select data-k="civ" data-i="${i}" aria-label="Civilización">${civOptions(s.civ, i === 0)}</select>
      <select data-k="team" data-i="${i}" aria-label="Equipo">${teamOptions(s.team)}</select>
      ${s.ai ? `<select data-k="dif" data-i="${i}" aria-label="Dificultad">${difOptions(s.difficulty ?? difficulty)}</select>
        <button class="rm" data-rm="${i}" aria-label="Quitar" ${slots.length <= 2 ? 'disabled' : ''}>✖</button>` : '<span class="mine">⭐</span>'}
    </div>`).join('');
  const sides = new Set(slots.map((s, i) => (s.team > 0 ? s.team : 100 + i)));
  menu.innerHTML = `<div class="menu-inner setup">
    <h2>⚔️ Escaramuza</h2>
    <section><h3>Modo de juego</h3><div class="startmodes">${(Object.keys(START_MODES) as StartMode[]).map((k) =>
      `<button class="opt ${k === startSel ? 'on' : ''}" data-start="${k}"><b>${k === 'imperial' ? '👑 ' : '🌾 '}${START_MODES[k].name}</b><small>${START_MODES[k].desc}</small></button>`).join('')}</div></section>
    <section><h3>Jugadores (${slots.length}/${maxPlayers()})</h3>
      <div class="presets">
        <button class="chip" data-preset="1v1">1 vs 1</button><button class="chip" data-preset="2v2">2 vs 2</button>
        <button class="chip" data-preset="4v4">4 vs 4</button><button class="chip" data-preset="ffa">Todos contra todos</button>
      </div>
      <div class="slots">${rows}</div>
      <div class="diff allai"><span>Todas las IA</span><div class="seg">${DIFF_LIST.map((d) => `<button data-alldif="${d}" class="${slots.slice(1).every((s) => (s.difficulty ?? difficulty) === d) ? 'on' : ''}">${DIFF_NAME[d]}</button>`).join('')}</div></div>
      ${slots.length < maxPlayers() ? '<button class="addai" data-add>➕ Agregar IA</button>' : `<p class="dim">Este tamaño de mapa admite hasta ${maxPlayers()} jugadores. Elegí uno más grande para sumar IAs.</p>`}
      ${sides.size < 2 ? '<p class="warn">Tiene que haber al menos dos bandos distintos.</p>' : ''}
    </section>
    <section><h3>Tu civilización</h3>${civCard(slots[0].civ)}</section>
    <section><h3>Tamaño del mapa</h3><div class="seg sizes">${(Object.keys(MAP_SIZES) as MapSize[]).map((k) =>
      `<button data-size="${k}" class="${k === sizeSel ? 'on' : ''}">${MAP_SIZES[k].name}<small>${MAP_SIZES[k].players} jug.</small></button>`).join('')}</div></section>
    <section><h3>Mapa</h3><div class="mapsel">${mapsHtml}</div></section>
    <section><h3>Bioma</h3><div class="chips">${biomesHtml}</div></section>
    <div class="setup-actions"><button class="big ghost" data-back>Volver</button><button class="big" data-go ${sides.size < 2 ? 'disabled' : ''}>¡A jugar!</button></div>
  </div>`;
  menu.onchange = (e) => {
    const t = e.target as HTMLSelectElement;
    const i = Number(t.getAttribute('data-i')), k = t.getAttribute('data-k');
    if (!slots[i]) return;
    if (k === 'civ') slots[i].civ = t.value as CivId | 'random';
    if (k === 'team') slots[i].team = Number(t.value);
    if (k === 'dif') slots[i].difficulty = t.value as Difficulty;
    saveSlots();
    showSetup();
  };
  menu.onclick = (e) => {
    const t = e.target as HTMLElement;
    const sc = t.closest('[data-slotcolor]')?.getAttribute('data-slotcolor');
    if (sc) {
      const i = Number(sc);
      const used = new Set(slots.map((s) => s.color));
      let c = slots[i].color;
      for (let k = 0; k < 8; k++) { c = (c + 1) % 8; if (!used.has(c)) break; }
      if (!used.has(c)) { slots[i].color = c; if (i === 0) { color = c; store.set('color', String(c)); } }
      saveSlots(); return showSetup();
    }
    const pr = t.closest('[data-preset]')?.getAttribute('data-preset');
    if (pr) { slots = preset(pr as '1v1', slots[0].civ); sizeSel = sizeForPlayers(slots.length); store.set('size', sizeSel); saveSlots(); return showSetup(); }
    const sz = t.closest('[data-size]')?.getAttribute('data-size') as MapSize | null;
    if (sz) {
      sizeSel = sz; store.set('size', sz);
      // si hay más jugadores de los que entran, quitar IAs del final
      while (slots.length > MAP_SIZES[sz].players) slots.pop();
      saveSlots(); return showSetup();
    }
    if (t.closest('[data-add]') && slots.length < maxPlayers()) {
      const used = new Set(slots.map((s) => s.color));
      const c = [0, 1, 2, 3, 4, 5, 6, 7].find((x) => !used.has(x)) ?? 0;
      slots.push({ ai: true, civ: 'random', team: slots.some((s) => s.team === 2) ? 2 : 0, color: c, difficulty });
      saveSlots(); return showSetup();
    }
    const rm = t.closest('[data-rm]')?.getAttribute('data-rm');
    if (rm && slots.length > 2) { slots.splice(Number(rm), 1); saveSlots(); return showSetup(); }
    const mp = t.closest('[data-map]')?.getAttribute('data-map');
    if (mp) { mapSel = mp as MapType; store.set('map', mp); mapOpen = false; return showSetup(); }
    const sm = t.closest('[data-start]')?.getAttribute('data-start') as StartMode | null;
    if (sm) { startSel = sm; store.set('start', sm); return showSetup(); }
    if (t.closest('[data-mapdd]')) { mapOpen = !mapOpen; return showSetup(); }
    if (t.closest('[data-reroll]')) { nextSeed = Math.floor(Math.random() * 99999); return showSetup(); }
    const ad = t.closest('[data-alldif]')?.getAttribute('data-alldif') as Difficulty | null;
    if (ad) { difficulty = ad; store.set('dif', ad); for (const s of slots) if (s.ai) s.difficulty = ad; saveSlots(); return showSetup(); }
    const bi = t.closest('[data-biome]')?.getAttribute('data-biome');
    if (bi) { biomeSel = bi as Biome; store.set('biome', bi); return showSetup(); }
    if (t.closest('[data-back]')) return renderMenu();
    if (t.closest('[data-go]') && sides.size >= 2) { const seed = nextSeed; nextSeed = Math.floor(Math.random() * 99999); start({ mode: 'skirmish', difficulty, color, map: mapSel, biome: biomeSel, size: sizeSel, start: startSel, players: playSlots(), seed }); }
  };
  fillPreviews();
}

function showSettings() {
  const row = (k: keyof Settings, title: string, desc: string) => `
    <label class="setting"><div><b>${title}</b><small>${desc}</small></div>
    <input type="checkbox" id="set-${k}" data-set="${k}" ${settings[k] ? 'checked' : ''}><span class="switch"></span></label>`;
  menu.innerHTML = `<div class="menu-inner">
    <h2 class="pagetitle">⚙️ Configuración</h2>
    <div class="settings">
      <div class="setting langs"><div><b>Idioma</b><small>Language · Idioma</small></div>
        <div class="seg">${LANGS.map((l) => `<button data-lang="${l.id}" class="${l.id === lang ? 'on' : ''}">${l.flag} ${l.name}</button>`).join('')}</div></div>
      ${row('grid', 'Cuadrícula', 'Muestra las casillas del terreno: ayuda a ubicar edificios y murallas.')}
      ${row('hpBars', 'Barras de vida siempre visibles', 'Muestra la vida de todas tus unidades, no solo de las heridas.')}
    </div>
    <button class="big" data-back>Volver</button>
  </div>`;
  menu.onchange = (e) => {
    const t = e.target as HTMLInputElement;
    const k = t.getAttribute('data-set') as keyof Settings | null;
    if (k) { settings[k] = t.checked; saveSettings(); }
  };
  menu.onclick = (e) => {
    const t = e.target as HTMLElement;
    const l = t.closest('[data-lang]')?.getAttribute('data-lang') as typeof lang | null;
    if (l && l !== lang) { setLang(l); return; }
    if (t.closest('[data-back]')) renderMenu();
  };
}

function showStories() {
  menu.innerHTML = `<div class="menu-inner">
    <h2 class="pagetitle">🗺️ Historias</h2>
    <div class="camps">${CAMPAIGNS.map((c) => {
      const n = campaignCount(c);
      return `<button class="camp" data-camp="${c.id}"><i>${c.emblem}</i><div><b>${c.name}</b><small>${c.desc}</small>
        <span class="cprog"><em style="width:${(n / c.scenarios.length) * 100}%"></em></span><small>${CIVS[c.civ].emblem} ${CIVS[c.civ].name} · ${n}/${c.scenarios.length}</small></div></button>`;
    }).join('')}</div>
    <button class="big" data-back>Volver</button>
  </div>`;
  menu.onclick = (e) => {
    const t = e.target as HTMLElement;
    const c = t.closest('[data-camp]')?.getAttribute('data-camp');
    if (c) return showCampaign(c);
    if (t.closest('[data-back]')) renderMenu();
  };
}

function showCampaign(id: string, sel?: number) {
  const camp = CAMPAIGNS.find((c) => c.id === id);
  if (!camp) return showStories();
  if (sel === undefined) { sel = camp.scenarios.findIndex((s) => !storyDone(s.id)); if (sel < 0) sel = 0; }
  const s = camp.scenarios[sel];
  const open = storyOpen(camp, sel);
  const intro = s.intro.map((l) => `<p><b>${l.icon} ${l.who}:</b> ${l.text}</p>`).join('');
  menu.innerHTML = `<div class="menu-inner camppage">
    <h2 class="pagetitle">${camp.emblem} ${camp.name}</h2>
    <canvas id="wmap" class="wmap"></canvas>
    <div class="scnlist">${camp.scenarios.map((x, i) => `<button class="scn ${i === sel ? 'on' : ''} ${storyDone(x.id) ? 'done' : ''} ${storyOpen(camp, i) ? '' : 'locked'}" data-scn="${i}">
      <b>${storyDone(x.id) ? '✓' : storyOpen(camp, i) ? i + 1 : '🔒'}</b><span>${x.title}</span></button>`).join('')}</div>
    <div class="diff campdiff"><span>Dificultad</span><div class="seg">${DIFF_LIST.map((d) => `<button data-cdif="${d}" class="${d === campDiff ? 'on' : ''}">${DIFF_NAME[d]}</button>`).join('')}</div></div>
    <div class="brief">
      <h3>${s.title}</h3><small>${s.place} · ${s.year}</small>
      ${open ? intro : '<p class="dim">Completá el escenario anterior para conocer esta parte de la historia.</p>'}
      <p class="goal">🎯 ${s.goalText}${s.hero ? ` · 👑 ${s.hero.name} no debe morir` : ''}</p>
    </div>
    <div class="setup-actions"><button class="big ghost" data-back>Volver</button><button class="big" data-play ${open ? '' : 'disabled'}>${open ? (storyDone(s.id) ? '↻ Jugar de nuevo' : '▶ Jugar') : '🔒 Bloqueado'}</button></div>
  </div>`;
  const cv = document.getElementById('wmap') as HTMLCanvasElement;
  const draw = () => drawWorldMap(cv, camp, sel!, storyDone, (i) => storyOpen(camp, i));
  requestAnimationFrame(draw);
  menu.onclick = (e) => {
    const t = e.target as HTMLElement;
    const i = t.closest('[data-scn]')?.getAttribute('data-scn');
    if (i) return showCampaign(id, Number(i));
    const cd = t.closest('[data-cdif]')?.getAttribute('data-cdif') as Difficulty | null;
    if (cd) { campDiff = cd; store.set('difcamp', cd); return showCampaign(id, sel); }
    if (t.closest('[data-back]')) return showStories();
    if (t.closest('[data-play]') && open) start({ mode: 'scenario', scenario: s.id, difficulty: campDiff, color, seed: 1 });
  };
}
window.addEventListener('open-campaign', (e) => showCampaign((e as CustomEvent<string>).detail));
void findScenario;

function showAchievements() {
  const n = achCount(), pr = achProgress();
  const locked = CIV_LIST.filter((c) => CIVS[c].unlock);
  menu.innerHTML = `<div class="menu-inner">
    <h2 class="pagetitle">🏅 Logros · ${n}/${ACHIEVEMENTS.length}</h2>
    <div class="achbar"><i style="width:${(n / ACHIEVEMENTS.length) * 100}%"></i></div>
    <div class="unlocks">${locked.map((c) => `<div class="unl ${civUnlocked(c) ? 'on' : ''}"><b>${CIVS[c].emblem}</b><span>${CIVS[c].name}</span><small>${civUnlocked(c) ? '✔ Disponible' : `🔒 ${CIVS[c].unlock} logros`}</small></div>`).join('')}</div>
    <div class="achs">${ACHIEVEMENTS.map((a) => {
      const extra = a.id === 'legend' ? ` (${Math.min(10, pr.wins)}/10)` : a.id === 'travel' ? ` (${Math.min(5, pr.maps)}/5)` : a.id === 'collect' ? ` (${Math.min(5, pr.civs)}/5)` : '';
      return `<div class="ach ${achDone(a.id) ? 'done' : ''}"><i>${a.icon}</i><div><b>${a.name}</b><small>${a.desc}${achDone(a.id) ? '' : extra}</small></div><em>${achDone(a.id) ? '✔' : ''}</em></div>`;
    }).join('')}</div>
    <button class="big" data-back>Volver</button>
  </div>`;
  menu.onclick = (e) => { if ((e.target as HTMLElement).closest('[data-back]')) renderMenu(); };
}

function showCivs() {
  menu.innerHTML = `<div class="menu-inner">
    <h2 class="pagetitle">🏛️ Civilizaciones</h2>
    <div class="civgrid">${CIV_LIST.map((c) => civCard(c)).join('')}</div>
    <button class="big" data-back>Volver</button>
  </div>`;
  menu.onclick = (e) => { if ((e.target as HTMLElement).closest('[data-back]')) renderMenu(); };
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
      <li>💤 busca aldeanos sin trabajo, 🛡️ selecciona tu ejército y ⚓ tu flota.</li>
      <li>Hacé 🏠 casas para crecer y avanzá por las 4 edades desde el 🏰 Centro Urbano: <b>Oscura → Media → Castillos → Imperial</b>.</li>
      <li>Cada civilización tiene bonificaciones propias y una <b>unidad única</b> que se entrena en el 🏯 Castillo.</li>
      <li><b>Piedra, papel o tijera:</b> lanceros 🔱 &gt; caballería 🐎 &gt; arqueros 🏹 &gt; infantería 🗡️; los escaramuzadores cazan arqueros. Arietes y fundíbulos rompen edificios.</li>
      <li>El ⚓ Muelle va en el agua tocando la costa: entrena barcos pesqueros, galeones, barcos incendiarios y galeones cañoneros.</li>
      <li>La 🎓 Universidad investiga Albañilería, Química (desbloquea la pólvora), Balística y más.</li>
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
if (q.get('demo')) start({ start: (q.get('start') as StartMode) || 'normal', mode: q.get('demo') as Mode, difficulty: (q.get('dif') as Difficulty) || 'normal', seed: Number(q.get('seed') || 1),
  map: (q.get('map') as MapType) || 'continental', biome: (q.get('biome') as Biome) || 'templado', color: Number(q.get('color') || 0) });
else renderMenu();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
