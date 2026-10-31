// Ajustes del jugador guardados en el navegador.
export interface Settings { grid: boolean; hpBars: boolean; sound: boolean; music: boolean }
const KEY = 'ajustes';
const defaults: Settings = { grid: false, hpBars: false, sound: true, music: true };

function load(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...defaults }; }
}
export const settings: Settings = load();
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* sin almacenamiento */ } }
