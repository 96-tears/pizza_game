import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './test-runtime.mjs';

function ready(storage) { const h = createHarness({storage}); h.M.lobby.init(); return h; }
function start(h) { h.M.lobby.autoplay(); assert.equal(h.M.race.isRunning(), true); }

test('pause, key release, Escape and focus changes clear steering', () => {
  const h = ready(); start(h);
  let steer;
  const original = h.M.stepShip;
  h.M.stepShip = (s, input, dt, spec) => { steer = input.steer; return original(s, input, dt, spec); };
  h.sandbox.dispatch('keydown', {code:'KeyA'}); h.M.race.update(0.1); assert.equal(steer, -1);
  h.sandbox.dispatch('keydown', {code:'Escape'}); assert.equal(h.M.race.status().paused, true);
  h.sandbox.dispatch('keyup', {code:'KeyA'});
  h.sandbox.dispatch('keydown', {code:'Escape'}); h.M.race.update(0.1); assert.equal(steer, 0);
  h.sandbox.dispatch('keydown', {code:'KeyD'}); h.sandbox.dispatch('blur'); assert.equal(h.M.race.status().paused, true);
  h.sandbox.dispatch('keydown', {code:'Escape'}); h.M.race.update(0.1); assert.equal(steer, 0);
  h.sandbox.document.hidden = true; h.sandbox.document.dispatch('visibilitychange'); assert.equal(h.M.race.status().paused, true);
  h.M.race.stop(); h.sandbox.dispatch('blur'); assert.equal(h.M.race.isRunning(), false);
});

test('fast vessel outside track returns to checkpoint and resets drift', () => {
  const h = ready(); start(h);
  h.M.stepShip = s => { s.x = -10000; s.z = 0; s.sp = 60; s.drifting = true; s.slip = 0.7; };
  h.M.race.update(0.1);
  assert.equal(h.M.race.status().progress, 24);
  assert.equal(h.els.banner.textContent, 'ВЕРНУЛИ НА ВОДУ');
  assert.equal(h.els.driftScore.textContent, '0');
});

test('moving without route progress triggers recovery', () => {
  const h = ready(); start(h);
  h.M.stepShip = s => { s.sp = 60; };
  for (let i = 0; i < 160; i++) h.M.race.update(0.1);
  assert.equal(h.els.banner.textContent, 'ВЕРНУЛИ НА ВОДУ');
});

test('damaged saves recover backup; malformed valid JSON never breaks startup', () => {
  const base = ready(); const good = JSON.stringify(base.M.lobby.career());
  const h = ready({'megalul-career':'{"v":1}', 'megalul-career-backup': good});
  assert.equal(h.M.lobby.career().ship, 'megalul');
  assert.match(h.M.store.message, /резервная/);
  for (const value of ['{', '{"v":1}', '[]', '{"v":99}']) {
    const broken = ready({'megalul-career':value});
    assert.equal(broken.M.lobby.career().level, 1);
  }
  const invalid = JSON.parse(good); invalid.rooms.dock = 99;
  assert.equal(h.M.validateCareer(invalid), null);
});

test('reload cancels pending race and returns cargo only once', () => {
  const h = ready(); const before = h.M.lobby.career().stock; start(h);
  assert.ok(h.M.lobby.career().stock < before);
  assert.ok(JSON.parse(h.storage['megalul-career']).pendingRace);
  const restored = ready(h.storage);
  assert.equal(restored.M.lobby.career().stock, before);
  assert.equal(restored.M.lobby.career().pendingRace, null);
  const next = ready(h.storage);
  assert.equal(next.M.lobby.career().stock, before);
  // A later spending operation must not be overwritten by a stale refund marker.
  next.M.lobby.career().stock = 7; next.M.store.save(next.M.lobby.career());
  assert.equal(ready(h.storage).M.lobby.career().stock, 7);
});

test('storage denial is visible and does not crash gameplay', () => {
  const h = createHarness(); h.sandbox.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  h.M.lobby.init(); assert.equal(h.M.store.failed, true);
  assert.match(h.els.saveWarning.textContent, /не сохраняется/);
  start(h);
});

test('race teardown disposes geometry, materials, textures once each', () => {
  const h = ready(); start(h); const resources = new Set();
  h.M.race.scene().traverse(o => {
    if (o.geometry) resources.add(o.geometry);
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
      resources.add(m); for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);
    }
  });
  const calls = new Map(); for (const r of resources) r.addEventListener('dispose', () => calls.set(r, (calls.get(r) || 0) + 1));
  h.M.race.stop(); assert.ok(resources.size > 100);
  for (const r of resources) assert.equal(calls.get(r), 1);
  h.M.race.stop(); for (const r of resources) assert.equal(calls.get(r), 1);
});

