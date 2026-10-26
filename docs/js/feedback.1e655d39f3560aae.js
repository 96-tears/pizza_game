(function () {
  'use strict';
  var config = window.MEGALUL_CONFIG || {}, url;
  try { url = new URL(config.feedbackUrl); } catch (e) { return; }
  if (url.protocol !== 'https:' || url.username || url.password) return;
  var link = M.el('feedbackLink');
  link.href = url.href;
  link.classList.remove('hidden');
})();
