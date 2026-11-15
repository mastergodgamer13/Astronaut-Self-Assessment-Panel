/*
 * pwa.js — offline use, install, and daily reminders. All browser-only glue; the rules live in remind.js and the worker.
 * Honest limits: closed-app reminders need either the optional relay (worker/push.mjs, deployed by you) or a Chromium
 * browser with the app installed (periodic background sync). On iPhone/iPad the app must be added to the Home Screen.
 */
(function (root) {
  'use strict';
  var KEY = 'll-remind', LAST = 'll-lastcheckin', SUB = 'll-pushsub';
  var t = function (k, p) { return k; }, lang = function () { return 'en'; };
  var deferred = null, reg = null;

  function ls(op, k, v) { try { return op === 'get' ? root.localStorage.getItem(k) : root.localStorage.setItem(k, v); } catch (e) { return null; } }
  /** Saved settings, with the site defaults (js/config.js) filling an empty service address or key. */
  function withDefaults(s) {
    var d = (root.LL_CONFIG && root.LL_CONFIG.reminders) || {};
    return { enabled: s.enabled, time: s.time, relay: s.relay || String(d.url || '').replace(/\/+$/, ''), vapid: s.vapid || d.vapid || '' };
  }
  function settings() { var r; try { r = JSON.parse(ls('get', KEY) || '{}'); } catch (e) { r = {}; } var c = Remind.clean(r); return withDefaults(c.ok ? c.settings : Remind.clean({}).settings); }
  function lastCheckin() { return ls('get', LAST) || null; }
  function $(id) { return document.getElementById(id); }
  function msg(text, cls) { var m = $('remind-msg'); if (m) { m.textContent = text || ''; m.className = 'form-msg' + (cls ? ' ' + cls : ''); } }

  /** State copy the service worker reads (it has no localStorage). */
  function shareState() {
    if (!root.caches) return Promise.resolve();
    var s = { settings: settings(), lastCheckin: lastCheckin(), lang: lang(), lastNotified: null };
    return root.caches.open('ll-state').then(function (c) {
      return c.match('ll-state.json').then(function (old) { return old ? old.json() : {}; }).catch(function () { return {}; }).then(function (o) {
        s.lastNotified = o.lastNotified || null;
        return c.put('ll-state.json', new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json' } }));
      });
    }).catch(function () {});
  }

  function b64uToBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function post(url, body) { return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }

  function relay(path, body) { var s = settings(); return s.relay ? post(s.relay + path, body) : Promise.resolve(); }

  /** Called when a check-in was saved today: stops today's reminder here and at the relay. */
  function checkedIn(date) {
    ls('set', LAST, date);
    shareState();
    try { var sub = JSON.parse(ls('get', SUB) || 'null'); if (sub && sub.endpoint) relay('/push/checkin', { endpoint: sub.endpoint, day: date }).catch(function () {}); } catch (e) {}
  }

  function subscribePush(s) {
    if (!(reg && reg.pushManager) || !s.relay || !s.vapid) return Promise.resolve('off');
    return reg.pushManager.getSubscription().then(function (cur) {
      return cur || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(s.vapid) });
    }).then(function (sub) {
      var json = sub.toJSON(); ls('set', SUB, JSON.stringify({ endpoint: json.endpoint }));
      return post(s.relay + '/push/subscribe', { sub: { endpoint: json.endpoint }, time: s.time, tz: -new Date().getTimezoneOffset(), lang: lang() })
        .then(function (r) { return r.ok ? 'on' : 'fail'; });
    }).catch(function () { return 'fail'; });
  }

  function unsubscribePush(s) {
    if (!(reg && reg.pushManager)) return Promise.resolve();
    return reg.pushManager.getSubscription().then(function (sub) {
      if (!sub) return; var ep = sub.endpoint;
      return sub.unsubscribe().then(function () { return s.relay ? relay('/push/unsubscribe', { endpoint: ep }).catch(function () {}) : null; });
    }).catch(function () {});
  }

  function registerPeriodic() {
    if (reg && reg.periodicSync && reg.periodicSync.register) return reg.periodicSync.register('ll-reminder', { minInterval: 3 * 3600 * 1000 }).catch(function () {});
    return Promise.resolve();
  }

  function ask() {
    if (!('Notification' in root)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return Notification.requestPermission();
  }

  function showNow() {
    var tx = Remind.text(lang());
    if (reg && reg.showNotification) return reg.showNotification(tx.title, { body: tx.body, tag: 'll-daily', icon: 'icons/icon-192.png', data: { url: './index.html' } });
    new Notification(tx.title, { body: tx.body }); return Promise.resolve();
  }

  /** Open-page timer: while the app is open, remind when due. */
  var timer = null;
  function tick() {
    var s = settings(), now = new Date();
    if (!('Notification' in root) || Notification.permission !== 'granted') return;
    root.caches.open('ll-state').then(function (c) { return c.match('ll-state.json'); }).then(function (r) { return r ? r.json() : {}; }).catch(function () { return {}; }).then(function (st) {
      if (Remind.due(now, s, lastCheckin(), st.lastNotified)) {
        showNow().then(function () { st.lastNotified = Remind.localDay(now); st.settings = s; st.lastCheckin = lastCheckin(); st.lang = lang(); return root.caches.open('ll-state').then(function (c) { return c.put('ll-state.json', new Response(JSON.stringify(st), { headers: { 'content-type': 'application/json' } })); }); });
      }
    });
  }

  function fill() {
    var f = $('remindform'); if (!f) return; var s = settings();
    var raw; try { raw = JSON.parse(ls('get', KEY) || '{}'); } catch (e) { raw = {}; }
    f.querySelector('[name=enabled]').checked = s.enabled; f.querySelector('[name=time]').value = s.time;
    f.querySelector('[name=relay]').value = raw.relay || ''; f.querySelector('[name=vapid]').value = raw.vapid || '';
    f.querySelector('[name=relay]').placeholder = (root.LL_CONFIG && root.LL_CONFIG.reminders && root.LL_CONFIG.reminders.url) || 'https://';
  }

  function relabel() {
    var f = $('remindform'); if (!f) return;
    Array.prototype.forEach.call(f.querySelectorAll('[data-rt]'), function (n) { n.textContent = t(n.getAttribute('data-rt')); });
    $('remind-install').textContent = t('remind.install');
    $('remind-ios').textContent = /iphone|ipad|ipod/i.test(navigator.userAgent) ? t('remind.ios') : '';
  }

  function wire() {
    var f = $('remindform'); if (!f) return;
    fill(); relabel();
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var c = Remind.clean({ enabled: f.querySelector('[name=enabled]').checked, time: f.querySelector('[name=time]').value, relay: f.querySelector('[name=relay]').value, vapid: f.querySelector('[name=vapid]').value });
      if (!c.ok) { msg(t('remind.err.' + c.code), 'err'); return; }
      ls('set', KEY, JSON.stringify(c.settings));
      var done = function (extra) { shareState(); msg(t('remind.saved') + (extra ? ' ' + extra : ''), 'good'); };
      var eff = withDefaults(c.settings);
      if (!c.settings.enabled) { unsubscribePush(eff).then(function () { done(''); }); return; }
      ask().then(function (p) {
        if (p === 'denied') { msg(t('remind.denied'), 'err'); return; }
        if (p === 'unsupported') { msg(t('remind.unsupported'), 'err'); return; }
        if (p !== 'granted') return;
        registerPeriodic();
        subscribePush(eff).then(function (r) { done(t(r === 'on' ? 'remind.push.on' : r === 'fail' ? 'remind.push.fail' : 'remind.push.off')); });
      });
    });
    $('remind-test').addEventListener('click', function () {
      ask().then(function (p) { if (p === 'granted') showNow().then(function () { msg(t('remind.test.sent'), 'good'); }); else msg(t(p === 'denied' ? 'remind.denied' : 'remind.unsupported'), 'err'); });
    });
    $('remind-check').addEventListener('click', checkSetup);
    $('remind-install').addEventListener('click', function () { if (deferred) { deferred.prompt(); deferred = null; $('remind-install').hidden = true; } });
  }

  /** "Check my reminder setup": gathers the facts, then Diag.reminderReport names the first step that fails. */
  function checkSetup() {
    var s = settings(), list = $('remind-report'); if (!list) return;
    list.innerHTML = '';
    var f = { notif: 'Notification' in root, perm: 'Notification' in root ? Notification.permission : 'denied', sw: !!(reg && reg.active), push: !!(reg && reg.pushManager), relay: s.relay, vapid: s.vapid, sub: false, accepts: null };
    var subP = f.push ? reg.pushManager.getSubscription().catch(function () { return null; }) : Promise.resolve(null);
    subP.then(function (sub) {
      f.sub = !!sub;
      if (!(sub && s.relay)) return;
      return post(s.relay + '/push/subscribe', { sub: { endpoint: sub.endpoint }, time: s.time, tz: -new Date().getTimezoneOffset(), lang: lang() })
        .then(function (r) { f.accepts = r.ok; }).catch(function () { f.accepts = false; });
    }).then(function () {
      var rep = Diag.reminderReport(f);
      rep.steps.forEach(function (st) {
        var li = document.createElement('li');
        li.textContent = (st.ok === true ? '✓ ' : st.ok === false ? '✗ ' : '– ') + t('diag.rem.step.' + st.id) + (st.ok === false ? ' — ' + t('diag.rem.hint.' + st.id) : st.ok === null ? ' (' + t('diag.rem.skipped') + ')' : '');
        if (st.ok === false) li.className = 'form-msg err';
        list.appendChild(li);
      });
      var done = document.createElement('li');
      done.textContent = rep.first ? t('diag.rem.partial') : t('diag.rem.allgood'); list.appendChild(done);
    });
  }

  function banner() {
    var b = $('net-banner'); if (!b) return;
    var upd = function () { var off = root.navigator && root.navigator.onLine === false; b.hidden = !off; b.textContent = off ? t('net.offline') : ''; };
    root.addEventListener('online', upd); root.addEventListener('offline', upd); upd();
    b.__upd = upd;
  }

  function init(opts) {
    t = opts.t; lang = opts.lang || lang;
    wire(); banner();
    root.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; var b = $('remind-install'); if (b) b.hidden = false; });
    if ('serviceWorker' in navigator && /^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(root.location.href)) {
      navigator.serviceWorker.register('sw.js').then(function (r) { reg = r; return navigator.serviceWorker.ready; }).then(function (r) { reg = r; shareState(); }).catch(function () {});
    }
    timer = setInterval(tick, 60000); setTimeout(tick, 3000);
  }

  root.Pwa = { init: init, relabel: function () { relabel(); var b = $('net-banner'); if (b && b.__upd) b.__upd(); }, checkedIn: checkedIn };
})(window);
