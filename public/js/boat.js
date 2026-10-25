/* Низкополигональные модели: танкеры игрока, трафик и трофей-коробка пиццы. Гранёный вид: геометрии без общих вершин, ламбертовский свет. */
(function () {
  'use strict';
  function flat(geo) { var g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; }
  function mat(color, extra) { var m = new THREE.MeshLambertMaterial({ color: color }); if (extra) for (var k in extra) m[k] = extra[k]; return m; }
  function box(w, h, d, m, x, y, z, g, shadow) { var mesh = new THREE.Mesh(flat(new THREE.BoxGeometry(w, h, d)), m); mesh.position.set(x, y, z); mesh.castShadow = shadow !== false; mesh.receiveShadow = true; g.add(mesh); return mesh; }
  function cyl(rt, rb, h, seg, m, x, y, z, g, rotZ) { var mesh = new THREE.Mesh(flat(new THREE.CylinderGeometry(rt, rb, h, seg || 10)), m); mesh.position.set(x, y, z); if (rotZ) mesh.rotation.z = rotZ; mesh.castShadow = true; g.add(mesh); return mesh; }
  M.flat = flat; M.mat = mat; M.box = box; M.cyl = cyl;

  // Корпус: план в виде многоугольника (нос острый, корма плоская), выдавленный вверх.
  function hullGeo(len, half, h) {
    var s = new THREE.Shape();
    s.moveTo(-len / 2, -half); s.lineTo(len * 0.22, -half); s.lineTo(len * 0.42, -half * 0.62); s.lineTo(len / 2, 0); s.lineTo(len * 0.42, half * 0.62); s.lineTo(len * 0.22, half); s.lineTo(-len / 2, half); s.closePath();
    var g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);   // план лежал в XY, теперь XZ, высота вдоль Y
    return flat(g);
  }

  // Танкер игрока. spec из M.D.SHIPS. Возвращает группу; userData.len и userData.half для столкновений.
  M.buildShip = function (spec) {
    var g = new THREE.Group(), k = spec.size || 1, len = 24 * k, half = 4.6 * k;
    var mHull = mat(spec.hull), mDeck = mat(spec.deck), mHouse = mat(spec.house), mStripe = mat(spec.stripe), mTank = mat(0xf2f3f0), mDark = mat(0x2b3038), mGlass = mat(0x1d4b66), mSteel = mat(0x8a9096);
    var hull = new THREE.Mesh(hullGeo(len, half, 2.6 * k), mHull); hull.position.y = -0.4 * k; hull.castShadow = true; hull.receiveShadow = true; g.add(hull);
    var deck = new THREE.Mesh(hullGeo(len * 0.985, half * 0.9, 0.3 * k), mDeck); deck.position.y = 2.2 * k; deck.receiveShadow = true; g.add(deck);
    // цистерны на палубе: ряд из четырёх, на каждой поясок цвета корпуса
    var tanksN = spec.tanks >= 16 ? 5 : spec.tanks >= 12 ? 4 : 3, span = len * 0.52, pitch = span / tanksN, r = Math.min(1.9 * k, pitch * 0.42);
    for (var i = 0; i < tanksN; i++) {
      var tx = -len * 0.08 + (i - (tanksN - 1) / 2) * pitch;
      box(pitch * 0.7, 0.5 * k, 2 * r + 0.8 * k, mSteel, tx, 2.6 * k, 0, g, false);
      cyl(r, r, pitch * 0.78, 10, mTank, tx, 2.8 * k + r, 0, g, Math.PI / 2);
      cyl(r * 1.04, r * 1.04, 0.5 * k, 10, mHull, tx, 2.8 * k + r, 0, g, Math.PI / 2);
      box(0.5 * k, 0.5 * k, 0.5 * k, mDark, tx - r * 0.3, 2.8 * k + 2 * r + 0.1 * k, 0, g, false);
    }
    // две гоночные полосы по палубе, как у машин оригинала
    for (var sd = -1; sd <= 1; sd += 2) box(len * 0.9, 0.08, 0.7 * k, mStripe, 0, 2.4 * k, sd * 1.0 * k, g, false);
    // надстройка на корме: жилой блок, рубка с лентой окон, труба, мачта
    box(5.2 * k, 3.4 * k, half * 1.5, mHouse, -len * 0.36, 2.5 * k + 1.7 * k, 0, g);
    box(4 * k, 2.2 * k, half * 1.3, mHouse, -len * 0.35, 5.9 * k + 1.1 * k, 0, g);
    box(4.1 * k, 0.7 * k, half * 1.32, mGlass, -len * 0.35, 7.3 * k, 0, g, false);
    cyl(0.6 * k, 0.75 * k, 2.6 * k, 10, mDark, -len * 0.44, 8.2 * k, 0, g);
    cyl(0.64 * k, 0.64 * k, 0.4 * k, 10, mStripe, -len * 0.44, 8.4 * k, 0, g);
    cyl(0.08 * k, 0.1 * k, 3 * k, 6, mSteel, -len * 0.3, 9.4 * k, 0, g);
    // бак на носу и носовой фонарь
    box(3.2 * k, 0.6 * k, half * 1.1, mDeck, len * 0.33, 2.6 * k, 0, g, false);
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35 * k, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff1c8 })); lamp.position.set(len * 0.44, 3.4 * k, 0); g.add(lamp);
    var red = new THREE.Mesh(new THREE.SphereGeometry(0.25 * k, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff4a3a })); red.position.set(-len * 0.35, 8.6 * k, half * 0.7); g.add(red);
    var green = new THREE.Mesh(new THREE.SphereGeometry(0.25 * k, 6, 5), new THREE.MeshBasicMaterial({ color: 0x4aff7a })); green.position.set(-len * 0.35, 8.6 * k, -half * 0.7); g.add(green);
    g.userData = { len: len, half: half, headlight: lamp };
    return g;
  };

  // Трафик: баржа с грудой и катер.
  M.buildTraffic = function (kind, rand) {
    var g = new THREE.Group(), barge = kind === 'barge', len = barge ? 26 : 12, half = barge ? 3.6 : 2.2;
    var cols = barge ? [0x3b4a5a, 0x5a4a3b, 0x2f5a4a, 0x6b3a3a] : [0x2a6fb0, 0xd9d2c0, 0x6f8f3a, 0xc9573a];
    var mHull = mat(cols[Math.floor(rand() * cols.length)]), white = mat(0xeeeeea), dark = mat(0x3b4146);
    var hull = new THREE.Mesh(hullGeo(len, half, 2.2), mHull); hull.position.y = -0.3; hull.castShadow = true; g.add(hull);
    if (barge) { box(len * 0.55, 2.2, half * 1.5, mat(rand() < 0.5 ? 0x8a6a3a : 0x6a7a86), 2, 2.9, 0, g); box(3.4, 3, half * 1.5, white, -len / 2 + 3, 3.3, 0, g); box(0.2, 0.9, half * 1.4, mat(0x1d4b66), -len / 2 + 4.75, 3.9, 0, g, false); }
    else { box(3.6, 2.2, 3, white, -1.2, 2.9, 0, g); box(0.2, 0.8, 2.8, mat(0x1d4b66), 0.7, 3.3, 0, g, false); cyl(0.08, 0.1, 4, 6, dark, -1.5, 5.8, 0, g); }
    g.userData = { len: len, half: half };
    return g;
  };

  // Трофей: огромная коробка пиццы «Питса 4 сыра Мазерати» с приоткрытой крышкой, внутри пицца без одного куска. Размеры в метрах,
  // начало координат в центре дна. Стоит на вертолётной площадке, когда куплена.
  M.buildTrophy = function () {
    var g = new THREE.Group(), W = 6.4, Hb = 0.9, T = 0.14, card = mat(0xe3c08a), inner = mat(0xf3e4c4), dark = mat(0x2b3038), i;
    box(W, T, W, card, 0, T / 2, 0, g); box(W - 0.02, 0.02, W - 0.02, inner, 0, T + 0.01, 0, g, false);   // дно и светлое нутро
    box(W, Hb, T, card, 0, Hb / 2, -W / 2 + T / 2, g); box(W, Hb, T, card, 0, Hb / 2, W / 2 - T / 2, g);   // задний и передний борт
    box(T, Hb, W, card, -W / 2 + T / 2, Hb / 2, 0, g); box(T, Hb, W, card, W / 2 - T / 2, Hb / 2, 0, g);   // боковые борта
    function label(text, color, size, w, h) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: M.label(text, color, size), transparent: true })); }
    var front = label('МАЗЕРАТИ', '#c0432f', 76, 3.2, 0.8); front.position.set(0, Hb / 2 + 0.02, W / 2 + 0.01); g.add(front);
    // крышка на петле по заднему краю, открыта на 70°; надпись на внутренней стороне читается спереди
    var lid = new THREE.Group(); lid.position.set(0, Hb, -W / 2); lid.rotation.x = -1.22; g.add(lid);
    box(W, T, W, card, 0, T / 2, W / 2, lid); box(W - 0.4, 0.02, W - 0.4, inner, 0, -0.01, W / 2, lid, false);
    var l1 = label('ПИТСА 4 СЫРА', '#c0432f', 66, 4.8, 1.2); l1.position.set(0, -0.03, W / 2 + 0.8); l1.rotation.x = Math.PI / 2; lid.add(l1);
    var l2 = label('МАЗЕРАТИ', '#1d2a3a', 76, 4.8, 1.2); l2.position.set(0, -0.03, W / 2 - 0.55); l2.rotation.x = Math.PI / 2; lid.add(l2);
    // пицца: корж и сыр как цилиндры без одного сектора, края выреза закрыты тонкими дольками; четыре сыра, пепперони, базилик, разрезы
    var pizza = new THREE.Group(); pizza.position.set(0, T + 0.02, 0.1); g.add(pizza);
    var wedge = M.TAU - Math.PI / 4, th0 = 0.4;
    var crust = new THREE.Mesh(flat(new THREE.CylinderGeometry(2.75, 2.75, 0.28, 18, 1, false, th0, wedge)), mat(0xd9a052)); crust.position.y = 0.14; crust.castShadow = true; pizza.add(crust);
    var cheese = new THREE.Mesh(flat(new THREE.CylinderGeometry(2.45, 2.45, 0.1, 18, 1, false, th0, wedge)), mat(0xf2d24a)); cheese.position.y = 0.32; pizza.add(cheese);
    [th0, th0 + wedge].forEach(function (th) { var b = box(0.08, 0.3, 2.75, mat(0xd9a052), Math.sin(th) * 1.375, 0.15, Math.cos(th) * 1.375, pizza, false); b.rotation.y = th; });
    var fill = [0xf7f3ea, 0xe8d48a, 0xf2e7b0];
    for (i = 0; i < 12; i++) { var th = 0.75 + i * 0.44, rr = 0.9 + (i % 3) * 0.55; if (th > th0 + wedge - 0.3) break; cyl(0.3, 0.3, 0.08, 9, mat(i % 2 ? 0xc0432f : fill[i % 3]), Math.sin(th) * rr, 0.41, Math.cos(th) * rr, pizza); }
    for (i = 0; i < 5; i++) { var tb = 1.1 + i * 1.05, rb = 1.4 + (i % 2) * 0.7, leaf = box(0.42, 0.04, 0.22, mat(0x3f9050), Math.sin(tb) * rb, 0.42, Math.cos(tb) * rb, pizza, false); leaf.rotation.y = tb; }
    for (i = 0; i < 4; i++) { var cut = box(0.04, 0.02, 5.4, dark, 0, 0.39, 0, pizza, false); cut.rotation.y = th0 + i * Math.PI / 4; }
    return g;
  };
})();
