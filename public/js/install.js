/* Optional home-screen installation; refusal never blocks playing. */
(function () {
  'use strict';
  var key = 'megalul-install-dismissed', deferred = null, installed = false;
  var mode = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)');
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var mobile = ios || /Android/.test(navigator.userAgent);
  var dialog = document.getElementById('installDialog');
  var action = document.getElementById('installAction');
  var message = document.getElementById('installMessage');
  var dismissed = false;
  try { dismissed = localStorage.getItem(key) === '1'; } catch (e) {}
  function standalone() { return installed || mode.matches || navigator.standalone === true; }
  function remember() { dismissed = true; try { localStorage.setItem(key, '1'); } catch (e) {} }
  function close() { if (dialog.open) dialog.close(); }
  function paint() {
    message.textContent = standalone() ? 'Игра уже открыта как приложение.' :
      'Запускайте игру по иконке с главного экрана, в отдельном окне без обычной адресной строки. Для игры нужен интернет.';
    action.hidden = standalone();
    action.textContent = deferred ? 'Установить' : 'Как добавить';
  }
  function show(manual) {
    if (!manual && (!mobile || dismissed || standalone())) return;
    paint();
    if (!dialog.open) dialog.showModal();
  }
  window.MEGALUL_INSTALL = { show: function () { show(true); } };
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault(); deferred = event;
    if (dialog.open) paint();
  });
  window.addEventListener('appinstalled', function () { installed = true; deferred = null; close(); });
  mode.addEventListener('change', function () { if (standalone()) close(); });
  dialog.addEventListener('cancel', function () { remember(); });
  document.getElementById('installDismiss').addEventListener('click', function () { remember(); close(); });
  action.addEventListener('click', async function () {
    if (!deferred) {
      message.textContent = ios ? 'В Safari откройте «Поделиться» (иногда внутри меню «…»), выберите «На экран Домой», затем «Добавить». Если есть переключатель «Открывать как веб-приложение», оставьте его включённым.' :
        'Откройте меню браузера ⋮ и выберите «Установить приложение» или «Добавить на главный экран». Если такого пункта нет, откройте игру в Chrome или Safari.';
      return;
    }
    var prompt = deferred; deferred = null; action.disabled = true;
    try {
      await prompt.prompt();
      var choice = await prompt.userChoice;
      if (choice.outcome === 'dismissed') remember();
      close();
    } catch (e) {
      message.textContent = 'Не удалось открыть установку. Добавьте игру через меню браузера или продолжайте играть здесь.';
    } finally { action.disabled = false; action.textContent = 'Как добавить'; }
  });
  show(false);
})();
