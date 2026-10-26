// Shared deterministic runtime for simulation and regression tests; no real WebGL.
import fs from 'node:fs'; import vm from 'node:vm';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
function events() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, data = {}) { for (const fn of listeners.get(type) || []) fn({type, preventDefault() {}, ...data}); }
  };
}
export function createHarness(options = {}) {
const hash = options.hash || '#autotest';
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
    ...events(), setAttribute(k, v) { this['@' + k] = v; }, getAttribute(k) { return this['@' + k] == null ? null : this['@' + k]; },
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
els.modal.classList.add('hidden');   // как в index.html: панель закрыта, пока её не открыли
const storage = options.storage || {};  const localStorage = { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; } };
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
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox; sandbox.matchMedia = () => ({ matches: false }); Object.assign(sandbox, events()); Object.assign(sandbox.document, events());
vm.createContext(sandbox);
function run(file) { vm.runInContext(fs.readFileSync(root + '/' + file, 'utf8'), sandbox, { filename: file }); }
run('vendor/three.r128.min.js');
sandbox.THREE.WebGLRenderer = function () { this.shadowMap = {}; this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {}; };
['core', 'data', 'career', 'track', 'boat', 'world', 'physics', 'rockets', 'race', 'studio', 'lobby'].forEach(f => run('js/' + f + '.js'));


return { M: sandbox.M, sandbox, els, storage, advance, run, logs, now: () => vnow };
}
