// Прогон игры в Node: заглушки DOM и рендерера, виртуальное время, режим #autotest.
// Использование: node harness.mjs [минут виртуального времени] [hash]
import fs from 'fs'; import vm from 'vm';
import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const minutes = parseFloat(process.argv[2] || '20'), hash = process.argv[3] || '#autotest';

// ---- виртуальное время ----
let vnow = 1700000000000; const timers = []; let tid = 1;
function addTimer(fn, ms, rep) { timers.push({ id: tid++, fn, at: vnow + Math.max(0, ms | 0), ms: Math.max(1, ms | 0), rep }); return tid - 1; }
function clearTimer(id) { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); }
function advance(ms) {
  const end = vnow + ms;
  for (;;) { let next = null; for (const t of timers) if (!next || t.at < next.at) next = t; if (!next || next.at > end) break; vnow = next.at; if (next.rep) next.at += next.ms; else clearTimer(next.id); next.fn(); }
  vnow = end;
}

// ---- DOM ----
function classList(el) { const set = new Set(); return { add: c => set.add(c), remove: c => set.delete(c), toggle: (c, f) => { if (f === undefined) f = !set.has(c); f ? set.add(c) : set.delete(c); return f; }, contains: c => set.has(c), get list() { return [...set]; } }; }
function makeEl(tag, id) {
  const el = { tagName: tag, id, children: [], parentNode: null, _cls: '', style: { setProperty() {} }, textContent: '', _html: '', clientWidth: 360, clientHeight: 640, onclick: null,
    addEventListener() {}, removeEventListener() {}, setAttribute(k, v) { this['@' + k] = v; }, getAttribute(k) { return this['@' + k] == null ? null : this['@' + k]; },
    querySelectorAll() { return []; }, querySelector() { return null; }, appendChild(c) { c.parentNode = this; this.children.push(c); return c; }, removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    getContext(kind) { return kind === '2d' ? new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } }) : null; },
    get firstChild() { return this.children[0] || makeEl('div'); } };
  el.classList = classList(el);
  Object.defineProperty(el, 'className', { get() { return el.classList.list.join(' '); }, set(v) { el.classList.list.forEach(c => el.classList.remove(c)); String(v).split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c)); } });
  Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = v; } });
  return el;
}
const els = {}; const ids = ['gl', 'modal', 'lobbyUI', 'lvl', 'xpText', 'xpBar', 'coins', 'stock', 'actions', 'tabs', 'tabmarks', 'trophyBadge', 'btnSettings', 'raceUI', 'raceProgress', 'driftScore', 'cargo', 'banner', 'popups', 'btnPause'];
ids.forEach(id => { els[id] = makeEl('div', id); }); els.tabmarks.children = [makeEl('span'), makeEl('span'), makeEl('span'), makeEl('span')];
const storage = {}; const localStorage = { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; } };
const logs = [];
const sandbox = {
  console: { log: (...a) => { logs.push(a.join(' ')); if (process.env.VERBOSE) console.log(...a); }, warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) },
  document: { getElementById: id => els[id] || (els[id] = makeEl('div', id)), createElement: tag => makeEl(tag), createElementNS: (ns, tag) => makeEl(tag), body: makeEl('body') },
  location: { hash }, localStorage, confirm: () => true, alert() {},
  setTimeout: (fn, ms) => addTimer(fn, ms, false), setInterval: (fn, ms) => addTimer(fn, ms, true), clearTimeout: clearTimer, clearInterval: clearTimer,
  requestAnimationFrame: fn => addTimer(() => fn(vnow), 16, false), performance: { now: () => vnow },
  Date: class extends Date { constructor(...a) { a.length ? super(...a) : super(vnow); } static now() { return vnow; } },
  navigator: { userAgent: 'node' }, devicePixelRatio: 1, Math, JSON, Object, Array, Number, String, Boolean, Error, TypeError, RangeError, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Float64Array, ArrayBuffer, DataView, Map, Set, WeakMap, Promise, Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox; sandbox.matchMedia = () => ({ matches: false }); sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {};
