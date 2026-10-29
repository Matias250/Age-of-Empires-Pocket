// Desarrollo de un escenario de historia: presentación, objetivo en pantalla y avisos.
import { Campaign, Scenario, ScenarioState, ScnLine } from '../sim/campaigns.js';
import type { Game } from './game.js';

// ---------------------------------------------------------- progreso guardado
function loadDone(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('historias') ?? '{}') ?? {}; } catch { return {}; }
}
let done = loadDone();
export const storyDone = (id: string) => !!done[id];
export function markStoryDone(id: string) {
  done[id] = Date.now();
  try { localStorage.setItem('historias', JSON.stringify(done)); } catch { /* sin almacenamiento */ }
}
/** Un escenario se habilita al completar el anterior de su campaña */
export const storyOpen = (c: Campaign, i: number) => i === 0 || storyDone(c.scenarios[i - 1].id);
export const campaignCount = (c: Campaign) => c.scenarios.filter((s) => storyDone(s.id)).length;

export class ScenarioRunner {
  readonly state: ScenarioState;
  private queue: ScnLine[] = [];
  private dlg = document.getElementById('dialog')!;
  private obj = document.getElementById('objective')!;
  private lastGoal = '';
  result: 'win' | 'lose' | null = null;

  constructor(private g: Game, readonly scn: Scenario) {
    this.state = new ScenarioState(g.world, scn);
  }

  start() {
    const extra: ScnLine[] = [];
    if (this.scn.armyOnly) extra.push({ who: 'Crónica', icon: '📜', text: 'En esta historia solo tenés tu ejército: no hay aldeanos ni podés entrenar más tropas.' });
    if (this.scn.recruits?.length) extra.push({ who: 'Crónica', icon: '📜', text: `Hay soldados en gris sin señor. Si ${this.scn.hero?.name ?? 'tu héroe'} pasa cerca, se unen a tu ejército.` });
    this.queue = [...this.scn.intro, ...extra, { who: 'Objetivo', icon: '🎯', text: this.scn.goalText + (this.scn.hero ? `. Si ${this.scn.hero.name} muere, perdés.` : '.') }];
    this.showLine();
    this.renderGoal();
  }

  destroy() {
    this.dlg.hidden = true; this.obj.hidden = true; this.dlg.onclick = null;
  }

  private showLine() {
    const l = this.queue.shift();
    if (!l) { this.dlg.hidden = true; this.g.paused = false; return; }
    this.g.paused = true;
    this.dlg.hidden = false;
    this.dlg.innerHTML = `<div class="who"><span>${l.icon}</span>${l.who}</div>
      <div class="text">${l.text}</div><button class="big">${this.queue.length ? 'Seguir ▸' : '¡A la batalla!'}</button>`;
    this.dlg.onclick = () => this.showLine();
  }

  private renderGoal() {
    const p = this.state.progress();
    this.obj.hidden = false;
    this.obj.innerHTML = `<span class="step">🎯</span> ${this.scn.goalText}${p ? ` <b>${p}</b>` : ''}`;
  }

  /** Cada tick de simulación */
  tick() {
    if (this.result) return;
    this.result = this.state.step();
    if (this.result === 'win') markStoryDone(this.scn.id);
  }

  /** Cada cuadro */
  update() {
    for (const e of this.state.events.splice(0)) this.g.hud.toast(e, e.startsWith('⚔️') || e.startsWith('💀'));
    if (!this.dlg.hidden) return;
    const p = this.state.progress();
    if (p !== this.lastGoal) { this.lastGoal = p; this.renderGoal(); }
    if (this.result) this.obj.hidden = true;
  }
}
