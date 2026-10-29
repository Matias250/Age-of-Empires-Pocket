// Idiomas: español (por defecto), inglés y portugués.
// Los datos del juego se traducen en el lugar al arrancar; la interfaz se traduce sola
// observando el DOM (cada texto nuevo se busca en el diccionario, con partes variables {0}, {1}…).
import { AGE_NAME, AGE_SHORT, BUILDINGS, NODES, TECHS, UNITS } from '../../sim/data.js';
import { CIVS } from '../../sim/civs.js';
import { BIOMES, MAP_SIZES, MAPS, PLAYER_COLORS, START_MODES } from '../../sim/match.js';
import { DIFF_NAME } from '../../sim/ai.js';
import { STANCE_NAME } from '../../sim/world.js';
import { CAMPAIGNS } from '../../sim/campaigns.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { UI } from './ui.js';
import { DATA } from './data.js';
import { CAMP } from './camp.js';

export type Lang = 'es' | 'en' | 'pt';
export const LANGS: { id: Lang; name: string; flag: string }[] = [
  { id: 'es', name: 'Español', flag: '🇪🇸' }, { id: 'en', name: 'English', flag: '🇬🇧' }, { id: 'pt', name: 'Português', flag: '🇧🇷' },
];

function loadLang(): Lang {
  try { const v = localStorage.getItem('idioma'); if (v === 'en' || v === 'pt' || v === 'es') return v; } catch { /* sin almacenamiento */ }
  return 'es';
}
export const lang: Lang = loadLang();
export function setLang(l: Lang) {
  try { localStorage.setItem('idioma', l); } catch { /* sin almacenamiento */ }
  location.reload();
}

const DICT: Record<string, [string, string]> = { ...DATA, ...CAMP, ...UI };
const li = lang === 'en' ? 0 : 1;

// claves con partes variables → expresiones regulares (las más largas primero)
const PATTERNS: { re: RegExp; key: string }[] = Object.keys(DICT)
  .filter((k) => /\{\d\}/.test(k))
  .sort((a, b) => b.replace(/\{\d\}/g, '').length - a.replace(/\{\d\}/g, '').length)
  .map((key) => ({ key, re: new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{(\d)\\\}/g, '(.+?)') + '$') }));

const missing = new Set<string>();
const produced = new Set<string>();
const SPANISH = /[ñ¿¡]|\b(de|del|la|las|los|el|que|con|para|por|una|tu|vos|en|y|sin|más|está|tenés|perdés)\b/i;

/** Traduce un texto (sin espacios alrededor). Devuelve el mismo texto si no lo conoce. */
export function tr(s: string): string {
  if (lang === 'es' || !s) return s;
  if (produced.has(s)) return s;
  const hit = DICT[s];
  if (hit) { produced.add(hit[li]); return hit[li]; }
  for (const p of PATTERNS) {
    const m = p.re.exec(s);
    if (m) { const r = DICT[p.key][li].replace(/\{(\d)\}/g, (_, i) => tr(m[Number(i) + 1] ?? '')); produced.add(r); return r; }
  }
  if (SPANISH.test(s)) missing.add(s);
  return s;
}
(window as unknown as { __i18nMissing: () => string[] }).__i18nMissing = () => [...missing];

/** Traduce en el lugar los textos de los datos del juego */
function localizeData() {
  const fix = <T extends Record<string, unknown>>(o: T, keys: string[]) => { for (const k of keys) if (typeof o[k] === 'string') (o as Record<string, unknown>)[k] = tr(o[k] as string); };
  for (const d of Object.values(UNITS)) fix(d as never, ['name', 'desc']);
  for (const d of Object.values(BUILDINGS)) fix(d as never, ['name', 'desc']);
  for (const d of Object.values(TECHS)) fix(d as never, ['name', 'desc']);
  for (const d of Object.values(NODES)) fix(d as never, ['name']);
  for (const c of Object.values(CIVS)) { fix(c as never, ['name', 'region']); c.bonuses = c.bonuses.map(tr); }
  for (const rec of [AGE_NAME, AGE_SHORT, DIFF_NAME, STANCE_NAME, BIOMES] as Record<string, string>[]) for (const k of Object.keys(rec)) rec[k] = tr(rec[k]);
  for (const d of Object.values(MAPS)) fix(d as never, ['name', 'desc']);
  for (const d of Object.values(MAP_SIZES)) fix(d as never, ['name']);
  for (const d of Object.values(START_MODES)) fix(d as never, ['name', 'desc']);
  for (const c of PLAYER_COLORS) c.name = tr(c.name);
  for (const a of ACHIEVEMENTS) { a.name = tr(a.name); a.desc = tr(a.desc); }
  for (const c of CAMPAIGNS) {
    fix(c as never, ['name', 'desc', 'hero']);
    for (const s of c.scenarios) {
      fix(s as never, ['title', 'place', 'outro', 'goalText']);
      for (const l of s.intro) { l.who = tr(l.who); l.text = tr(l.text); }
      if (s.hero) s.hero.name = tr(s.hero.name);
      for (const e of [...s.enemies, ...(s.allies ?? [])]) e.name = tr(e.name);
      if (s.goal.t === 'destroy') s.goal.label = tr(s.goal.label);
    }
  }
}

function walk(n: Node) {
  if (n.nodeType === 3) {
    const v = n.nodeValue ?? '';
    const core = v.trim();
    if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return;
    const t = tr(core);
    if (t !== core) n.nodeValue = v.replace(core, t);
    return;
  }
  if (n.nodeType !== 1) return;
  const el = n as Element;
  if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
  for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
  for (const c of [...el.childNodes]) walk(c);
}

export function initI18n() {
  document.documentElement.lang = lang;
  if (lang === 'es') return;
  localizeData();
  walk(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') walk(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