test('every beginner seed has coins and a star within the river', () => {
  const h = createHarness();
  for (let seed = 0; seed < 30; seed++) {
    const t = h.M.makeTrack({seed, length:2400, difficulty:0.15, ports:2});
    assert.ok(t.coins.length >= 7); assert.ok(t.stars.length >= 1);
    for (const item of [...t.coins, ...t.stars]) assert.ok(Number.isFinite(item.x) && Number.isFinite(item.z));
  }
});

test('unplayable viewport pauses the race and widening it does not auto-resume', () => {
  const h = createHarness(); h.run('js/main.js'); start(h); h.advance(100);
  assert.equal(h.M.race.isRunning(), true);
  h.sandbox.matchMedia = () => ({matches:true}); h.sandbox.dispatch('resize');
  const before = h.M.race.status(); assert.equal(before.paused,true);
  h.advance(1000); assert.equal(h.M.race.status().progress,before.progress);
  h.sandbox.matchMedia = () => ({matches:false}); h.sandbox.dispatch('resize');
  assert.equal(h.M.race.status().paused,true);
  h.sandbox.dispatch('keydown',{code:'Escape'}); assert.equal(h.M.race.status().paused,false);
});

test('completed zen run pays for collected coins', () => {
  const h = ready(); const makeTrack = h.M.makeTrack;
  h.M.makeTrack = spec => {
    const track = makeTrack(spec);
    track.coins.unshift({x:track.start.x,z:track.start.z,taken:false,phase:0});
    return track;
  };
  let result;
  h.M.race.start({order:{zen:true,seed:42,track:'summer',lengthM:2600,difficulty:0.3,amount:0,ports:0,pay:0},
    ship:h.M.lobby.effective(),onEnd:r => { result = r; }});
  for (let frame = 0; frame < 6000 && !result; frame++) {
    if (frame % 3 === 0) h.M.race.autopilot();
    h.M.race.update(0.1); h.advance(100);
  }
  assert.ok(result,'zen run should finish'); assert.ok(result.coins > 0);
  assert.equal(result.pay,result.coins * 20);
});

test('license to kill is sold only after the trophy, arms every ship and survives reload', () => {
  const h = ready(); const c = h.M.lobby.career();
  h.M.lobby.panel('shop'); assert.doesNotMatch(h.els.modal.innerHTML, /Лицензия/);
  c.trophy = true; c.coins = 100; h.M.lobby.panel('shop'); assert.match(h.els.modal.innerHTML, /Лицензия на убийство/);
  assert.equal(h.M.lobby.effective().rockets, false);
  h.M.modal.close(); h.M.lobby.autoplay();   // автотест покупает лицензию, как только есть Питса и 100 монет
  assert.equal(h.M.lobby.career().license, true); assert.equal(h.M.lobby.career().coins, 0);
  assert.equal(h.M.race.status().rockets, true);
  h.M.race.stop();
  const again = ready(h.storage); assert.equal(again.M.lobby.career().license, true); assert.equal(again.M.lobby.effective().rockets, true);
  for (const value of ['{"v":1}', '[]']) assert.equal(ready({'megalul-career': value}).M.lobby.career().license, false);
});

test('rocket blows up the rock ahead, the ship passes unharmed, without rockets the rock hits the cargo', () => {
  function run(rockets) {
    const h = ready(); const makeTrack = h.M.makeTrack; let rock;
    // сид 7: река начинается прямым участком, камень стоит в 90 м прямо по курсу; без руля корабль идёт на него
    h.M.makeTrack = spec => { const t = makeTrack(spec); rock = { x: t.start.x + Math.cos(t.start.a) * 90, z: t.start.z + Math.sin(t.start.a) * 90, r: 3, rot: 0 }; t.rocks.push(rock); return t; };
    h.M.race.start({ order: { zen: true, seed: 7, track: 'summer', lengthM: 2600, difficulty: 0.3, amount: 0, ports: 0, pay: 0 }, ship: { ...h.M.lobby.effective(), rockets }, onEnd() {} });
    assert.equal(h.M.race.status().rockets, rockets);
    h.sandbox.dispatch('keydown', { code: 'Space' }); h.M.race.update(0.1);
    assert.equal(h.M.race.status().flying, rockets ? 1 : 0);   // пробел пускает ракету только с лицензией
    for (let i = 0; i < 120 && h.M.race.status().progress < 150; i++) h.M.race.update(0.1);
    const out = { rock, status: h.M.race.status(), cargo: h.els.cargo.textContent }; h.M.race.stop(); return out;
  }
  const armed = run(true);
  assert.equal(armed.rock.dead, true); assert.equal(armed.rock.mesh.visible, false); assert.ok(armed.status.blown >= 1); assert.equal(armed.cargo, '100%');
  const control = run(false);
  assert.notEqual(control.rock.dead, true); assert.equal(control.status.blown, 0); assert.notEqual(control.cargo, '100%');
});
