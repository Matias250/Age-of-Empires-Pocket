// Modo historia corto que enseña a jugar: "La Crónica de Varnia".
import { TILE } from '../sim/data.js';
import { GEvent } from '../sim/world.js';
import type { Game } from './game.js';

interface Line { who: 'Ilen' | 'Bram' | 'Narrador'; text: string }
interface Step {
  lines: Line[];
  goal: string;
  enter?: () => void;
  done: () => boolean;
  progress?: () => string;
}

const PORTRAIT: Record<Line['who'], string> = { Ilen: '👸', Bram: '🧔', Narrador: '📜' };

export class Tutorial {
  private steps: Step[];
  private i = -1;
  private queue: Line[] = [];
  private raiders: number[] = [];
  private dlg = document.getElementById('dialog')!;
  private obj = document.getElementById('objective')!;

  constructor(private g: Game) {
    const w = g.world, me = g.me;
    const pl = w.players[me];
    const vill = () => w.unitsOf(me, 'villager').length;
    const army = () => w.unitsOf(me).filter((u) => u.type !== 'villager').length;
    const done = (t: Parameters<typeof w.buildingsOf>[1]) => w.buildingsOf(me, t, true).length;
    const gift = (food: number, wood: number, gold: number) => { pl.res.food += food; pl.res.wood += wood; pl.res.gold += gold; };
    this.steps = [
      {
        lines: [
          { who: 'Narrador', text: 'Año 412 de la Corona de Varnia. En la frontera del este, los Cuervos Negros arrasaron la aldea de Valdeluz.' },
          { who: 'Bram', text: 'Señora Ilen… solo quedamos tres aldeanos y el Centro Urbano. Si cae, se pierde la frontera entera.' },
          { who: 'Ilen', text: 'Entonces reconstruimos, Bram. Y después les devolvemos la visita.' },
          { who: 'Bram', text: 'Primero, madera. Tocá un aldeano y después tocá un árbol 🌳.' },
        ],
        goal: 'Mandá un aldeano a cortar madera 🌳',
        done: () => w.unitsOf(me, 'villager').some((u) => u.order?.t === 'gather' && u.order.res === 'wood'),
      },
      {
        lines: [{ who: 'Bram', text: '¡Eso es! Los aldeanos llevan lo que juntan al Centro Urbano. Esperá a que junten un poco.' }],
        goal: 'Juntá 40 de madera',
        progress: () => `${Math.min(40, pl.stats.gathered.wood)}/40`,
        done: () => pl.stats.gathered.wood >= 40,
      },
      {
        lines: [{ who: 'Bram', text: 'Cada 🏠 Casa da lugar a 5 personas más. Tocá el botón dorado 🔨 de la derecha, elegí Casa, ubicala tocando el mapa y confirmá con ✔️.' }],
        enter: () => document.getElementById('btnBuild')?.classList.add('pulse'),
        goal: 'Construí una Casa 🏠',
        done: () => done('house') > 0,
      },
      {
        lines: [
          { who: 'Ilen', text: 'Necesitamos más manos. Tocá el 🏰 Centro Urbano y entrená aldeanos.' },
          { who: 'Bram', text: 'Y mandá a alguno a las bayas 🫐: sin comida no hay aldeanos ni soldados. Los vecinos nos mandaron 100 de comida.' },
        ],
        enter: () => { document.getElementById('btnBuild')?.classList.remove('pulse'); gift(100, 0, 0); },
        goal: 'Llegá a 6 aldeanos',
        progress: () => `${Math.min(6, vill())}/6`,
        done: () => vill() >= 6,
      },
      {
        lines: [{ who: 'Bram', text: 'Los Cuervos van a volver. Construí un ⚔️ Cuartel. Te consigo 150 de madera del bosque viejo.' }],
        enter: () => gift(0, 150, 0),
        goal: 'Construí un Cuartel ⚔️',
        done: () => done('barracks') > 0,
      },
      {
        lines: [
          { who: 'Ilen', text: 'Ahora, soldados. Tocá el Cuartel y entrená tropas.' },
          { who: 'Bram', text: 'Los 🗡️ Espadachines aguantan y rompen edificios. Cuando avances a la Edad Media vas a tener lanceros, arqueros y jinetes. Acá tenés oro y comida del tesoro.' },
        ],
        enter: () => gift(200, 0, 80),
        goal: 'Entrená 4 soldados',
        progress: () => `${Math.min(4, army())}/4`,
        done: () => army() >= 4,
      },
      {
        lines: [
          { who: 'Bram', text: '¡Humo en el este! Una banda de Cuervos viene directo a la aldea.' },
          { who: 'Ilen', text: 'Tocá 🛡️ Ejército para elegir a todos los soldados, y después tocá a un enemigo para atacarlo.' },
        ],
        enter: () => {
          for (let i = 0; i < 4; i++) {
            const u = w.spawnUnit(1, i < 3 ? 'militia' : 'spearman', (24 + (i % 2)) * TILE, (23 + i) * TILE);
            this.raiders.push(u.id);
          }
          const tc = w.buildingsOf(me, 'towncenter')[0];
          if (tc) w.issue({ t: 'attackMove', p: 1, ids: this.raiders, x: tc.x, y: tc.y });
          g.centerOn(17 * TILE, 25 * TILE);
        },
        goal: 'Defendé la aldea',
        progress: () => `${this.raiders.filter((id) => !w.entities.has(id)).length}/4`,
        done: () => this.raiders.every((id) => !w.entities.has(id)),
      },
      {
        lines: [
          { who: 'Ilen', text: 'Bien hecho. Ahora llevemos la pelea a su puerta: el Fortín de los Cuervos está al noreste.' },
          { who: 'Bram', text: 'Juntá tu ejército, tocá ⚔️ Atacar zona y tocá cerca del fortín. Si te faltan soldados, entrená más: el pueblo donó recursos.' },
          { who: 'Bram', text: 'Los vecinos levantaron dos casas 🏠 más, así podés entrenar más soldados.' },
          { who: 'Narrador', text: 'Regla de las partidas rápidas: el bando que pierde su Centro Urbano, pierde la partida.' },
        ],
        enter: () => {
          gift(250, 100, 120);
          const tc = w.buildingsOf(me, 'towncenter')[0];
          let placed = 0;
          for (let r = 4; r < 10 && placed < 2; r++)
            for (let dy = -r; dy <= r && placed < 2; dy++)
              for (let dx = -r; dx <= r && placed < 2; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !tc) continue;
                const x = tc.tx + dx, y = tc.ty + dy;
                if (!w.canPlace(me, 'house', x, y) && w.areaFree(x, y, 2, 1)) { w.placeBuilding(me, 'house', x, y, true); placed++; }
              }
        },
        goal: 'Destruí el Fortín de los Cuervos 🏴',
        done: () => w.winnerTeam === 0,
      },
    ];
    w.checkDefeat = true;
  }

  start() { this.next(); }

  destroy() {
    this.dlg.hidden = true;
    this.obj.hidden = true;
    this.dlg.onclick = null;
    document.getElementById('btnBuild')?.classList.remove('pulse');
  }

  private next() {
    this.i++;
    const s = this.steps[this.i];
    if (!s) { this.obj.hidden = true; return; }
    s.enter?.();
    this.queue = [...s.lines];
    this.showLine();
    this.renderGoal();
  }

  private showLine() {
    const l = this.queue.shift();
    if (!l) { this.dlg.hidden = true; this.g.paused = false; return; }
    this.g.paused = true;
    this.dlg.hidden = false;
    this.dlg.innerHTML = `<div class="who"><span>${PORTRAIT[l.who]}</span>${l.who === 'Narrador' ? 'Crónica' : l.who}</div>
      <div class="text">${l.text}</div><button class="big">${this.queue.length ? 'Seguir ▸' : '¡Vamos!'}</button>`;
    this.dlg.onclick = () => this.showLine();
  }

  private renderGoal() {
    const s = this.steps[this.i];
    if (!s) return;
    this.obj.hidden = false;
    this.obj.innerHTML = `<span class="step">${this.i + 1}/${this.steps.length}</span> ${s.goal}${s.progress ? ` <b>${s.progress()}</b>` : ''}`;
  }

  private lastGoal = '';
  update() {
    const s = this.steps[this.i];
    if (!s || !this.dlg.hidden) return;
    const txt = s.progress?.() ?? '';
    if (txt !== this.lastGoal) { this.lastGoal = txt; this.renderGoal(); }
    if (s.done()) {
      if (this.i === this.steps.length - 1) { this.obj.hidden = true; this.i++; return; }
      this.g.hud.toast('✅ Objetivo cumplido');
      this.next();
    }
  }

  onEvents(_ev: GEvent[]) { /* reservado para eventos futuros de la historia */ }
}
