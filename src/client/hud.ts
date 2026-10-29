// Interfaz en HTML sobre el canvas: recursos, panel de selección, botones grandes para dedos.
import {
  Age, AGE_NAME, AGE_SHORT, AGE_UPS, ArmorClass, BUILDINGS, BuildingType, NODES, NodeType, Res, RES_LIST, ResBag, TECHS, TechType,
  TICK_RATE, TILE, TRADE, UNITS, UnitType, COUNTERS,
} from '../sim/data.js';
import { CIVS } from '../sim/civs.js';
import { Entity, Stance, STANCE_NAME } from '../sim/world.js';
import { findScenario } from '../sim/campaigns.js';
import type { Game } from './game.js';
import { saveSettings, settings } from './settings.js';

export const UNIT_ICON: Record<UnitType, string> = {
  villager: '🧑‍🌾', militia: '🗡️', spearman: '🔱', champion: '⚔️',
  archer: '🏹', skirmisher: '🎯', cavarcher: '🏇', handcannon: '🔫',
  scout: '🐎', knight: '🛡️', camel: '🐪', ram: '🐏', mangonel: '🪨', bombard: '💣', trebuchet: '🏗️', monk: '🧙',
  fishship: '🎣', galleon: '⛵', fireship: '🔥', cannongalleon: '🚢',
  huskarl: '🛡️', jaguar: '🐆', tarkan: '🔥', teutonic: '⚜️', plumed: '🪶',
  longbow: '🏹', axeman: '🪓', conquistador: '🤠', cataphract: '🐴', mangudai: '🏇',
  samurai: '🗡️', chukonu: '🎯', elephant: '🐘', berserker: '🪓', janissary: '🔫',
};
export const BUILD_ICON: Record<BuildingType, string> = {
  towncenter: '🏰', house: '🏠', barracks: '⚔️', range: '🎯', stable: '🐴', workshop: '⚙️',
  mill: '🌾', lumbercamp: '🪓', miningcamp: '⛏️', farm: '🌱', tower: '🗼',
  blacksmith: '⚒️', market: '⚖️', castle: '🏯', monastery: '⛪', wall: '🪵',
  dock: '⚓', university: '🎓', stonewall: '🧱', gate: '🚪',
};
export const RES_ICON: Record<Res, string> = { food: '🍖', wood: '🪵', gold: '🪙', stone: '🪨' };
const NODE_ICON: Record<NodeType, string> = { tree: '🌳', berries: '🫐', goldmine: '🪙', stonemine: '🪨', fish: '🐟' };
const CLS_NAME: Record<ArmorClass, string> = { infantry: 'infantería', archer: 'arqueros', cavalry: 'caballería', siege: 'asedio', villager: 'aldeanos', building: 'edificios', ship: 'barcos', camel: 'camellos' };
const STANCE_ICON: Record<Stance, string> = { agg: '⚔️', def: '🛡️', pas: '🕊️' };
const STANCE_DESC: Record<Stance, string> = {
  agg: 'Ataca a todo enemigo que vea y lo persigue.',
  def: 'Defiende su puesto: ataca a los que se acercan, persigue poco y vuelve a su lugar.',
  pas: 'Nunca ataca sola, ni aunque la ataquen. Solo obedece tus órdenes.',
};

const BUILD_GROUPS: [string, BuildingType[]][] = [
  ['Economía', ['house', 'farm', 'mill', 'lumbercamp', 'miningcamp', 'dock', 'market', 'towncenter']],
  ['Militar', ['barracks', 'range', 'stable', 'workshop', 'blacksmith', 'monastery', 'university']],
  ['Defensa', ['wall', 'stonewall', 'gate', 'tower', 'castle']],
];

const $ = (id: string) => document.getElementById(id)!;

function costHtml(c: Partial<ResBag>, have?: ResBag): string {
  return RES_LIST.filter((r) => c[r]).map((r) => `<span class="${have && have[r] < (c[r] ?? 0) ? 'short' : ''}">${RES_ICON[r]}${c[r]}</span>`).join('');
}
const lock = (age: Age) => `🔒 ${AGE_SHORT[age]}`;

/** Ficha de una unidad para el "mantener apretado" */
export function unitTip(u: UnitType): string {
  const d = UNITS[u];
  const name = (k: string) => (k === 'building' ? CLS_NAME.building : k === 'tower' ? BUILDINGS.tower.name : UNITS[k as UnitType].name);
  const c = COUNTERS[u];
  const strong = c.strong.map(name);
  const weak = c.weak.map(name);
  const kind = d.atk === 0 ? '' : d.range > TILE ? `a distancia (alcance ${Math.round(d.range / TILE)})` : 'cuerpo a cuerpo';
  return `<b>${UNIT_ICON[u]} ${d.name}</b><p>${d.desc}</p>
    <div class="stats"><span>❤️ ${d.hp} vida</span>${d.atk ? `<span>⚔️ ${d.atk} ataque ${kind}</span>` : ''}<span>🛡️ ${d.armorMelee} / ${d.armorPierce} armadura</span><span>🏃 ${d.speed > 75 ? 'rápida' : d.speed > 45 ? 'normal' : 'lenta'}</span></div>
    ${strong.length ? `<p class="good">💪 Fuerte contra: ${strong.join(', ')}</p>` : ''}
    ${weak.length ? `<p class="bad">⚠️ Débil contra: ${[...new Set(weak)].slice(0, 4).join(', ')}</p>` : ''}
    ${d.heals ? '<p class="good">✨ Cura a las unidades aliadas cercanas.</p>' : ''}
    <p class="dim">Costo ${costHtml(d.cost)} · ${d.trainTime} s · ${AGE_NAME[d.age]}${d.requires ? ` · requiere ${TECHS[d.requires].name}` : ''}</p>`;
}

