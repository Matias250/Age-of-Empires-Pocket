// Interfaz en HTML sobre el canvas: recursos, panel de selección, botones grandes para dedos.
import {
  AGE_NAME, AGE_UP, BUILDINGS, BuildingType, NODES, NodeType, Res, RES_LIST, TICK_RATE, TILE, UNITS, UnitType, ResBag,
  TECHS, TechType, TRADE,
} from '../sim/data.js';
import { Entity } from '../sim/world.js';
import type { Game } from './game.js';

export const UNIT_ICON: Record<UnitType, string> = { villager: '🧑‍🌾', militia: '🗡️', spearman: '🔱', archer: '🏹', knight: '🐎', ram: '🐏', monk: '🧙', champion: '🛡️' };
export const BUILD_ICON: Record<BuildingType, string> = {
  towncenter: '🏰', house: '🏠', barracks: '⚔️', range: '🎯', stable: '🐴', workshop: '⚙️',
  mill: '🌾', lumbercamp: '🪓', miningcamp: '⛏️', farm: '🌱', tower: '🗼',
  blacksmith: '⚒️', market: '⚖️', castle: '🏯', monastery: '⛪', wall: '🪵',
};
export const RES_ICON: Record<Res, string> = { food: '🍖', wood: '🪵', gold: '🪙', stone: '🪨' };
const NODE_ICON: Record<NodeType, string> = { tree: '🌳', berries: '🫐', goldmine: '🪙', stonemine: '🪨' };

const BUILD_GROUPS: [string, BuildingType[]][] = [
  ['Economía', ['house', 'farm', 'mill', 'lumbercamp', 'miningcamp', 'market', 'towncenter']],
  ['Militar', ['barracks', 'range', 'stable', 'workshop', 'blacksmith', 'monastery']],
  ['Defensa', ['wall', 'tower', 'castle']],
];

const $ = (id: string) => document.getElementById(id)!;

function costHtml(c: Partial<ResBag>, have: ResBag): string {
  return RES_LIST.filter((r) => c[r]).map((r) => `<span class="${have[r] < (c[r] ?? 0) ? 'short' : ''}">${RES_ICON[r]}${c[r]}</span>`).join('');
}

export class Hud {
  minimap: HTMLCanvasElement;
  private root = $('hud');
  private panel = $('panel');
  private sig = '';
  private topAt = 0;
  private handlers: [HTMLElement, string, EventListener][] = [];

