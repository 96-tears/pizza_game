/* Верфь: стальная платформа на опорах посреди океана, как нефтяная вышка. На палубе четыре комнаты-выреза, камера поворачивается к выбранной,
   стены со стороны камеры прячутся. Обстановка зависит от уровней: сначала голый бетон, ржавчина и лампочка на проводе, с улучшениями
   появляются мебель, свет, растения и уют; сама платформа хорошеет по сумме уровней комнат (M.D.rigStage). */
(function () {
  'use strict';
  var flat = M.flat, mat = M.mat, box = M.box, cyl = M.cyl;
  var ST = M.studio = {};
  var scene, cam, sun, yard, roomsRoot, decoRoot, ocean, oceanFar, deckMat, legMat, foam = [], buoys = [], farShip = null, walls = [], stripes = [], crossStripes = [], floors = {};
  var levels = { office: 1, plant: 1, store: 1, dock: 1 }, stage = 1, az = Math.PI / 4, azTarget = az;
  var shipHolder = null, shipMesh = null, shipSpec = null, trophyMesh = null, tankSlots = [], t = 0, spinners = [], anims = [];
  var ROOM = 18, H = 9, E = ROOM, DECK = ROOM + 8, LEG = DECK - 4, SEA = -13, PAD = { x: DECK + 4, z: 14, r: 8.5 };
  // комнаты по четвертям: угол камеры = atan2(cx, cz); вкладки идут по кругу через 90°
  ST.rooms = { office: { cx: 9, cz: 9 }, plant: { cx: -9, cz: 9 }, store: { cx: -9, cz: -9 }, dock: { cx: 9, cz: -9 } };
  ST.azimuth = function (key) { var r = ST.rooms[key]; return Math.atan2(r.cx, r.cz); };
  // палитры: стены и пол по уровню комнаты (1..5), крест внутренних стен, палуба и опоры по ступени платформы (1..5)
  var WALL = [0x9ea4aa, 0xd2c3a6, 0xe9a05a, 0xe9a05a, 0xf0a860], CROSS = [0xaab0b6, 0xdccdb1, 0xf2b56a, 0xf2b56a, 0xf6c078];
  var FLOOR = { office: [0xa3a7ab, 0xc9b58e, 0xd9a66a, 0xd9a66a, 0xe0ad70], plant: [0x9a9ea2, 0xb0a894, 0xb9ad9a, 0xc4b59c, 0xcdbda2], store: [0xa3a7ab, 0xbeb39f, 0xd3b183, 0xd3b183, 0xdab98a], dock: [0x9ea2a6, 0xb3ab9d, 0xc29f70, 0xc29f70, 0xcfa070] };
  var DECKCOL = [0x8a6b55, 0x7f8a94, 0x8a95a0, 0x929da8, 0x97a3ad], LEGCOL = [0x6e5a4c, 0x5d6670, 0x5d6670, 0x66707a, 0x66707a];
  var RUST = 0x8a5a3a, STEEL = 0x8a9096, DARK = 0x2b3038, WOOD = 0xb5602f, YELLOW = 0xf2d24a, ORANGE = 0xd9822b, TEAL = 0x2aa69a, WHITE = 0xf7f3ea, RED = 0xc0432f, GREEN = 0x3f9050, BLUE = 0x2f6fdc;

  // ---------- общие помощники ----------
  function wave(x, z, tt) { return 0.8 * Math.sin(0.09 * x + 1.1 * tt) + 0.55 * Math.sin(0.13 * z - 0.8 * tt + 0.02 * x) + 0.3 * Math.sin(0.21 * (x + z) + 1.9 * tt); }
  function beam(ax, ay, az0, bx, by, bz, r, m, g) { // цилиндр от точки A к точке B: раскосы опор, стрелы, растяжки
    var dx = bx - ax, dy = by - ay, dz = bz - az0, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var mesh = new THREE.Mesh(flat(new THREE.CylinderGeometry(r, r, len, 6)), m); mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az0 + bz) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize()); mesh.castShadow = true; g.add(mesh); return mesh;
  }
  function glow(g, x, y, z, r, color) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), new THREE.MeshBasicMaterial({ color: color || 0xfff1b8 })); m.position.set(x, y, z); g.add(m); return m; }
  function warm(g, x, y, z, power, dist) { var l = new THREE.PointLight(0xffd9a0, power || 0.7, dist || 22, 2); l.position.set(x, y, z); g.add(l); return l; }
  function blob(g, x, y, z, r, color) { var m = new THREE.Mesh(flat(new THREE.IcosahedronGeometry(r, 0)), mat(color)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; }
  function disc(g, x, y, z, r, color, up) { var m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), mat(color)); m.position.set(x, y, z); if (up) m.rotation.x = -Math.PI / 2; g.add(m); return m; }
  function sign(g, text, color, x, y, z, w, h, faceX, flip) { // табличка с надписью; flip разворачивает текст в зеркально отражённых комнатах
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: M.label(text, color, 64), transparent: true })); m.position.set(x, y, z); if (faceX) m.rotation.y = Math.PI / 2; if (flip) m.scale.x = -1; g.add(m); return m;
  }
  function clear(g) { M.disposeTree(g); while (g.children.length) g.remove(g.children[0]); }

  // ---------- мелкий реквизит; координаты комнаты канонические: задние стены слева (x = -8.7) и справа (z = -8.7), пол на y = 0 ----------
  function cracks(g, seed) { var r = M.rng(seed); for (var i = 0; i < 4; i++) { var c = box(2 + r() * 3, 0.02, 0.1, mat(0x7d8287), -6 + r() * 12, 0.02, -6 + r() * 12, g, false); c.rotation.y = r() * 3; } }
  function puddle(g, x, z, r) { var m = disc(g, x, 0.03, z, r, 0x6f8290, true); m.scale.x = 1.4; return m; }
  function crate(g, x, z, s, color, y) { return box(s, s * 0.8, s, mat(color || 0xb98a56), x, (y || 0) + s * 0.4, z, g); }
  function bucket(g, x, z) { return cyl(0.5, 0.4, 0.9, 8, mat(STEEL), x, 0.45, z, g); }
  function stool(g, x, z) { cyl(0.55, 0.55, 0.14, 8, mat(WOOD), x, 1.1, z, g); for (var i = 0; i < 3; i++) cyl(0.06, 0.06, 1.1, 4, mat(DARK), x + Math.cos(i * 2.1) * 0.4, 0.55, z + Math.sin(i * 2.1) * 0.4, g); }
  function paper(g, x, y, z, faceX) { var p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.3), mat(WHITE)); p.position.set(x, y, z); if (faceX) p.rotation.y = Math.PI / 2; g.add(p); return p; }
  function bulb(g, x, z, y) { cyl(0.03, 0.03, H - y, 4, mat(DARK), x, (H + y) / 2, z, g); return glow(g, x, y, z, 0.35); }
  function lamp(g, x, z, y, lit) { bulb(g, x, z, y); var s = cyl(0.35, 1.2, 0.9, 8, mat(YELLOW), x, y + 0.5, z, g); s.material.side = THREE.DoubleSide; if (lit) warm(g, x, y - 0.5, z, 0.6, 20); }
  function desk(g, x, z, color) { box(5, 0.3, 2.4, mat(color), x, 2, z, g); for (var i = -1; i <= 1; i += 2) box(1.2, 1.9, 2.2, mat(color), x + i * 1.9, 0.95, z, g); }
  function monitor(g, x, z) { box(1.6, 1.3, 0.3, mat(0xf2c56a), x, 2.95, z, g); box(1.3, 1, 0.1, mat(DARK), x, 3, z + 0.15, g, false); box(0.5, 0.3, 0.6, mat(0xf2c56a), x, 2.3, z + 0.6, g, false); box(1.4, 0.08, 0.5, mat(WHITE), x + 1.6, 2.19, z + 0.5, g, false); }
  function chair(g, x, z, color) { box(1.1, 0.16, 1.1, mat(color), x, 1.05, z, g); box(1.1, 1.1, 0.16, mat(color), x, 1.6, z + 0.5, g); cyl(0.06, 0.06, 1, 5, mat(DARK), x, 0.5, z, g); cyl(0.5, 0.5, 0.08, 6, mat(DARK), x, 0.05, z, g); }
  function cabinet(g, x, z) { box(1.6, 4.2, 2.2, mat(STEEL), x, 2.1, z, g); for (var i = 0; i < 3; i++) box(0.6, 0.08, 0.08, mat(DARK), x + 0.82, 1 + i * 1.3, z, g, false); }
  function kettle(g, x, y, z) { cyl(0.35, 0.42, 0.55, 8, mat(WHITE), x, y + 0.28, z, g); cyl(0.05, 0.05, 0.5, 4, mat(DARK), x + 0.35, y + 0.5, z, g, 1.1); }
  function clock(g, x, y, z) { disc(g, x, y, z, 0.7, WHITE, false); cyl(0.74, 0.74, 0.12, 12, mat(DARK), x, y, z - 0.07, g).rotation.x = Math.PI / 2; box(0.08, 0.5, 0.04, mat(DARK), x, y + 0.2, z + 0.02, g, false); box(0.35, 0.08, 0.04, mat(DARK), x + 0.15, y, z + 0.02, g, false); }
  function rug(g, x, z, w, d, c1, c2) { box(w, 0.08, d, mat(c1), x, 0.04, z, g, false); box(w - 1.2, 0.1, d - 1.2, mat(c2), x, 0.04, z, g, false); }
  function couch(g, x, z, color) { var m = mat(color); box(5.5, 1.1, 2.2, m, x, 0.55, z, g); box(5.5, 1.5, 0.6, m, x, 1.3, z - 0.8, g); box(0.5, 1.5, 2.2, m, x - 2.5, 0.85, z, g, false); box(0.5, 1.5, 2.2, m, x + 2.5, 0.85, z, g, false); for (var i = -1; i <= 1; i += 2) box(1.3, 0.5, 1.3, mat(WHITE), x + i * 1.3, 1.35, z + 0.1, g, false); }
  function plantPot(g, x, z, s) { s = s || 1; cyl(0.5 * s, 0.6 * s, 0.9 * s, 7, mat(RED), x, 0.45 * s, z, g); cyl(0.08 * s, 0.08 * s, 1.6 * s, 5, mat(DARK), x, 1.6 * s, z, g); blob(g, x, 2.6 * s, z, 1.1 * s, GREEN); }
  function shelf(g, x, z, alongX) { // полка с книгами на задней стене: alongX — вдоль правой стены, иначе вдоль левой
    var w = 3.2, d = 0.7, cols = [RED, TEAL, YELLOW, GREEN, BLUE, WHITE], k; for (k = 0; k < 2; k++) box(alongX ? w : d, 0.15, alongX ? d : w, mat(WOOD), x, 3.2 + k * 1.5, z, g);
    for (k = 0; k < 10; k++) { var o = -1.3 + (k % 5) * 0.55; box(alongX ? 0.4 : 0.5, 0.9 + (k % 3) * 0.15, alongX ? 0.5 : 0.4, mat(cols[k % 6]), x + (alongX ? o : 0), 3.75 + Math.floor(k / 5) * 1.5, z + (alongX ? 0 : o), g, false); }
  }
  function fan(g, x, y, z) { var f = new THREE.Group(); f.position.set(x, y, z); cyl(0.15, 0.15, 1, 6, mat(DARK), 0, 0.5, 0, f); for (var i = 0; i < 4; i++) { var bl = box(3.2, 0.08, 0.5, mat(WOOD), 0, 0, 0, f, false); bl.rotation.y = i * Math.PI / 2; bl.position.set(Math.cos(i * Math.PI / 2) * 1.6, 0, -Math.sin(i * Math.PI / 2) * 1.6); } g.add(f); spinners.push({ m: f, v: 2 }); }
  function picture(g, x, z, w, h, y, color, alongX) { box(alongX ? w : 0.12, h, alongX ? 0.12 : w, mat(0x5a4632), x, y, z, g, false); box(alongX ? w - 0.3 : 0.14, h - 0.3, alongX ? 0.14 : w - 0.3, mat(color), x + (alongX ? 0 : 0.02), y, z + (alongX ? 0.02 : 0), g, false); }
  function floorLamp(g, x, z, lit) { cyl(0.4, 0.5, 0.1, 8, mat(DARK), x, 0.05, z, g); cyl(0.05, 0.05, 4.2, 4, mat(DARK), x, 2.1, z, g); var s = cyl(0.6, 0.9, 1.1, 8, mat(0xf2c56a), x, 4.5, z, g); s.material.side = THREE.DoubleSide; glow(g, x, 4.3, z, 0.25); if (lit) warm(g, x, 4, z, 0.6, 18); }
  function coffee(g, x, z) { box(1.6, 1.6, 1.2, mat(WOOD), x, 0.8, z, g); box(0.8, 0.9, 0.8, mat(DARK), x, 2.05, z, g); box(0.8, 0.2, 0.8, mat(RED), x, 2.6, z, g, false); for (var i = 0; i < 2; i++) cyl(0.15, 0.12, 0.25, 6, mat(WHITE), x - 0.55 + i * 1.1, 1.72, z + 0.3, g); }
  function aquarium(g, x, y, z) {
    box(2.4, 1.6, 1.3, mat(WOOD), x, y - 0.8, z, g); box(2.3, 0.1, 1.2, mat(DARK), x, y + 0.05, z, g, false);
    var w = new THREE.Mesh(flat(new THREE.BoxGeometry(2.2, 1.3, 1.1)), new THREE.MeshLambertMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.45 })); w.position.set(x, y + 0.75, z); g.add(w);
    var f = box(0.4, 0.2, 0.1, mat(ORANGE), x - 0.4, y + 0.7, z, g, false); anims.push(function (tt) { f.position.x = x + Math.sin(tt * 0.9) * 0.7; f.rotation.y = Math.cos(tt * 0.9) > 0 ? 0 : Math.PI; });
    cyl(0.05, 0.05, 0.8, 4, mat(GREEN), x + 0.7, y + 0.5, z + 0.2, g);
  }
  function cat(g, x, y, z) { var m = mat(0x6b6f76); box(1.3, 0.5, 0.55, m, x, y + 0.25, z, g); box(0.5, 0.5, 0.5, m, x + 0.75, y + 0.5, z, g); box(0.12, 0.2, 0.1, m, x + 0.62, y + 0.82, z - 0.15, g, false); box(0.12, 0.2, 0.1, m, x + 0.62, y + 0.82, z + 0.15, g, false); var tail = box(0.8, 0.12, 0.12, m, x - 0.95, y + 0.3, z, g, false); anims.push(function (tt) { tail.rotation.y = Math.sin(tt * 2.2) * 0.6; }); }
  function cups(g, x, y, z, n, alongZ) { for (var i = 0; i < n; i++) { var cx = x + (alongZ ? 0 : i * 0.6), cz = z + (alongZ ? i * 0.6 : 0); cyl(0.22, 0.14, 0.45, 7, mat(0xe6b422), cx, y + 0.3, cz, g); cyl(0.2, 0.2, 0.08, 7, mat(DARK), cx, y + 0.04, cz, g); } }
  function flowers(g, x, y, z) { cyl(0.18, 0.14, 0.5, 6, mat(TEAL), x, y + 0.25, z, g); var c = [RED, YELLOW, 0xff7ab3]; for (var i = 0; i < 3; i++) glow(g, x + Math.cos(i * 2.1) * 0.18, y + 0.75 + (i % 2) * 0.1, z + Math.sin(i * 2.1) * 0.18, 0.13, c[i]); }
  function bunting(g, x0, y0, z0, x1, y1, z1, n) { for (var i = 0; i <= n; i++) { var k = i / n, f = box(0.5, 0.5, 0.04, mat([RED, YELLOW, TEAL, WHITE][i % 4]), M.lerp(x0, x1, k), M.lerp(y0, y1, k) - Math.sin(k * Math.PI) * 0.6, M.lerp(z0, z1, k), g, false); f.rotation.y = Math.atan2(z1 - z0, x1 - x0); } }
  function stringLights(g, x0, y, z0, x1, z1, n) { for (var i = 0; i <= n; i++) glow(g, M.lerp(x0, x1, i / n), y - Math.sin(i / n * Math.PI) * 0.4, M.lerp(z0, z1, i / n), 0.14, [0xfff1b8, 0xffc43d, 0x9fe6ff][i % 3]); }
  function ladder(g, x, z, h, lean) { var l = new THREE.Group(); l.position.set(x, 0, z); l.rotation.z = lean || 0; for (var s = -1; s <= 1; s += 2) box(0.12, h, 0.12, mat(WOOD), s * 0.5, h / 2, 0, l); for (var i = 1; i < h; i += 0.9) box(1, 0.1, 0.1, mat(WOOD), 0, i, 0, l, false); g.add(l); }
  function rope(g, x, z) { var m = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.18, 6, 10), mat(0xc9a06a)); m.position.set(x, 0.18, z); m.rotation.x = -Math.PI / 2; m.castShadow = true; g.add(m); }
  function lifeRing(g, x, y, z, faceX) { var m = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.2, 6, 12), mat(RED)); m.position.set(x, y, z); if (faceX) m.rotation.y = Math.PI / 2; g.add(m); for (var i = 0; i < 2; i++) { var b = box(faceX ? 0.2 : 0.42, 0.42, faceX ? 0.42 : 0.2, mat(WHITE), x, y, z, g, false); b.rotation[faceX ? 'x' : 'z'] = i * Math.PI / 2 + Math.PI / 4; b.position.set(x, y + Math.cos(i * Math.PI / 2 + Math.PI / 4) * 0.7, z); } }
  function drum(g, x, z, color) { cyl(0.7, 0.7, 1.6, 8, mat(color), x, 0.8, z, g); cyl(0.72, 0.72, 0.1, 8, mat(DARK), x, 1.2, z, g, false); }
  function slot(g, x, y, z, alongZ) { // цистерна на складе; видимость по запасу через ST.setStock
    var c = cyl(0.8, 0.8, 2, 8, mat(0xf2f3f0), x, y, z, g, alongZ ? 0 : Math.PI / 2), band = cyl(0.84, 0.84, 0.5, 8, mat(RED), x, y, z, g, alongZ ? 0 : Math.PI / 2);
    if (alongZ) { c.rotation.x = Math.PI / 2; band.rotation.x = Math.PI / 2; } tankSlots.push([c, band]);
  }
  function barrow(g, x, z) { box(1.6, 0.8, 1.1, mat(STEEL), x, 0.9, z, g); cyl(0.35, 0.35, 0.3, 8, mat(DARK), x + 0.9, 0.35, z, g).rotation.x = Math.PI / 2; for (var s = -1; s <= 1; s += 2) box(1.6, 0.1, 0.1, mat(WOOD), x - 1.2, 0.6, z + s * 0.45, g, false); }
  function valve(g, x, y, z) { var m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 6, 10), mat(RED)); m.position.set(x, y, z); g.add(m); cyl(0.06, 0.06, 0.6, 4, mat(DARK), x, y, z - 0.3, g).rotation.x = Math.PI / 2; }
  function sacks(g, x, z) { for (var i = 0; i < 4; i++) { var s = box(1.5, 0.7, 1, mat(0xcdb58c), x + (i % 2) * 1.6 - 0.8, 0.35 + Math.floor(i / 2) * 0.7, z + (i % 2) * 0.2, g); s.rotation.y = (i % 2) * 0.3; } }
  function gauge(g, x, y, z) { var d = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10), mat(WHITE)); d.position.set(x, y, z); d.rotation.y = Math.PI / 2; g.add(d); box(0.04, 0.3, 0.05, mat(RED), x + 0.03, y + 0.1, z, g, false).rotation.x = 0.5; }
  function beacon(g, x, y, z) { var bk = new THREE.Group(); bk.position.set(x, y, z); box(0.5, 0.4, 0.5, mat(0xff8a2a), 0, 0, 0, bk, false); box(0.26, 0.42, 0.52, mat(DARK), -0.13, 0, 0, bk, false); g.add(bk); spinners.push({ m: bk, v: 6 }); }
  function forklift(g, x, z) { box(3, 1.2, 1.4, mat(0xf2b632), x, 0.6, z, g); box(1.2, 1.4, 1.2, mat(DARK), x + 1.3, 1.6, z, g); box(0.12, 2.6, 1.2, mat(DARK), x - 1.6, 1.3, z, g, false); for (var w = 0; w < 4; w++) cyl(0.4, 0.4, 0.4, 7, mat(0x222222), x - 1 + (w % 2) * 2.2, 0.4, z - 0.7 + Math.floor(w / 2) * 1.4, g).rotation.x = Math.PI / 2; }
  function handTruck(g, x, z) { box(0.9, 0.1, 0.5, mat(STEEL), x, 0.3, z, g, false); box(0.1, 2, 0.9, mat(STEEL), x + 0.4, 1.2, z, g, false); cyl(0.25, 0.25, 0.2, 7, mat(0x222222), x + 0.4, 0.25, z - 0.45, g).rotation.x = Math.PI / 2; cyl(0.25, 0.25, 0.2, 7, mat(0x222222), x + 0.4, 0.25, z + 0.45, g).rotation.x = Math.PI / 2; }
  function extinguisher(g, x, y, z) { cyl(0.22, 0.22, 0.9, 7, mat(RED), x, y, z, g); cyl(0.08, 0.08, 0.3, 5, mat(DARK), x, y + 0.6, z, g); }
  function craneBeam(g) { var m = mat(STEEL); for (var s = -1; s <= 1; s += 2) box(0.6, 8, 0.6, m, s * 7.8, 4, 0, g); box(16.2, 0.6, 0.6, m, 0, 8.3, 0, g); box(1, 0.8, 1, mat(YELLOW), 2, 7.6, 0, g, false); cyl(0.04, 0.04, 2.4, 4, mat(DARK), 2, 6, 0, g); box(0.5, 0.6, 0.3, mat(DARK), 2, 4.6, 0, g, false); }
  function scale(g, x, z) { box(1.8, 0.3, 1.8, mat(STEEL), x, 0.15, z, g); box(0.2, 1.8, 0.2, mat(DARK), x - 0.7, 1.1, z - 0.7, g, false); disc(g, x - 0.7, 2.1, z - 0.6, 0.4, WHITE, false); }
  function bench(g, x, z) { box(3, 0.3, 1.4, mat(WOOD), x, 1.2, z, g); for (var i = -1; i <= 1; i += 2) box(0.3, 1.1, 1.2, mat(DARK), x + i * 1.3, 0.55, z, g, false); box(0.5, 0.5, 0.5, mat(STEEL), x - 0.8, 1.6, z - 0.3, g, false); }
  function floodlight(g, x, z) { cyl(0.1, 0.12, 6, 5, mat(DARK), x, 3, z, g); var h = new THREE.Group(); h.position.set(x, 6.2, z); box(0.9, 0.6, 0.5, mat(DARK), 0, 0, 0, h, false); var f = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff1b8 })); f.position.z = 0.3; h.add(f); h.lookAt(0, 2, 0); g.add(h); }
  function compressor(g, x, z) { cyl(0.45, 0.45, 1.8, 8, mat(STEEL), x, 0.45, z, g, Math.PI / 2); box(1.2, 0.8, 0.8, mat(BLUE), x, 1.3, z, g); cyl(0.3, 0.3, 0.2, 8, mat(DARK), x + 0.4, 1.8, z, g); }

  // ---------- комнаты по уровням ----------
  function buildOffice(g, lvl, sx) {
    if (lvl < 2) { // голый бетон: ящик вместо стола, табурет, лампочка на проводе, коробки в углу, лужа и объявление на стене
      cracks(g, 3); puddle(g, 3.5, 3.5, 1.4); crate(g, -2, 1.5, 2.4); box(0.9, 0.25, 0.5, mat(DARK), -2.4, 2.1, 1.3, g, false); cyl(0.18, 0.15, 0.3, 6, mat(WHITE), -1.3, 2.07, 1.9, g);
      stool(g, -2, 4.2); crate(g, -6.8, -6.5, 1.8, 0xc9a06a); crate(g, -4.9, -7.1, 1.3); crate(g, -6.8, -6.5, 1.4, 0xb98a56, 1.45);
      paper(g, -8.38, 5, 2, true); bulb(g, -1, 1.5, H - 2.6); bucket(g, 5.5, -6.5); return;
    }
    desk(g, -1.5, 2, WOOD); monitor(g, -2.3, 2.1); chair(g, -1.5, 4.4, DARK); cabinet(g, -7.6, -1.5); kettle(g, -7.6, 4.2, -1.5); clock(g, 2.5, 6.2, -8.36); lamp(g, -1, 1.5, H - 2.6, lvl >= 4);
    if (lvl < 3) { crate(g, 5.5, -6.5, 1.6, 0xc9a06a); return; }
    rug(g, -1.5, 3.2, 8, 6, TEAL, 0x1f8a80); couch(g, 4, -5.6, TEAL); plantPot(g, 7.2, -7.2, 1); shelf(g, -8.1, 3.8, false);
    if (lvl < 4) return;
    fan(g, 0, H - 1.2, 0); picture(g, -1.2, -8.56, 2.6, 1.7, 5.6, GREEN, true); picture(g, 2.2, -8.56, 1.7, 1.7, 5.6, ORANGE, true); picture(g, -8.56, -5, 1.8, 1.4, 5.8, BLUE, false);
    floorLamp(g, 7.4, -2.8, true); coffee(g, -7.3, 2.2);
    if (lvl < 5) return;
    box(3.6, 1.2, 0.2, mat(0x1b1a2e), 0, 6.8, -8.46, g, false); sign(g, 'ОАО МЕГАЛЮЛЬ', '#ffb347', 0, 6.8, -8.34, 3.4, 1, false, sx < 0);
    aquarium(g, 6.4, 1.6, 6.4); cat(g, 4.6, 1.1, -5.4); cups(g, -8.1, 4.78, 2.6, 3, true); flowers(g, 0.6, 2.15, 1.6); rug(g, 2, 6.5, 6, 2.4, RED, 0xa33627);
  }
  function buildPlant(g, lvl, sx) {
    var copper = mat(0xd9822b), pipe = mat(0xd9b43a), steel = mat(STEEL), i;
    if (lvl < 2) { // ржавый чан, ведро под капелью, тачка, обломок трубы и лампочка
      cracks(g, 5); puddle(g, -1, 2, 1.8); cyl(1.8, 2.1, 3.6, 9, mat(RUST), -3.5, 1.8, -3.5, g); cyl(1.9, 1.9, 0.3, 9, mat(0x6e4a2e), -3.5, 3.7, -3.5, g, false);
      bucket(g, -1, 2); barrow(g, 4, 3.5); cyl(0.3, 0.3, 2.4, 6, mat(RUST), 3, 6, -8, g, Math.PI / 2); bulb(g, 1, 0, H - 2.4); crate(g, 6.5, -6.5, 1.6, 0x8a7a66); return;
    }
    var vats = Math.min(3, lvl);   // два котла на втором уровне, три с третьего
    for (i = 0; i < vats; i++) { var x = -5 + i * 5; cyl(1.8, 2.1, 4.2, 9, copper, x, 2.4, -3, g); cyl(1.2, 1.8, 1.2, 9, copper, x, 5.1, -3, g); cyl(0.3, 0.3, 2.4, 6, pipe, x, 6.8, -3, g); box(0.6, 0.6, 5, pipe, x, 7.9, -0.5, g, false); if (lvl >= 5) cyl(1.95, 1.95, 0.4, 9, mat(0xe6b422), x, 3.2, -3, g, false); }
    cyl(0.35, 0.35, 15, 6, pipe, 0, 6.5, -8, g, Math.PI / 2); for (i = 0; i < 3; i++) cyl(0.25, 0.25, 2.5, 6, pipe, -5 + i * 5, 5.3, -8, g);
    valve(g, -7.5, 6.5, -7.6); sacks(g, 6.5, -6.5); lamp(g, 1, 0, H - 2.4, lvl >= 4);
    if (lvl < 3) return;
    box(14, 0.6, 1.6, steel, 0, 1.4, 2, g); for (i = 0; i < 6; i++) cyl(0.6, 0.6, 1.4, 8, mat(0xf2f3f0), -6 + i * 2.4, 2.4, 2, g);
    for (i = 0; i < 4; i++) cyl(0.7, 0.7, 1.6, 7, mat(i % 2 ? GREEN : RED), -6.5 + (i % 2) * 1.5, 0.8 + Math.floor(i / 2) * 1.6, 6, g);
    if (lvl < 4) return;
    box(2.4, 2.4, 2.4, mat(DARK), 6, 1.2, 5, g); box(2.2, 0.6, 2.2, pipe, 6, 2.7, 5, g, false); beacon(g, 6, 3.25, 5); for (i = 0; i < 3; i++) gauge(g, -8.36, 5.5, 1 + i * 1.6);
    box(15, 0.5, 4, steel, 0, 8.3, -3, g, false); warm(g, 0, 7, 0, 0.5, 24);
    if (lvl < 5) return;
    stringLights(g, -8.3, 8.2, -8.3, 8.3, -8.3, 10); stringLights(g, -8.3, 8.2, -8.3, -8.3, 8.3, 10); sign(g, 'УДОБРЕНИЕ', '#ffe08a', 3, 7.6, -8.34, 4, 1.1, false, sx < 0); bunting(g, -8, 8, 8, 8, 8, -8, 12);
  }
  function buildStore(g, lvl, sx, sz) {
    var rack = mat(0x8a5a3a), i, k, tier;
    if (lvl < 2) { // цистерны прямо на полу, на поддонах; швабра, ведро и коробки
      cracks(g, 7); for (i = 0; i < 6; i++) { var x = -5 + (i % 3) * 3, z = -5.5 + Math.floor(i / 3) * 3; box(2.4, 0.25, 2.4, mat(0xa07a4a), x, 0.12, z, g, false); slot(g, x, 1.05, z, false); }
      bucket(g, 6, 2); cyl(0.05, 0.05, 3, 4, mat(WOOD), 6.5, 1.5, 2.4, g, 0.3); crate(g, 6.5, -6.5, 1.6, 0xc9a06a); crate(g, 6.4, -6.4, 1.2, 0xb98a56, 1.3); bulb(g, 0, 0, H - 2.4); puddle(g, 2, 4, 1.2); return;
    }
    var tiers = lvl >= 4 ? 3 : 2, rows = lvl >= 3 ? 2 : 1, ph = 2.4 * tiers + 0.3;
    for (var r = 0; r < rows; r++) { var rz = -4 + r * 8; for (tier = 0; tier < tiers; tier++) box(14, 0.3, 3, rack, 0, 2.4 + tier * 2.4, rz, g); for (i = -1; i <= 1; i++) { box(0.4, ph, 0.4, rack, i * 6.8, ph / 2, rz - 1.3, g, false); box(0.4, ph, 0.4, rack, i * 6.8, ph / 2, rz + 1.3, g, false); }
      for (k = 0; k < 6; k++) for (tier = 0; tier < tiers; tier++) slot(g, -6 + k * 2.4, 0.9 + tier * 2.4 + (tier ? 0.15 : 0), rz, false); }
    lamp(g, 0, 0, H - 2.4, lvl >= 4); handTruck(g, 7.8, -1);
    if (lvl < 3) return;
    forklift(g, 6, 1);
    if (lvl < 4) return;
    lamp(g, -5, 4, H - 2.4, false); for (i = 0; i < 2; i++) box(0.12, 0.02, 14, mat(YELLOW), -2 + i * 6, 0.02, 0, g, false); extinguisher(g, -8.3, 1.5, 6.5);
    if (lvl < 5) return;
    craneBeam(g); sign(g, 'СКЛАД', '#fff6e8', -8.34, 7.4, 0, 3, 1, true, sz < 0); scale(g, 6.5, -6.5);
  }
  function buildDock(g, lvl, sx) {
    var steel = mat(STEEL), orange = mat(ORANGE), dark = mat(DARK), blocks = mat(lvl < 2 ? 0x6b4a32 : DARK), i, s;
    box(1.4, 1.2, 10, blocks, -3.2, 0.6, 0, g); box(1.4, 1.2, 10, blocks, 3.2, 0.6, 0, g);
    shipHolder = new THREE.Group(); shipHolder.position.set(0, 1.4, 0); shipHolder.rotation.y = Math.PI / 2; shipHolder.scale.setScalar(0.42); g.add(shipHolder);
    if (lvl < 2) { cracks(g, 9); ladder(g, -7.4, 4, 6, 0.28); bucket(g, 6, 6); rope(g, 6.5, -6); crate(g, -6.5, -6.5, 1.6, 0xc9a06a); bulb(g, 0, 6, H - 2.4); puddle(g, 6, -2, 1.3); return; }
    cyl(0.4, 0.5, 11, 8, orange, -7, 5.5, -6, g); box(10, 0.7, 0.7, orange, -2.5, 11, -6, g); cyl(0.05, 0.05, 5, 5, dark, 1, 8.5, -6, g); box(0.6, 0.5, 0.6, dark, 1, 6, -6, g, false);
    bench(g, 5.8, 6.5); for (i = 0; i < 4; i++) cyl(1, 1, 0.5, 10, mat(0x222222), 6.5, 0.3 + i * 0.5, 3, g); lamp(g, 0, 6, H - 2.4, lvl >= 4);
    if (lvl < 3) return;
    for (s = -1; s <= 1; s += 2) box(0.6, 8, 0.6, steel, s * 6.2, 4, 0, g); box(13, 0.6, 0.6, steel, 0, 8.3, 0, g); box(1, 0.8, 1, dark, 1.5, 7.6, 0, g, false);
    box(5, 3, 0.3, mat(0x5a4632), 4, 5, -8.4, g, false); for (i = 0; i < 6; i++) box(0.25, 1.2, 0.1, steel, 2.2 + i * 0.7, 5 + (i % 2) * 0.4, -8.2, g, false);
    drum(g, -6.5, 6.5, RED); drum(g, -5, 7, BLUE);
    if (lvl < 4) return;
    floodlight(g, -7.6, 7.6); floodlight(g, 7.6, -7.6); warm(g, 0, 7, 0, 0.5, 24); compressor(g, -6.5, 2.5); for (i = 0; i < 3; i++) cyl(0.25, 0.25, 0.4, 7, mat([RED, BLUE, WHITE][i]), 5 + i * 0.7, 1.55, 6.5, g);
    if (lvl < 5) return;
    lifeRing(g, -8.3, 5.5, 3, true); lifeRing(g, -8.3, 5.5, 5.5, true); bunting(g, -8, 8.2, -8, 8, 8.2, 8, 12); sign(g, 'ДОК №1', '#fff6e8', -2, 7.4, -8.34, 3.4, 1.1, false, sx < 0);
    for (i = 0; i < 2; i++) box(0.12, 0.02, 14, mat(YELLOW), -4.5 + i * 9, 0.02, 0, g, false);
  }
  var BUILD = { office: buildOffice, plant: buildPlant, store: buildStore, dock: buildDock };

  // ---------- платформа: палуба, опоры, площадка, океан вокруг ----------
  function buildRig() {
    deckMat = mat(DECKCOL[0]); legMat = mat(LEGCOL[0]); var i, s;
    var deck = box(2 * DECK, 1.8, 2 * DECK, deckMat, 0, -0.9, 0, yard); deck.receiveShadow = true;
    box(2 * DECK + 1, 2.2, 2 * DECK + 1, mat(0x4e5661), 0, -2.9, 0, yard, false);
    for (i = 0; i < 4; i++) { var lx = (i % 2 ? 1 : -1) * LEG, lz = (i < 2 ? 1 : -1) * LEG; cyl(2.4, 2.8, 22, 10, legMat, lx, -13, lz, yard); var f = new THREE.Mesh(new THREE.RingGeometry(3.3, 5.0, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })); f.rotation.x = -Math.PI / 2; f.position.set(lx, SEA + 0.1, lz); scene.add(f); foam.push(f); }
    var pairs = [[LEG, LEG, LEG, -LEG], [LEG, -LEG, -LEG, -LEG], [-LEG, -LEG, -LEG, LEG], [-LEG, LEG, LEG, LEG]];
    for (i = 0; i < 4; i++) { var p = pairs[i]; beam(p[0], -5, p[1], p[2], -5, p[3], 0.45, legMat, yard); beam(p[0], SEA + 1.5, p[1], p[2], SEA + 1.5, p[3], 0.45, legMat, yard); beam(p[0], -5, p[1], p[2], SEA + 1.5, p[3], 0.3, legMat, yard); beam(p[0], SEA + 1.5, p[1], p[2], -5, p[3], 0.3, legMat, yard); }
    cyl(PAD.r, PAD.r, 0.8, 8, deckMat, PAD.x, 0, PAD.z, yard);   // вертолётная площадка на консоли у конторы, на ней встанет трофей
    for (s = -1; s <= 1; s += 2) beam(PAD.x + 5, -0.5, PAD.z + s * 4, DECK - 2, -4, PAD.z + s * 4, 0.35, legMat, yard);
    // буи вокруг, качаются на волне; далёкая баржа ходит по кругу на горизонте
    var rb = M.rng(11);
    for (i = 0; i < 7; i++) { var ang = i / 7 * M.TAU + rb() * 0.5, rad = 50 + rb() * 16, bg = new THREE.Group(); bg.position.set(Math.cos(ang) * rad, SEA, Math.sin(ang) * rad); cyl(0.7, 1.0, 2.4, 6, mat(i % 2 ? RED : GREEN), 0, 0.8, 0, bg); cyl(0.12, 0.12, 1.4, 4, mat(DARK), 0, 2.6, 0, bg); var lt = glow(bg, 0, 3.4, 0, 0.3, i % 2 ? 0xff6a5a : 0x7aff9a); scene.add(bg); buoys.push({ g: bg, light: lt, phase: rb() * 6 }); }
    farShip = M.buildTraffic('barge', M.rng(5)); farShip.scale.setScalar(2); scene.add(farShip);
  }
  function buildWalls() {
    for (var k in ST.rooms) { var r = ST.rooms[k], sx = r.cx > 0 ? 1 : -1, sz = r.cz > 0 ? 1 : -1;
      wall(sx * (E / 2 + 0.15), sz * E, E + 0.3, 'x', 0, sz, k); wall(sx * E, sz * (E / 2 + 0.15), E + 0.3, 'z', sx, 0, k);
      stripes.push({ room: k, mesh: stripe(sx * (E / 2 + 0.25), sz * E, E + 0.5, 'x') }); stripes.push({ room: k, mesh: stripe(sx * E, sz * (E / 2 + 0.25), E + 0.5, 'z') });
      floors[k] = box(ROOM - 0.4, 0.3, ROOM - 0.4, mat(FLOOR[k][0]), r.cx, 0.15, r.cz, yard, false); floors[k].receiveShadow = true;
    }
    wall(0, 0, 2 * E, 'x', 0, 0, null); wall(0, 0, 2 * E, 'z', 0, 0, null);
    crossStripes.push(stripe(0, 0, 2 * E, 'x'), stripe(0, 0, 2 * E, 'z'));
  }
  function wall(x, z, len, along, nx, nz, room) { // наружные полустены принадлежат комнате и прячутся, когда смотрят в камеру; крест внутренних виден всегда
    var m = box(along === 'x' ? len : 0.6, H, along === 'x' ? 0.6 : len, mat(0xffffff), x, H / 2, z, yard); m.receiveShadow = true;
    walls.push({ mesh: m, nx: nx, nz: nz, exterior: !!room, room: room }); return m;
  }
  function stripe(x, z, len, along) { return box(along === 'x' ? len : 0.8, 0.3, along === 'x' ? 0.8 : len, mat(0xf7e3b6), x, H + 0.1, z, yard, false); }   // плитка-ромбик по верху стен, как у оригинала

  // ---------- палуба снаружи комнат: по ступени платформы и по уровням отдельных комнат ----------
  function railings(g, lit) {
    var m = mat(stage >= 3 ? 0xf2f3f0 : STEEL), ins = DECK - 0.6, gap = levels.dock >= 4, i, k;
    for (i = 0; i < 4; i++) {
      var side = i % 2 === 0 ? 'x' : 'z', sgn = i < 2 ? 1 : -1, n = 0;
      for (k = -ins + 1.6; k <= ins - 1.5; k += 3.2, n++) {
        var x = side === 'x' ? k : sgn * ins, z = side === 'x' ? sgn * ins : k;
        if (gap && side === 'z' && sgn > 0 && z > -13 && z < -5) continue;   // проём под слип
        cyl(0.08, 0.08, 1.2, 5, m, x, 0.6, z, g); if (lit) glow(g, x, 1.35, z, 0.16, [0xfff1b8, 0xffc43d, 0x9fe6ff][n % 3]);
      }
      var segs = gap && side === 'z' && sgn > 0 ? [[-ins, -13], [-5, ins]] : [[-ins, ins]];
      for (k = 0; k < segs.length; k++) { var a = segs[k][0], b = segs[k][1]; for (var y = 0.65; y <= 1.2; y += 0.55) box(side === 'x' ? b - a : 0.12, 0.12, side === 'x' ? 0.12 : b - a, m, side === 'x' ? (a + b) / 2 : sgn * ins, y, side === 'x' ? sgn * ins : (a + b) / 2, g, false); }
    }
  }
  function lifeboat(g, x, z) {
    for (var s = -1; s <= 1; s += 2) { beam(x + 1.8, 0, z + s * 2.2, x, 3.4, z + s * 2.2, 0.12, mat(DARK), g); beam(x, 3.4, z + s * 2.2, x, 1.4, z + s * 2.2, 0.04, mat(DARK), g); var cap = new THREE.Mesh(flat(new THREE.SphereGeometry(1.1, 8, 6)), mat(0xf07a2a)); cap.position.set(x, 1.1, z + s * 2.2); cap.castShadow = true; g.add(cap); }
    cyl(1.1, 1.1, 4.4, 8, mat(0xf07a2a), x, 1.1, z, g).rotation.x = Math.PI / 2; box(1.4, 0.8, 2.2, mat(WHITE), x, 1.9, z, g, false);
  }
  function planter(g, x, z) { box(2.4, 1.2, 2.4, mat(0xb8603a), x, 0.6, z, g); for (var j = 0; j < 3; j++) blob(g, x - 0.7 + j * 0.7, 1.7, z + (j - 1) * 0.3, 0.75, j === 1 ? YELLOW : GREEN); }
  function deckBench(g, x, z) { box(3.2, 0.25, 1.1, mat(WOOD), x, 1, z, g); box(3.2, 1, 0.25, mat(WOOD), x, 1.5, z - 0.5, g); for (var i = -1; i <= 1; i += 2) box(0.25, 1, 1, mat(DARK), x + i * 1.4, 0.5, z, g, false); }
  function flagpole(g, x, z) { cyl(0.1, 0.14, 11, 5, mat(0xf2f3f0), x, 5.5, z, g); var f = box(2.4, 1.5, 0.08, mat(RED), x + 1.2, 10, z, g, false); box(2.4, 0.5, 0.1, mat(WHITE), x + 1.2, 10, z, g, false); anims.push(function (tt) { f.rotation.y = Math.sin(tt * 2.3) * 0.25; f.position.x = x + 1.2 * Math.cos(f.rotation.y); f.position.z = z - 1.2 * Math.sin(f.rotation.y); }); glow(g, x, 11.2, z, 0.18, 0xffc43d); }
  function umbrella(g, x, z) { cyl(0.08, 0.08, 3.2, 5, mat(DARK), x, 1.6, z, g); var u = cyl(0.2, 2.4, 1.0, 8, mat(YELLOW), x, 3.2, z, g); u.material.side = THREE.DoubleSide; cyl(1.1, 1.1, 0.12, 10, mat(WHITE), x, 1.5, z, g); cyl(0.1, 0.1, 1.5, 5, mat(DARK), x, 0.75, z, g); for (var i = 0; i < 2; i++) { var cx = x + (i ? 1.8 : -1.8); cyl(0.5, 0.5, 0.1, 8, mat(WHITE), cx, 0.9, z, g); cyl(0.07, 0.07, 0.9, 4, mat(DARK), cx, 0.45, z, g); } }
  function dish(g, x, z) { cyl(0.15, 0.2, 4, 5, mat(DARK), x, 2, z, g); var d = cyl(1.4, 0.3, 0.6, 10, mat(0xf2f3f0), x, 4.4, z, g); d.rotation.x = -0.9; cyl(0.05, 0.05, 1.3, 4, mat(DARK), x, 4.9, z + 0.6, g); }
  function crane(g, x, z) { // портовый кран на кромке у дока: стрела висит над водой и медленно поводит крюком. Высокие вещи стоят на серединах краёв, чтобы не заслонять комнаты
    var c = new THREE.Group(); c.position.set(x, 0, z); g.add(c);
    box(2.4, 1, 2.4, mat(DARK), 0, 0.5, 0, c); box(1.8, 15, 1.8, mat(ORANGE), 0, 8.5, 0, c); box(2.6, 2, 2.4, mat(WHITE), 0, 16.5, 0, c); box(2.4, 0.9, 0.2, mat(0x1d4b66), 0, 16.7, 1.3, c, false);
    var boom = new THREE.Group(); boom.position.y = 17.9; c.add(boom);
    box(22, 1, 1, mat(ORANGE), 9, 0, 0, boom); box(6, 1, 1, mat(ORANGE), -4, 0, 0, boom); box(2, 2, 2, mat(DARK), -6, 0, 0, boom); cyl(0.3, 0.3, 2.5, 6, mat(DARK), 0, 1.5, 0, boom);
    beam(0, 2.6, 0, 19, 0.5, 0, 0.06, mat(DARK), boom); cyl(0.05, 0.05, 24, 4, mat(DARK), 19, -12, 0, boom); box(1, 1.2, 0.6, mat(DARK), 19, -24.3, 0, boom);
    anims.push(function (tt) { boom.rotation.y = 0.35 * Math.sin(tt * 0.25); });
  }
  function slipway(g) { // наклонный спуск с палубы дока к воде, с рельсами и лебёдкой наверху
    var len = Math.sqrt(16 * 16 + 13 * 13), r = new THREE.Group(); r.position.set(DECK, 0, -9); r.rotation.z = -Math.atan2(13, 16); g.add(r);
    box(len, 0.7, 7, mat(0x6f7a86), len / 2, -0.35, 0, r); for (var s = -1; s <= 1; s += 2) box(len, 0.3, 0.3, mat(DARK), len / 2, 0.15, s * 2.2, r, false); for (var i = 0; i < 6; i++) box(0.3, 0.4, 7.2, mat(DARK), 1.5 + i * 3.4, 0.2, 0, r, false);
    box(2, 1.6, 2.6, mat(DARK), DECK - 2.5, 0.8, -9, g); cyl(0.6, 0.6, 2, 8, mat(STEEL), DECK - 2.5, 1.3, -9, g).rotation.x = Math.PI / 2;
  }
  function flare(g, x, z) { // факельная вышка цеха: решётчатая тренога и дрожащий огонь
    var m = mat(STEEL), i; for (i = 0; i < 3; i++) { var a = i * 2.094, bx = x + Math.cos(a) * 2.4, bz = z + Math.sin(a) * 2.4; beam(bx, 0, bz, x + Math.cos(a) * 0.5, 21, z + Math.sin(a) * 0.5, 0.14, m, g); beam(bx, 0, bz, x + Math.cos(a + 2.094) * 1.5, 10.5, z + Math.sin(a + 2.094) * 1.5, 0.06, m, g); }
    cyl(0.6, 0.6, 1, 6, m, x, 21.3, z, g); var fl = new THREE.Mesh(flat(new THREE.ConeGeometry(1.1, 3.6, 7)), new THREE.MeshBasicMaterial({ color: 0xff8a2a })); fl.position.set(x, 23.6, z); g.add(fl);
    var core = new THREE.Mesh(flat(new THREE.ConeGeometry(0.55, 2.4, 6)), new THREE.MeshBasicMaterial({ color: 0xfff0a0 })); core.position.set(x, 23.2, z); g.add(core);
    anims.push(function (tt) { var k = 0.85 + 0.25 * Math.abs(Math.sin(tt * 11)) + 0.12 * Math.sin(tt * 29); fl.scale.set(1, k, 1); fl.position.y = 21.8 + 1.8 * k; core.scale.set(1, k, 1); core.position.y = 21.8 + 1.2 * k; });
  }
  function buildDeco(g) {
    var i, s;
    if (stage < 2) { // ржавые бочки по углам, обломки ящика, лужи
      for (i = 0; i < 3; i++) cyl(0.9, 0.9, 2, 8, mat(RUST), -DECK + 3.5 + (i % 2) * 2, 1, -DECK + 4 + Math.floor(i / 2) * 2, g);
      cyl(0.9, 0.9, 2, 8, mat(RUST), DECK - 4, 0.9, DECK - 3, g).rotation.x = Math.PI / 2;
      for (i = 0; i < 3; i++) box(2.2, 0.08, 0.3, mat(0x8a7a66), -DECK + 5 + i * 0.4, 0.05, DECK - 5 - i * 0.6, g, false).rotation.y = i * 0.5;
      puddle(g, 22, 14, 2.2); puddle(g, -14, 22, 1.8); puddle(g, 6, -22, 1.5);
    }
    if (stage >= 2) { // перила, кнехты у слипа, шлюпка на балках, разметка площадки
      railings(g, stage >= 5); lifeboat(g, -DECK - 1.8, 8); for (i = 0; i < 4; i++) cyl(0.35, 0.4, 0.9, 7, mat(DARK), DECK - 1.6, 0.45, -22 + i * 2.5, g);
      var ring = new THREE.Mesh(new THREE.RingGeometry(6.6, 7.4, 24), mat(WHITE)); ring.rotation.x = -Math.PI / 2; ring.position.set(PAD.x, 0.42, PAD.z); g.add(ring);
      box(0.7, 0.04, 4.2, mat(WHITE), PAD.x - 1.2, 0.42, PAD.z, g, false); box(0.7, 0.04, 4.2, mat(WHITE), PAD.x + 1.2, 0.42, PAD.z, g, false); box(1.7, 0.04, 0.7, mat(WHITE), PAD.x, 0.42, PAD.z, g, false);
    }
    if (stage >= 3) { // фонари по углам, жёлтая кромка, скамейка и кадки у конторы
      for (i = 0; i < 4; i++) { var lx = (i % 2 ? 1 : -1) * (DECK - 1.8), lz = (i < 2 ? 1 : -1) * (DECK - 1.8); cyl(0.15, 0.2, 7, 6, mat(DARK), lx, 3.5, lz, g); glow(g, lx, 7.2, lz, 0.5, 0xfff3cc); }
      for (i = 0; i < 4; i++) { var ax = i % 2 === 0, sg = i < 2 ? 1 : -1; box(ax ? 2 * DECK : 0.5, 0.05, ax ? 0.5 : 2 * DECK, mat(YELLOW), ax ? 0 : sg * (DECK - 0.3), 0.03, ax ? sg * (DECK - 0.3) : 0, g, false); }
      deckBench(g, E + 3.5, -5); planter(g, 8, E + 5); planter(g, 12, E + 5); planter(g, -10, E + 5);
    }
    if (stage >= 4) { flagpole(g, 16, DECK - 2.5); umbrella(g, E + 4.5, 7); planter(g, -E - 4, 20); planter(g, 20, -E - 4); }
    if (stage >= 5) dish(g, -E - 4.5, -9);
    if (levels.dock >= 2) crane(g, DECK - 2, 0);
    if (levels.dock >= 4) slipway(g);
    if (levels.plant >= 2) for (i = 0; i < 2; i++) { var tx = i ? 3.6 : -3.6; cyl(1.5, 1.5, 6, 10, mat(WHITE), tx, 1.9, E + 5, g, Math.PI / 2); for (s = -1; s <= 1; s += 2) box(1, 0.8, 3.2, mat(DARK), tx + s * 2, 0.4, E + 5, g, false); }   // баки сырья у кромки между конторой и цехом
    if (levels.plant >= 3) flare(g, -DECK + 2, 0);
    if (levels.store >= 4) { var cc = [BLUE, RED, GREEN]; for (i = 0; i < 3; i++) box(6, 2.6, 2.4, mat(cc[i]), i === 2 ? 0 : (i ? 3.3 : -3.3), 1.3 + (i === 2 ? 2.6 : 0), -E - 5, g); }   // контейнеры у кромки между складом и доком
  }

  // ---------- сцена ----------
  ST.init = function () {
    scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe8f5); scene.fog = new THREE.Fog(0xd9eef8, 130, 460);
    cam = new THREE.PerspectiveCamera(30, 9 / 16, 1, 1600);
    // небо: купол с градиентом от голубого зенита к светлой дымке у горизонта; туман растворяет в ней далёкую воду
    var dome = new THREE.SphereGeometry(900, 24, 10), dc = [], dp = dome.attributes.position, top = new THREE.Color(0x5ea7e6), hor = new THREE.Color(0xd9eef8), i;
    for (i = 0; i < dp.count; i++) { var c = hor.clone().lerp(top, Math.pow(M.clamp(dp.getY(i) / 900, 0, 1), 0.6)); dc.push(c.r, c.g, c.b); }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
    scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
    scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x2f5f70, 0.7));
    sun = new THREE.DirectionalLight(0xffe0b0, 1.1); sun.position.set(40, 70, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 240; sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70; sun.shadow.bias = -0.0006;
    scene.add(sun); scene.add(sun.target);
    // океан: рядом с платформой низкополигональная сетка с волнами (вершины качаются в update, грани плоские), дальше плоская вода до тумана
    var waterMat = new THREE.MeshPhongMaterial({ color: 0x2b82a3, specular: 0x3f7f90, shininess: 14, flatShading: true });
    ocean = new THREE.Mesh(new THREE.PlaneGeometry(340, 340, 42, 42), waterMat); ocean.rotation.x = -Math.PI / 2; ocean.position.y = SEA; ocean.receiveShadow = true; scene.add(ocean);
    oceanFar = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), waterMat); oceanFar.rotation.x = -Math.PI / 2; oceanFar.position.y = SEA - 1.9; scene.add(oceanFar);
    yard = new THREE.Group(); scene.add(yard);
    buildRig(); buildWalls();
    roomsRoot = new THREE.Group(); yard.add(roomsRoot); decoRoot = new THREE.Group(); yard.add(decoRoot);
    ST.setLevels(levels);
    ST.resize();
  };

  // Уровни комнат: перекрасить стены и пол, собрать обстановку заново, обновить палубу.
  ST.setLevels = function (lv) {
    for (var k in lv) if (levels[k] !== undefined) levels[k] = M.clamp(lv[k] | 0, 1, 5);
    stage = M.D.rigStage(levels); var i;
    for (i = 0; i < walls.length; i++) { var w = walls[i]; w.mesh.material.color.setHex(w.room ? WALL[levels[w.room] - 1] : CROSS[stage - 1]); }
    for (i = 0; i < stripes.length; i++) stripes[i].mesh.visible = levels[stripes[i].room] >= 4;
    for (i = 0; i < crossStripes.length; i++) crossStripes[i].visible = stage >= 4;
    for (k in floors) floors[k].material.color.setHex(FLOOR[k][levels[k] - 1]);
    deckMat.color.setHex(DECKCOL[stage - 1]); legMat.color.setHex(LEGCOL[stage - 1]);
    clear(roomsRoot); clear(decoRoot); tankSlots = []; spinners = []; anims = []; shipHolder = null; shipMesh = null;
    for (k in ST.rooms) { var r = ST.rooms[k], sx = r.cx > 0 ? 1 : -1, sz = r.cz > 0 ? 1 : -1, g = new THREE.Group(); g.position.set(r.cx, 0.3, r.cz); g.scale.set(sx, 1, sz); roomsRoot.add(g); BUILD[k](g, levels[k], sx, sz); }   // комнаты собираются в одной системе координат и зеркалятся по четвертям
    buildDeco(decoRoot);
    if (shipSpec) ST.setShip(shipSpec);
  };
  ST.setShip = function (spec) { if (shipMesh && shipSpec === spec) return; shipSpec = spec; if (!shipHolder) return; if (shipMesh) { shipHolder.remove(shipMesh); M.disposeTree(shipMesh); } shipMesh = M.buildShip(spec); shipMesh.position.y = 0.4; shipHolder.add(shipMesh); };
  ST.setStock = function (stock, cap) { var n = tankSlots.length, show = Math.round(M.clamp(stock / cap, 0, 1) * n); for (var i = 0; i < n; i++) { tankSlots[i][0].visible = i < show; tankSlots[i][1].visible = i < show; } };
  // трофей-коробка стоит на площадке открытой крышкой к камере конторы
  ST.setTrophy = function (has) { if (has && !trophyMesh) { trophyMesh = M.buildTrophy(); trophyMesh.position.set(PAD.x, 0.42, PAD.z); trophyMesh.rotation.y = 1.3; yard.add(trophyMesh); } if (!has && trophyMesh) { yard.remove(trophyMesh); M.disposeTree(trophyMesh); trophyMesh = null; } };
  ST.focus = function (key, snap) { azTarget = ST.azimuth(key) + 0.5; if (snap) az = azTarget; };   // камера смотрит чуть сбоку: выбранная комната слева, справа место под вкладки
  ST.update = function (dt) {
    t += dt; az += M.angDiff(azTarget, az) * Math.min(1, 4 * dt);
    var land = cam.aspect > 1.2, R = land ? 112 : 108, Hh = land ? 70 : 78, cx = Math.sin(az) * R, cz = Math.cos(az) * R, i;
    cam.position.set(cx, Hh, cz); cam.lookAt(0, land ? -3 : 4, 0);
    for (i = 0; i < walls.length; i++) { var w = walls[i]; if (!w.exterior) continue; w.mesh.visible = (w.nx * cx + w.nz * cz) < 0; }
    for (i = 0; i < spinners.length; i++) spinners[i].m.rotation.y += dt * spinners[i].v;
    for (i = 0; i < anims.length; i++) anims[i](t);
    var p = ocean.geometry.attributes.position; for (i = 0; i < p.count; i++) p.setZ(i, wave(p.getX(i), -p.getY(i), t)); p.needsUpdate = true;
    for (i = 0; i < foam.length; i++) { var f = foam[i]; f.position.y = SEA + wave(f.position.x, f.position.z, t) + 0.12; f.rotation.z += dt * 0.15; }
    for (i = 0; i < buoys.length; i++) { var b = buoys[i]; b.g.position.y = SEA + wave(b.g.position.x, b.g.position.z, t) + 0.5; b.g.rotation.x = Math.sin(t * 1.3 + b.phase) * 0.1; b.g.rotation.z = Math.cos(t * 1.1 + b.phase) * 0.1; b.light.visible = stage < 5 || Math.sin(t * 3 + b.phase) > 0.2; }
    if (farShip) { var a = t * 0.012 + 1.2; farShip.position.set(Math.cos(a) * 250, SEA + 0.3, Math.sin(a) * 250); farShip.rotation.y = -(a + Math.PI / 2); }
    if (shipHolder) shipHolder.position.y = 1.4 + Math.sin(t * 1.3) * 0.08;
  };
  ST.resize = function () { var c = M.el('gl'); cam.aspect = (c.clientWidth || 16) / (c.clientHeight || 9); cam.fov = cam.aspect < 0.7 ? 34 : cam.aspect > 1.2 ? 30 : 28; cam.updateProjectionMatrix(); };
  ST.render = function (renderer) { renderer.render(scene, cam); };
})();
