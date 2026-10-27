// Ajustes del jugador guardados en el navegador.
export interface Settings { grid: boolean; hpBars: boolean }
const KEY = 'ajustes';
const defaults: Settings = { grid: false, hpBars: false };

function load(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...defaults }; }
}
export const settings: Settings = load();
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* sin almacenamiento */ } }
