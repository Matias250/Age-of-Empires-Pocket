// Empaqueta el juego compilado (dist/) en un único HTML autocontenido: build/age-of-empires-pocket.html
// Uso: npm run build && node scripts/bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const dist = join(root, 'dist');
const modules = new Map(); // id -> code
const order = [];

function load(file) {
  const id = relative(dist, file);
  if (modules.has(id)) return id;
  modules.set(id, null);
  let src = readFileSync(file, 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
  const deps = [];
  src = src.replace(/import\s*\{([^}]*)\}\s*from\s*['"](.+?)['"];?/g, (_, names, path) => {
    const dep = load(resolve(dirname(file), path));
    deps.push(dep);
    const fixed = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/\s+as\s+/, ': ')).join(', ');
    return `const { ${fixed} } = __req(${JSON.stringify(dep)});`;
  });
  const exported = [];
  src = src.replace(/^export\s+(class|function|const|let|var)\s+([A-Za-z0-9_$]+)/gm, (_, kw, name) => { exported.push(name); return `${kw} ${name}`; });
  src = src.replace(/^export\s*\{([^}]*)\};?/gm, (_, names) => { names.split(',').map((n) => n.trim()).filter(Boolean).forEach((n) => exported.push(n)); return ''; });
  src += `\nreturn { ${exported.join(', ')} };`;
  modules.set(id, src);
  order.push(id);
  return id;
}

load(join(dist, 'client', 'main.js'));
let js = 'const __mods = {}; const __defs = {};\nfunction __req(id) { if (!(id in __mods)) __mods[id] = __defs[id](); return __mods[id]; }\n';
for (const id of order) js += `__defs[${JSON.stringify(id)}] = function () {\n${modules.get(id)}\n};\n`;
js += `__req(${JSON.stringify(order[order.length - 1])});\n`;

let html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'styles.css'), 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="styles.css" \/>/, `<style>\n${css}\n</style>`)
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(readFileSync(join(root, 'icon.svg'), 'utf8'))}" />`)
  .replace(/<script type="module" src="dist\/client\/main.js"><\/script>/, () => `<script type="module">\n${js}</script>`);
mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'age-of-empires-pocket.html'), html);
console.log('build/age-of-empires-pocket.html', (html.length / 1024).toFixed(0) + ' KB', order.length, 'módulos');
