// Chat de la partida. Los mensajes viajan como comandos de la simulación (listos para el online)
// y las IA aliadas los leen: se les puede pedir que ataquen, defiendan, esperen o manden recursos.
import type { Game } from './game.js';

const QUICK = [
  { icon: '⚔️', text: '¡Ataquen!' },
  { icon: '🛡️', text: 'Ayúdenme a defender mi base' },
  { icon: '✋', text: 'No ataquen todavía' },
  { icon: '🪙', text: 'Mándenme oro' },
  { icon: '🍖', text: 'Mándenme comida' },
  { icon: '🪵', text: 'Mándenme madera' },
  { icon: '👍', text: 'Hagan lo que quieran' },
];

interface Line { from: number; to: 'all' | 'allies' | number; text: string }

export class Chat {
  private el = document.getElementById('chat')!;
  private btn = document.getElementById('btnChat')!;
  private badge = document.getElementById('chatCount')!;
  private lines: Line[] = [];
  private unread = 0;
  private to: 'all' | 'allies' | number = 'allies';
  open = false;

  constructor(private g: Game) {
    const w = g.world;
    const allies = w.players.some((p) => p.id !== g.me && !p.neutral && p.team === w.players[g.me].team);
    if (!allies) this.to = 'all';
    this.btn.hidden = g.match.cfg.mode === 'tutorial';
    this.btn.onclick = () => this.toggle();
    this.el.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]')) return this.toggle(false);
      const q = t.closest('[data-q]')?.getAttribute('data-q');
      if (q) return this.send(q);
      if (t.closest('[data-send]')) {
        const inp = this.el.querySelector('input') as HTMLInputElement;
        if (inp.value.trim()) { this.send(inp.value.trim()); inp.value = ''; }
      }
    };
    this.el.onchange = (e) => {
      const v = (e.target as HTMLSelectElement).value;
      this.to = v === 'all' || v === 'allies' ? v : Number(v);
    };
    this.el.onkeydown = (e) => {
      if (e.key === 'Enter') { const inp = e.target as HTMLInputElement; if (inp.value.trim()) { this.send(inp.value.trim()); inp.value = ''; } }
      e.stopPropagation();
    };
    this.setBadge();
  }

  destroy() { this.el.hidden = true; this.btn.hidden = true; this.el.onclick = null; this.el.onchange = null; this.el.onkeydown = null; }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.el.hidden = !this.open;
    if (this.open) { this.unread = 0; this.setBadge(); this.render(); }
  }

  private send(text: string) {
    this.g.world.issue({ t: 'chat', p: this.g.me, to: this.to, text });
  }

  /** Llega un mensaje de la simulación */
  receive(from: number, to: 'all' | 'allies' | number, text: string) {
    const g = this.g, w = g.world;
    const me = g.me;
    const forMe = from === me || to === 'all' || to === me || (to === 'allies' && !w.isEnemy(from, me));
    if (!forMe) return;
    this.lines.push({ from, to, text });
    if (this.lines.length > 60) this.lines.shift();
    if (this.open) this.renderLog();
    else if (from !== me) { this.unread++; this.setBadge(); g.hud.toast(`💬 ${w.players[from].name}: ${text}`); }
  }

  private setBadge() { this.badge.textContent = String(this.unread); this.badge.hidden = !this.unread; }

  private render() {
    const g = this.g, w = g.world;
    const others = w.players.filter((p) => p.id !== g.me && !p.neutral);
    this.el.innerHTML = `<div class="chat-card">
      <div class="chat-head"><b>💬 Chat</b>
        <select aria-label="Para">
          <option value="allies" ${this.to === 'allies' ? 'selected' : ''}>Aliados</option>
          <option value="all" ${this.to === 'all' ? 'selected' : ''}>Todos</option>
          ${others.map((p) => `<option value="${p.id}" ${this.to === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
        </select>
        <button data-close aria-label="Cerrar">✖</button></div>
      <div class="chat-log"></div>
      <div class="chat-quick">${QUICK.map((q) => `<button data-q="${q.text}">${q.icon} ${q.text}</button>`).join('')}</div>
      <div class="chat-in"><input type="text" maxlength="140" placeholder="Escribí un mensaje…"><button data-send>Enviar</button></div>
    </div>`;
    this.renderLog();
  }

  private renderLog() {
    const g = this.g, w = g.world;
    const lg = this.el.querySelector('.chat-log');
    if (!lg) return;
    const toName = (to: Line['to']) => (to === 'all' ? 'Todos' : to === 'allies' ? 'Aliados' : w.players[to]?.name ?? '');
    lg.innerHTML = this.lines.map((l) => {
      const p = w.players[l.from];
      return `<div class="cl ${l.from === g.me ? 'me' : ''}"><b style="color:${p.color}">${l.from === g.me ? 'Vos' : p.name}</b> <small>→ ${toName(l.to)}</small><span>${l.text.replace(/</g, '&lt;')}</span></div>`;
    }).join('') || '<p class="dim">Escribile a tus aliados: podés pedirles que ataquen, que te defiendan, que esperen o que te manden recursos.</p>';
    lg.scrollTop = lg.scrollHeight;
  }
}
