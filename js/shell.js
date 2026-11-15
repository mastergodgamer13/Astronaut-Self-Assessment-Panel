/* shell.js: first-run intro and the offline banner. Text comes from I18n; nothing is sent anywhere. */
(function (root) {
  'use strict';
  var KEY = 'sa_onboarded';
  function seen() { try { return root.localStorage.getItem(KEY) === '1'; } catch (e) { return true; } }
  function mark() { try { root.localStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked */ } }
  function el(tag, attrs, text) { var n = document.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); }); if (text) n.textContent = text; return n; }

  function intro(t) {
    if (seen()) return;
    var step = 0, last = document.activeElement;
    var ov = el('div', { class: 'ob', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ob-title' });
    var card = el('div', { class: 'ob-card' }), h = el('h2', { id: 'ob-title', tabindex: '-1' }, t('ob.title')), body = el('p', { class: 'ob-text' }), dots = el('div', { class: 'ob-dots', 'aria-hidden': 'true' });
    var next = el('button', { type: 'button', class: 'ob-next' }), skip = el('button', { type: 'button', class: 'ghost' }, t('ob.skip')), demo = el('button', { type: 'button', class: 'ghost' }, t('cu.startDemo'));
    for (var i = 0; i < 3; i++) dots.appendChild(el('span'));
    var row = el('div', { class: 'ob-row' }); row.appendChild(skip); row.appendChild(demo); row.appendChild(next);
    [h, body, dots, row].forEach(function (n) { card.appendChild(n); }); ov.appendChild(card); document.body.appendChild(ov);
    function draw() {
      body.textContent = t('ob.' + (step + 1)); next.textContent = step < 2 ? t('cu.next') : t('ob.start');
      Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k === step ? 'on' : ''; });
      demo.style.display = step === 2 ? '' : 'none';
    }
    function close(startDemo) {
      mark(); ov.remove(); if (last && last.focus) last.focus();
      if (startDemo) { var b = Array.prototype.filter.call(document.querySelectorAll('#checkup button'), function (x) { return x.textContent === t('cu.startDemo'); })[0]; if (b) b.click(); }
    }
    next.addEventListener('click', function () { if (step < 2) { step++; draw(); } else close(false); });
    skip.addEventListener('click', function () { close(false); }); demo.addEventListener('click', function () { close(true); });
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(false); });
    draw(); h.focus();
  }

  function offline(t) {
    var bar = el('div', { class: 'offline-bar', role: 'status' }, t('off.banner'));
    function upd() { if (navigator.onLine === false) { if (!bar.parentNode) document.body.insertBefore(bar, document.body.firstChild); } else bar.remove(); }
    root.addEventListener('online', upd); root.addEventListener('offline', upd); upd();
  }

  function init(t) { offline(t); intro(t); }
  var api = { init: init, KEY: KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Shell = api;
})(typeof window !== 'undefined' ? window : globalThis);
