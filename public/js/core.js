/* Общие помощники: математика, сид-рандом, форматирование, хранилище, модальные панели. Все файлы игры складывают своё в объект M. */
var M = window.M || (window.M = {});
(function () {
  'use strict';
  M.TAU = Math.PI * 2;
  M.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  M.lerp = function (a, b, t) { return a + (b - a) * t; };
  M.smooth = function (t) { t = M.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  M.angDiff = function (a, b) { var d = (a - b) % M.TAU; if (d > Math.PI) d -= M.TAU; if (d < -Math.PI) d += M.TAU; return d; };
  M.rng = function (seed) { // mulberry32: один и тот же сид даёт одну и ту же реку
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  M.fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  M.fmtTime = function (sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60, mm = (m < 10 ? '0' : '') + m, ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + mm + ':' + ss : m + ':' + ss;
  };
  M.plural = function (n, one, few, many) { // 1 цистерна, 2 цистерны, 5 цистерн
    n = Math.floor(Math.abs(n)); var m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  M.tanks = function (n) { return Math.floor(n) + ' ' + M.plural(n, 'цистерна', 'цистерны', 'цистерн'); };
  M.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  M.hex = function (n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); };
  M.el = function (id) { return document.getElementById(id); };
  M.now = function () { return Date.now(); };
  M.isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  // ---------- хранилище ----------
  M.store = {
    key: 'megalul-career',
    message: '', failed: false, validate: null,
    notice: function () { var el = M.el('saveWarning'); if (el) { el.textContent = this.failed ? 'Прогресс не сохраняется. Разрешите хранение данных в браузере и освободите место.' : this.message; el.classList.toggle('hidden', !el.textContent); } },
    load: function (validate) {
      this.validate = validate;
      try {
        var raw = localStorage.getItem(this.key), backup = localStorage.getItem(this.key + '-backup'), value = this.parse(raw);
        if (value) return value;
        value = this.parse(backup);
        if (value) this.message = 'Восстановлена резервная копия прогресса.';
        else if (raw || backup) this.message = 'Сохранение повреждено. Начата новая карьера.';
        return value;
      } catch (e) { this.failed = true; return null; }
    },
    parse: function (raw) { try { var value = JSON.parse(raw); return this.validate ? this.validate(value) : value; } catch (e) { return null; } },
    save: function (o) {
      try {
        var previous = localStorage.getItem(this.key);
        if (previous && this.parse(previous)) localStorage.setItem(this.key + '-backup', previous);
        localStorage.setItem(this.key, JSON.stringify(o)); this.failed = false;
      } catch (e) { this.failed = true; }
      this.notice(); return !this.failed;
    },
    clear: function () { try { localStorage.removeItem(this.key); localStorage.removeItem(this.key + '-backup'); this.message = ''; } catch (e) { this.failed = true; } }
  };

  // ---------- кнопки с data-act: один обработчик на контейнер ----------
  M.bind = function (root, handler) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-act]'), function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); handler(b.getAttribute('data-act'), b.getAttribute('data-key'), b); });
    });
  };

  // ---------- модальная панель: лист снизу или карточка по центру ----------
  M.modal = {
    el: null, onClose: null,
    open: function (html, opts) {
      opts = opts || {};
      var m = this.el || (this.el = M.el('modal'));
      m.className = opts.center ? 'center' : '';
      m.innerHTML = '<div class="sheet">' + html + '</div>';
      this.onClose = opts.onClose || null;
      var self = this;
      m.onclick = function (e) { if (e.target === m && !opts.sticky) self.close(); };
      if (opts.actions) M.bind(m, opts.actions);
      Array.prototype.forEach.call(m.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', function () { self.close(); }); });
      return m.firstChild;
    },
    close: function () { var m = this.el || (this.el = M.el('modal')); m.className = 'hidden'; m.innerHTML = ''; var f = this.onClose; this.onClose = null; if (f) f(); },
    isOpen: function () { var m = this.el || (this.el = M.el('modal')); return m.className !== 'hidden'; }
  };
  M.pips = function (l, max) { var h = ''; for (var k = 0; k < max; k++) h += '<span class="' + (k < l ? 'on' : '') + '">●</span>'; return '<span class="pips">' + h + '</span>'; };
  M.coin = function (n) { return '<span class="pay"><span class="c"></span>' + M.fmt(n) + '</span>'; };
})();
