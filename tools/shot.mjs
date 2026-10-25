// Скриншот игры через DevTools-протокол: запускает безэкранный Chrome, открывает страницу, даёт ей пару секунд, снимает кадр и закрывает.
// node shot.mjs out.png "<hash>" [localStorage JSON] [секунд ожидания]
import { spawn } from 'child_process'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [out, hash = '#photo', storeJson = '', waitS = '3', expr = ''] = process.argv.slice(2);
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn(CH, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--remote-debugging-port=${port}`, '--window-size=960,540', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const events = [];
async function connect() {
  for (let i = 0; i < 50; i++) { try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const page = list.find(t => t.type === 'page'); if (page) return page.webSocketDebuggerUrl; } catch (e) {} await sleep(200); }
  throw new Error('chrome did not start');
}
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
try {
  const url = await connect(); ws = new WebSocket(url); await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } else events.push(m); };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: true });
  const page = process.env.PAGE || 'file://' + path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html');   // PAGE=file:///…/dist/index.html проверяет сборку
  if (storeJson) { // сначала открыть страницу без хэша, чтобы записать карьеру в localStorage, потом перезагрузить с хэшем
    await send('Page.navigate', { url: page + '#blank' }); await sleep(800);
    await send('Runtime.evaluate', { expression: `localStorage.setItem('megalul-career', ${JSON.stringify(storeJson)})` });
  }
  await send('Page.navigate', { url: page + hash }); await sleep(2500);
  if (expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); console.log('expr', JSON.stringify(r.result.value || r.result.description || '').slice(0, 300)); }
  await sleep(parseFloat(waitS) * 1000);
  const shot = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  const info = await send('Runtime.evaluate', { expression: `(function(){ try { var c = M.lobby.career(); return JSON.stringify({ level: c.level, rooms: c.rooms, trophy: c.trophy, race: M.race.isRunning(), dbg: M.race.isRunning() ? M.race.debug() : '' }); } catch (e) { return 'err ' + e; } })()`, returnByValue: true });
  console.log('state', info.result.value);
  const errs = events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
  for (const e of errs) console.log('ERR', JSON.stringify(e.params).slice(0, 400));
  console.log('saved', out);
} catch (e) { console.error('failed', e); } finally { try { ws && ws.close(); } catch (e) {} chrome.kill('SIGKILL'); }
