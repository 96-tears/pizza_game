/* Река: осевая линия из прямых и дуг, две полосы, берега, причалы, финиш, монеты, камни и трафик. Чистая геометрия без three.js. */
(function () {
  'use strict';
  var STEP = 4;
  var LANE = 0.5;          // полосы идут на ±LANE·hw от оси: встречные слева, попутные баржи справа
  var BOAT_HALF = 3.2;

  // spec: { seed, track (id), length (м), difficulty 0..1, ports (число причалов), rocks (bool), zen (bool), pace (темп заказа: трафик идёт быстрее) }
  M.makeTrack = function (spec) {
    var rand = M.rng(spec.seed), diff = M.clamp(spec.difficulty || 0, 0, 1);
    var runLen = spec.length || 2000, basin = 160, total = runLen + basin, n = Math.ceil(total / STEP) + 1;
    var baseHw = 32 - 6 * diff;
    var px = new Float32Array(n), pz = new Float32Array(n), pa = new Float32Array(n), hw = new Float32Array(n);
    var x = 0, z = 0, a = 0, i, segLeft = 0, curv = 0, target = 0, widthPhase = rand() * 10;
    // профиль: прямая — поворот — прямая; радиусы тем меньше, чем сложнее заказ. Река раскроена под скорость машины: длинные прямые и широкие дуги
    for (i = 0; i < n; i++) {
      var s = i * STEP;
      px[i] = x; pz[i] = z; pa[i] = a;
      hw[i] = baseHw + 3 * Math.sin(s / 90 + widthPhase) + (s > runLen ? M.smooth((s - runLen) / 60) * 14 : 0);
      if (segLeft <= 0) {
        var straight = target !== 0 || rand() < 0.35;
        if (straight) { target = 0; segLeft = 120 + rand() * 260; }
        else {
          var R = M.lerp(470, 170, diff) * (0.75 + rand() * 0.6), sign = rand() < 0.5 ? -1 : 1;
          if (a > 0.9) sign = -1; if (a < -0.9) sign = 1;            // русло в целом течёт на восток и не заворачивает в себя
          target = sign / R; var ang = 0.5 + rand() * (0.6 + 0.7 * diff); segLeft = ang * R;
        }
      }
      segLeft -= STEP;
      var ease = s > runLen - 100 ? 1 - M.smooth((s - (runLen - 100)) / 100) : 1;
      curv = M.lerp(curv, target * ease, 0.12);
      a += curv * STEP; x += Math.cos(a) * STEP; z += Math.sin(a) * STEP;
    }
    var curvArr = new Float32Array(n), kmax = new Float32Array(n), j;
    for (i = 0; i < n; i++) { var i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2); curvArr[i] = M.angDiff(pa[i1], pa[i0]) / (STEP * (i1 - i0)); }
    for (i = 0; i < n; i++) { var mx = 0; for (j = Math.max(0, i - 10); j <= Math.min(n - 1, i + 10); j++) mx = Math.max(mx, Math.abs(curvArr[j])); kmax[i] = mx; }
    var noise = new Float32Array(n); for (i = 0; i < n; i++) noise[i] = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(i * 0.37 + rand() * 0.2) * Math.sin(i * 0.11));

    var T = { spec: spec, step: STEP, n: n, px: px, pz: pz, pa: pa, hw: hw, curv: curvArr, kmax: kmax, noise: noise, total: total, runLen: runLen, lane: LANE,
      trees: [], rocks: [], lamps: [], buoys: [], coins: [], stars: [], ports: [], traffic: [], finish: null, start: null };
    T.atIdx = function (i, off) { i = M.clamp(i, 0, n - 1); var h = pa[i]; return { x: px[i] - Math.sin(h) * off, z: pz[i] + Math.cos(h) * off, a: h, hw: hw[i] }; };
    T.atS = function (s, off) {
      var f = M.clamp(s / STEP, 0, n - 1.001), k = Math.floor(f), t = f - k, p0 = T.atIdx(k, off), p1 = T.atIdx(k + 1, off);
      return { x: M.lerp(p0.x, p1.x, t), z: M.lerp(p0.z, p1.z, t), a: pa[k] + M.angDiff(pa[k + 1], pa[k]) * t, hw: M.lerp(hw[k], hw[k + 1], t) };
    };
    T.nearest = function (x, z, hint) { // ближайшая точка оси рядом с подсказкой: индекс, смещение (влево +), пройденный путь
      var lo = M.clamp(hint - 30, 0, n - 1), hi = M.clamp(hint + 60, 0, n - 1), best = lo, bd = Infinity;
      for (var k = lo; k <= hi; k++) { var dx = x - px[k], dz = z - pz[k], dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = k; } }
      var h = pa[best], off = -(x - px[best]) * Math.sin(h) + (z - pz[best]) * Math.cos(h), along = (x - px[best]) * Math.cos(h) + (z - pz[best]) * Math.sin(h);
      return { i: best, off: off, s: best * STEP + along, hw: hw[best], a: h, dist: Math.sqrt(bd) };
    };
    T.insideSafe = function (i, side, d) { // на внутренней стороне дуги смещение насыщается, чтобы берег не складывался
      var kap = curvArr[i]; if (side * kap <= 0) return d;
      var Rm = Math.max(10, 0.8 / Math.max(kmax[i], 1e-4) - hw[i]);
      return Rm * (1 - Math.exp(-d / Rm));
    };
    T.bankHeight = function (i, d) { var k = noise[M.clamp(i, 0, n - 1)]; return Math.min(60, (0.5 + 0.09 * d + 0.0019 * d * d) * k); };
    T.farFromWater = function (x, z, i, margin) { // точка на берегу не должна оказаться в воде другого колена реки
      for (var k = 0; k < n; k += 6) { if (Math.abs(k - i) < 14) continue; var dx = x - px[k], dz = z - pz[k]; if (dx * dx + dz * dz < (hw[k] + margin) * (hw[k] + margin)) return false; }
      return true;
    };
    function inLane(off, r, h) { var lo = LANE * h - BOAT_HALF - 2, hi = LANE * h + BOAT_HALF + 2, a0 = Math.abs(off) - r, a1 = Math.abs(off) + r; return a1 > lo && a0 < hi; }

    // причалы: на прямых участках, по очереди слева и справа; сброс засчитывается у головы пирса
    var portsN = spec.zen ? 0 : (spec.ports || 2);
    for (i = 0; i < portsN; i++) {
      var want = Math.floor(runLen * (i + 1) / (portsN + 1) / STEP), bi = want, bk = Infinity;
      for (j = want - 40; j <= want + 40; j++) { if (j < 30 || j > runLen / STEP - 40) continue; if (kmax[j] < bk) { bk = kmax[j]; bi = j; } }
      var side = i % 2 === 0 ? 1 : -1, head = T.atIdx(bi, side * (hw[bi] - 13));
      T.ports.push({ i: bi, s: bi * STEP, side: side, x: head.x, z: head.z, a: pa[bi], hw: hw[bi], done: false, missed: false });
    }
    var fin = T.atS(total - 70, 0); T.finish = { s: total - 70, x: fin.x, z: fin.z, a: fin.a, hw: fin.hw };
    var st = T.atIdx(6, 0); T.start = { x: st.x, z: st.z, a: pa[6] };

    // камни в воде: только на опасной реке, никогда в полосе
    if (spec.rocks) {
      var rockCount = Math.round(runLen / 260), tries = 0;
      while (T.rocks.length < rockCount && tries < 500) {
        tries++;
        var ri = 40 + Math.floor(rand() * (runLen / STEP - 80)), rr = 2.5 + rand() * 3, roff = (rand() * 2 - 1) * hw[ri] * 0.85;
        if (inLane(roff, rr, hw[ri]) || Math.abs(roff) + rr > hw[ri] - 2) continue;
        var nearPort = false; for (j = 0; j < T.ports.length; j++) if (Math.abs(T.ports[j].i - ri) * STEP < 60) nearPort = true;
        if (nearPort) continue;
        var rp = T.atIdx(ri, roff); T.rocks.push({ x: rp.x, z: rp.z, r: rr, rot: rand() * M.TAU });
      }
    }
    // монеты: цепочки по внутренней стороне поворотов, как подсказка траектории; звёзды — редкие, на внешней кромке крутых дуг
    for (i = 40; i < runLen / STEP - 60; i += 1) {
      var kap = curvArr[i];
      if (Math.abs(kap) > 0.004 && rand() < 0.045) {
        var inner = kap > 0 ? 1 : -1, coff = inner * hw[i] * 0.55;
        for (j = 0; j < 7; j++) { var cp = T.atIdx(i + j * 2, coff); T.coins.push({ x: cp.x, z: cp.z, taken: false, phase: rand() * M.TAU }); }
        i += 24;
      } else if (Math.abs(kap) > 0.007 && rand() < 0.02) {
        var outer = kap > 0 ? -1 : 1, sp = T.atIdx(i, outer * hw[i] * 0.7); T.stars.push({ x: sp.x, z: sp.z, taken: false, phase: rand() * M.TAU }); i += 10;
      }
    }
    // трафик: попутные баржи справа и встречные катера слева, в разных ячейках по 420 м, чтобы обе полосы не перекрывались разом
    if (!spec.zen || true) {
      var cells = Math.floor((runLen - 500) / 420);
      for (i = 0; i < cells; i++) {
        if (rand() < 0.25) continue;
        var oncoming = i % 2 === 1, s0 = 300 + i * 420 + rand() * 120;
        T.traffic.push({ s: s0, off: (oncoming ? -1 : 1) * LANE, dir: oncoming ? -1 : 1, speed: (oncoming ? 11 + rand() * 4 : 5 + rand() * 3) * (spec.pace || 1), kind: oncoming ? 'launch' : 'barge', x: 0, z: 0, a: 0, hit: false });
      }
    }
    // фонари и буи по кромке, деревья и камни по берегам
    for (i = 8; i < n - 4; i += 1) {
      var s2 = i * STEP, sideL;
      if (i % 22 === 0 && spec.lamps !== false) { sideL = (i / 22) % 2 === 0 ? 1 : -1; var lp = T.atIdx(i, sideL * (hw[i] + 3)); if (T.farFromWater(lp.x, lp.z, i, 1)) T.lamps.push({ x: lp.x, z: lp.z, a: pa[i], side: sideL }); }
      if (i % 15 === 0) { var bl = T.atIdx(i, hw[i] - 1.2), br = T.atIdx(i, -hw[i] + 1.2); T.buoys.push({ x: bl.x, z: bl.z, left: true }); T.buoys.push({ x: br.x, z: br.z, left: false }); }
      for (var sd = -1; sd <= 1; sd += 2) {
        if (rand() < 0.5 * (spec.treeDensity || 1)) {
          var d = 6 + rand() * 70; if (s2 > runLen - 40 && sd === 1) continue;
          var tp = T.atIdx(i, sd * (hw[i] + T.insideSafe(i, sd, d)));
          if (!T.farFromWater(tp.x, tp.z, i, 4)) continue;
          var h = T.bankHeight(i, d);
          T.trees.push({ x: tp.x, z: tp.z, y: h, s: 0.75 + rand() * 0.7, tint: rand(), kind: rand() < 0.12 ? 'rock' : 'tree' });
        }
      }
    }
    return T;
  };
})();