vm.createContext(sandbox);
function run(file) { vm.runInContext(fs.readFileSync(root + '/' + file, 'utf8'), sandbox, { filename: file }); }
run('vendor/three.r128.min.js');
sandbox.THREE.WebGLRenderer = function () { this.shadowMap = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
['core', 'data', 'track', 'boat', 'world', 'physics', 'race', 'studio', 'lobby'].forEach(f => run('js/' + f + '.js'));

// перехват результатов заездов
const results = []; const M = sandbox.M; const origStart = M.race.start;
let trophyAt = null, milestones = [];
M.race.start = function (o) { const onEnd = o.onEnd, t0 = vnow; o.onEnd = r => { const cc = M.lobby.career(); const sum = Object.values(cc.rooms).reduce((a, b) => a + b, 0); if (!milestones.length || milestones[milestones.length - 1].sum !== sum || milestones[milestones.length - 1].ship !== cc.ship) milestones.push({ sum, ship: cc.ship, min: Math.round((vnow - 1700000000000) / 60000), runs: cc.runs, level: cc.level }); if (cc.trophy && trophyAt === null) trophyAt = Math.round((vnow - 1700000000000) / 60000); results.push({ ...r, track: o.order.track, len: o.order.lengthM, diff: +o.order.difficulty.toFixed(2), cruise: o.ship.cruise, pace: M.D.pace(o.order.difficulty), secs: Math.round((vnow - t0) / 1000) }); onEnd && onEnd(r); }; return origStart.call(this, o); };
let restores = 0; const origBanner = els.banner; Object.defineProperty(els.banner, 'textContent', { set(v) { if (v === 'ВЕРНУЛИ НА ВОДУ') restores++; this._t = v; }, get() { return this._t; } });

run('js/main.js');
if (process.env.SWEEP) { // перебор уровней комнат: каждая функция обстановки должна собираться на всех уровнях без ошибок
  const keys = ['office', 'plant', 'store', 'dock']; let n = 0;
  for (let l = 1; l <= 5; l++) { M.studio.setLevels({ office: l, plant: l, store: l, dock: l }); M.studio.update(0.1); M.studio.setStock(7, 20); n++; }
  for (let i = 0; i < 20; i++) { const lv = {}; keys.forEach((k, j) => { lv[k] = 1 + ((i * 7 + j * 3) % 5); }); M.studio.setLevels(lv); M.studio.setTrophy(i % 2 === 0); M.studio.update(0.1); n++; }
  console.log('sweep ok, setLevels calls:', n);
}
const t0 = Date.now();
advance(minutes * 60 * 1000);
const c = M.lobby.career();
console.log(`virtual ${minutes} min in ${Date.now() - t0} ms; runs=${c.runs} level=${c.level} xp=${c.xp} coins=${c.coins} stock=${c.stock.toFixed(1)} restores=${restores} rooms=${JSON.stringify(c.rooms)}`);
console.log(`fleet=${c.fleet.join(',')} ship=${c.ship} trophy=${c.trophy} trophyAt=${trophyAt === null ? '-' : trophyAt + ' min'}`);
if (process.env.MILESTONES) for (const m of milestones) console.log(`  min ${m.min}: runs=${m.runs} level=${m.level} rooms sum=${m.sum} ship=${m.ship}`);
for (const r of results) console.log(`  ${r.zen ? 'zen  ' : 'order'} ${r.track.padEnd(6)} ${String(r.len).padStart(4)}m diff=${r.diff} cruise=${r.cruise}${r.pace ? ' pace=' + r.pace.toFixed(2) : ''} ${r.secs}s score=${r.score} best=${r.best} cargo=${r.cargo}% deliv=${r.delivered}/${r.amount} coins=${r.coins} stars=${r.stars} pay=${r.pay} xp=${r.xp}`);
if (process.env.LOGS) console.log(logs.slice(-20).join('\n'));