export class Hud {
  minimap: HTMLCanvasElement;
  private root = $('hud');
  private panel = $('panel');
  private sig = '';
  private topAt = 0;
  private scoreAt = 0;
  private delAt = 0;
  private scoreOpen = false;
  private handlers: [EventTarget, string, EventListener][] = [];
  private pressTimer = 0;
  private pressStart = { x: 0, y: 0 };
  private suppressClick = false;

  constructor(private g: Game) {
    this.root.hidden = false;
    this.minimap = $('minimap') as HTMLCanvasElement;
    const clickAction = (e: Event) => {
      if (this.suppressClick) { this.suppressClick = false; e.preventDefault(); return; }
      this.action((e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a'));
    };
    this.on(this.panel, 'click', clickAction);
    this.on($('sheet'), 'click', (e) => {
      const t = e.target as HTMLElement;
      if (t.id === 'sheet') { g.buildMenu = false; this.sig = ''; return; }
      clickAction(e);
    });
    this.on($('sidebtns'), 'click', clickAction);
    this.on($('btnPause'), 'click', () => this.togglePause());
    this.on(window, 'resize', () => { if (!$('overlay').hidden) setTimeout(() => this.fitOverlay(), 50); });
    this.on($('overlay'), 'touchmove', (e) => e.preventDefault());
    this.on($('score'), 'click', () => { this.scoreOpen = !this.scoreOpen; this.scoreAt = 0; });
    // mantener apretado un botón: ficha con la descripción
    const down = (e: Event) => {
      const pe = e as PointerEvent;
      const btn = (pe.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      this.hideTip();
      if (!btn) return;
      this.pressStart = { x: pe.clientX, y: pe.clientY };
      clearTimeout(this.pressTimer);
      this.pressTimer = window.setTimeout(() => { if (this.showTip(btn)) this.suppressClick = true; }, 420);
    };
    const cancel = (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.type === 'pointermove' && Math.hypot(pe.clientX - this.pressStart.x, pe.clientY - this.pressStart.y) < 10) return;
      clearTimeout(this.pressTimer);
      // la ficha se ve mientras mantenés apretado; al soltar se cierra
      if (pe.type !== 'pointermove') setTimeout(() => this.hideTip(), 120);
    };
    for (const el of [this.panel, $('sheet')]) {
      this.on(el, 'pointerdown', down);
      this.on(el, 'pointerup', cancel);
      this.on(el, 'pointercancel', cancel);
      this.on(el, 'pointermove', cancel);
      this.on(el, 'contextmenu', (e) => e.preventDefault());
    }
    this.on($('game'), 'pointerdown', () => this.hideTip());
    const mm = (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.type === 'pointermove' && !pe.buttons) return;
      const r = this.minimap.getBoundingClientRect();
      const w = g.world;
      g.centerOn((pe.clientX - r.left) / r.width * w.w * TILE, (pe.clientY - r.top) / r.height * w.h * TILE);
    };
    this.on(this.minimap, 'pointerdown', mm);
    this.on(this.minimap, 'pointermove', mm);
    $('toasts').innerHTML = '';
  }

  private on(el: EventTarget, n: string, f: EventListener) { el.addEventListener(n, f); this.handlers.push([el, n, f]); }

  destroy() {
    for (const [el, n, f] of this.handlers) el.removeEventListener(n, f);
    this.root.hidden = true;
    $('sheet').hidden = true;
    $('overlay').hidden = true;
    $('toasts').innerHTML = '';
    this.hideTip();
  }

  // ---------------------------------------------------------------- fichas
  private tipFor(a: string): string | null {
    const g = this.g, w = g.world;
    const [cmd, arg] = a.split(':');
    if (cmd === 'train') return unitTip(arg as UnitType);
    if (cmd === 'research') {
      const t = TECHS[arg as TechType];
      return `<b>${t.icon} ${t.name}</b><p>${t.desc}</p><p class="dim">Costo ${costHtml(w.techCost(g.me, arg as TechType))} · ${t.time} s · ${AGE_NAME[t.age]}</p>`;
    }
    if (cmd === 'place') {
      const b = arg as BuildingType, d = BUILDINGS[b];
      const trains = w.trainsOf(g.me, b).map((u) => UNITS[u].name);
      const res = (d.research ?? []).map((t) => TECHS[t].name);
      return `<b>${BUILD_ICON[b]} ${d.name}</b><p>${d.desc}</p>
        <div class="stats"><span>❤️ ${d.hp} vida</span>${d.pop ? `<span>👥 +${d.pop} población</span>` : ''}${d.attack ? `<span>🏹 dispara flechas</span>` : ''}</div>
        ${trains.length ? `<p>Entrena: ${trains.join(', ')}</p>` : ''}${res.length ? `<p>Investiga: ${res.join(', ')}</p>` : ''}
        <p class="dim">Costo ${costHtml(w.buildingCost(g.me, b))} · ${d.buildTime} s · ${AGE_NAME[d.age]}</p>`;
    }
    if (cmd === 'age') {
      const pl = w.players[g.me];
      if (pl.age >= 4) return null;
      const next = (pl.age + 1) as 2 | 3 | 4;
      const unlocks = (Object.keys(UNITS) as UnitType[]).filter((u) => UNITS[u].age === next && !UNITS[u].unique).map((u) => UNITS[u].name).slice(0, 6);
      return `<b>👑 ${AGE_NAME[next]}</b><p>Desbloquea: ${unlocks.join(', ')} y más edificios e investigaciones.</p><p class="dim">Costo ${costHtml(w.ageCost(g.me, next))} · ${AGE_UPS[next].time} s</p>`;
    }
    if (cmd === 'stance') return `<b>${STANCE_ICON[arg as Stance]} Actitud ${STANCE_NAME[arg as Stance]}</b><p>${STANCE_DESC[arg as Stance]}</p>`;
    if (cmd === 'queue') return `<b>➕ Agregar a la cola</b><p>Con esto prendido, cada orden nueva se suma al final en vez de reemplazar la actual (como mantener Shift en el AoE). Sirve para mandar a un aldeano a construir varias cosas seguidas o marcar un recorrido.</p>`;
    if (cmd === 'gatelock') return `<b>🔒 Bloquear portón</b><p>Bloqueado no deja pasar a nadie, ni siquiera a tu equipo. Abierto deja pasar a tu equipo y frena al enemigo.</p>`;
    if (cmd === 'attack') return `<b>⚔️ Atacar zona</b><p>Tocá un lugar: las unidades caminan hacia ahí y atacan todo lo que encuentren en el camino.</p>`;
    return null;
  }

  private showTip(btn: HTMLElement): boolean {
    const html = this.tipFor(btn.getAttribute('data-a') ?? '');
    if (!html) return false;
    const tip = $('tip');
    tip.innerHTML = html;
    tip.hidden = false;
    const r = btn.getBoundingClientRect();
    const tw = Math.min(300, window.innerWidth - 16);
    tip.style.width = tw + 'px';
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px';
    const th = tip.offsetHeight;
    tip.style.top = Math.max(8, r.top - th - 8) + 'px';
    navigator.vibrate?.(15);
    return true;
  }
  hideTip() { const t = document.getElementById('tip'); if (t) t.hidden = true; }

  // ---------------------------------------------------------------- avisos
  toast(text: string, alert = false) {
    const box = $('toasts');
    if ([...box.children].some((c) => c.textContent === text)) return;
    const d = document.createElement('div');
    d.className = 'toast' + (alert ? ' alert' : '');
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild!.remove();
    setTimeout(() => d.remove(), 2800);
  }

  ping(x: number, y: number) {
    const w = this.g.world;
    const d = document.createElement('div');
    d.className = 'ping';
    d.style.left = (x / (w.w * TILE)) * 100 + '%';
    d.style.top = (y / (w.h * TILE)) * 100 + '%';
    $('minimapwrap').appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }

  /** Tabla de jugadores con puntuación, agrupada por equipo */
  private playersTable(): string {
    const w = this.g.world;
    if (this.g.match.cfg.mode === 'tutorial') return '';
    const teams = new Map<number, number[]>();
    for (const p of w.players) { const l = teams.get(p.team) ?? []; l.push(p.id); teams.set(p.team, l); }
    let html = `<table class="players"><tr class="hd"><td>Jugador</td><td>Civ.</td><td>Edad</td><td title="Militar">⚔️</td><td title="Economía">🌾</td><td title="Tecnología">📜</td><td>Total</td></tr>`;
    for (const [team, ids] of [...teams].sort((a, b) => a[0] - b[0])) {
      let tt = 0;
      for (const id of ids) {
        const p = w.players[id], s = w.score(id); tt += s.total;
        const civ = p.civ ? CIVS[p.civ] : undefined;
        html += `<tr class="${p.defeated ? 'dead' : ''}"><td><i class="dot" style="background:${p.color}"></i>${p.name}</td><td>${civ ? civ.emblem : ''}</td>
          <td>${p.defeated ? '💀' : AGE_SHORT[p.age]}</td><td>${s.mil}</td><td>${s.eco}</td><td>${s.tech}</td><td><b>${s.total}</b></td></tr>`;
      }
      if (ids.length > 1 && team < 100) html += `<tr class="team"><td colspan="6">Equipo ${team}</td><td><b>${tt}</b></td></tr>`;
    }
    return html + '</table>';
  }

  /** Escala la tarjeta para que entre completa en la pantalla (sin desplazarse) */
  fitOverlay() {
    const card = $('overlay').querySelector<HTMLElement>('.card');
    if (!card) return;
    card.style.transform = '';
    const h = card.offsetHeight, wd = card.offsetWidth;
    const k = Math.min(1, (window.innerHeight - 16) / h, (window.innerWidth - 12) / wd);
    card.style.transform = k < 1 ? `scale(${k.toFixed(3)})` : '';
  }

  togglePause() {
    const g = this.g;
    if (g.over) return;
    g.paused = !g.paused;
    const o = $('overlay');
    if (!g.paused) { o.hidden = true; return; }
    o.hidden = false;
    const civ = g.world.players[g.me].civ;
    o.innerHTML = `<div class="card">
      <h2>Pausa</h2>
      ${civ ? `<p class="civline">${CIVS[civ].emblem} Jugás con los <b>${CIVS[civ].name}</b>: ${CIVS[civ].bonuses.join(' · ')}. Unidad única: ${UNITS[CIVS[civ].unique].name}.</p>` : ''}
      ${this.playersTable()}
      <div class="row"><button class="chip ${settings.grid ? 'on' : ''}" data-grid>▦ Cuadrícula: ${settings.grid ? 'Sí' : 'No'}</button></div>
      <div class="row">Velocidad:
        ${[1, 1.5, 2].map((s) => `<button class="chip ${g.speed === s ? 'on' : ''}" data-speed="${s}">${s}×</button>`).join('')}
      </div>
      <button class="big" data-o="resume">Continuar</button>
      <button class="big ghost" data-o="exit">Salir al menú</button>
    </div>`;
    this.fitOverlay();
    o.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-grid]')) { settings.grid = !settings.grid; saveSettings(); g.paused = false; this.togglePause(); return; }
      const sp = t.getAttribute('data-speed');
      if (sp) { g.speed = Number(sp); g.paused = false; this.togglePause(); return; }
      const a = t.getAttribute('data-o');
      if (a === 'resume') this.togglePause();
      if (a === 'exit') g.exit();
    };
  }

  showEnd(win: boolean) {
    const g = this.g, w = g.world;
    const st = w.players[g.me].stats;
    const mins = Math.floor(w.tick / TICK_RATE / 60), secs = Math.floor(w.tick / TICK_RATE) % 60;
    const tut = g.match.cfg.mode === 'tutorial';
    const fresh = g.ach.end(win);
    const story = g.story ? findScenario(g.story.scn.id) : undefined;
    const next = story && win ? story.camp.scenarios[story.index + 1] : undefined;
    const lost = g.story && !win ? (g.story.scn.hero && !w.entities.has(g.story.state.heroId) ? `${g.story.scn.hero.name} cayó en combate. La historia quedó sin terminar.` : 'La historia quedó sin terminar. Podés intentarlo de nuevo.') : '';
    const o = $('overlay');
    o.hidden = false;
    o.innerHTML = `<div class="card end ${win ? 'win' : 'lose'}">
      <h1>${win ? '¡Victoria!' : 'Derrota'}</h1>
      ${story ? `<div class="end-story"><small>${story.camp.emblem} ${story.camp.name} · ${story.index + 1}/${story.camp.scenarios.length}</small><b>${story.scn.title}</b></div>` : ''}
      <p>${story ? (win ? story.scn.outro : lost) : tut && win ? 'Los Cuervos Negros huyeron de Varnia. La frontera vuelve a estar a salvo… por ahora.' : win ? 'Tu reino domina la región.' : 'Tu Centro Urbano cayó.'}</p>
      <div class="end-stats">
        <div><b>${mins}:${String(secs).padStart(2, '0')}</b><small>Tiempo</small></div>
        <div><b>${st.trained}</b><small>Entrenadas</small></div>
        <div><b>${st.kills}</b><small>Derrotados</small></div>
        <div><b>${st.lost}</b><small>Pérdidas</small></div>
      </div>
      <div class="end-res">${RES_LIST.map((r) => `${RES_ICON[r]} ${st.gathered[r]}`).join(' · ')}</div>
      ${tut || story ? '' : this.playersTable()}
      ${fresh.length ? `<div class="end-ach"><b>🏅 Logros nuevos</b>${fresh.map((a) => `<span>${a.icon} ${a.name}</span>`).join('')}</div>` : ''}
      <div class="end-btns">
        ${story ? (next ? `<button class="big" data-o="next">Siguiente: ${next.title} ▸</button>` : win ? '' : '<button class="big" data-o="retry">Reintentar</button>')
          : tut ? '' : '<button class="big" data-o="again">Revancha</button>'}
        <button class="big ghost" data-o="${story ? 'stories' : 'exit'}">${story ? '🗺️ Mapa de la campaña' : 'Menú principal'}</button>
      </div>
    </div>`;
    this.fitOverlay();
    o.onclick = (e) => {
      const a = (e.target as HTMLElement).getAttribute('data-o');
      if (a === 'exit') g.exit();
      if (a === 'stories' && story) { g.exit(); window.dispatchEvent(new CustomEvent('open-campaign', { detail: story.camp.id })); }
      if (a === 'retry' && story) { const cfg = { ...g.match.cfg }; g.exit(); window.dispatchEvent(new CustomEvent('start-match', { detail: cfg })); }
      if (a === 'next' && next) { const cfg = { ...g.match.cfg, scenario: next.id }; g.exit(); window.dispatchEvent(new CustomEvent('start-match', { detail: cfg })); }
      if (a === 'again') { const cfg = { ...g.match.cfg, seed: (g.match.cfg.seed * 31 + 7) % 100000 }; g.exit(); window.dispatchEvent(new CustomEvent('start-match', { detail: cfg })); }
    };
  }

  // ------------------------------------------------------------------
  private action(a: string | null | undefined) {
    if (!a) return;
    const g = this.g, w = g.world;
    const [cmd, arg] = a.split(':');
    const selIds = () => g.selUnits().map((u) => u.id);
    switch (cmd) {
      case 'buildmenu': g.buildMenu = true; break;
      case 'quickbuild': g.openBuildMenu(); break;
      case 'research': { const b = w.get(g.sel[0]); if (b) w.issue({ t: 'research', p: g.me, bid: b.id, tech: arg as TechType }); break; }
      case 'buy': case 'sell': w.issue({ t: 'trade', p: g.me, res: arg as Res, buy: cmd === 'buy' }); break;
      case 'back': g.buildMenu = false; g.mode = 'normal'; break;
      case 'place': g.buildMenu = false; g.placedInQueue = 0; g.startPlacing(arg as BuildingType); break;
      case 'confirm': g.confirmPlacement(); this.sig = ''; return;
      case 'rotate': g.rotateGhost(); break;
      case 'cancelplace': g.placing = null; g.ghost = null; g.wallStart = null; g.placedInQueue = 0; break;
      case 'train': g.train(arg as UnitType); break;
      case 'age': { const b = w.get(g.sel[0]); if (b) w.issue({ t: 'age', p: g.me, bid: b.id }); break; }
      case 'cancel': { const b = arg === 'tech' ? w.get(g.sel[0]) : g.sel.map((id) => w.get(id)).filter((x): x is Entity => !!x).sort((a2, b2) => b2.queue.length - a2.queue.length)[0]; if (b) w.issue({ t: 'cancel', p: g.me, bid: b.id, what: arg === 'tech' ? 'tech' : 'unit' }); break; }
      case 'rally': g.mode = 'rally'; this.toast('Tocá el mapa para marcar el punto de reunión'); break;
      case 'stop': w.issue({ t: 'stop', p: g.me, ids: selIds() }); break;
      case 'stance': w.issue({ t: 'stance', p: g.me, ids: selIds(), stance: arg as Stance }); this.toast(`Actitud ${STANCE_NAME[arg as Stance]}`); break;
      case 'queue': g.queueMode = !g.queueMode; this.toast(g.queueMode ? '➕ Las próximas órdenes se agregan a la cola' : 'Cola apagada: las órdenes reemplazan a la actual'); break;
      case 'gatelock': { const b = w.get(g.sel[0]); if (b) w.issue({ t: 'gateLock', p: g.me, bid: b.id }); break; }
      case 'attack': g.mode = g.mode === 'attack' ? 'normal' : 'attack'; if (g.mode === 'attack') this.toast('Tocá el destino: atacarán todo lo que encuentren'); break;
      case 'deselect': g.select([]); break;
      case 'delete': {
        const ids = g.sel.filter((id) => w.get(id)?.owner === g.me);
        if (!ids.length) break;
        if (!this.delAt || performance.now() - this.delAt > 2500) { this.delAt = performance.now(); this.toast('Tocá de nuevo para confirmar'); setTimeout(() => { this.sig = ''; }, 2600); break; }
        this.delAt = 0; w.issue({ t: 'delete', p: g.me, ids }); g.select([]); break;
      }
      case 'idle': g.selectIdleVillager(); break;
      case 'army': g.selectArmy(); break;
      case 'navy': g.selectNavy(); break;
      case 'box': g.mode = g.mode === 'box' ? 'normal' : 'box'; if (g.mode === 'box') this.toast('Arrastrá para seleccionar varias unidades'); break;
      case 'home': { const tc = w.buildingsOf(g.me, 'towncenter')[0]; if (tc) { g.centerOn(tc.x, tc.y); g.select([tc.id]); } break; }
    }
    this.sig = '';
  }

  update() {
    const g = this.g, w = g.world, pl = w.players[g.me];
    const now = performance.now();
    if (now - this.topAt > 200) {
      this.topAt = now;
      // aldeanos trabajando en cada recurso
      const workers: Record<Res, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
      let builders = 0, idle = 0;
      for (const v of w.unitsOf(g.me)) {
        if (v.type !== 'villager' && v.type !== 'fishship') continue;
        if (v.order?.t === 'gather') workers[v.order.res]++;
        else if (v.order?.t === 'build') builders++;
        else if (v.type === 'villager' && !v.order) idle++;
      }
      $('res').innerHTML = RES_LIST.map((r) => `<span class="rs">${RES_ICON[r]}<b>${Math.floor(pl.res[r])}</b><sub title="Aldeanos en ${r}">${workers[r]}</sub></span>`).join('') +
        `<span class="rs">👥<b class="${w.popOf(g.me) >= w.popCap(g.me) ? 'short' : ''}">${w.popOf(g.me)}/${w.popCap(g.me)}</b>${builders ? `<sub title="Construyendo">🔨${builders}</sub>` : ''}</span>`;
      const t = Math.floor(w.tick / TICK_RATE);
      const civ = pl.civ ? CIVS[pl.civ].emblem + ' ' : '';
      $('clock').textContent = `${civ}${AGE_NAME[pl.age]} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      $('idleCount').textContent = idle ? String(idle) : '';
      $('idleCount').hidden = !idle;
      $('btnNavy').hidden = !w.unitsOf(g.me).some((u) => UNITS[u.type as UnitType].naval && u.type !== 'fishship');
      // barra de avance de edad, siempre visible arriba
      const tcAge = w.buildingsOf(g.me, 'towncenter').find((b) => b.ageT >= 0);
      const ab = $('agebar');
      ab.hidden = !tcAge || pl.age >= 4;
      if (tcAge && pl.age < 4) {
        const next = (pl.age + 1) as 2 | 3 | 4;
        const f = tcAge.ageT / AGE_UPS[next].time;
        if (!ab.firstChild) ab.innerHTML = '<span></span><i></i>';
        ab.querySelector('span')!.textContent = `👑 ${AGE_NAME[next]} · ${Math.floor(f * 100)}%`;
      }
    }
    // puntuación
    if (g.match.cfg.mode !== 'tutorial' && now - this.scoreAt > 1000) {
      this.scoreAt = now;
      const sc = $('score');
      sc.hidden = false;
      if (this.scoreOpen) sc.innerHTML = this.playersTable() + '<small>Tocá para cerrar</small>';
      else {
        const mine = w.score(g.me).total;
        const team = w.players.filter((p) => p.team === pl.team).reduce((a, p) => a + w.score(p.id).total, 0);
        const best = Math.max(...w.players.filter((p) => w.isEnemy(g.me, p.id)).map((p) => w.score(p.id).total), 0);
        sc.innerHTML = `🏆 <b>${mine}</b>${team !== mine ? ` · Eq. ${team}` : ''} <small>rival ${best}</small>`;
      }
      sc.classList.toggle('open', this.scoreOpen);
    }
    // barra de edad: cada cuadro, sin saltos
    const abar = $('agebar').querySelector('i') as HTMLElement | null;
    if (abar && pl.age < 4) {
      const tcA = w.buildingsOf(g.me, 'towncenter').find((b) => b.ageT >= 0);
      if (tcA) abar.style.width = ((tcA.ageT / AGE_UPS[(pl.age + 1) as 2 | 3 | 4].time) * 100).toFixed(1) + '%';
    }
    $('btnBox').classList.toggle('on', g.mode === 'box');
    $('btnClose').hidden = !g.sel.length;

    const sig = this.signature();
    if (sig !== this.sig) {
      this.sig = sig;
      const scroll = this.panel.querySelector('.acts')?.scrollLeft ?? 0;
      this.panel.innerHTML = this.render();
      const acts = this.panel.querySelector('.acts'); if (acts) acts.scrollLeft = scroll;
      const sheet = $('sheet');
      const show = g.buildMenu && g.selUnits().some((u) => u.type === 'villager');
      sheet.hidden = !show;
      if (show) {
        const sc = sheet.querySelector('.sheet-body')?.scrollTop ?? 0;
        sheet.innerHTML = this.renderSheet();
        const body = sheet.querySelector('.sheet-body'); if (body) body.scrollTop = sc;
      }
    }
    // barras y números en vivo
    const b0 = g.sel.length >= 1 ? w.get(g.sel[0]) : undefined;
    const b = b0 && (g.sel.length === 1 || b0.cat === 'building') ? (b0.cat === 'building' && !b0.queue.length && b0.ageT < 0 ? g.sel.map((id) => w.get(id)).find((x) => x && x.queue.length) ?? b0 : b0) : undefined;
    if (b) {
      const pb = this.panel.querySelector<HTMLElement>('[data-progress]');
      if (pb) {
        let f = 0;
        if (b.progress < 1) f = b.progress;
        else if (b.ageT >= 0 && pl.age < 4) f = b.ageT / AGE_UPS[(pl.age + 1) as 2 | 3 | 4].time;
        else if (b.queue.length) f = b.trainT / UNITS[b.queue[0]].trainTime;
        pb.style.width = (f * 100).toFixed(1) + '%';
      }
      const tb = this.panel.querySelector<HTMLElement>('[data-tprogress]');
      if (tb && b0?.tech) tb.style.width = ((b0.techT / TECHS[b0.tech].time) * 100).toFixed(1) + '%';
      const hp = this.panel.querySelector<HTMLElement>('[data-hp]');
      if (hp && b.cat !== 'node') hp.textContent = `${Math.ceil(b.hp)}/${b.maxHp}`;
      const amt = this.panel.querySelector<HTMLElement>('[data-amt]');
      if (amt) amt.textContent = String(Math.max(0, Math.floor(b.amount)));
    }
  }

  private signature(): string {
    const g = this.g, w = g.world, pl = w.players[g.me];
    const parts: (string | number)[] = [w.popOf(g.me) >= w.popCap(g.me) ? 1 : 0, this.delAt ? 1 : 0, g.placedInQueue, g.sel.join(','), g.mode, g.buildMenu ? 1 : 0, g.placing ?? '', g.ghostVertical ? 1 : 0, pl.age, w.isResearchingAge(g.me) ? 1 : 0, pl.techs.size, g.queueMode ? 1 : 0];
    parts.push(RES_LIST.map((r) => Math.floor(pl.res[r] / 25)).join('.'));
    if (g.sel.length >= 1) {
      const e = w.get(g.sel[0]);
      if (e) parts.push(e.queue.join(''), e.progress >= 1 ? 1 : 0, e.ageT >= 0 ? 1 : 0, e.order?.t ?? '', e.carry > 0 ? 1 : 0, e.tech ?? '', e.techQueue.join(''), e.locked ? 1 : 0, e.cmdQueue.length);
      parts.push(g.selUnits().map((u) => u.stance).join(''));
      parts.push(g.sel.map((id) => w.get(id)?.queue.length ?? 0).join('.'));
    }
    return parts.join('|');
  }

  private render(): string {
    const g = this.g, w = g.world, pl = w.players[g.me];
    const ents = g.sel.map((id) => w.get(id)).filter((e): e is Entity => !!e);
    if (g.placing) {
      const d = BUILDINGS[g.placing];
      const hint = d.line ? (g.wallStart ? 'Tocá dónde termina y confirmá.' : 'Tocá dónde empieza.') : d.onWater ? 'Ubicalo en el agua, tocando la costa, y confirmá.'
        : d.onWall ? 'Ponelo sobre 3 tramos de tu muralla. Girá si hace falta.' : 'Tocá o arrastrá el contorno para ubicarlo y confirmá.';
      return `<div class="info"><div class="title">${BUILD_ICON[g.placing]} ${d.name}</div>
        <div class="sub">${hint}</div><div class="sub dim">${costHtml(w.buildingCost(g.me, g.placing), pl.res)}${d.line ? ' por tramo' : ''}</div></div>
        <div class="acts"><button class="act yes" data-a="confirm"><i>✔️</i><span>${g.queuing ? 'A la cola' : 'Construir aquí'}</span></button>
        <button class="act ${g.queueMode ? 'on' : ''}" data-a="queue"><i>➕</i><span>En cola${g.queueMode ? ' ✓' : ''}</span></button>
        ${d.onWall ? '<button class="act" data-a="rotate"><i>🔄</i><span>Girar</span></button>' : ''}
        ${g.placedInQueue ? '<button class="act gold" data-a="cancelplace"><i>👍</i><span>Listo</span></button>' : '<button class="act no" data-a="cancelplace"><i>✖️</i><span>Cancelar</span></button>'}</div>`;
    }
    if (!ents.length) {
      return `<div class="info"><div class="hint">Tocá una unidad o edificio · Arrastrá para mover la cámara · Pellizcá para hacer zoom · Mantené apretado un botón para ver qué hace</div></div>
        <div class="acts one"><button class="act" data-a="home"><i>🏰</i><span>Centro Urbano</span></button>
        <button class="act" data-a="idle"><i>💤</i><span>Aldeano ocioso</span></button>
        <button class="act" data-a="army"><i>🛡️</i><span>Ejército</span></button></div>`;
    }
    const first = ents[0];
    if (first.cat === 'node') {
      return `<div class="info"><div class="title">${NODE_ICON[first.type as NodeType]} ${NODES[first.type as NodeType].name}</div>
        <div class="sub">${RES_ICON[NODES[first.type as NodeType].res]} <b data-amt>${Math.floor(first.amount)}</b></div>
        ${first.type === 'fish' ? '<div class="sub dim">Lo pescan los barcos pesqueros del muelle.</div>' : ''}</div>
        <div class="acts"></div>`;
    }
    const mine = first.owner === g.me;
    const owner = w.players[first.owner];
    const ownerTag = mine ? '' : ` <small>(${owner.name}${owner.civ ? ' ' + CIVS[owner.civ].emblem : ''})</small>`;
    // ----- edificio
    if (first.cat === 'building') {
      const b = first, d = BUILDINGS[b.type as BuildingType];
      const group = ents.filter((x) => x.cat === 'building' && x.type === b.type);
      const allQ = group.flatMap((x) => x.queue);
      const bar = (attr: string, tech = false) => `<div class="bar${tech ? ' tech' : ''}"><div ${attr}></div></div>`;
      let html = `<div class="info"><div class="title">${BUILD_ICON[b.type as BuildingType]} ${d.name}${group.length > 1 ? ` <b class="mult">×${group.length}</b>` : ''}${ownerTag}
          <small class="hpl">❤️ <span data-hp>${Math.ceil(b.hp)}/${b.maxHp}</span>${b.type === 'farm' ? ` · 🍖 <b data-amt>${Math.floor(b.amount)}</b>` : ''}</small></div>`;
      if (b.type === 'gate') html += `<div class="sub">${b.locked ? '🔒 Bloqueado' : '🔓 Abierto para tu equipo'}</div>`;
      if (b.progress < 1) html += `<div class="prow"><span>🔨 En construcción</span>${bar('data-progress')}</div>`;
      else if (b.ageT >= 0 && pl.age < 4) html += `<div class="prow"><span>👑 ${AGE_NAME[(pl.age + 1) as Age]}</span>${bar('data-progress')}</div>`;
      else if (allQ.length) html += `<div class="prow"><span>${UNIT_ICON[(b.queue[0] ?? allQ[0])]} ${UNITS[b.queue[0] ?? allQ[0]].name}${allQ.length > 1 ? ` <em>+${allQ.length - 1}</em>` : ''}</span>${bar('data-progress')}</div>`;
      if (b.tech) html += `<div class="prow"><span>📜 ${TECHS[b.tech].name}${b.techQueue.length ? ` <em>+${b.techQueue.length}</em>` : ''}</span>${bar('data-tprogress', true)}</div>`;
      if (mine && allQ.length && b.trainT === 0 && w.popOf(g.me) >= w.popCap(g.me)) html += '<div class="sub warn">⚠️ Sin población: construí casas</div>';
      if (!b.tech && b.progress >= 1 && b.ageT < 0 && !b.queue.length) html += `<div class="sub dim">${d.desc}</div>`;
      html += `</div><div class="acts">`;
      if (mine && b.progress >= 1) {
        if (b.type === 'towncenter' && pl.age < 4 && !w.isResearchingAge(g.me)) {
          const next = (pl.age + 1) as 2 | 3 | 4;
          const cost = w.ageCost(g.me, next);
          html += `<button class="act gold" data-a="age" ${w.canAfford(g.me, cost) ? '' : 'data-dis'}><i>👑</i><span>${AGE_NAME[next]}</span><em>${costHtml(cost, pl.res)}</em></button>`;
        }
        for (const u of w.trainsOf(g.me, b.type as BuildingType)) {
          const ud = UNITS[u];
          const locked = pl.age < ud.age;
          const needs = ud.requires && !pl.techs.has(ud.requires);
          const cost = w.unitCost(g.me, u);
          const n = allQ.filter((q) => q === u).length;
          html += `<button class="act ${ud.unique ? 'uniq' : ''}" data-a="train:${u}" ${locked || needs || !w.canAfford(g.me, cost) ? 'data-dis' : ''}>
            <i>${UNIT_ICON[u]}</i><span>${ud.name}</span><em>${locked ? lock(ud.age) : needs ? `🔒 ${TECHS[ud.requires!].name}` : costHtml(cost, pl.res)}</em>${n ? `<b class="badge">${n}</b>` : ''}</button>`;
        }
        for (const t of d.research ?? []) {
          const td = TECHS[t];
          if (pl.techs.has(t)) continue;
          const queued = b.tech === t || b.techQueue.includes(t);
          if (!queued && w.isResearching(g.me, t)) continue;
          const locked = pl.age < td.age;
          const cost = w.techCost(g.me, t);
          html += `<button class="act tech ${queued ? 'on' : ''}" data-a="research:${t}" ${!locked && !queued && w.canAfford(g.me, cost) ? '' : 'data-dis'}>
            <i>${td.icon}</i><span>${td.name}</span><em>${locked ? lock(td.age) : b.tech === t ? '⏳ investigando' : queued ? '⏳ en cola' : costHtml(cost, pl.res)}</em></button>`;
        }
        if (d.trade) {
          for (const r of ['food', 'wood', 'stone'] as Res[]) {
            html += `<button class="act" data-a="buy:${r}" ${pl.res.gold >= TRADE.buy ? '' : 'data-dis'}><i>${RES_ICON[r]}</i><span>Comprar ${TRADE.lot}</span><em>🪙${TRADE.buy}</em></button>`;
            html += `<button class="act" data-a="sell:${r}" ${pl.res[r] >= TRADE.lot ? '' : 'data-dis'}><i>${RES_ICON[r]}</i><span>Vender ${TRADE.lot}</span><em>+🪙${TRADE.sell}</em></button>`;
          }
        }
        if (b.type === 'gate') html += `<button class="act ${b.locked ? 'on' : ''}" data-a="gatelock"><i>${b.locked ? '🔓' : '🔒'}</i><span>${b.locked ? 'Desbloquear' : 'Bloquear'}</span></button>`;
        if (b.queue.length || (b.ageT >= 0 && !b.queue.length)) html += `<button class="act" data-a="cancel"><i>↩️</i><span>Cancelar ${b.queue.length ? 'unidad' : 'edad'}</span></button>`;
        if (b.tech) html += `<button class="act" data-a="cancel:tech"><i>↩️</i><span>Cancelar invest.</span></button>`;
        if (d.trains) html += `<button class="act" data-a="rally"><i>🚩</i><span>Reunión</span></button>`;
      }
      if (mine) html += this.delBtn('Destruir');
      html += `</div>`;
      return html;
    }
    // ----- unidades
    const units = ents.filter((e) => e.cat === 'unit');
    let info: string;
    if (units.length === 1) {
      const u = units[0], d = UNITS[u.type as UnitType];
      const doing = !u.order ? 'Ocioso' : u.order.t === 'gather' ? `${d.naval ? 'Pescando' : 'Recolectando'} ${RES_ICON[u.order.res]}` : u.order.t === 'build' ? 'Construyendo' : u.order.t === 'move' ? 'Moviéndose' : u.order.t === 'heal' ? 'Curando' : 'Atacando';
      const range = d.range > TILE ? ` · 🎯 ${Math.round(w.rangeOf(u) / TILE)}` : '';
      info = `<div class="title">${UNIT_ICON[u.type as UnitType]} ${u.hero ? `👑 ${u.hero} <small>(${d.name})</small>` : d.name}${ownerTag}</div>
        <div class="sub">❤️ <span data-hp>${Math.ceil(u.hp)}/${u.maxHp}</span>${d.atk ? ` · ⚔️ ${w.attackOf(u)}` : ''} · 🛡️ ${d.armorMelee}/${d.armorPierce}${range}</div>
        <div class="sub dim">${mine ? doing + (u.carry ? ` · lleva ${u.carry} ${RES_ICON[u.carryRes!]}` : '') + (u.cmdQueue.length ? ` · ${u.cmdQueue.length} en cola` : '') : d.desc}</div>`;
    } else {
      const counts = new Map<string, number>();
      for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
      info = `<div class="title">${units.length} unidades</div><div class="chips">${[...counts].map(([t, n]) => `<span class="chip">${UNIT_ICON[t as UnitType]} ${n}</span>`).join('')}</div>`;
    }
    let acts = '';
    if (mine) {
      const vills = units.some((u) => u.type === 'villager');
      const fighters = units.filter((u) => UNITS[u.type as UnitType].atk > 0 && u.type !== 'villager' && !UNITS[u.type as UnitType].gathers);
      if (vills) acts += `<button class="act gold" data-a="buildmenu"><i>🔨</i><span>Construir</span></button>`;
      if (fighters.length) acts += `<button class="act ${g.mode === 'attack' ? 'on' : ''}" data-a="attack"><i>⚔️</i><span>Atacar zona</span></button>`;
      acts += `<button class="act ${g.queueMode ? 'on' : ''}" data-a="queue"><i>➕</i><span>En cola${g.queueMode ? ' ✓' : ''}</span></button>`;
      if (fighters.length) {
        const cur = new Set(fighters.map((u) => u.stance));
        for (const s of ['agg', 'def', 'pas'] as Stance[])
          acts += `<button class="act stance ${cur.size === 1 && cur.has(s) ? 'on' : ''}" data-a="stance:${s}"><i>${STANCE_ICON[s]}</i><span>${STANCE_NAME[s]}</span></button>`;
      }
      acts += `<button class="act" data-a="stop"><i>✋</i><span>Detener</span></button>`;
      acts += this.delBtn('Eliminar');
    }
    return `<div class="info">${info}</div><div class="acts">${acts}</div>`;
  }

  private delBtn(label: string): string {
    const armed = this.delAt > 0 && performance.now() - this.delAt < 2500;
    return `<button class="act ${armed ? 'no' : ''}" data-a="delete"><i>🗑️</i><span>${armed ? '¿Seguro?' : label}</span></button>`;
  }

  /** Menú de construcción en una ventana propia */
  private renderSheet(): string {
    const g = this.g, w = g.world, pl = w.players[g.me];
    let html = `<div class="sheet-card"><div class="sheet-head"><b>🔨 ¿Qué construimos?</b><small>Mantené apretado para ver detalles</small><button data-a="back" aria-label="Cerrar">✖️</button></div><div class="sheet-body">`;
    for (const [group, list] of BUILD_GROUPS) {
      html += `<h4>${group}</h4><div class="sheet-grid">`;
      for (const b of list) {
        const d = BUILDINGS[b];
        const locked = pl.age < d.age;
        const cost = w.buildingCost(g.me, b);
        html += `<button class="bcard" data-a="place:${b}" ${locked || !w.canAfford(g.me, cost) ? 'data-dis' : ''}>
          <i>${BUILD_ICON[b]}</i><b>${d.name}</b><em>${locked ? lock(d.age) : costHtml(cost, pl.res)}</em><small>${d.desc}</small></button>`;
      }
      html += `</div>`;
    }
    return html + `</div></div>`;
  }
}
