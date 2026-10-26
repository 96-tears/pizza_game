// Static release with content-addressed scripts. FEEDBACK_URL configures the external form.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public'), dist = path.join(root, 'dist');
const legacy = process.argv.includes('--legacy');
const defaults = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(pub, 'js/config.js'), 'utf8'), defaults);
const feedbackUrl = process.env.FEEDBACK_URL ?? defaults.window.MEGALUL_CONFIG.feedbackUrl;
if (feedbackUrl) {
  const url = new URL(feedbackUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('FEEDBACK_URL must be an HTTPS URL without credentials');
}
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 16);
let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/src="((?:js|vendor)\/[^"?]+)"/g)].map(m => m[1]);
const inputs = scripts.map(name => [name, fs.readFileSync(path.join(pub, name), 'utf8')]);
const version = hash(JSON.stringify({html, inputs, feedbackUrl}));
// Validate all input before replacing the previous local output.
fs.rmSync(dist, {recursive:true, force:true}); fs.mkdirSync(dist);
const copy = name => fs.cpSync(path.join(pub, name), path.join(dist, name), {recursive:true});
['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', '_redirects', '_headers'].forEach(copy);
for (const [name, source] of inputs) {
  const code = name === 'js/config.js' ? 'window.MEGALUL_CONFIG = ' + JSON.stringify({feedbackUrl, version}) + ';\n' : source;
  const target = name.replace(/\.js$/, '.' + hash(code) + '.js');
  fs.mkdirSync(path.dirname(path.join(dist, target)), {recursive:true});
  fs.writeFileSync(path.join(dist, target), code);
  html = html.replace('src="' + name + '"', 'src="' + target + '"');
}
fs.writeFileSync(path.join(dist, 'index.html'), html);
if (legacy) ['legacy.html', 'online.js', 'admin.html', 'voice', 'vendor'].forEach(copy);
fs.writeFileSync(path.join(dist, 'version.txt'), version + '\n');
let total = 0, files = 0;
(function walk(dir) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir,f), st = fs.statSync(p); if (st.isDirectory()) walk(p); else { total += st.size; files++; } } })(dist);
console.log(`dist/ готов: версия ${version}, файлов ${files}, ${(total / 1024).toFixed(0)} КБ`);
console.log(feedbackUrl ? 'Кнопка внешней формы включена.' : 'Ссылка на отзывы не задана: кнопка скрыта. Перед публикацией задайте FEEDBACK_URL.');
