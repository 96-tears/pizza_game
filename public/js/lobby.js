/* Карьера и интерфейс верфи: монеты, опыт и уровни, цех со складом, заказы, флот, доработки, трофей, сохранение, панели. */
(function () {
  'use strict';
  var L = M.lobby = {}, D = M.D, C = null, room = 'office', el = {}, uiTimer = null;
  ['lobbyUI', 'lvl', 'xpText', 'xpBar', 'coins', 'stock', 'actions', 'tabs', 'trophyBadge', 'btnSettings'].forEach(function (id) { el[id] = M.el(id); });
  var PORTS = { summer: ['ШАНХАЙ', 'НИНБО', 'НАНТУН', 'ЦИНДАО', 'УХАНЬ'], winter: ['ДИКСОН', 'ТИКСИ', 'ПЕВЕК', 'ДУДИНКА'], rocks: ['СИНГАПУР', 'ПЕНАНГ', 'МАЛАККА', 'ПОРТ-КЛАНГ'], night: ['СТАМБУЛ', 'БЕЙКОЗ', 'ЮСКЮДАР', 'САРЫЕР'] };

  // ---------- карьера ----------
  function fresh() { return { v: 1, coins: 0, xp: 0, level: 1, stock: 20, prodAt: M.now(), rooms: { office: 1, plant: 1, store: 1, dock: 1 }, fleet: ['megalul'], ship: 'megalul', tune: { megalul: {} }, orders: [], orderAt: 0, trophy: false, runs: 0, best: 0, settings: { sound: true } }; }
  function save() { if (!M.DEMO) M.store.save(C); }
  L.career = function () { return C; };
  function roomLvl(k) { return C.rooms[k] || 1; }
  function plantRate() { return D.ROOMS.plant.rate[roomLvl('plant') - 1]; }
  function storeCap() { return D.ROOMS.store.cap[roomLvl('store') - 1]; }
  function accrue() { var now = M.now(); if (!C.prodAt || C.prodAt > now) C.prodAt = now; var made = (now - C.prodAt) / 1000 / plantRate(); if (made > 0) { C.stock = Math.min(storeCap(), C.stock + made); C.prodAt = now; } }
  function stockWhole() { return Math.floor(C.stock + 1e-6); }
  function addXp(n) { C.xp += n; var ups = 0; while (C.xp >= D.xpNeed(C.level)) { C.xp -= D.xpNeed(C.level); C.level += 1; ups += 1; } return ups; }
  function shipSpec() { return D.shipById(C.ship); }
  function tune(id) { return C.tune[id] || (C.tune[id] = {}); }
  function effective() { // характеристики корабля с доработками, в формате, который ждёт заезд
    var s = shipSpec(), t = tune(s.id);
    return { model: s, cruise: s.speed + 3 * (t.engine || 0), turn: s.turn * (1 + 0.12 * (t.rudder || 0)), grip: s.grip, armour: s.armour * (1 - 0.15 * (t.fenders || 0)), tanks: s.tanks + (t.tanks || 0) };
  }
  L.effective = effective;
  function tracksOpen() { return D.TRACKS.filter(function (t) { return t.office <= roomLvl('office'); }); }
  function makeOrder(seed) {
    var rand = M.rng(seed), open = tracksOpen(), tr = open[Math.floor(rand() * open.length)], len = D.LENGTHS[Math.floor(rand() * D.LENGTHS.length)];
    var hard = roomLvl('office') >= 5 && rand() < 0.35;
    var diff = M.clamp(0.12 + 0.025 * C.level + (hard ? 0.3 : 0) + rand() * 0.15, 0.1, 1);
    var amount = M.clamp(3 + Math.floor(rand() * 3) + Math.floor(C.level / 2), 3, 20);
    if (rand() < 0.6) amount = Math.max(3, Math.min(amount, effective().tanks));   // большинство заказов по плечу текущему кораблю, остальные зовут купить побольше
    var ports = len.key === 'long' ? 3 : 2, names = PORTS[tr.id].slice().sort(function () { return rand() - 0.5; }).slice(0, ports);
    return { id: seed, seed: seed, track: tr.id, len: len.key, lengthM: len.m, difficulty: diff, hard: hard, amount: amount, ports: ports, portNames: names, pay: Math.round(amount * D.UNIT_PAY * tr.pay * len.k * (1 + diff)), until: M.now() + D.ORDER_TTL * 1000 };
  }
  function refreshOrders() {
    var now = M.now(), max = D.ROOMS.office.orders[roomLvl('office') - 1], cap = effective().tanks;
    C.orders = C.orders.filter(function (o) { return !o.until || o.until > now; });   // заказы не вечные: просроченные уходят с доски
    if (C.orders.length >= max && !C.orders.some(function (o) { return o.amount <= cap; })) C.orders.shift();   // доска из одних неподъёмных заказов не должна стоять намертво
    if (!C.orderAt) { C.orderAt = now; while (C.orders.length < max) C.orders.push(makeOrder((now + C.orders.length * 7919) % 2147483647)); }
    while (now >= C.orderAt) { if (C.orders.length < max) C.orders.push(makeOrder((C.orderAt + 104729 * (C.orders.length + 1)) % 2147483647)); C.orderAt += D.ORDER_EVERY * 1000; if (C.orderAt < now - 3600000) C.orderAt = now; }
    if (C.orders.length >= max) C.orderAt = Math.max(C.orderAt, now + D.ORDER_EVERY * 1000);
  }
  function canTake(o) {
    var e = effective();
    if (o.amount > e.tanks) return 'Нужен корабль на ' + M.tanks(o.amount);
    if (o.amount > stockWhole()) return 'Цистерн ' + stockWhole() + ' из ' + o.amount;
    return '';
  }

  // ---------- вход, выход, обновление экрана ----------
  L.init = function () {
    C = M.store.load(M.validateCareer); if (!C) C = fresh();
    if (M.DEMO) { C = fresh(); for (var k in C.rooms) C.rooms[k] = M.clamp(M.DEMO.rooms, 1, 5); C.trophy = !!M.DEMO.trophy; C.level = 30; C.coins = 300000; if (M.DEMO.room && ACTIONS[M.DEMO.room]) room = M.DEMO.room; }   // витрина для скриншотов
    accrue();
    if (C.pendingRace) { C.stock = Math.min(storeCap(), C.stock + C.pendingRace.amount); C.pendingRace = null; M.store.message = 'Незавершённый рейс отменён. Груз возвращён на склад в пределах его вместимости.'; }
    refreshOrders(); save();
    M.studio.init(); M.studio.setLevels(C.rooms); M.studio.setShip(shipSpec()); M.studio.setTrophy(C.trophy); M.studio.focus(room, true);
    M.bind(el.tabs, function () {});
    Array.prototype.forEach.call(el.tabs.querySelectorAll('[data-room]'), function (b) { b.addEventListener('click', function () { setRoom(b.getAttribute('data-room')); }); });
    el.btnSettings.addEventListener('click', settingsPanel);
    window.addEventListener('keydown', function (e) { if (M.race.isRunning() || M.modal.isOpen() || !L.visible) return; var keys = ['office', 'plant', 'store', 'dock'], i = keys.indexOf(room); if (e.code === 'ArrowRight' || e.code === 'KeyD') setRoom(keys[(i + 1) % 4]); else if (e.code === 'ArrowLeft' || e.code === 'KeyA') setRoom(keys[(i + 3) % 4]); else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); ordersPanel(); } });
  };
  L.visible = false;
  L.show = function () { L.visible = true; accrue(); refreshOrders(); el.lobbyUI.classList.remove('hidden'); M.studio.setShip(shipSpec()); M.studio.focus(room, true); paint(); if (!uiTimer) uiTimer = setInterval(function () { if (L.visible) { accrue(); refreshOrders(); paint(); } }, 1000); };
  L.hide = function () { L.visible = false; el.lobbyUI.classList.add('hidden'); M.modal.close(); if (uiTimer) { clearInterval(uiTimer); uiTimer = null; } };
  L.update = function (dt) { M.studio.update(dt); };
  function setRoom(k) { room = k; M.studio.focus(k); paint(); }
  var ACTIONS = { office: [['orders', '★', 'ЗАКАЗЫ'], ['upgrade', '⬆', 'УЛУЧШИТЬ'], ['zen', '∞', 'ДЗЕН']], plant: [['prod', '⚙', 'ЦЕХ'], ['upgrade', '⬆', 'УЛУЧШИТЬ']], store: [['prod', '▤', 'ЗАПАСЫ'], ['upgrade', '⬆', 'УЛУЧШИТЬ']], dock: [['upgrade', '⬆', 'УЛУЧШИТЬ'], ['shop', '◈', 'МАГАЗИН'], ['tune', '⚒', 'ДОК']] };
  function canUpgrade(k) { var r = D.ROOMS[k], l = roomLvl(k); return l < 5 && C.level >= r.lvl[l] && C.coins >= r.cost[l]; }
  function paint() {
    var need = D.xpNeed(C.level);
    el.lvl.textContent = C.level; el.xpText.textContent = M.fmt(C.xp) + ' / ' + M.fmt(need); el.xpBar.style.width = Math.round(C.xp / need * 100) + '%';
    el.coins.textContent = M.fmt(C.coins); el.stock.textContent = stockWhole();
    Array.prototype.forEach.call(el.tabs.querySelectorAll('[data-room]'), function (b) { b.classList.toggle('on', b.getAttribute('data-room') === room); });
    var acts = ACTIONS[room], h = '';
    for (var i = 0; i < acts.length; i++) h += '<button data-act="' + acts[i][0] + '"' + (acts[i][0] === 'upgrade' && canUpgrade(room) ? ' class="lit"' : '') + '><span class="ai">' + acts[i][1] + '</span>' + acts[i][2] + '</button>';
    if (el.actions.innerHTML !== h) { el.actions.innerHTML = h; M.bind(el.actions, action); }
    var idx = ['office', 'plant', 'store', 'dock'].indexOf(room), tab = el.tabs.querySelectorAll('[data-room]')[idx];   // пузырь действий висит слева от активной вкладки
    if (tab && tab.getBoundingClientRect) { var tr = tab.getBoundingClientRect(), ur = el.lobbyUI.getBoundingClientRect(); el.actions.style.top = (tr.top + tr.height / 2 - ur.top) + 'px'; }
    var cheap = D.SHIPS.some(function (s) { return C.fleet.indexOf(s.id) < 0 && s.cls <= D.ROOMS.dock.cls[roomLvl('dock') - 1] && C.coins >= s.price; });
    var marks = ['office', 'plant', 'store', 'dock'].map(function (k) { return (canUpgrade(k) ? '⬆' : '') + (k === 'dock' && cheap ? ' ⛴' : ''); });
    Array.prototype.forEach.call(el.tabs.querySelectorAll('.mark'), function (sp, i) { sp.textContent = marks[i]; });
    el.trophyBadge.classList.toggle('hidden', !!C.trophy); el.trophyBadge.innerHTML = '<b>' + Math.min(100, Math.floor(C.coins / D.TROPHY.price * 100)) + '%</b>до Питсы';
    M.studio.setStock(C.stock, storeCap());
  }
  function action(act) {
    if (act === 'orders') ordersPanel(); else if (act === 'upgrade') upgradePanel(room); else if (act === 'zen') zenPanel(); else if (act === 'prod') prodPanel(); else if (act === 'shop') shopPanel(); else if (act === 'tune') tunePanel();
  }

  // ---------- панели ----------
  function head(title, sub) { return '<div class="sheet-head"><h2>' + title + '</h2><button class="x" data-close>✕</button></div>' + (sub ? '<div class="sub">' + sub + '</div>' : ''); }
  function ordersPanel() {
    accrue(); refreshOrders();
    var e = effective(), h = head('Заказы', 'на борт влезает ' + M.tanks(e.tanks) + ' · на складе ' + stockWhole() + '<br>Рулите A/D, стрелками или половинами экрана. Для разгрузки пройдите через синее кольцо у причала. За монету на реке — 20 монет на счёт.'), i;
    for (i = 0; i < C.orders.length; i++) {
      var o = C.orders[i], tr = D.trackById(o.track), why = canTake(o), len = D.LENGTHS.filter(function (x) { return x.key === o.len; })[0];
      h += '<div class="card' + (why ? ' locked' : '') + '"><div class="card-head"><b>' + tr.name + ' · ' + o.portNames.map(M.esc).join(' → ') + '</b>' + M.pips(Math.min(5, Math.ceil(o.difficulty * 5)), 5) + '</div>' +
        '<p>' + len.name + ' рейс, ' + (o.lengthM / 1000).toFixed(1).replace('.', ',') + ' км · ' + M.tanks(o.amount) + ' на ' + o.ports + ' порта' + (o.until ? ' · ещё ' + M.fmtTime((o.until - M.now()) / 1000) : '') + (tr.friction < 0.8 ? '<span class="tag cold">лёд</span>' : '') + (tr.rocks ? '<span class="tag hot">камни</span>' : '') + (tr.night ? '<span class="tag">ночь</span>' : '') + (o.hard ? '<span class="tag hot">сложно</span>' : '') + (D.pace(o.difficulty) >= 1.25 ? '<span class="tag hot">быстро</span>' : '') + '</p>' +
        '<div class="row">' + M.coin(o.pay) + '<button class="btn" data-act="take" data-key="' + i + '"' + (why ? ' disabled' : '') + '>' + (why || 'В рейс') + '</button></div></div>';
    }
    var max = D.ROOMS.office.orders[roomLvl('office') - 1];
    h += '<div class="meta center-text">' + (C.orders.length < max ? 'новый заказ через ' + M.fmtTime((C.orderAt - M.now()) / 1000) : 'доска полна, новые появятся после доставки') + '</div>';
    M.modal.open(h, { actions: function (act, key) { if (act === 'take') takeOrder(parseInt(key, 10)); } });
  }
  function takeOrder(i) {
    accrue(); var o = C.orders[i]; if (!o || canTake(o)) { paint(); return; }
    C.stock -= o.amount; C.pendingRace = { amount: o.amount }; save(); M.modal.close();
    startRace(o, i);
  }
  function startRace(o, idx) {
    L.hide();
    M.race.start({ order: o, ship: effective(), onQuit: function () { if (idx != null) { accrue(); C.stock = Math.min(storeCap(), C.stock + o.amount); C.pendingRace = null; save(); } L.show(); },
      onEnd: function (res) { if (idx != null) { var at = C.orders.indexOf(o); if (at >= 0) C.orders.splice(at, 1); C.pendingRace = null; } finishRace(o, res); } });
  }
  function finishRace(o, res) {
    C.coins += res.pay; var ups = addXp(res.xp); C.runs += 1; C.best = Math.max(C.best, res.score);
    if (!o.zen && C.orders.length === 0) C.orderAt = Math.min(C.orderAt, M.now() + 30000);   // пустая доска: новый заказ через полминуты
    save(); L.show();
    var stars = res.zen ? 0 : res.cargo >= 90 && res.delivered === res.amount ? 3 : res.cargo >= 60 ? 2 : 1, sh = '';
    for (var i = 0; i < 3; i++) sh += i < stars ? '★' : '<span class="dim">★</span>';
    var h = '<div class="sheet-head"><h2>' + (res.zen ? 'Дзен' : 'Доставлено') + '</h2></div>' + (res.zen ? '' : '<div class="stars">' + sh + '</div>') +
      '<div class="big-num">' + M.fmt(res.score) + '</div><div class="meta center-text">счёт дрифта · лучшая серия ' + M.fmt(res.best) + '</div>' +
      '<div class="score-table">' + (res.zen ? '' : '<span>Сдано</span><span>' + res.delivered + ' из ' + M.tanks(res.amount) + '</span><span>Состояние груза</span><span>' + res.cargo + '%</span>') +
      '<span>Монеты по пути</span><span>' + res.coins + '</span>' + (res.stars ? '<span>Звёзды</span><span>' + res.stars + '</span>' : '') +
      '<span class="total">Получено монет</span><span class="total">' + M.fmt(res.pay) + '</span><span>Опыт</span><span>+' + M.fmt(res.xp) + '</span></div>' +
      (ups ? '<div class="card center-text"><b>Новый уровень: ' + C.level + '</b><p>На верфи открылись новые улучшения.</p></div>' : '') +
      '<button class="btn wide" data-close>На верфь</button>';
    M.modal.open(h, { center: true, sticky: true });
  }
  function upgradePanel(k) {
    var r = D.ROOMS[k], l = roomLvl(k), max = l >= 5, cost = max ? 0 : r.cost[l], need = max ? 0 : r.lvl[l], ok = !max && C.level >= need && C.coins >= cost;
    var h = head(r.name + ' ' + M.pips(l, 5), r.desc) + '<div class="card"><div class="card-head"><b>Сейчас</b><span class="meta">уровень ' + l + '</span></div><p>' + r.fx(l) + '</p><p>' + r.look[l - 1] + '</p></div>';
    if (!max) h += '<div class="card"><div class="card-head"><b>Следующий уровень</b><span class="meta">нужен ' + need + '-й уровень</span></div><p>' + r.fx(l + 1) + '</p><p>' + r.look[l] + '</p><div class="row">' + M.coin(cost) + '<button class="btn green" data-act="up"' + (ok ? '' : ' disabled') + '>' + (C.level < need ? 'Мало уровня' : C.coins < cost ? 'Мало монет' : 'Улучшить') + '</button></div></div>';
    else h += '<div class="card center-text"><b>Максимальный уровень</b></div>';
    M.modal.open(h, { actions: function (act) { if (act === 'up' && ok) { accrue(); C.coins -= cost; C.rooms[k] = l + 1; M.studio.setLevels(C.rooms); if (k === 'office') refreshOrders(); save(); upgradePanel(k); paint(); } } });
  }
  function prodPanel() {
    accrue();
    var cap = storeCap(), whole = stockWhole(), full = C.stock >= cap - 1e-6, frac = full ? 1 : C.stock - whole, rate = plantRate(), room2 = cap - whole;
    var h = head('Цех и склад', 'цистерна за ' + rate + ' с · склад до ' + cap) +
      '<div class="grid2"><div class="card center-text"><div class="meta">НА СКЛАДЕ</div><div class="big-num">' + whole + '</div><div class="meta">из ' + cap + '</div></div>' +
      '<div class="card center-text"><div class="meta">СЛЕДУЮЩАЯ</div><div class="big-num">' + (full ? '—' : Math.ceil((1 - frac) * rate)) + '</div><div class="meta">' + (full ? 'склад полон' : 'секунд') + '</div></div></div>' +
      '<div class="card"><p>Цех работает и в рейсе, и пока игра закрыта. До полного склада ' + (full ? 'уже дошли' : M.fmtTime(room2 * rate - frac * rate)) + '. Не хочется ждать: соседи продают цистерны по ' + D.FILL_PRICE + ' монет.</p>' +
      '<div class="row"><button class="btn ghost" data-act="buy" data-key="1"' + (room2 >= 1 && C.coins >= D.FILL_PRICE ? '' : ' disabled') + '>+1 · ' + D.FILL_PRICE + '</button><button class="btn ghost" data-act="buy" data-key="5"' + (room2 >= 5 && C.coins >= 5 * D.FILL_PRICE ? '' : ' disabled') + '>+5 · ' + 5 * D.FILL_PRICE + '</button><button class="btn" data-act="buy" data-key="full"' + (room2 >= 1 && C.coins >= room2 * D.FILL_PRICE ? '' : ' disabled') + '>Заполнить · ' + M.fmt(room2 * D.FILL_PRICE) + '</button></div></div>';
    M.modal.open(h, { actions: function (act, key) { if (act !== 'buy') return; accrue(); var n = key === 'full' ? storeCap() - stockWhole() : Math.min(storeCap() - stockWhole(), parseInt(key, 10)); if (n <= 0 || C.coins < n * D.FILL_PRICE) return; C.coins -= n * D.FILL_PRICE; C.stock = Math.min(storeCap(), C.stock + n); save(); prodPanel(); paint(); } });
  }
  function shopPanel() {
    var dock = D.ROOMS.dock.cls[roomLvl('dock') - 1], h = head('Магазин', 'док принимает корабли до ' + dock + '-го класса'), i;
    for (i = 0; i < D.SHIPS.length; i++) {
      var s = D.SHIPS[i], owned = C.fleet.indexOf(s.id) >= 0, sel = s.id === C.ship, fits = s.cls <= dock, can = !owned && fits && C.coins >= s.price;
      h += '<div class="card' + (sel ? ' sel' : '') + (!owned && !fits ? ' locked' : '') + '"><div class="card-head"><b>' + s.name + '</b><span class="tag">' + s.cls + ' класс · ' + s.tanks + ' цист.</span></div><p>' + s.desc + '</p>' +
        '<div class="stat"><span>скорость</span><div class="bar"><i style="width:' + Math.round((s.speed - 50) * 6) + '%"></i></div><span>манёвр</span><div class="bar"><i style="width:' + Math.round((s.turn - 0.6) / 0.8 * 100) + '%"></i></div><span>прочность</span><div class="bar"><i style="width:' + Math.round((1.5 - s.armour) / 1 * 100) + '%"></i></div><span>цистерны</span><div class="bar"><i style="width:' + Math.round(s.tanks / 20 * 100) + '%"></i></div></div>' +
        '<div class="row">' + (owned ? '<span class="meta">' + (sel ? 'у стапеля' : 'в парке') + '</span>' : M.coin(s.price)) + (sel ? '' : owned ? '<button class="btn ghost" data-act="pick" data-key="' + s.id + '">Поставить</button>' : '<button class="btn" data-act="buyship" data-key="' + s.id + '"' + (can ? '' : ' disabled') + '>' + (fits ? 'Купить' : 'Нужен док ' + s.cls) + '</button>') + '</div></div>';
    }
    h += '<div class="card' + (C.trophy ? ' sel' : '') + '"><div class="card-head"><b>' + D.TROPHY.name + '</b><span class="tag hot">цель</span></div><p>' + D.TROPHY.desc + '</p><div class="row">' + M.coin(D.TROPHY.price) + (C.trophy ? '<span class="meta">стоит на площадке</span>' : '<button class="btn green" data-act="trophy"' + (C.coins >= D.TROPHY.price ? '' : ' disabled') + '>Купить</button>') + '</div></div>';
    M.modal.open(h, { actions: function (act, key) {
      if (act === 'pick' && C.fleet.indexOf(key) >= 0) { C.ship = key; M.studio.setShip(shipSpec()); }
      else if (act === 'buyship') { var s = D.shipById(key); if (C.fleet.indexOf(key) >= 0 || s.cls > dock || C.coins < s.price) return; C.coins -= s.price; C.fleet.push(key); C.ship = key; M.studio.setShip(s); }
      else if (act === 'trophy') { if (C.trophy || C.coins < D.TROPHY.price) return; C.coins -= D.TROPHY.price; C.trophy = true; M.studio.setTrophy(true); }
      save(); shopPanel(); paint();
    } });
  }
  function tunePanel() {
    var s = shipSpec(), t = tune(s.id), depth = D.ROOMS.dock.depth[roomLvl('dock') - 1], h = head('Доработки · ' + s.name, 'док даёт ступени до ' + depth + '-й'), i;
    for (i = 0; i < D.TUNING.length; i++) {
      var u = D.TUNING[i], l = t[u.key] || 0, max = l >= 3, capped = !max && l >= depth, price = max ? 0 : Math.round(u.prices[l] * (1 + 0.4 * (s.cls - 1))), ok = !max && !capped && C.coins >= price;
      h += '<div class="card"><div class="card-head"><b>' + u.name + '</b>' + M.pips(l, 3) + '</div><p>' + u.desc + ' Сейчас ' + u.fx(l) + (max ? '' : ', дальше ' + u.fx(l + 1)) + '.</p><div class="row">' + (max ? '<span class="meta">максимум</span>' : M.coin(price)) + (max ? '' : '<button class="btn" data-act="tune" data-key="' + u.key + '"' + (ok ? '' : ' disabled') + '>' + (capped ? 'Нужен док' : 'Купить') + '</button>') + '</div></div>';
    }
    M.modal.open(h, { actions: function (act, key) { if (act !== 'tune') return; var u = D.TUNING.filter(function (x) { return x.key === key; })[0], l = t[key] || 0, price = Math.round(u.prices[l] * (1 + 0.4 * (s.cls - 1))); if (l >= 3 || l >= depth || C.coins < price) return; C.coins -= price; t[key] = l + 1; save(); tunePanel(); paint(); } });
  }
  function zenPanel() {
    var open = tracksOpen(), h = head('Дзен', '10 км без груза: дрифт даёт опыт, собранные монеты — валюту');
    for (var i = 0; i < open.length; i++) h += '<div class="card"><div class="card-head"><b>' + open[i].name + '</b>' + (open[i].friction < 0.8 ? '<span class="tag cold">лёд</span>' : open[i].rocks ? '<span class="tag hot">камни</span>' : open[i].night ? '<span class="tag">ночь</span>' : '') + '</div><div class="row"><span class="meta">10 км реки, финиш в конце</span><button class="btn" data-act="zen" data-key="' + open[i].id + '">Поехали</button></div></div>';
    M.modal.open(h, { actions: function (act, key) { if (act === 'zen') { M.modal.close(); startRace({ zen: true, seed: (M.now() % 1000003), track: key, lengthM: 10000, difficulty: M.clamp(0.2 + 0.02 * C.level, 0.2, 0.9), amount: 0, ports: 0, pay: 0 }, null); } } });
  }
  function settingsPanel() {
    var h = head('Настройки', 'Мегалюль · карьера капитана Данилкина') + '<div class="switch"><span>Рейсов: ' + C.runs + ' · лучший счёт ' + M.fmt(C.best) + '</span></div>' +
      '<div class="card"><div class="card-head"><b>Платформа</b>' + M.pips(D.rigStage(C.rooms), 5) + '</div><p>' + D.RIG_LOOK[D.rigStage(C.rooms) - 1] + '</p></div>' +
      '<div class="switch"><span>Игра на главном экране</span><button class="btn ghost" data-act="install">Добавить</button></div>' +
      '<div class="switch"><span>Начать карьеру заново</span><button class="btn ghost" data-act="reset">Сбросить</button></div><div class="meta center-text">Сохранение живёт в этом браузере. При перезагрузке незавершённый рейс отменяется, груз возвращается в пределах вместимости склада.</div><div class="meta center-text">Версия ' + M.esc((window.MEGALUL_CONFIG || {}).version || 'dev') + '</div>';
    M.modal.open(h, { actions: function (act) { if (act === 'install') { window.MEGALUL_INSTALL.show(); return; } if (act === 'reset') { if (!confirm('Стереть карьеру и начать заново?')) return; M.store.clear(); C = fresh(); refreshOrders(); save(); M.modal.close(); M.studio.setLevels(C.rooms); M.studio.setShip(shipSpec()); M.studio.setTrophy(false); paint(); } } });
  }
  function invest() { // автотест: тратит монеты как торопливый игрок: комнаты по порядку, корабль повместительнее, потом трофей
    var keys = ['plant', 'store', 'dock', 'office'], changed = false, i, k, dockCls = D.ROOMS.dock.cls[roomLvl('dock') - 1], want = null;
    for (i = 0; i < D.SHIPS.length; i++) { var s = D.SHIPS[i]; if (C.fleet.indexOf(s.id) < 0 && s.cls <= dockCls && s.tanks > effective().tanks) { if (C.coins >= s.price) { C.coins -= s.price; C.fleet.push(s.id); C.ship = s.id; changed = true; } else if (!want) want = s; } }
    if (!want) for (i = 0; i < keys.length; i++) { k = keys[i]; while (canUpgrade(k)) { C.coins -= D.ROOMS[k].cost[roomLvl(k)]; C.rooms[k] += 1; changed = true; } }   // пока копим на корабль, комнаты ждут
    if (!C.trophy && C.coins >= D.TROPHY.price) { C.coins -= D.TROPHY.price; C.trophy = true; changed = true; }
    if (changed) { M.studio.setLevels(C.rooms); M.studio.setShip(shipSpec()); M.studio.setTrophy(C.trophy); save(); }
  }
  L.autoplay = function () { // для автотеста: вкладывает монеты, берёт первый доступный заказ, иначе дзен
    accrue(); refreshOrders(); invest();
    for (var i = 0; i < C.orders.length; i++) if (!canTake(C.orders[i])) { takeOrder(i); return 'order'; }
    startRace({ zen: true, seed: 42, track: 'summer', lengthM: 2600, difficulty: 0.3, amount: 0, ports: 0, pay: 0 }, null); return 'zen';
  };
})();
