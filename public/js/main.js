/* Запуск: рендерер под вертикальную рамку, главный цикл, переключение верфи и заезда, режим автотеста для проверок без экрана. */
(function () {
  'use strict';
  var canvas = M.el('gl'), renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { document.body.innerHTML = '<p style="color:#fff;padding:20px;font-family:sans-serif">Браузер не смог создать WebGL. Попробуйте другой браузер.</p>'; return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  function resize() { var w = canvas.clientWidth || 360, h = canvas.clientHeight || 640; renderer.setSize(w, h, false); M.studio.resize(); M.race.resize(); }
  window.addEventListener('resize', resize);
  // параметры в хэше: #autotest, #photo; для витрины и скриншотов #photo&rooms=5&trophy=1&room=dock (карьера-витрина не сохраняется)
  var HASH = {}; location.hash.slice(1).split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) HASH[kv[0]] = kv.length > 1 ? kv[1] : true; });
  if (HASH.rooms) M.DEMO = { rooms: parseInt(HASH.rooms, 10) || 1, trophy: !!HASH.trophy, room: HASH.room };
  M.lobby.init(); resize(); M.lobby.show();

  var AUTOTEST = !!HASH.autotest, PHOTO = !!HASH.photo, last = 0;
  function tick(dt) {
    if (M.race.isRunning()) { M.race.update(dt); if (M.race.scene() && M.race.isRunning()) renderer.render(M.race.scene(), M.race.camera()); }
    else { M.lobby.update(dt); M.studio.render(renderer); }
  }
  function frame(ts) { if (!last) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts; tick(dt); requestAnimationFrame(frame); }
  if (PHOTO) setInterval(function () { tick(0.1); }, 500);   // фото-режим: два кадра в секунду в полном качестве, для скриншотов без видеокарты
  else if (!AUTOTEST) requestAnimationFrame(frame);
  else { // автотест: фиксированный шаг по таймеру, автопилот у руля, заказы берутся сами
    renderer.setPixelRatio(0.3); renderer.shadowMap.enabled = false;
    var steerT = 0;
    setInterval(function () { tick(0.1); }, 100);
    setInterval(function () {
      if (!M.race.isRunning()) { if (!M.modal.isOpen()) M.lobby.autoplay(); else M.modal.close(); return; }
      steerT += 0.1; var k = M.race.autopilot(); if (!k) return;
    }, 300);
    setInterval(function () { var c = M.lobby.career(); console.log('autotest', M.race.isRunning() ? 'race ' + M.race.debug() : 'lobby', 'lvl=' + c.level, 'xp=' + c.xp, 'coins=' + c.coins, 'stock=' + c.stock.toFixed(1), 'orders=' + c.orders.length, 'runs=' + c.runs); }, 3000);
  }
})();
