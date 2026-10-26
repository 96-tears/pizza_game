import { createHarness } from './test-runtime.mjs';
const minutes = parseFloat(process.argv[2] || '20');
const { M, sandbox, els, advance, run, now, logs } = createHarness({ hash: process.argv[3] });
// перехват результатов заездов
const results = []; const origStart = M.race.start;
let trophyAt = null, milestones = [];
M.race.start = function (o) { const onEnd = o.onEnd, t0 = now(); o.onEnd = r => { const cc = M.lobby.career(); const sum = Object.values(cc.rooms).reduce((a, b) => a + b, 0); if (!milestones.length || milestones[milestones.length - 1].sum !== sum || milestones[milestones.length - 1].ship !== cc.ship) milestones.push({ sum, ship: cc.ship, min: Math.round((now() - 1700000000000) / 60000), runs: cc.runs, level: cc.level }); if (cc.trophy && trophyAt === null) trophyAt = Math.round((now() - 1700000000000) / 60000); results.push({ ...r, track: o.order.track, len: o.order.lengthM, diff: +o.order.difficulty.toFixed(2), cruise: o.ship.cruise, pace: M.D.pace(o.order.difficulty), secs: Math.round((now() - t0) / 1000) }); onEnd && onEnd(r); }; return origStart.call(this, o); };
let restores = 0; const origBanner = els.banner; Object.defineProperty(els.banner, 'textContent', { set(v) { if (v === 'ВЕРНУЛИ НА ВОДУ') restores++; this._t = v; }, get() { return this._t; } });

run('js/main.js');
if (process.env.SWEEP) { // перебор уровней комнат: каждая функция обстановки должна собираться на всех уровнях без ошибок
  const keys = ['office', 'plant', 'store', 'dock']; let n = 0;
  for (let l = 1; l <= 5; l++) { M.studio.setLevels({ office: l, plant: l, store: l, dock: l }); M.studio.update(0.1); M.studio.setStock(7, 20); n++; }
  for (let i = 0; i < 20; i++) { const lv = {}; keys.forEach((k, j) => { lv[k] = 1 + ((i * 7 + j * 3) % 5); }); M.studio.setLevels(lv); M.studio.setTrophy(i % 2 === 0); M.studio.update(0.1); n++; }
  console.log('sweep ok, setLevels calls:', n);
}
const t0 = Date.now();
for (let t = 0; t < minutes * 60; t++) {
  advance(1000);
  const status = M.race.status();
  if (status && (!Number.isFinite(status.progress) || status.progress < 0 || status.time > 600)) throw new Error('Race stalled or left track: ' + JSON.stringify(status));
}
if (minutes >= 20 && M.lobby.career().runs < minutes / 5) throw new Error('Too few completed races');
const c = M.lobby.career();
console.log(`virtual ${minutes} min in ${Date.now() - t0} ms; runs=${c.runs} level=${c.level} xp=${c.xp} coins=${c.coins} stock=${c.stock.toFixed(1)} restores=${restores} rooms=${JSON.stringify(c.rooms)}`);
console.log(`fleet=${c.fleet.join(',')} ship=${c.ship} trophy=${c.trophy} trophyAt=${trophyAt === null ? '-' : trophyAt + ' min'}`);
if (process.env.MILESTONES) for (const m of milestones) console.log(`  min ${m.min}: runs=${m.runs} level=${m.level} rooms sum=${m.sum} ship=${m.ship}`);
for (const r of results) console.log(`  ${r.zen ? 'zen  ' : 'order'} ${r.track.padEnd(6)} ${String(r.len).padStart(4)}m diff=${r.diff} cruise=${r.cruise}${r.pace ? ' pace=' + r.pace.toFixed(2) : ''} ${r.secs}s score=${r.score} best=${r.best} cargo=${r.cargo}% deliv=${r.delivered}/${r.amount} coins=${r.coins} stars=${r.stars}${r.blown ? ' blown=' + r.blown : ''} pay=${r.pay} xp=${r.xp}`);
if (process.env.LOGS) console.log(logs.slice(-20).join('\n'));
