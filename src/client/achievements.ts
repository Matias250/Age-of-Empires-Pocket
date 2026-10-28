// Logros: se guardan en el teléfono y desbloquean civilizaciones nuevas.
import { CIV_LIST, CIVS, CivId } from '../sim/civs.js';
import { isLandArmy, TICK_RATE, UNITS, UnitType } from '../sim/data.js';
import type { Game } from './game.js';

export interface AchDef { id: string; icon: string; name: string; desc: string }

export const ACHIEVEMENTS: AchDef[] = [
  { id: 'tutorial', icon: '📜', name: 'Aprendiz de Varnia', desc: 'Completá la Historia.' },
  { id: 'first', icon: '🏆', name: 'Primera victoria', desc: 'Ganá una escaramuza.' },
  { id: 'hard', icon: '💀', name: 'Sin miedo', desc: 'Ganale a una IA en Difícil.' },
  { id: 'fastimp', icon: '👑', name: 'Imperio veloz', desc: 'Llegá a la Edad Imperial antes de los 18 minutos (modo Normal).' },
  { id: 'castle', icon: '🏯', name: 'Señor del castillo', desc: 'Construí un Castillo.' },
  { id: 'scholar', icon: '📚', name: 'Erudito', desc: 'Investigá 10 mejoras en una misma partida (modo Normal).' },
  { id: 'eco', icon: '💰', name: 'Gran economía', desc: 'Juntá 10.000 recursos en una partida.' },
  { id: 'butcher', icon: '⚔️', name: 'Azote de reinos', desc: 'Derrotá 100 enemigos en una partida.' },
  { id: 'untouch', icon: '🛡️', name: 'Intocable', desc: 'Ganá perdiendo menos de 5 unidades o edificios.' },
  { id: 'blitz', icon: '⚡', name: 'Relámpago', desc: 'Ganá en menos de 12 minutos (modo Normal).' },
  { id: 'admiral', icon: '⚓', name: 'Almirante', desc: 'Entrená 10 barcos de guerra en una partida.' },
  { id: 'ffa', icon: '🥇', name: 'Último en pie', desc: 'Ganá un todos contra todos de 3 o más reinos.' },
  { id: 'team', icon: '🤝', name: 'Hermanos de armas', desc: 'Ganá una partida con aliados.' },
  { id: 'imperial', icon: '🎖️', name: 'Gloria imperial', desc: 'Ganá una partida de Combate imperial.' },
  { id: 'army', icon: '🪖', name: 'Gran ejército', desc: 'Tené 50 soldados al mismo tiempo.' },
  { id: 'wall', icon: '🧱', name: 'Muralla infranqueable', desc: 'Tené 30 tramos de muralla de piedra.' },
  { id: 'score', icon: '🧠', name: 'Gran estratega', desc: 'Ganá con 5.000 puntos o más.' },
  { id: 'legend', icon: '🌟', name: 'Leyenda', desc: 'Ganá 10 escaramuzas.' },
  { id: 'travel', icon: '🗺️', name: 'Trotamundos', desc: 'Ganá en 5 mapas distintos.' },
  { id: 'collect', icon: '🏛️', name: 'Coleccionista', desc: 'Ganá con 5 civilizaciones distintas.' },
];

interface Progress { done: Record<string, number>; wins: number; maps: string[]; civs: string[] }

function load(): Progress {
  try {
    const v = JSON.parse(localStorage.getItem('logros') ?? '') as Progress;
    if (v && v.done) return { done: v.done, wins: v.wins ?? 0, maps: v.maps ?? [], civs: v.civs ?? [] };
  } catch { /* sin datos */ }
  return { done: {}, wins: 0, maps: [], civs: [] };
}
let prog = load();
function save() { try { localStorage.setItem('logros', JSON.stringify(prog)); } catch { /* sin almacenamiento */ } }

export const achDone = (id: string) => !!prog.done[id];
export const achCount = () => ACHIEVEMENTS.filter((a) => prog.done[a.id]).length;
export const achProgress = () => ({ wins: prog.wins, maps: prog.maps.length, civs: prog.civs.length });
export const civUnlocked = (c: CivId) => (CIVS[c].unlock ?? 0) <= achCount();
export const unlockedCivs = () => CIV_LIST.filter(civUnlocked);

