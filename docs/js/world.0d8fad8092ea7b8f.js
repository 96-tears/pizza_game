/* Сцена заезда по сгенерированной реке: небо и туман, свет, вода с разметкой, гранёные берега с цветом по высоте, деревья, причалы, финиш, монеты, трафик. */
(function () {
  'use strict';
  var flat = M.flat, mat = M.mat, box = M.box, cyl = M.cyl;
  var tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

  M.label = function (text, color, size) { // текстура с надписью для табличек портов и финиша
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; var x = cv.getContext('2d');
    x.clearRect(0, 0, 512, 128); x.font = '900 ' + (size || 72) + "px Nunito, 'Arial Black', sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,0.35)'; x.strokeText(text, 256, 68); x.fillStyle = color || '#fff'; x.fillText(text, 256, 64);
    var tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; return tex;
  };

  M.buildWorld = function (T, def, scene) {
    var pal = def.pal, W = { group: new THREE.Group(), coins: [], stars: [], ports: [], traffic: [], lampHeads: [] };
    scene.add(W.group);
    scene.background = new THREE.Color(pal.sky);
    scene.fog = new THREE.Fog(pal.fog, def.night ? 120 : 220, def.night ? 520 : 820);
    W.hemi = new THREE.HemisphereLight(pal.hemi, pal.hemiG, def.night ? 0.55 : 0.75); W.group.add(W.hemi);
    W.sun = new THREE.DirectionalLight(pal.sun, def.night ? 0.35 : 1.0); W.sun.castShadow = true;
    W.sun.shadow.mapSize.set(1024, 1024); W.sun.shadow.camera.near = 40; W.sun.shadow.camera.far = 520;
    W.sun.shadow.camera.left = -150; W.sun.shadow.camera.right = 150; W.sun.shadow.camera.top = 150; W.sun.shadow.camera.bottom = -150; W.sun.shadow.bias = -0.0008;
    W.group.add(W.sun); W.group.add(W.sun.target);
    W.setSun = function (x, z) { W.sun.position.set(x - 110, 170, z + 90); W.sun.target.position.set(x, 0, z); W.sun.target.updateMatrixWorld(); };

    var i, k, sd, n = T.n;
    // ---------- вода: полоса между берегами, пенная кромка, пунктир по оси ----------
    var wpos = [], lpos = [], cpos = [];
    for (i = 0; i < n - 1; i++) {
      var l0 = T.atIdx(i, T.hw[i] + 0.6), r0 = T.atIdx(i, -T.hw[i] - 0.6), l1 = T.atIdx(i + 1, T.hw[i + 1] + 0.6), r1 = T.atIdx(i + 1, -T.hw[i + 1] - 0.6);
      wpos.push(l0.x, 0, l0.z, r0.x, 0, r0.z, r1.x, 0, r1.z, l0.x, 0, l0.z, r1.x, 0, r1.z, l1.x, 0, l1.z);
      for (sd = -1; sd <= 1; sd += 2) {
        var a0 = T.atIdx(i, sd * (T.hw[i] - 1.4)), b0 = T.atIdx(i, sd * (T.hw[i] + 0.3)), a1 = T.atIdx(i + 1, sd * (T.hw[i + 1] - 1.4)), b1 = T.atIdx(i + 1, sd * (T.hw[i + 1] + 0.3));
        lpos.push(a0.x, 0.05, a0.z, b0.x, 0.05, b0.z, b1.x, 0.05, b1.z, a0.x, 0.05, a0.z, b1.x, 0.05, b1.z, a1.x, 0.05, a1.z);
      }
      if (i % 4 < 2 && i * T.step < T.runLen) { var c0 = T.atIdx(i, 0.5), d0 = T.atIdx(i, -0.5), c1 = T.atIdx(i + 1, 0.5), d1 = T.atIdx(i + 1, -0.5); cpos.push(c0.x, 0.05, c0.z, d0.x, 0.05, d0.z, d1.x, 0.05, d1.z, c0.x, 0.05, c0.z, d1.x, 0.05, d1.z, c1.x, 0.05, c1.z); }
    }
    function tris(arr, material) { var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); var m = new THREE.Mesh(g, material); W.group.add(m); return m; }
    var water = tris(wpos, new THREE.MeshLambertMaterial({ color: pal.water, side: THREE.DoubleSide })); water.receiveShadow = true;
    tris(lpos, new THREE.MeshBasicMaterial({ color: pal.line, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    tris(cpos, new THREE.MeshBasicMaterial({ color: pal.line, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));

    // ---------- берега: кольца смещений, высота по профилю, цвет по высоте ----------
    var rings = [0, 5, 14, 28, 50, 80, 120, 170, 240], bpos = [], bcol = [];
    var cBank = new THREE.Color(pal.bank), cG1 = new THREE.Color(pal.ground), cG2 = new THREE.Color(pal.ground2), cHill = new THREE.Color(pal.hill);
    function colorAt(d, h, j) { var c = d < 4 ? cBank : h < 9 ? (j < 0.5 ? cG1 : cG2) : h < 26 ? cG2.clone().lerp(cHill, (h - 9) / 17) : cHill; return c; }
    function vert(i, r, side) { var d = rings[r], off = side * (T.hw[i] + T.insideSafe(i, side, d)), p = T.atIdx(i, off); var h = d === 0 ? -0.6 : T.bankHeight(i, d); return [p.x, h, p.z, d, h]; }
    var jit = function (i, r) { return ((Math.sin(i * 12.9898 + r * 78.233) * 43758.5453) % 1 + 1) % 1; };
    for (i = 0; i < n - 1; i += 1) for (sd = -1; sd <= 1; sd += 2) for (k = 0; k < rings.length - 1; k++) {
      var p00 = vert(i, k, sd), p01 = vert(i, k + 1, sd), p10 = vert(i + 1, k, sd), p11 = vert(i + 1, k + 1, sd), j = jit(i, k);
      var c = colorAt(p01[3], p01[4], j).clone().offsetHSL(0, 0, (j - 0.5) * 0.05);
      var quad = sd > 0 ? [p00, p01, p11, p00, p11, p10] : [p00, p11, p01, p00, p10, p11];
      for (var q = 0; q < 6; q++) { bpos.push(quad[q][0], quad[q][1], quad[q][2]); bcol.push(c.r, c.g, c.b); }
    }
    var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3)); bg.computeVertexNormals();
    var banks = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true })); banks.receiveShadow = true; W.group.add(banks);

    // ---------- деревья и камни на берегах: инстансы ----------
    var trees = T.trees.filter(function (t) { return t.kind === 'tree'; }), rocks = T.trees.filter(function (t) { return t.kind === 'rock'; });
    function instanced(geo, material, items, place) {
      if (!items.length) return null;
      var im = new THREE.InstancedMesh(geo, material, items.length); im.castShadow = true; im.receiveShadow = true;
      for (var q = 0; q < items.length; q++) { place(items[q], q); im.setMatrixAt(q, tmpM); if (im.setColorAt) im.setColorAt(q, tmpC); }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; W.group.add(im); return im;
    }
    var crownGeo = def.trees === 'crystal' ? flat(new THREE.ConeGeometry(2.2, 7, 5)) : def.trees === 'palm' ? flat(new THREE.ConeGeometry(3.2, 1.4, 6)) : flat(new THREE.IcosahedronGeometry(2.6, 0));
    var trunkGeo = flat(new THREE.CylinderGeometry(0.35, 0.5, 3.6, 5));
    var cT1 = new THREE.Color(pal.tree), cT2 = new THREE.Color(pal.tree2);
    instanced(trunkGeo, mat(pal.trunk), trees, function (t) { tmpQ.set(0, 0, 0, 1); tmpM.compose(tmpP.set(t.x, t.y + 1.6 * t.s, t.z), tmpQ, tmpS.set(t.s, t.s, t.s)); tmpC.copy(cT1); });
    instanced(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), trees, function (t) {
      var cy = def.trees === 'crystal' ? t.y + 5.5 * t.s : def.trees === 'palm' ? t.y + 4.2 * t.s : t.y + 5 * t.s;
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.tint * 6.28); tmpM.compose(tmpP.set(t.x, cy, t.z), tmpQ, tmpS.set(t.s, t.s * (def.trees === 'round' ? 1.2 : 1), t.s));
      tmpC.copy(cT1).lerp(cT2, t.tint);
    });
    instanced(flat(new THREE.DodecahedronGeometry(1.8, 0)), new THREE.MeshLambertMaterial({ color: 0xffffff }), rocks, function (t) { tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0.3, 0), t.tint * 3); tmpM.compose(tmpP.set(t.x, t.y + 0.6 * t.s, t.z), tmpQ, tmpS.set(t.s * 1.4, t.s, t.s * 1.1)); tmpC.setHex(pal.rock); });
    // камни в воде: отдельные меши, они ещё и препятствия
    for (i = 0; i < T.rocks.length; i++) { var rk = T.rocks[i], rm = new THREE.Mesh(flat(new THREE.DodecahedronGeometry(rk.r, 0)), mat(pal.rock)); rm.position.set(rk.x, rk.r * 0.25, rk.z); rm.rotation.y = rk.rot; rm.castShadow = true; W.group.add(rm); rk.mesh = rm; }
    // буи по кромке и фонари
    var buoyGeo = flat(new THREE.CylinderGeometry(0.5, 0.7, 1.4, 6)), bR = mat(0xe0453a), bG = mat(0x3fbf6a);
    instanced(buoyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), T.buoys, function (b) { tmpQ.set(0, 0, 0, 1); tmpM.compose(tmpP.set(b.x, 0.5, b.z), tmpQ, tmpS.set(1, 1, 1)); tmpC.setHex(b.left ? 0xe0453a : 0x3fbf6a); });
    var lampMat = new THREE.MeshBasicMaterial({ color: def.night ? 0xffe6a0 : 0xfff3cc });
    for (i = 0; i < T.lamps.length; i++) {
      var lp = T.lamps[i], y0 = T.bankHeight(T.nearest(lp.x, lp.z, 0).i, 3);
      cyl(0.18, 0.26, 9, 6, mat(0x3d4248), lp.x, y0 + 4.5, lp.z, W.group);
      var arm = box(2.6, 0.25, 0.25, mat(0x3d4248), lp.x, y0 + 9, lp.z, W.group, false); arm.rotation.y = -lp.a; arm.position.x -= Math.sin(lp.a) * -lp.side * 1.2; arm.position.z -= Math.cos(lp.a) * lp.side * 1.2;
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 6), lampMat); head.position.set(lp.x - Math.sin(lp.a) * -lp.side * 2.3, y0 + 8.8, lp.z - Math.cos(lp.a) * lp.side * 2.3); W.group.add(head); W.lampHeads.push(head);
    }
    // ---------- причалы и финиш ----------
    for (i = 0; i < T.ports.length; i++) {
      var P = T.ports[i], pg = new THREE.Group(), base = T.atIdx(P.i, P.side * P.hw); pg.position.set(base.x, 0, base.z); pg.rotation.y = -P.a; W.group.add(pg);
      var pierLen = 14, zc = -P.side * pierLen / 2;   // пирс уходит от берега к голове причала (в локальных осях +z это левый берег)
      box(8, 0.5, pierLen, mat(0x8a6a4a), 0, 1.4, zc, pg); for (k = -1; k <= 1; k += 2) for (var q2 = 0; q2 < 3; q2++) cyl(0.3, 0.3, 2.6, 6, mat(0x5a4632), k * 3.4, 0.6, zc + (q2 - 1) * 5, pg);
      box(12, 6, 9, mat(0xd9822b), 0, 3 + T.bankHeight(P.i, 6), P.side * 10, pg); box(13, 0.8, 10, mat(0x3d4248), 0, 6.4 + T.bankHeight(P.i, 6), P.side * 10, pg);
      var tag = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: M.label(P.name || ('ПОРТ ' + (i + 1)), '#fff6e8', 70), transparent: true, side: THREE.DoubleSide })); tag.position.set(0, 9.2 + T.bankHeight(P.i, 6), P.side * 10 - P.side * 5.2); tag.rotation.y = P.side > 0 ? 0 : Math.PI; pg.add(tag);
      var ring = new THREE.Mesh(new THREE.RingGeometry(19, 23, 28), new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(P.x, 0.12, P.z); W.group.add(ring);
      W.ports.push({ data: P, ring: ring });
    }
    var F = T.finish, fg = new THREE.Group(); fg.position.set(F.x, 0, F.z); fg.rotation.y = -F.a; W.group.add(fg);
    for (k = -1; k <= 1; k += 2) cyl(0.5, 0.6, 14, 8, mat(0xf2f3f0), 0, 7, k * (F.hw + 1), fg);
    box(1.2, 3.2, F.hw * 2 + 2, mat(0x2f6fdc), 0, 13, 0, fg, false);
    var fl = new THREE.Mesh(new THREE.PlaneGeometry(F.hw * 1.6, 3), new THREE.MeshBasicMaterial({ map: M.label('ФИНИШ', '#ffffff', 90), transparent: true })); fl.position.set(-0.7, 13, 0); fl.rotation.y = -Math.PI / 2; fg.add(fl);
    var fline = new THREE.Mesh(new THREE.PlaneGeometry(2.4, F.hw * 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })); fline.rotation.x = -Math.PI / 2; fline.position.y = 0.08; fg.add(fline);

    // ---------- монеты, звёзды, трафик ----------
    var coinGeo = flat(new THREE.CylinderGeometry(1.1, 1.1, 0.35, 10)), coinMat = new THREE.MeshLambertMaterial({ color: 0xffc43d, emissive: 0x5a3f00 });
    for (i = 0; i < T.coins.length; i++) { var cm = new THREE.Mesh(coinGeo, coinMat); cm.position.set(T.coins[i].x, 1.6, T.coins[i].z); cm.rotation.x = Math.PI / 2; cm.castShadow = true; W.group.add(cm); T.coins[i].mesh = cm; }
    var starGeo = flat(new THREE.OctahedronGeometry(1.5, 0)), starMat = new THREE.MeshLambertMaterial({ color: 0xffd34d, emissive: 0x7a5200 });
    for (i = 0; i < T.stars.length; i++) { var sm = new THREE.Mesh(starGeo, starMat); sm.position.set(T.stars[i].x, 2, T.stars[i].z); W.group.add(sm); T.stars[i].mesh = sm; }
    var rand = M.rng(T.spec.seed + 77);
    for (i = 0; i < T.traffic.length; i++) { var tr = T.traffic[i]; tr.mesh = M.buildTraffic(tr.kind, rand); W.group.add(tr.mesh); }

    W.animate = function (dt, t) {
      for (var q = 0; q < T.coins.length; q++) { var c = T.coins[q]; if (!c.mesh) continue; if (c.taken) { if (c.mesh.visible) { c.mesh.position.y += 10 * dt; c.mesh.scale.multiplyScalar(1 - 6 * dt); if (c.mesh.scale.x < 0.1) c.mesh.visible = false; } continue; } c.mesh.rotation.z += dt * 2.5; c.mesh.position.y = 1.6 + Math.sin(t * 3 + c.phase) * 0.2; }
      for (q = 0; q < T.stars.length; q++) { var s = T.stars[q]; if (!s.mesh) continue; if (s.taken) { s.mesh.visible = false; continue; } s.mesh.rotation.y += dt * 1.8; s.mesh.position.y = 2 + Math.sin(t * 2 + s.phase) * 0.3; }
    };
    W.dispose = function () { scene.remove(W.group); M.disposeTree(W.group); };
    return W;
  };
})();
