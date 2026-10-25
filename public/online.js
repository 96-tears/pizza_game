/* Онлайн-слой «Мегалюля»: таблица лидеров и форма отзывов.
   Подключается в игру одной строкой <script src="online.js"></script> и ходит в /api на том же сервере
   (server.js или Cloudflare Pages). Если сервера нет (например, файл открыт напрямую с диска),
   всё молча отключается, игра работает как раньше.

   Что вызывает игра:
     Online.panel(el, { game: '3d', mode: 'title' })             таблица и имя игрока на титульном экране
     Online.panel(el, { game, mode: 'result', score, level })   записать результат и показать таблицу
     Online.report(game, score, level)                         тихо записать результат, если имя уже задано
     Online.feedbackLink(game)                                 HTML кнопки «Оставить отзыв»
     Online.feedback({ game })                                 открыть форму отзыва */
(function () {
  'use strict';
  var API = (window.MEGALUL_API || '') + '/api';
  var LS_NAME = 'megalul-name', LS_PID = 'megalul-pid';
  var LABELS = {
    '3d': { score: 'Заработано', level: 'Рейсов', unit: ' ₽' }
  };
  var ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var lastCtx = {};   // последний известный уровень и счёт по играм, уходит вместе с отзывом
  var CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
  // Невидимые символы (zero-width, метки направления текста, BOM) перечислены кодами, чтобы файл не зависел от редактора.
  var INVISIBLE = new RegExp('[' + String.fromCharCode(0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0xfeff) + ']', 'g');

  // ---------- хранилище и утилиты ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function playerId() {
    var p = lsGet(LS_PID);
    if (p && /^[a-z0-9]{8,40}$/.test(p)) return p;
    var buf = new Uint8Array(20);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
    else for (var i = 0; i < buf.length; i++) buf[i] = (Math.random() * 256) | 0;
    p = '';
    for (var j = 0; j < buf.length; j++) p += ALPHABET[buf[j] % ALPHABET.length];
    lsSet(LS_PID, p);
    return p;
  }
  function cleanName(s) {
    return String(s || '').replace(CONTROL, '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  }
  function getName() { return cleanName(lsGet(LS_NAME)); }
  function setName(n) { n = cleanName(n); lsSet(LS_NAME, n); return n; }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function api(method, path, body) {
    if (!window.fetch) return Promise.reject(new Error('no_fetch'));
    var opts = { method: method, headers: {} };
    if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(API + path, opts).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok || !d || !d.ok) throw new Error((d && d.error) || ('http_' + r.status));
        return d;
      });
    });
  }
  function submit(game, score, level, limit) {
    lastCtx[game] = { level: level, score: score };
    return api('POST', '/scores', { game: game, player_id: playerId(), name: getName(), score: Math.round(score), level: Math.round(level), limit: limit || 10 });
  }
  function report(game, score, level) {
    if (!LABELS[game] || !getName() || !(score > 0)) return;
    submit(game, score, level).catch(function () {});
  }

  // ---------- стили: цвета берутся из переменных игры, запасные значения на всякий случай ----------
  var css = [
    '.ol{margin:14px auto 4px;max-width:380px;text-align:left;font-size:13px}',
    '.ol-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px}',
    '.ol-title{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#9aa)}',
    '.ol-me{font-size:12px;color:var(--muted,#9aa)}.ol-me b{color:var(--fg,#fff);font-weight:500}',
    '.ol-link{background:none;border:none;padding:0;font:inherit;font-size:12px;color:var(--accent,#ffb347);cursor:pointer;text-decoration:underline;text-underline-offset:2px}',
    '.ol-link:hover{filter:brightness(1.15)}',
    '.ol-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}',
    '.ol-table th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#9aa);font-weight:400;text-align:left;padding:2px 6px}',
    '.ol-table th.r{text-align:right}',
    '.ol-table td{padding:4px 6px;border-top:1px solid var(--edge,var(--panel-edge,rgba(255,255,255,.14)))}',
    '.ol-table td.n{color:var(--muted,#9aa);width:2em;text-align:right}',
    '.ol-table td.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}',
    '.ol-table td.s{text-align:right;font-weight:500;white-space:nowrap}',
    '.ol-table td.l{color:var(--muted,#9aa);text-align:right;white-space:nowrap}',
    '.ol-table tr.me td{color:var(--accent,#ffb347)}.ol-table tr.me td.name{font-weight:700}',
    '.ol-table tr.gap td{text-align:center;color:var(--muted,#9aa);padding:0 6px;line-height:1}',
    '.ol-total{margin-top:6px;text-align:right}',
    '.ol-row{display:flex;gap:6px;margin:8px 0}',
    '.ol-input{flex:1;min-width:0;padding:8px 10px;border-radius:6px;border:1px solid var(--edge,var(--panel-edge,#567));background:rgba(0,0,0,.3);color:var(--fg,#fff);font:inherit;font-size:14px}',
    '.ol-input:focus{outline:2px solid var(--accent,#ffb347);outline-offset:1px}',
    '.ol-btn{padding:8px 14px;border-radius:6px;border:1px solid var(--edge,var(--panel-edge,#567));background:transparent;color:var(--fg,#fff);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}',
    '.ol-btn.primary{background:var(--accent,#ffb347);color:#1a1206;border-color:transparent;font-weight:500}',
    '.ol-btn:hover{filter:brightness(1.1)}.ol-btn:disabled{opacity:.5;cursor:default}',
    '.ol-muted{color:var(--muted,#9aa);font-size:12px}',
    '.ol-status{font-weight:500;margin:6px 0 8px}',
    '.ol-foot{margin-top:10px;text-align:center}',
    '.ol-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);text-align:left}',
    '.ol-dialog{width:100%;max-width:420px;max-height:100%;overflow:auto;box-sizing:border-box;padding:18px 18px 14px;border-radius:8px;background:var(--bg,#14141c);border:1px solid var(--edge,var(--panel-edge,#567));color:var(--fg,#fff);font-size:13px}',
    '.ol-dialog h3{margin:0 0 4px;font-family:var(--display,inherit);font-size:20px;letter-spacing:.04em}',
    '.ol-dialog label{display:block;margin:12px 0 4px;font-size:12px;color:var(--muted,#9aa)}',
    '.ol-dialog .ol-input{display:block;width:100%;box-sizing:border-box}',
    '.ol-dialog textarea.ol-input{min-height:90px;resize:vertical}',
    '.ol-stars{display:flex;gap:2px}.ol-stars button{background:none;border:none;font-size:28px;line-height:1;cursor:pointer;color:rgba(255,255,255,.25);padding:0 3px}',
    '.ol-stars button.on{color:var(--accent,#ffb347)}',
    '.ol-error{color:var(--bad,#f4705f);font-size:12px;margin-top:10px}',
    '.ol-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}',
    '.ol-ok{text-align:center;padding:16px 0}'
  ].join('');
  var styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  // ---------- таблица ----------
  function rowHtml(n, r, L, me) {
    return '<tr' + (me ? ' class="me"' : '') + '><td class="n">' + n + '</td><td class="name" title="' + esc(r.name) + '">' + esc(r.name) + '</td>' +
      '<td class="s">' + fmt(r.score) + L.unit + '</td><td class="l">' + r.level + '</td></tr>';
  }
  function tableHtml(game, d) {
    var L = LABELS[game];
    if (!d.top.length) return '<div class="ol-muted">В таблице пока никого. Запишите первый результат.</div>';
    var h = '<table class="ol-table"><thead><tr><th></th><th>Имя</th><th class="r">' + L.score + '</th><th class="r">' + L.level + '</th></tr></thead><tbody>';
    var meShown = false;
    for (var i = 0; i < d.top.length; i++) {
      if (d.top[i].me) meShown = true;
      h += rowHtml(i + 1, d.top[i], L, d.top[i].me);
    }
    if (d.me && !meShown) h += '<tr class="gap"><td colspan="4">···</td></tr>' + rowHtml(d.me.rank, d.me, L, true);
    h += '</tbody></table>';
    if (d.total > d.top.length) h += '<div class="ol-muted ol-total">Всего в таблице: ' + d.total + '</div>';
    return h;
  }

  // ---------- панель на экране игры ----------
  function panel(el, opts) {
    if (!el || !opts || !LABELS[opts.game]) return;
    var game = opts.game, L = LABELS[game];
    var result = opts.mode === 'result' && opts.score > 0;
    var limit = result ? 5 : 10;
    var state = { data: null, status: 'loading', editing: false };
    if (opts.level != null) lastCtx[game] = { level: opts.level, score: opts.score };
    el.className = 'ol';
    el.innerHTML = '<div class="ol-muted">Таблица лидеров загружается…</div>';

    function load() {
      var p = result && getName()
        ? submit(game, opts.score, opts.level, limit)
        : api('GET', '/scores?game=' + game + '&limit=' + limit + '&player=' + playerId());
      p.then(function (d) { state.data = d; state.status = 'ok'; render(); })
        .catch(function (e) { state.status = /^(bad_|implausible|too_)/.test(e.message) ? 'rejected' : 'offline'; render(); });
    }
    function render() {
      if (!el.isConnected) return;                                                         // экран уже сменился
      if (state.status === 'offline') { el.className = ''; el.innerHTML = ''; return; }   // сервера нет, таблицу не показываем
      var name = getName(), d = state.data, h = '';
      h += '<div class="ol-head"><span class="ol-title">Таблица лидеров</span>';
      if (name && !state.editing) h += '<span class="ol-me">Вы: <b>' + esc(name) + '</b> <button type="button" class="ol-link" data-act="edit">изменить</button></span>';
      h += '</div>';
      if (!name || state.editing) {
        h += '<form class="ol-row" data-act="name" autocomplete="off"><input class="ol-input" name="name" maxlength="16" placeholder="' + (result ? 'Имя для таблицы' : 'Ваше имя') + '" value="' + esc(name) + '">' +
          '<button type="submit" class="ol-btn primary">' + (result ? 'Записать' : 'Сохранить') + '</button>' +
          (state.editing ? '<button type="button" class="ol-btn" data-act="cancel">Отмена</button>' : '') + '</form>';
        if (result) h += '<div class="ol-muted">Введите имя, и результат попадёт в таблицу.</div>';
      } else if (result && d && d.me && state.status === 'ok') {
        h += '<div class="ol-status">' + (d.improved
          ? (d.me.rank === 1 ? '🏆 Вы на первом месте!' : '🏆 Новый рекорд: ' + d.me.rank + '-е место')
          : 'Ваш рекорд: ' + fmt(d.me.score) + L.unit + ' · ' + d.me.rank + '-е место') + '</div>';
      }
      if (state.status === 'rejected') h += '<div class="ol-muted">Сервер не принял результат.</div>';
      if (state.status === 'loading') h += '<div class="ol-muted">Отправляем…</div>';
      if (d) h += tableHtml(game, d);
      h += '<div class="ol-foot">' + feedbackLink(game) + '</div>';
      el.innerHTML = h;
      bind();
    }
    function bind() {
      var form = el.querySelector('form[data-act="name"]');
      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = form.querySelector('input'), n = cleanName(input.value);
          if (!n) { input.focus(); return; }
          setName(n);
          state.editing = false; state.status = 'loading'; render();
          if (result) load();                                   // запишет результат с этим именем
          else if (state.data && state.data.me) {               // переименовать уже записанную строку
            submit(game, state.data.me.score, state.data.me.level, limit)
              .then(function (d) { state.data = d; state.status = 'ok'; render(); })
              .catch(function () { state.status = 'ok'; render(); });
          } else { state.status = 'ok'; render(); }
        });
      }
      var edit = el.querySelector('[data-act="edit"]');
      if (edit) edit.addEventListener('click', function () {
        state.editing = true; render();
        var i = el.querySelector('input'); if (i) { i.focus(); i.select(); }
      });
      var cancel = el.querySelector('[data-act="cancel"]');
      if (cancel) cancel.addEventListener('click', function () { state.editing = false; render(); });
    }
    load();
  }

  // ---------- форма отзыва ----------
  function feedbackLink(game) {
    return '<button type="button" class="ol-link" data-ol-feedback="' + (LABELS[game] ? game : '') + '">💬 Оставить отзыв</button>';
  }
  var modal = null;
  function closeFeedback() {
    if (modal) {
      if (modal.olCleanup) modal.olCleanup();
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    }
    modal = null;
  }
  function feedback(ctx) {
    ctx = ctx || {};
    var game = LABELS[ctx.game] ? ctx.game : null;
    var known = (game && lastCtx[game]) || {};
    closeFeedback();
    modal = document.createElement('div');
    modal.className = 'ol-modal';
    var starsHtml = '';
    for (var i = 1; i <= 5; i++) starsHtml += '<button type="button" data-star="' + i + '" aria-label="' + i + ' из 5">★</button>';
    modal.innerHTML = '<div class="ol-dialog" role="dialog" aria-label="Отзыв об игре">' +
      '<h3>Отзыв об игре</h3><div class="ol-muted">Что понравилось, что сломалось, чего не хватает. Любой отклик полезен.</div>' +
      '<label>Оценка</label><div class="ol-stars">' + starsHtml + '</div>' +
      '<label for="olMsg">Сообщение</label><textarea id="olMsg" class="ol-input" maxlength="2000" placeholder="Например: на третьем уровне баржа выскакивает прямо перед носом…"></textarea>' +
      '<label for="olName">Имя</label><input id="olName" class="ol-input" maxlength="32" value="' + esc(getName()) + '" placeholder="Необязательно">' +
      '<label for="olContact">Как с вами связаться</label><input id="olContact" class="ol-input" maxlength="100" placeholder="Telegram или почта, необязательно">' +
      '<div class="ol-error" hidden></div>' +
      '<div class="ol-actions"><button type="button" class="ol-btn" data-act="close">Отмена</button><button type="button" class="ol-btn primary" data-act="send">Отправить</button></div></div>';
    document.body.appendChild(modal);
    var dialog = modal.firstChild, rating = 0;
    var stars = dialog.querySelectorAll('[data-star]');
    function paint() { for (var k = 0; k < stars.length; k++) stars[k].className = k < rating ? 'on' : ''; }
    for (var s = 0; s < stars.length; s++) {
      stars[s].addEventListener('click', function () { rating = Number(this.getAttribute('data-star')); paint(); });
    }
    // Пока форма открыта, клавиши не должны управлять игрой: внутри формы гасим всплытие,
    // снаружи (если фокус ушёл) перехватываем на окне. Esc закрывает форму.
    dialog.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeFeedback(); e.stopPropagation(); });
    dialog.addEventListener('keyup', function (e) { e.stopPropagation(); });
    function outsideKey(e) {
      if (!modal || dialog.contains(e.target)) return;
      if (e.type === 'keydown' && e.key === 'Escape') closeFeedback();
      e.stopPropagation(); e.preventDefault();
    }
    window.addEventListener('keydown', outsideKey, true);
    window.addEventListener('keyup', outsideKey, true);
    modal.olCleanup = function () { window.removeEventListener('keydown', outsideKey, true); window.removeEventListener('keyup', outsideKey, true); };
    modal.addEventListener('click', function (e) { if (e.target === modal) closeFeedback(); });
    dialog.querySelector('[data-act="close"]').addEventListener('click', closeFeedback);
    var sendBtn = dialog.querySelector('[data-act="send"]'), err = dialog.querySelector('.ol-error');
    sendBtn.addEventListener('click', function () {
      var message = dialog.querySelector('#olMsg').value.trim();
      if (!message && !rating) { err.textContent = 'Поставьте оценку или напишите пару слов.'; err.hidden = false; return; }
      err.hidden = true; sendBtn.disabled = true; sendBtn.textContent = 'Отправляем…';
      api('POST', '/feedback', {
        game: game,
        player_id: playerId(),
        name: dialog.querySelector('#olName').value,
        contact: dialog.querySelector('#olContact').value,
        rating: rating || null,
        message: message,
        context: {
          level: known.level, score: known.score,
          screen: window.innerWidth + '×' + window.innerHeight + ' @' + (window.devicePixelRatio || 1),
          touch: String(!!isTouch), page: location.pathname, lang: navigator.language, ua: navigator.userAgent
        }
      }).then(function () {
        dialog.innerHTML = '<div class="ol-ok"><h3>Спасибо!</h3><div class="ol-muted">Отзыв отправлен.</div></div>';
        setTimeout(closeFeedback, 1500);
      }).catch(function (e) {
        sendBtn.disabled = false; sendBtn.textContent = 'Отправить';
        err.textContent = e.message === 'too_fast' ? 'Подождите немного перед следующим отзывом.' : 'Не удалось отправить. Попробуйте ещё раз чуть позже.';
        err.hidden = false;
      });
    });
    if (!isTouch) { var ta = dialog.querySelector('#olMsg'); if (ta) ta.focus(); }   // на телефоне клавиатуру не вызываем сами
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document && !(t.hasAttribute && t.hasAttribute('data-ol-feedback'))) t = t.parentNode;
    if (t && t !== document) feedback({ game: t.getAttribute('data-ol-feedback') });
  });

  window.Online = { panel: panel, report: report, feedback: feedback, feedbackLink: feedbackLink, name: getName, setName: setName, playerId: playerId };
})();