  constructor(private g: Game) {
    this.root.hidden = false;
    this.minimap = $('minimap') as HTMLCanvasElement;
    this.on(this.panel, 'click', (e) => this.action((e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a')));
    this.on($('sheet'), 'click', (e) => {
      const t = e.target as HTMLElement;
      if (t.id === 'sheet') { g.buildMenu = false; this.sig = ''; return; }
      this.action(t.closest('[data-a]')?.getAttribute('data-a'));
    });
    this.on($('sidebtns'), 'click', (e) => this.action((e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a')));
    this.on($('btnPause'), 'click', () => this.togglePause());
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

  private on(el: HTMLElement, n: string, f: EventListener) { el.addEventListener(n, f); this.handlers.push([el, n, f]); }

  destroy() {
    for (const [el, n, f] of this.handlers) el.removeEventListener(n, f);
    this.root.hidden = true;
    $('sheet').hidden = true;
    $('overlay').hidden = true;
    $('toasts').innerHTML = '';
  }

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

  togglePause() {
    const g = this.g;
    if (g.over) return;
    g.paused = !g.paused;
    const o = $('overlay');
    if (!g.paused) { o.hidden = true; return; }
    o.hidden = false;
    o.innerHTML = `<div class="card">
      <h2>Pausa</h2>
      <div class="row">Velocidad:
        ${[1, 1.5, 2].map((s) => `<button class="chip ${g.speed === s ? 'on' : ''}" data-speed="${s}">${s}×</button>`).join('')}
      </div>
      <button class="big" data-o="resume">Continuar</button>
      <button class="big ghost" data-o="exit">Salir al menú</button>
    </div>`;
    o.onclick = (e) => {
      const t = e.target as HTMLElement;
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
    const o = $('overlay');
    o.hidden = false;
    o.innerHTML = `<div class="card end ${win ? 'win' : 'lose'}">
      <h1>${win ? '¡Victoria!' : 'Derrota'}</h1>
      <p>${tut && win ? 'Los Cuervos Negros huyeron de Varnia. La frontera vuelve a estar a salvo… por ahora.' : win ? 'Tu reino domina la región.' : 'Tu Centro Urbano cayó.'}</p>
      <table>
        <tr><td>Tiempo</td><td>${mins}:${String(secs).padStart(2, '0')}</td></tr>
        <tr><td>Recursos juntados</td><td>${RES_LIST.map((r) => `${RES_ICON[r]} ${st.gathered[r]}`).join(' ')}</td></tr>
        <tr><td>Unidades entrenadas</td><td>${st.trained}</td></tr>
        <tr><td>Enemigos derrotados</td><td>${st.kills}</td></tr>
        <tr><td>Pérdidas</td><td>${st.lost}</td></tr>
      </table>
      ${tut ? '' : '<button class="big" data-o="again">Revancha</button>'}
      <button class="big ghost" data-o="exit">Menú principal</button>
    </div>`;
    o.onclick = (e) => {
      const a = (e.target as HTMLElement).getAttribute('data-o');
      if (a === 'exit') g.exit();
      if (a === 'again') { const cfg = { ...g.match.cfg, seed: (g.match.cfg.seed * 31 + 7) % 100000 }; g.exit(); window.dispatchEvent(new CustomEvent('start-match', { detail: cfg })); }
    };
  }

  // ------------------------------------------------------------------
  private action(a: string | null | undefined) {
    if (!a) return;
    const g = this.g, w = g.world;
    const [cmd, arg] = a.split(':');
    switch (cmd) {
      case 'buildmenu': g.buildMenu = true; break;
      case 'quickbuild': g.openBuildMenu(); break;
      case 'research': { const b = w.get(g.sel[0]); if (b) w.issue({ t: 'research', p: g.me, bid: b.id, tech: arg as TechType }); break; }
      case 'buy': case 'sell': w.issue({ t: 'trade', p: g.me, res: arg as Res, buy: cmd === 'buy' }); break;
      case 'back': g.buildMenu = false; g.mode = 'normal'; break;
      case 'place': g.buildMenu = false; g.startPlacing(arg as BuildingType); break;
      case 'confirm': g.confirmPlacement(); this.sig = ''; return;
      case 'cancelplace': g.placing = null; g.ghost = null; break;
      case 'train': g.train(arg as UnitType); break;
      case 'age': { const b = w.get(g.sel[0]); if (b) w.issue({ t: 'age', p: g.me, bid: b.id }); break; }
      case 'cancel': { const b = w.get(g.sel[0]); if (b) w.issue({ t: 'cancel', p: g.me, bid: b.id }); break; }
      case 'rally': g.mode = 'rally'; this.toast('Tocá el mapa para marcar el punto de reunión'); break;
      case 'stop': w.issue({ t: 'stop', p: g.me, ids: g.selUnits().map((u) => u.id) }); break;
      case 'attack': g.mode = g.mode === 'attack' ? 'normal' : 'attack'; if (g.mode === 'attack') this.toast('Tocá el destino: atacarán todo lo que encuentren'); break;
      case 'deselect': g.select([]); break;
      case 'idle': g.selectIdleVillager(); break;
      case 'army': g.selectArmy(); break;
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
      $('res').innerHTML = RES_LIST.map((r) => `<span>${RES_ICON[r]} <b>${Math.floor(pl.res[r])}</b></span>`).join('') +
        `<span>👥 <b class="${w.popOf(g.me) >= w.popCap(g.me) ? 'short' : ''}">${w.popOf(g.me)}/${w.popCap(g.me)}</b></span>`;
      const t = Math.floor(w.tick / TICK_RATE);
      $('clock').textContent = `${AGE_NAME[pl.age]} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      const idle = w.unitsOf(g.me, 'villager').filter((v) => !v.order).length;
      $('idleCount').textContent = idle ? String(idle) : '';
      $('idleCount').hidden = !idle;
    }
    // botones laterales activos
    $('btnBox').classList.toggle('on', g.mode === 'box');

    const sig = this.signature();
    if (sig !== this.sig) {
      this.sig = sig;
      this.panel.innerHTML = this.render();
      const sheet = $('sheet');
      const show = g.buildMenu && g.selUnits().some((u) => u.type === 'villager');
      sheet.hidden = !show;
      if (show) {
        const sc = sheet.querySelector('.sheet-body')?.scrollTop ?? 0;
        sheet.innerHTML = this.renderSheet();
        const body = sheet.querySelector('.sheet-body'); if (body) body.scrollTop = sc;
      }
    }
    // barras de progreso en vivo
    const pb = this.panel.querySelector<HTMLElement>('[data-progress]');
    if (pb) {
      const b = w.get(g.sel[0]);
      if (b) {
        let f = 0;
        if (b.progress < 1) f = b.progress;
        else if (b.tech) f = b.techT / TECHS[b.tech].time;
        else if (b.ageT >= 0) f = b.ageT / AGE_UP.time;
        else if (b.queue.length) f = b.trainT / UNITS[b.queue[0]].trainTime;
        pb.style.width = Math.round(f * 100) + '%';
      }
    }
    const hp = this.panel.querySelector<HTMLElement>('[data-hp]');
    if (hp && g.sel.length === 1) { const e = w.get(g.sel[0]); if (e && e.cat !== 'node') hp.textContent = `${Math.ceil(e.hp)}/${e.maxHp}`; else if (e) hp.textContent = String(e.amount); }
  }

  private signature(): string {
    const g = this.g, w = g.world, pl = w.players[g.me];
    const parts: (string | number)[] = [g.sel.join(','), g.mode, g.buildMenu ? 1 : 0, g.placing ?? '', pl.age, w.isResearchingAge(g.me) ? 1 : 0];
    // asequibilidad (solo cambia de a saltos de 25)
    parts.push(RES_LIST.map((r) => Math.floor(pl.res[r] / 25)).join('.'));
    if (g.sel.length === 1) {
      const e = w.get(g.sel[0]);
      if (e) parts.push(e.queue.join(''), e.progress >= 1 ? 1 : 0, e.ageT >= 0 ? 1 : 0, e.order?.t ?? '', e.carry > 0 ? 1 : 0, e.tech ?? '', [...pl.techs].join(''));
    }
    return parts.join('|');
  }

  private render(): string {
    const g = this.g, w = g.world, pl = w.players[g.me];
    const ents = g.sel.map((id) => w.get(id)).filter((e): e is Entity => !!e);
    if (g.placing) {
      const d = BUILDINGS[g.placing];
      return `<div class="info"><div class="title">${BUILD_ICON[g.placing]} ${d.name}</div>
        <div class="sub">Tocá o arrastrá el contorno para ubicarlo y confirmá.</div><div class="sub dim">${costHtml(d.cost, pl.res)}</div></div>
        <div class="acts"><button class="act no" data-a="cancelplace"><i>✖️</i><span>Cancelar</span></button>
        <button class="act yes" data-a="confirm"><i>✔️</i><span>Construir aquí</span></button></div>`;
    }
    if (!ents.length) {
      return `<div class="info"><div class="hint">Tocá una unidad o edificio · Arrastrá para mover la cámara · Pellizcá para hacer zoom</div></div>
        <div class="acts"><button class="act" data-a="home"><i>🏰</i><span>Centro Urbano</span></button>
        <button class="act" data-a="idle"><i>💤</i><span>Aldeano ocioso</span></button>
        <button class="act" data-a="army"><i>🛡️</i><span>Ejército</span></button></div>`;
    }
    const first = ents[0];
    // ----- recurso natural
    if (first.cat === 'node') {
      return `<div class="info"><div class="title">${NODE_ICON[first.type as NodeType]} ${NODES[first.type as NodeType].name}</div>
        <div class="sub">Quedan <b data-hp>${first.amount}</b> de ${RES_ICON[NODES[first.type as NodeType].res]}</div></div>
        <div class="acts"><button class="act" data-a="deselect"><i>✖️</i><span>Cerrar</span></button></div>`;
    }
    const mine = first.owner === g.me;
    const ownerName = w.players[first.owner].name;
    // ----- edificio
    if (first.cat === 'building') {
      const b = first, d = BUILDINGS[b.type as BuildingType];
      let html = `<div class="info"><div class="title">${BUILD_ICON[b.type as BuildingType]} ${d.name}${mine ? '' : ` <small>(${ownerName})</small>`}</div>
        <div class="sub">❤️ <span data-hp>${Math.ceil(b.hp)}/${b.maxHp}</span>${b.type === 'farm' ? ` · 🍖 ${b.amount}` : ''}</div>`;
      if (b.progress < 1) html += `<div class="sub">En construcción</div><div class="bar"><div data-progress></div></div>`;
      else if (b.tech) html += `<div class="sub">Investigando ${TECHS[b.tech].name}…</div><div class="bar"><div data-progress></div></div>`;
      else if (b.ageT >= 0) html += `<div class="sub">Avanzando a ${AGE_NAME[2]}…</div><div class="bar"><div data-progress></div></div>`;
      else if (b.queue.length) html += `<div class="sub">Entrenando ${UNITS[b.queue[0]].name} ${b.queue.length > 1 ? `(+${b.queue.length - 1} en cola)` : ''}</div><div class="bar"><div data-progress></div></div>`;
      else html += `<div class="sub dim">${d.desc}</div>`;
      html += `</div><div class="acts">`;
      if (mine && b.progress >= 1) {
        for (const u of d.trains ?? []) {
          const ud = UNITS[u];
          const locked = pl.age < ud.age;
          const n = b.queue.filter((q) => q === u).length;
          html += `<button class="act" data-a="train:${u}" ${locked || !w.canAfford(g.me, ud.cost) ? 'data-dis' : ''} title="${ud.desc}">
            <i>${UNIT_ICON[u]}</i><span>${ud.name}</span><em>${locked ? '🔒 Era II' : costHtml(ud.cost, pl.res)}</em>${n ? `<b class="badge">${n}</b>` : ''}</button>`;
        }
        for (const t of d.research ?? []) {
          const td = TECHS[t];
          if (pl.techs.has(t) || (w.isResearching(g.me, t) && b.tech !== t)) continue;
          if (b.tech === t) continue;
          html += `<button class="act tech" data-a="research:${t}" ${w.canAfford(g.me, td.cost) && !b.tech ? '' : 'data-dis'} title="${td.desc}">
            <i>${td.icon}</i><span>${td.name}</span><em>${costHtml(td.cost, pl.res)}</em></button>`;
        }
        if (d.trade) {
          for (const r of ['food', 'wood', 'stone'] as Res[]) {
            html += `<button class="act" data-a="buy:${r}" ${pl.res.gold >= TRADE.buy ? '' : 'data-dis'}><i>${RES_ICON[r]}</i><span>Comprar ${TRADE.lot}</span><em>🪙${TRADE.buy}</em></button>`;
            html += `<button class="act" data-a="sell:${r}" ${pl.res[r] >= TRADE.lot ? '' : 'data-dis'}><i>${RES_ICON[r]}</i><span>Vender ${TRADE.lot}</span><em>+🪙${TRADE.sell}</em></button>`;
          }
        }
        if (b.type === 'towncenter' && pl.age === 1 && !w.isResearchingAge(g.me))
          html += `<button class="act gold" data-a="age" ${w.canAfford(g.me, AGE_UP.cost) ? '' : 'data-dis'}><i>👑</i><span>Era de los Reinos</span><em>${costHtml(AGE_UP.cost, pl.res)}</em></button>`;
        if (b.queue.length || b.ageT >= 0 || b.tech) html += `<button class="act" data-a="cancel"><i>↩️</i><span>Cancelar</span></button>`;
        if (d.trains) html += `<button class="act" data-a="rally"><i>🚩</i><span>Reunión</span></button>`;
      }
      html += `<button class="act" data-a="deselect"><i>✖️</i><span>Cerrar</span></button></div>`;
      return html;
    }
    // ----- unidades
    const units = ents.filter((e) => e.cat === 'unit');
    let info: string;
    if (units.length === 1) {
      const u = units[0], d = UNITS[u.type as UnitType];
      const doing = !u.order ? 'Ocioso' : u.order.t === 'gather' ? `Recolectando ${RES_ICON[u.order.res]}` : u.order.t === 'build' ? 'Construyendo' : u.order.t === 'move' ? 'Moviéndose' : u.order.t === 'heal' ? 'Curando' : 'Atacando';
      info = `<div class="title">${UNIT_ICON[u.type as UnitType]} ${d.name}${mine ? '' : ` <small>(${ownerName})</small>`}</div>
        <div class="sub">❤️ <span data-hp>${Math.ceil(u.hp)}/${u.maxHp}</span> · ⚔️ ${d.atk} · 🛡️ ${d.armorMelee}/${d.armorPierce}${d.atkType === 'pierce' ? ' · 🎯 alcance' : ''}</div>
        <div class="sub dim">${mine ? doing + (u.carry ? ` · lleva ${u.carry} ${RES_ICON[u.carryRes!]}` : '') : d.desc}</div>`;
    } else {
      const counts = new Map<string, number>();
      for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
      info = `<div class="title">${units.length} unidades</div><div class="chips">${[...counts].map(([t, n]) => `<span class="chip">${UNIT_ICON[t as UnitType]} ${n}</span>`).join('')}</div>`;
    }
    let acts = '';
    if (mine) {
      const vills = units.some((u) => u.type === 'villager');
      {
        if (vills) acts += `<button class="act gold" data-a="buildmenu"><i>🔨</i><span>Construir</span></button>`;
        if (units.some((u) => u.type !== 'villager')) acts += `<button class="act ${g.mode === 'attack' ? 'on' : ''}" data-a="attack"><i>⚔️</i><span>Atacar zona</span></button>`;
        acts += `<button class="act" data-a="stop"><i>✋</i><span>Detener</span></button>`;
        acts += `<button class="act" data-a="deselect"><i>✖️</i><span>Cerrar</span></button>`;
      }
    } else acts = `<button class="act" data-a="deselect"><i>✖️</i><span>Cerrar</span></button>`;
    return `<div class="info">${info}</div><div class="acts">${acts}</div>`;
  }

  /** Menú de construcción en una ventana propia, con scroll desde arriba */
  private renderSheet(): string {
    const g = this.g, w = g.world, pl = w.players[g.me];
    let html = `<div class="sheet-card"><div class="sheet-head"><b>🔨 ¿Qué construimos?</b><button data-a="back" aria-label="Cerrar">✖️</button></div><div class="sheet-body">`;
    for (const [group, list] of BUILD_GROUPS) {
      html += `<h4>${group}</h4><div class="sheet-grid">`;
      for (const b of list) {
        const d = BUILDINGS[b];
        const locked = pl.age < d.age;
        html += `<button class="bcard" data-a="place:${b}" ${locked || !w.canAfford(g.me, d.cost) ? 'data-dis' : ''}>
          <i>${BUILD_ICON[b]}</i><b>${d.name}</b><em>${locked ? '🔒 Era de los Reinos' : costHtml(d.cost, pl.res)}</em><small>${d.desc}</small></button>`;
      }
      html += `</div>`;
    }
    return html + `</div></div>`;
  }
}
