/* Ракеты «Лицензии на убийство»: захват ближайшего препятствия впереди, полёт ракеты с дымным следом, взрыв со вспышкой, кольцом по воде,
   огнём, дымом и обломками. Взорванное препятствие (камень, баржа, встречный катер) исчезает и больше не мешает. Ракет бесконечно. */
(function () {
  'use strict';
  var flat = M.flat, mat = M.mat, box = M.box, cyl = M.cyl;
  var tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color(), AX = new THREE.Vector3(1, 0, 0);
  var FIRE = [0xfff1b0, 0xffd34d, 0xff9a2e, 0xff5a1f], SMOKE = [0x3a3d42, 0x5c6066, 0x8a8f96], N = 360;
  var LABEL = { rock: 'КАМЕНЬ', barge: 'БАРЖА', launch: 'КАТЕР' };

  // Ракета в полёте: корпус вдоль +x, оранжевый поясок и нос-конус, три стабилизатора у хвоста, факел.
  function rocketTemplate() {
    var g = new THREE.Group(), white = mat(0xf4f4f0), orange = mat(0xff7a2e), dark = mat(0x2b3038), i;
    cyl(0.42, 0.42, 2.6, 8, white, 0, 0, 0, g, Math.PI / 2);
    cyl(0.44, 0.44, 0.5, 8, orange, 0.6, 0, 0, g, Math.PI / 2);
    var nose = new THREE.Mesh(flat(new THREE.ConeGeometry(0.42, 1.1, 8)), orange); nose.rotation.z = -Math.PI / 2; nose.position.x = 1.85; nose.castShadow = true; g.add(nose);
    for (i = 0; i < 3; i++) { var phi = i * M.TAU / 3, fin = box(0.9, 1.1, 0.1, dark, 0, 0, 0, g, false); fin.rotation.x = phi; fin.position.set(-1.05, Math.cos(phi) * 0.55, Math.sin(phi) * 0.55); }
    var flame = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd040 })); flame.position.x = -1.6; flame.scale.set(1.8, 1, 1); g.add(flame);
    g.visible = false;   // шаблон спрятан в сцене, ракеты в полёте — его клоны с общими геометриями и материалами
    return g;
  }

  // Пул частиц: кубики с цветом на экземпляр. Огонь и дым всплывают и растут, обломки летят по баллистике и тонут, брызги белые.
  function makePool(scene) {
    var im = new THREE.InstancedMesh(flat(new THREE.BoxGeometry(1, 1, 1)), new THREE.MeshBasicMaterial({ color: 0xffffff }), N), parts = [], idx = 0, i;
    for (i = 0; i < N; i++) { parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, grow: 0, g: 0, rot: 0, rv: 0, sink: false }); tmpM.makeScale(0, 0, 0); im.setMatrixAt(i, tmpM); im.setColorAt(i, tmpC.setHex(0xffffff)); }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; scene.add(im);
    return {
      spawn: function (x, y, z, vx, vy, vz, life, s, color, grow, g, sink) {
        var k = idx, p = parts[k]; idx = (idx + 1) % N;
        p.life = p.max = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.grow = grow || 0; p.g = g || 0; p.rot = Math.random() * M.TAU; p.rv = (Math.random() - 0.5) * 8; p.sink = !!sink;
        im.setColorAt(k, tmpC.setHex(color)); im.instanceColor.needsUpdate = true;
      },
      step: function (dt) {
        for (var i = 0; i < N; i++) {
          var p = parts[i];
          if (p.life > 0) {
            p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.rv * dt;
            if (p.sink && p.y < 0) p.life = 0;   // обломок ушёл под воду
            var k = p.life / p.max, sc = p.life > 0 ? p.s * (p.grow ? 1 + p.grow * (1 - k) : 1) * Math.min(1, k * 4) : 0;
            tmpQ.setFromAxisAngle(tmpS.set(0.3, 1, 0.2).normalize(), p.rot); tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(sc, sc, sc));
          } else tmpM.makeScale(0, 0, 0);
          im.setMatrixAt(i, tmpM);
        }
        im.instanceMatrix.needsUpdate = true;
      }
    };
  }

  // Вспышки: светлый шар, который раздувается и тает, и кольцо ударной волны по воде. Несколько штук по кругу, старая уступает новой.
  function makeFlashes(scene, n) {
    var list = [], i;
    for (i = 0; i < n; i++) {
      var ball = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.95, depthWrite: false }));
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ball.visible = ring.visible = false; scene.add(ball); scene.add(ring);
      list.push({ ball: ball, ring: ring, t: -1, size: 1 });
    }
    return {
      burst: function (x, y, z, size) {
        var f = list[0], k; for (k = 1; k < list.length; k++) if (f.t >= 0 && (list[k].t < 0 || list[k].t > f.t)) f = list[k];
        f.t = 0; f.size = size; f.ball.position.set(x, y, z); f.ring.position.set(x, 0.15, z); f.ball.visible = true; f.ring.visible = y < 8;
      },
      step: function (dt) {
        for (var k = 0; k < list.length; k++) {
          var f = list[k]; if (f.t < 0) continue;
          f.t += dt; var u = f.t / 0.5;
          if (u >= 1) { f.t = -1; f.ball.visible = f.ring.visible = false; continue; }
          f.ball.scale.setScalar(f.size * (2 + 9 * M.smooth(u))); f.ball.material.opacity = 0.95 * (1 - u);
          f.ring.scale.setScalar(f.size * (1 + 30 * u)); f.ring.material.opacity = 0.8 * (1 - u);
        }
      }
    };
  }

  // scene — сцена заезда, T — трасса (T.rocks и T.traffic — препятствия), ship — модель с userData.launcher,
  // hooks: { pop(text, cls, x, z) — подпись над точкой, shake(x, z, size) — тряска камеры }.
  // Возвращает RK: want — нажатие (обрабатывается в update), aim(S) — цель впереди, update(dt, S, canFire), blown — счётчик, flying — ракеты в полёте.
  M.makeRockets = function (scene, T, ship, hooks) {
    var cfg = M.D.ROCKET, RK = { blown: 0, want: false, flying: [] }, pool = makePool(scene), fx = makeFlashes(scene, 3), tpl = rocketTemplate(), cool = 0, tube = 0, reload = [];
    scene.add(tpl);

    // цель: ближайшее живое препятствие в конусе впереди по курсу, которое ещё не захвачено другой ракетой
    RK.aim = function (S) {
      var fx = Math.cos(S.a), fz = Math.sin(S.a), best = null, bd = Infinity, i;
      function consider(o, r, kind) {
        if (o.dead || o.locked) return;
        var dx = o.x - S.x, dz = o.z - S.z, along = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx), d = Math.sqrt(dx * dx + dz * dz);
        if (along < 4 || d > cfg.lockRange || side > 16 + along * 0.8) return;
        if (d < bd) { bd = d; best = { obj: o, r: r, kind: kind }; }
      }
      for (i = 0; i < T.rocks.length; i++) consider(T.rocks[i], T.rocks[i].r, 'rock');
      for (i = 0; i < T.traffic.length; i++) consider(T.traffic[i], T.traffic[i].mesh.userData.len * 0.5, T.traffic[i].kind);
      return best;
    };

    // пуск из трубы установки: ракета выходит по курсу чуть вверх, разгоняется и доворачивает на цель; без цели летит прямо
    RK.fire = function (S) {
      if (cool > 0 || RK.flying.length >= cfg.maxFlight) return false;
      var L = ship.userData.launcher || { x: 0, y: 3, spread: 0 }, ca = Math.cos(S.a), sa = Math.sin(S.a), tz = (tube % 2 ? 1 : -1) * (L.spread || 0);
      var x = S.x + L.x * ca - tz * sa, z = S.z + L.x * sa + tz * ca, y = L.y, target = RK.aim(S), m = tpl.clone(), i;
      m.visible = true; m.scale.setScalar(1.6); scene.add(m);   // в полёте ракета крупнее трубной, чтобы читаться с камеры
      if (target) target.obj.locked = true;
      RK.flying.push({ m: m, x: x, y: y, z: z, dx: ca * 0.985, dy: 0.17, dz: sa * 0.985, sp: Math.max(40, S.sp) + 30, t: 0, dist: 0, target: target, idx: S.idx });
      cool = cfg.cooldown;
      var tubes = ship.userData.tubes; if (tubes && tubes.length) { var tb = tubes[tube % tubes.length]; for (i = 0; i < tb.length; i++) tb[i].visible = false; reload.push({ parts: tb, t: 0.8 }); }   // в трубе на миг пусто: перезарядка
      tube += 1;
      for (i = 0; i < 6; i++) pool.spawn(x - ca * 2, y, z - sa * 2, -ca * 4 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, -sa * 4 + (Math.random() - 0.5) * 4, 0.5, 1.2, 0xe8eaee, 2, -1);
      return true;
    };

    RK.update = function (dt, S, canFire) {
      cool -= dt;
      if (RK.want) { RK.want = false; if (canFire) RK.fire(S); }
      var i;
      for (i = reload.length - 1; i >= 0; i--) { reload[i].t -= dt; if (reload[i].t <= 0) { for (var k = 0; k < reload[i].parts.length; k++) reload[i].parts[k].visible = true; reload.splice(i, 1); } }
      for (i = RK.flying.length - 1; i >= 0; i--) if (stepRocket(RK.flying[i], dt)) RK.flying.splice(i, 1);
      pool.step(dt); fx.step(dt);
    };

    function stepRocket(r, dt) {
      r.t += dt; r.sp = Math.min(cfg.speed, r.sp + cfg.accel * dt);
      var tg = r.target && !r.target.obj.dead ? r.target : null;
      if (tg) {   // самонаведение: направление догоняет вектор на цель, в первые четверть секунды мягко, потом резко
        var o = tg.obj, ty = tg.kind === 'rock' ? tg.r * 0.4 : 1.6, wx = o.x - r.x, wy = ty - r.y, wz = o.z - r.z, wl = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1, k = Math.min(1, (r.t < 0.25 ? 3 : 9) * dt);
        r.dx += (wx / wl - r.dx) * k; r.dy += (wy / wl - r.dy) * k; r.dz += (wz / wl - r.dz) * k;
      } else r.dy += (-0.1 - r.dy) * Math.min(1, 1.5 * dt);   // без цели ракета постепенно опускается к воде
      var dl = Math.sqrt(r.dx * r.dx + r.dy * r.dy + r.dz * r.dz) || 1; r.dx /= dl; r.dy /= dl; r.dz /= dl;
      var step = r.sp * dt, px = r.x, pz = r.z; r.x += r.dx * step; r.y += r.dy * step; r.z += r.dz * step; r.dist += step;
      r.m.position.set(r.x, r.y, r.z); r.m.quaternion.setFromUnitVectors(AX, tmpP.set(r.dx, r.dy, r.dz)); r.m.rotation.x += r.t * 9;   // ракета вращается вокруг своей оси
      var puffs = Math.max(1, Math.round(step / 3.5)), py = r.y - r.dy * step;   // дымный след: клуб каждые 3,5 м пути, распределён вдоль отрезка за кадр, чтобы на 170 м/с след не рвался на точки
      for (var pi = 0; pi < puffs; pi++) { var f = (pi + 0.5) / puffs; pool.spawn(px + (r.x - px) * f - r.dx * 2, py + (r.y - py) * f - r.dy * 2, pz + (r.z - pz) * f - r.dz * 2, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.55 + Math.random() * 0.35, 0.9, Math.random() < 0.25 ? 0xffb050 : 0xd8dce0, 2.5, -2); }
      if (tg) {   // попадание считается по отрезку пути за кадр: на 170 м/с ракета за кадр пролетает больше радиуса цели
        var ex = r.x - px, ez = r.z - pz, l2 = ex * ex + ez * ez, u = l2 > 0 ? M.clamp(((tg.obj.x - px) * ex + (tg.obj.z - pz) * ez) / l2, 0, 1) : 0;
        var hx = tg.obj.x - (px + ex * u), hz = tg.obj.z - (pz + ez * u);
        if (hx * hx + hz * hz < (tg.r + 2.5) * (tg.r + 2.5) && r.y < 10) return blast(r, tg, '');
      }
      var q = T.nearest(r.x, r.z, r.idx); r.idx = q.i;
      if (Math.abs(q.off) > q.hw + 2 && r.y < 12) return blast(r, null, 'В БЕРЕГ');
      if (r.y < 0.3 || r.dist > cfg.range) return blast(r, null, 'МИМО');
      return false;
    }

    // взрыв: цель исчезает, на её месте вспышка, огонь, дым, обломки цвета корпуса и брызги; без цели — хлопок на воде или в берегу
    function blast(r, tg, label) {
      scene.remove(r.m);
      var x = r.x, z = r.z, y = Math.max(0.5, r.y), color = 0xffffff, size = 0.7, kind = 'water';
      if (tg) {
        var o = tg.obj; o.dead = true; o.locked = false; if (o.mesh) o.mesh.visible = false; RK.blown += 1;
        x = o.x; z = o.z; kind = tg.kind;
        if (kind === 'rock') { y = tg.r * 0.5; size = 1 + tg.r / 5; color = o.mesh ? o.mesh.material.color.getHex() : 0x8c8f96; }
        else { y = 2; size = kind === 'barge' ? 1.5 : 1.1; color = (o.mesh && o.mesh.userData.color) || 0x3b4a5a; }
        label = 'БАБАХ<small>' + LABEL[kind] + '</small>';
      } else {
        if (r.target) r.target.obj.locked = false;
        if (label === 'В БЕРЕГ') { kind = 'bank'; color = 0x8a6a4a; size = 0.9; }
      }
      explode(x, y, z, size, color, kind);
      hooks.pop(label, tg ? 'big' : '', x, z); hooks.shake(x, z, size);
      return true;
    }
    function explode(x, y, z, size, color, kind) {
      var i, n, a, u, v;
      fx.burst(x, y, z, size);
      for (i = 0, n = Math.round(14 * size); i < n; i++) { a = Math.random() * M.TAU; u = Math.random(); v = 6 + Math.random() * 16; pool.spawn(x, y, z, Math.cos(a) * v * u, 6 + Math.random() * 14, Math.sin(a) * v * u, 0.35 + Math.random() * 0.4, (1.6 + Math.random() * 1.8) * size, FIRE[i % 4], 0, 6); }
      for (i = 0, n = Math.round(10 * size); i < n; i++) { a = Math.random() * M.TAU; v = 2 + Math.random() * 6; pool.spawn(x, y + 1, z, Math.cos(a) * v, 4 + Math.random() * 6, Math.sin(a) * v, 1.1 + Math.random() * 0.9, (1.8 + Math.random() * 1.6) * size, SMOKE[i % 3], 1.8, -1.5); }
      if (kind !== 'water') for (i = 0, n = Math.round(10 * size); i < n; i++) { a = Math.random() * M.TAU; v = 8 + Math.random() * 18; pool.spawn(x, y, z, Math.cos(a) * v, 9 + Math.random() * 16, Math.sin(a) * v, 1.5 + Math.random() * 1.2, (0.5 + Math.random() * 0.9) * size, i % 3 === 2 ? 0x2b3038 : color, 0, 24, true); }
      if (y < 6) for (i = 0; i < 12; i++) { a = Math.random() * M.TAU; v = 4 + Math.random() * 10; pool.spawn(x, 0.3, z, Math.cos(a) * v, 8 + Math.random() * 10, Math.sin(a) * v, 0.8 + Math.random() * 0.5, 1 + Math.random(), 0xffffff, 0, 18, true); }
    }
    return RK;
  };
})();
