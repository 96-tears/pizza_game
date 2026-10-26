/* Validate stored data before it reaches game logic. Preserve compatible v1 saves. */
(function () {
  'use strict';
  function num(v, min, max) { return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max; }
  function int(v, min, max) { return num(v, min, max) && Math.floor(v) === v; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function ship(id) { return M.D.SHIPS.some(function (s) { return s.id === id; }); }
  M.validateCareer = function (c) {
    if (!obj(c) || c.v !== 1 || !obj(c.rooms) || !num(c.coins, 0, 1e12) || !num(c.xp, 0, 1e12) || !int(c.level, 1, 10000)) return null;
    var rooms = {}, keys = ['office', 'plant', 'store', 'dock'];
    for (var i = 0; i < keys.length; i++) { var k = keys[i]; if (!int(c.rooms[k], 1, 5)) return null; rooms[k] = c.rooms[k]; }
    if (!num(c.stock, 0, 160) || !Array.isArray(c.fleet) || !ship(c.ship)) return null;
    var fleet = c.fleet.filter(function (s, i, a) { return ship(s) && a.indexOf(s) === i; });
    if (fleet.indexOf(c.ship) < 0) return null;
    var tune = {};
    fleet.forEach(function (id) { tune[id] = {}; M.D.TUNING.forEach(function (u) { var n = c.tune && c.tune[id] && c.tune[id][u.key]; tune[id][u.key] = int(n, 0, 3) ? n : 0; }); });
    var orders = Array.isArray(c.orders) ? c.orders.filter(function (o) {
      return obj(o) && int(o.id, 0, 2147483647) && int(o.seed, 0, 2147483647) &&
        M.D.TRACKS.some(function (t) { return t.id === o.track; }) &&
        M.D.LENGTHS.some(function (l) { return l.key === o.len && l.m === o.lengthM; }) &&
        num(o.difficulty, 0, 1) && int(o.amount, 1, 23) && int(o.ports, 2, 3) && int(o.pay, 0, 1e6) &&
        num(o.until, 0, 1e15) && Array.isArray(o.portNames) && o.portNames.length === o.ports &&
        o.portNames.every(function (n) { return typeof n === 'string' && n.length <= 40; });
    }).slice(0, 4) : [];
    var pending = obj(c.pendingRace) && int(c.pendingRace.amount, 1, 23) ? { amount: c.pendingRace.amount } : null;
    return { v: 1, coins: c.coins, xp: c.xp, level: c.level, stock: Math.min(c.stock, M.D.ROOMS.store.cap[rooms.store - 1]),
      prodAt: num(c.prodAt, 0, M.now()) ? c.prodAt : M.now(), rooms: rooms, fleet: fleet, ship: c.ship, tune: tune,
      orders: orders, orderAt: num(c.orderAt, 0, M.now() + M.D.ORDER_EVERY * 1000) ? c.orderAt : 0,
      trophy: c.trophy === true, runs: int(c.runs, 0, 1e9) ? c.runs : 0, best: num(c.best, 0, 1e12) ? c.best : 0,
      settings: { sound: !!(c.settings && c.settings.sound) }, pendingRace: pending };
  };
})();
