/* Заезд: камера сверху-сзади, управление половинами экрана, очки за дрифт с множителем и подписями, порча груза, причалы, монеты, финиш. */
(function () {
  'use strict';
  var R = M.race = {};
  var scene, camera, world, T, S, ship, spec, def, opts, running = false, paused = false, G;
  var keys = { left: false, right: false }, zones = {};
  var camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camDir = 0, camInit = false;
  var spray, sprayN = 420, sprayAlive = [], sprayIdx = 0, tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  var el = {}, live = null, headlight = null, finishTimer = null;
  ['raceUI', 'raceProgress', 'driftScore', 'cargo', 'speed', 'banner', 'popups', 'btnPause'].forEach(function (id) { el[id] = M.el(id); });

  // ---------- старт и остановка ----------
  // o: { order: {track, lengthM, difficulty, amount, ports, pay, seed, zen}, ship: {cruise, turn, grip, armour, model (D.SHIPS entry), tanks}, onEnd(result), onQuit() }
  R.start = function (o) {
    if (running) R.stop();
    opts = o; def = M.D.trackById(o.order.track);
    var pace = M.D.pace(o.order.difficulty); spec = {}; for (var key in o.ship) spec[key] = o.ship[key]; spec.cruise = o.ship.cruise * pace; spec.pace = pace;   // темп: сложный заказ идёт быстрее
    T = M.makeTrack({ seed: o.order.seed, length: o.order.lengthM, difficulty: o.order.difficulty, ports: o.order.ports, rocks: !!def.rocks, lamps: def.lamps, zen: !!o.order.zen, treeDensity: def.id === 'rocks' ? 1.3 : 1, pace: pace });
    for (var i = 0; i < T.ports.length; i++) T.ports[i].name = o.order.portNames ? o.order.portNames[i] : 'ПОРТ ' + (i + 1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 9 / 16, 0.5, 1600);
    world = M.buildWorld(T, def, scene);
    ship = M.buildShip(spec.model); scene.add(ship);
    headlight = new THREE.SpotLight(0xfff0d0, def.night ? 2.2 : 0, 160, 0.5, 0.5, 1); headlight.position.set(spec.model.size * 10, 4, 0); headlight.target.position.set(140, -4, 0); ship.add(headlight); ship.add(headlight.target);
    S = M.newShipState(T);
    var perPort = T.ports.length ? Math.floor(o.order.amount / T.ports.length) : 0;
    G = { t: 0, score: 0, session: 0, sessionT: 0, mult: 1, grace: 0, cargo: 100, coins: 0, stars: 0, delivered: 0, onBoard: o.order.amount, perPort: perPort, hitCool: 0, shake: 0, finished: false, sessionBest: 0 };
    G.safeS = S.s; G.progressAt = 0;
    resetInput(); camPos.set(0, 0, 0);
    makeSpray(); camInit = false; running = true; paused = false;
    el.raceUI.classList.remove('hidden'); el.popups.innerHTML = ''; live = null;
    el.driftScore.textContent = '0'; el.cargo.textContent = '100%'; el.speed.textContent = ''; el.raceProgress.style.width = '0%';
    banner(o.order.zen ? 'ДЗЕН' : def.name.toUpperCase(), 1.6);
    bindInput();
    R.resize();
  };
  R.stop = function () { running = false; clearTimeout(finishTimer); clearTimeout(banner.t); unbindInput(); el.raceUI.classList.add('hidden'); if (scene) M.disposeTree(scene); world = null; scene = null; ship = null; spray = null; headlight = null; T = null; S = null; camera = null; sprayAlive = []; live = null; el.popups.innerHTML = ''; };
  R.resize = function () { if (!camera) return; var c = M.el('gl'); camera.aspect = (c.clientWidth || 9) / (c.clientHeight || 16); camera.updateProjectionMatrix(); };
  R.isRunning = function () { return running; };
  R.scene = function () { return scene; }; R.camera = function () { return camera; };
  R.status = function () { return running ? { time: G.t, progress: S.s, length: T.finish.s, paused: paused } : null; };
  // автопилот для автотеста: целится в ось на две секунды хода впереди, на поворотах держит руль дольше нужного, чтобы корма срывалась
  R.autopilot = function () {
    if (!running || paused || G.finished) return false;
    var q = T.nearest(S.x, S.z, S.idx), aim = T.atS(q.s + Math.max(30, S.sp * 1.9), 0), want = Math.atan2(aim.z - S.z, aim.x - S.x), err = M.angDiff(want, S.a) + Math.sin(G.t * 0.7) * 0.25;
    keys.right = err > 0.06; keys.left = err < -0.06; return true;
  };
  R.debug = function () { return S ? 's=' + Math.round(S.s) + '/' + Math.round(T.finish.s) + ' pace=' + spec.pace.toFixed(2) + ' sp=' + S.sp.toFixed(1) + ' slip=' + S.slip.toFixed(2) + ' score=' + Math.round(G.score) + ' cargo=' + Math.round(G.cargo) + ' coins=' + G.coins + ' ports=' + T.ports.map(function (p) { return p.done ? 'ok' : p.missed ? 'miss' : '.'; }).join('') + ' deliv=' + G.delivered + '/' + opts.order.amount : '-'; };

  // ---------- ввод: клавиши и половины экрана ----------
  function onKey(e) {
    var down = e.type === 'keydown';
    if (!down) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
      return;
    }
    if ((e.code === 'KeyP' || e.code === 'Escape') && (!M.modal.isOpen() || paused)) { e.preventDefault(); if (!e.repeat) togglePause(); return; }
    if (M.modal.isOpen() || paused) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = down; e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = down; e.preventDefault(); }
    else if (down && (e.code === 'KeyP' || e.code === 'Escape')) togglePause();
  }
  function resetInput() { keys.left = keys.right = false; Object.keys(zones).forEach(function (k) { zones[k].classList.remove('on'); }); }
  function loseFocus() { resetInput(); if (running && !paused && !G.finished) togglePause(); }
  R.pause = loseFocus;
  function visibility() { if (document.hidden) loseFocus(); }
  function zoneHandler(z, on) { return function (e) { e.preventDefault(); if (on && (paused || M.modal.isOpen())) return; var k = z.getAttribute('data-steer') === '-1' ? 'left' : 'right'; keys[k] = on; z.classList.toggle('on', on); }; }
  function bindInput() {
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    window.addEventListener('blur', loseFocus); document.addEventListener('visibilitychange', visibility);
    Array.prototype.forEach.call(el.raceUI.querySelectorAll('.zone'), function (z) {
      zones[z.className] = z; var on = zoneHandler(z, true), off = zoneHandler(z, false);
      z.addEventListener('pointerdown', on); z.addEventListener('pointerup', off); z.addEventListener('pointercancel', off); z.addEventListener('pointerleave', off);
      z._h = [on, off];
    });
    el.btnPause.onclick = togglePause;
  }
  function unbindInput() {
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); keys.left = keys.right = false;
    window.removeEventListener('blur', loseFocus); document.removeEventListener('visibilitychange', visibility);
    Array.prototype.forEach.call(el.raceUI.querySelectorAll('.zone'), function (z) { if (z._h) { z.removeEventListener('pointerdown', z._h[0]); z.removeEventListener('pointerup', z._h[1]); z.removeEventListener('pointercancel', z._h[1]); z.removeEventListener('pointerleave', z._h[1]); } z.classList.remove('on'); });
  }
  function togglePause() {
    if (!running || G.finished) return;
    resetInput();
    if (!paused) {
      paused = true;
      M.modal.open('<div class="sheet-head"><h2>Пауза</h2></div><button class="btn wide" data-act="resume">Продолжить</button><button class="btn ghost wide" data-act="quit">Выйти на верфь</button>', { center: true, sticky: true,
        actions: function (act) { if (act === 'resume') { M.modal.close(); paused = false; } else { M.modal.close(); R.stop(); if (opts.onQuit) opts.onQuit(); } } });
    } else { M.modal.close(); paused = false; }
  }

  // ---------- подписи рядом с кораблём ----------
  function screenPos(x, y, z) { tmpP.set(x, y, z).project(camera); var c = M.el('gl'); return { x: (tmpP.x * 0.5 + 0.5) * c.clientWidth, y: (-tmpP.y * 0.5 + 0.5) * c.clientHeight }; }
  function pop(text, cls, dy) {
    var p = screenPos(S.x, 3, S.z), d = document.createElement('div'); d.className = 'pop' + (cls ? ' ' + cls : ''); d.innerHTML = text;
    d.style.left = p.x + 'px'; d.style.top = (p.y - 40 + (dy || 0)) + 'px'; el.popups.appendChild(d); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1200);
  }
  function banner(text, dur) { el.banner.textContent = text; el.banner.classList.add('show'); clearTimeout(banner.t); banner.t = setTimeout(function () { el.banner.classList.remove('show'); }, dur * 1000); }
  function statusFor(pts) { var st = M.D.STATUS, s = st[0][1]; for (var i = 0; i < st.length; i++) if (pts >= st[i][0]) s = st[i][1]; return s; }
  function updateLive() {
    if (G.session > 0 && (S.drifting || G.grace > 0)) {
      if (!live) { live = document.createElement('div'); live.className = 'pop'; live.style.animation = 'none'; live.style.opacity = '1'; el.popups.appendChild(live); }
      var p = screenPos(S.x, 2, S.z); live.style.left = (p.x + 120) + 'px'; live.style.top = (p.y - 10) + 'px';   // живой счёт серии справа от корабля, чтобы не лежать на корпусе
      live.innerHTML = '+' + Math.round(G.session) + (G.mult > 1 ? ' <span style="color:#ffc43d">×' + G.mult + '</span>' : '') + '<small>' + statusFor(G.session) + '</small>';
    } else if (live) { live.parentNode.removeChild(live); live = null; }
  }
  function endSession(clean) {
    if (G.session <= 0) return;
    var gained = Math.round(G.session * (clean ? G.mult : 1));
    G.score += gained; G.sessionBest = Math.max(G.sessionBest, gained);
    pop('+' + M.fmt(gained) + (clean && G.mult > 1 ? ' ×' + G.mult : '') + '<small>' + statusFor(G.session) + '</small>', clean && G.session > 180 ? 'big' : '', 60);
    G.session = 0; G.sessionT = 0; G.mult = 1; G.grace = 0;
  }

  // ---------- брызги: плоские квадраты, разлетающиеся из-под кормы ----------
  function makeSpray() {
    var geo = new THREE.PlaneGeometry(1.5, 1.5); geo.rotateX(-Math.PI / 2);
    spray = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }), sprayN);
    sprayAlive = []; for (var i = 0; i < sprayN; i++) { sprayAlive.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, s: 1 }); tmpM.makeScale(0, 0, 0); spray.setMatrixAt(i, tmpM); }
    spray.instanceMatrix.needsUpdate = true; scene.add(spray);
  }
  function spawnSpray(x, z, vx, vz, n) {
    for (var k = 0; k < n; k++) { var p = sprayAlive[sprayIdx]; sprayIdx = (sprayIdx + 1) % sprayN; p.life = 0.9 + Math.random() * 0.6; p.x = x + (Math.random() - 0.5) * 5; p.y = 0.3 + Math.random() * 1.5; p.z = z + (Math.random() - 0.5) * 5; p.vx = vx * 0.3 + (Math.random() - 0.5) * 9; p.vy = 2 + Math.random() * 5; p.vz = vz * 0.3 + (Math.random() - 0.5) * 9; p.rot = Math.random() * 6.28; p.s = 0.7 + Math.random() * 1.1; }
  }
  function stepSpray(dt) {
    for (var i = 0; i < sprayN; i++) {
      var p = sprayAlive[i];
      if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.vy -= 9 * dt; if (p.y < 0.2) { p.y = 0.2; p.vy = 0; p.vx *= 0.9; p.vz *= 0.9; } p.rot += dt * 2; var sc = p.s * Math.min(1, p.life * 2); tmpQ.setFromAxisAngle(tmpS.set(0, 1, 0), p.rot); tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(sc, sc, sc)); }
      else tmpM.makeScale(0, 0, 0);
      spray.setMatrixAt(i, tmpM);
    }
    spray.instanceMatrix.needsUpdate = true;
  }

  // ---------- столкновения: берега, камни, трафик ----------
  function collide(dt) {
    var fx = Math.cos(S.a), fz = Math.sin(S.a), L = ship.userData.len, r = ship.userData.half + 0.4, probes = [-0.38 * L, 0, 0.38 * L], hit = false, i, j;
    var circles = T.rocks.slice();
    for (i = 0; i < T.traffic.length; i++) { var tr = T.traffic[i], d = tr.mesh.userData.len / 2 - tr.mesh.userData.half, cx = Math.cos(tr.a), cz = Math.sin(tr.a); circles.push({ x: tr.x + cx * d, z: tr.z + cz * d, r: tr.mesh.userData.half + 0.6, tr: tr }); circles.push({ x: tr.x - cx * d, z: tr.z - cz * d, r: tr.mesh.userData.half + 0.6, tr: tr }); }
    for (i = 0; i < probes.length; i++) {
      var px = S.x + fx * probes[i], pz = S.z + fz * probes[i], q = T.nearest(px, pz, S.idx), lim = q.hw - r + 1;
      if (Math.abs(q.off) > lim) { var sg = q.off > 0 ? 1 : -1; hurt(M.impact(S, sg * Math.sin(q.a), -sg * Math.cos(q.a), Math.abs(q.off) - lim), 'bank'); hit = true; }
      for (j = 0; j < circles.length; j++) { var o = circles[j], dx = px - o.x, dz = pz - o.z, dd = Math.sqrt(dx * dx + dz * dz), rr = o.r + r - 0.6; if (dd < rr && dd > 0.001) { hurt(M.impact(S, dx / dd, dz / dd, rr - dd), o.tr ? 'boat' : 'rock'); hit = true; } }
    }
    return hit;
  }
  function hurt(v, src) {
    if (v > 1.6 && G.hitCool <= 0) {
      var dmg = Math.min(18, (v - 1.4) * 1.3) * spec.armour;
      G.cargo = Math.max(0, G.cargo - dmg); G.hitCool = 0.7; G.shake = Math.min(2, 0.4 + v * 0.15);
      pop('−' + Math.round(dmg) + '%<small>ГРУЗ</small>', 'bad', -70);
      if (G.session > 0) { G.mult = 1; endSession(false); }
    }
  }

  // ---------- шаг заезда ----------
  R.update = function (dt) {
    if (!running || paused) return;
    G.t += dt; G.hitCool -= dt;
    var P = { cruise: spec.cruise, turn: spec.turn, grip: spec.grip, friction: def.friction };
    var steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (!G.finished) M.stepShip(S, { steer: steer }, dt, P);
    var q = T.nearest(S.x, S.z, S.idx); S.idx = q.i; S.s = q.s; S.off = q.off;
    if (!G.finished) {
      if (q.s >= 0 && q.s <= T.finish.s + 20 && q.dist < q.hw && q.s > G.safeS + 2) { G.safeS = q.s; G.progressAt = G.t; }
      if (!Number.isFinite(q.s) || q.s < 0 || q.dist > q.hw + 40 || G.t - G.progressAt > 15) restore();
    }
    stepTraffic(dt);
    if (!G.finished) collide(dt);
    // дрифт: очки идут, пока есть угол и ход; короткий разрыв прощается, множитель растёт с длительностью серии
    if (S.drifting && S.sp > 6) {
      var qual = M.smooth((S.slip - 0.18) / 0.35) * (1 - M.smooth((S.slip - 0.95) / 0.3));
      G.session += S.sp * (0.25 + qual) * dt * 5; G.sessionT += dt; G.grace = 0.9;
      G.mult = Math.min(5, 1 + Math.floor(G.sessionT / 2.5));
      spawnSpray(S.x - Math.cos(S.a) * ship.userData.len * 0.35, S.z - Math.sin(S.a) * ship.userData.len * 0.35, S.vx, S.vz, 2 + Math.floor(S.slip * 4));
    } else if (G.session > 0) { G.grace -= dt; if (G.grace <= 0) endSession(true); }
    stepSpray(dt);
    pickups();
    if (!G.finished) {
      if (S.sp < 1.5) { S.stuckT += dt; if (S.stuckT > 3) restore(); } else S.stuckT = 0;
      if (S.s >= T.finish.s) finish();
    }
    // HUD
    el.raceProgress.style.width = Math.round(M.clamp(S.s / T.finish.s, 0, 1) * 100) + '%';
    el.driftScore.textContent = M.fmt(G.score + (G.session > 0 ? Math.round(G.session * G.mult) : 0));
    el.cargo.textContent = Math.round(G.cargo) + '%'; el.speed.textContent = Math.round(S.sp * 3.6) + ' км/ч';
    updateLive();
    world.animate(dt, G.t);
    ship.position.set(S.x, 0, S.z); ship.rotation.y = -S.a; ship.rotation.z = -S.w * 0.25 - (-S.vx * Math.sin(S.a) + S.vz * Math.cos(S.a)) * 0.012; ship.rotation.x = Math.sin(G.t * 1.1) * 0.01;
    updateCamera(dt);
    world.setSun(S.x, S.z);
  };
  function restore() {
    var s = M.clamp(G.safeS, 24, T.finish.s - 5), p = T.atS(s, 0);
    S.x = p.x; S.z = p.z; S.a = p.a; S.vx = Math.cos(p.a) * 5; S.vz = Math.sin(p.a) * 5;
    S.sp = 5; S.w = 0; S.slip = 0; S.drifting = false; S.stuckT = 0; S.s = s; S.off = 0; S.idx = Math.floor(s / T.step);
    G.session = 0; G.sessionT = 0; G.mult = 1; G.grace = 0; G.progressAt = G.t;
    resetInput(); banner('ВЕРНУЛИ НА ВОДУ', 1.2);
  }
  function stepTraffic(dt) {
    for (var i = 0; i < T.traffic.length; i++) {
      var tr = T.traffic[i]; tr.s += tr.dir * tr.speed * dt;
      if (tr.dir < 0 && tr.s < 40) tr.s = T.runLen - 60; if (tr.dir > 0 && tr.s > T.runLen - 40) tr.s = 60;
      var p = T.atS(tr.s, tr.off * T.atS(tr.s, 0).hw); tr.x = p.x; tr.z = p.z; tr.a = tr.dir > 0 ? p.a : p.a + Math.PI;
      tr.mesh.position.set(tr.x, 0, tr.z); tr.mesh.rotation.y = -tr.a;
    }
  }
  function pickups() {
    var i, dx, dz;
    for (i = 0; i < T.coins.length; i++) { var c = T.coins[i]; if (c.taken) continue; dx = c.x - S.x; dz = c.z - S.z; if (dx * dx + dz * dz < 36) { c.taken = true; G.coins += 1; pop('<span class="c" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#ffc43d;vertical-align:-1px"></span> +1', '', -10); } }
    for (i = 0; i < T.stars.length; i++) { var s = T.stars[i]; if (s.taken) continue; dx = s.x - S.x; dz = s.z - S.z; if (dx * dx + dz * dz < 49) { s.taken = true; G.stars += 1; pop('★ +400<small>ОПЫТ</small>', 'big', -20); } }
    for (i = 0; i < world.ports.length; i++) {
      var P = world.ports[i].data; if (P.done || P.missed || S.s < P.s) continue;
      dx = P.x - S.x; dz = P.z - S.z;
      var share = i === T.ports.length - 1 ? G.onBoard : Math.min(G.onBoard, G.perPort);
      if (dx * dx + dz * dz < 24 * 24) { P.done = true; G.delivered += share; G.onBoard -= share; world.ports[i].ring.material.color.setHex(0x5bc46a); pop('СДАНО<small>' + M.tanks(share).toUpperCase() + '</small>', 'big', -50); }
      else { P.missed = true; world.ports[i].ring.material.color.setHex(0x8a94a0); pop('МИМО ПРИЧАЛА', 'bad', -50); }
    }
  }
  function finish() {
    G.finished = true; endSession(true); banner('ФИНИШ', 2);
    var o = opts.order, share = o.amount ? G.delivered / o.amount : 1, cargoK = 0.4 + 0.6 * G.cargo / 100;
    var pay = (o.zen ? 0 : Math.round(o.pay * share * cargoK)) + G.coins * 20;
    var xp = Math.round(G.score) + G.stars * 400 + (o.zen ? 0 : Math.round(o.pay * 0.6 * share * cargoK));
    var result = { score: Math.round(G.score), best: G.sessionBest, coins: G.coins, stars: G.stars, cargo: Math.round(G.cargo), delivered: G.delivered, amount: o.amount, time: G.t, pay: pay, xp: xp, zen: !!o.zen };
    finishTimer = setTimeout(function () { if (running) { R.stop(); if (opts.onEnd) opts.onEnd(result); } }, 1500);
  }

  // ---------- камера: высоко сзади, доворачивается за скоростью, трясётся при ударе ----------
  function updateCamera(dt) {
    var portrait = camera.aspect < 1, fast = Math.max(0, S.sp - 50);   // быстрее опорных 50 м/с: камера чуть выше, дальше и смотрит дальше вперёд
    var back = (portrait ? 34 : 50) + fast * 0.2, up = (portrait ? 92 : 60) + fast * 0.3, ahead = (portrait ? 38 : 60) + fast * 0.8;   // альбомный экран: камера ниже и ближе, как за машиной
    var dir = S.a; if (S.sp > 3) { var va = Math.atan2(S.vz, S.vx); dir = S.a + M.angDiff(va, S.a) * 0.6; }
    if (!camInit) { camDir = dir; camInit = true; }
    camDir += M.angDiff(dir, camDir) * Math.min(1, 3 * dt);
    var dx = Math.cos(camDir), dz = Math.sin(camDir);
    var want = tmpP.set(S.x - dx * back, up, S.z - dz * back), look = new THREE.Vector3(S.x + dx * ahead, 0, S.z + dz * ahead);
    if (!camPos.lengthSq()) { camPos.copy(want); camLook.copy(look); }
    camPos.lerp(want, Math.min(1, 5 * dt)); camLook.lerp(look, Math.min(1, 6 * dt));
    camera.fov = (portrait ? 62 : 50) + M.clamp((S.sp - 25) * 0.3, 0, 18); camera.updateProjectionMatrix();
    camera.position.copy(camPos);
    if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.z += (Math.random() - 0.5) * G.shake; G.shake = Math.max(0, G.shake - dt * 3); }
    camera.lookAt(camLook);
  }
})();