/** Marca un logro; devuelve las civilizaciones que se desbloquearon con él */
function grant(id: string): CivId[] {
  if (prog.done[id]) return [];
  const before = new Set(unlockedCivs());
  prog.done[id] = Date.now();
  save();
  return unlockedCivs().filter((c) => !before.has(c));
}

/** Sigue una partida en curso y entrega logros */
export class AchTracker {
  private warships = new Set<number>();
  private techsAtStart: number;
  private next = 0;
  readonly fresh: AchDef[] = [];

  constructor(private g: Game) {
    this.techsAtStart = g.world.players[g.me].techs.size;
  }

  private get active() {
    const g = this.g;
    return !g.world.players[g.me].isAI;
  }

  private give(id: string) {
    if (achDone(id)) return;
    const civs = grant(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id)!;
    this.fresh.push(a);
    this.g.hud.toast(`🏅 ¡Logro! ${a.icon} ${a.name}`);
    for (const c of civs) this.g.hud.toast(`🔓 Nueva civilización: ${CIVS[c].emblem} ${CIVS[c].name}`);
  }

  /** Revisión periódica (una vez por segundo de juego) */
  update() {
    const g = this.g, w = g.world;
    if (!this.active || w.tick < this.next) return;
    this.next = w.tick + TICK_RATE;
    const me = g.me, pl = w.players[me];
    const normal = g.match.cfg.start !== 'imperial';
    if (w.buildingsOf(me, 'castle').length) this.give('castle');
    if (normal && pl.age >= 4 && w.tick < 18 * 60 * TICK_RATE) this.give('fastimp');
    if (normal && pl.techs.size - this.techsAtStart >= 10) this.give('scholar');
    const units = w.unitsOf(me);
    for (const u of units) if (UNITS[u.type as UnitType].naval && u.type !== 'fishship') this.warships.add(u.id);
    if (this.warships.size >= 10) this.give('admiral');
    if (units.filter((u) => isLandArmy(u.type as UnitType)).length >= 50) this.give('army');
    if (w.buildingsOf(me, 'stonewall').length >= 30) this.give('wall');
    const st = pl.stats;
    if (st.gathered.food + st.gathered.wood + st.gathered.gold + st.gathered.stone >= 10000) this.give('eco');
    if (st.kills >= 100) this.give('butcher');
  }

  /** Al terminar la partida; devuelve los logros obtenidos en esta partida */
  end(win: boolean): AchDef[] {
    const g = this.g, w = g.world, cfg = g.match.cfg;
    if (!this.active) return [];
    this.next = 0; this.update();
    const me = g.me, pl = w.players[me];
    if (cfg.mode === 'tutorial') { if (win) this.give('tutorial'); return this.fresh; }
    if (!win) return this.fresh;
    const normal = cfg.start !== 'imperial';
    prog.wins++;
    if (w.mapName && !prog.maps.includes(w.mapName)) prog.maps.push(w.mapName);
    if (pl.civ && !prog.civs.includes(pl.civ)) prog.civs.push(pl.civ);
    save();
    this.give('first');
    if (g.match.ais.some((ai) => ai.diff === 'hard' && w.isEnemy(me, ai.p))) this.give('hard');
    if (pl.stats.lost < 5) this.give('untouch');
    if (normal && w.tick < 12 * 60 * TICK_RATE) this.give('blitz');
    const teams = new Set(w.players.map((p) => p.team));
    if (w.players.length >= 3 && teams.size === w.players.length) this.give('ffa');
    if (w.players.some((p) => p.id !== me && p.team === pl.team)) this.give('team');
    if (!normal) this.give('imperial');
    if (w.score(me).total >= 5000) this.give('score');
    if (prog.wins >= 10) this.give('legend');
    if (prog.maps.length >= 5) this.give('travel');
    if (prog.civs.length >= 5) this.give('collect');
    return this.fresh;
  }
}
