// Сборка публикации: складывает в dist/ только то, что нужно новой игре (страница, скрипты, three.js, иконка, манифест),
// а адреса скриптов в index.html получают штамп версии, чтобы браузеры не держали старый код в кэше.
//   node tools/build.mjs            → dist/
//   node tools/build.mjs --legacy   → плюс старая игра (legacy.html, online.js, voice/)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), pub = path.join(root, 'public'), dist = path.join(root, 'dist');
const legacy = process.argv.includes('--legacy');
const d = new Date(), stamp = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()].map((n, i) => (i ? String(n).padStart(2, '0') : n)).join('');
fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(dist);
const copy = (name) => fs.cpSync(path.join(pub, name), path.join(dist, name), { recursive: true });
['js', 'vendor', 'icon.svg', 'manifest.webmanifest'].forEach(copy);
let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
html = html.replace(/(src|href)="((?:js|vendor)\/[^"?]+)"/g, (m, attr, p) => `${attr}="${p}?v=${stamp}"`);
fs.writeFileSync(path.join(dist, 'index.html'), html);
if (legacy) ['legacy.html', 'online.js', 'voice'].forEach(copy);
fs.writeFileSync(path.join(dist, 'version.txt'), stamp + '\n');
let total = 0, files = 0;
(function walk(dir) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f), st = fs.statSync(p); if (st.isDirectory()) walk(p); else { total += st.size; files++; } } })(dist);
console.log(`dist/ готов: версия ${stamp}, файлов ${files}, ${(total / 1024).toFixed(0)} КБ${legacy ? ' (со старой игрой)' : ''}`);
