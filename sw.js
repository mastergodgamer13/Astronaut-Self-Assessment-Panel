/*
 * sw.js — service worker: makes the app work offline and shows daily check-up reminders without the page being open.
 * Offline: the app files are cached on first visit (index.html is read to find them); NASA calls (other origins) are never touched.
 * Reminders: (1) Web Push from the optional relay (worker/push.mjs), (2) Periodic Background Sync where the browser allows it.
 */
'use strict';
importScripts('js/remind.js');

var CACHE = 'll-app-v2026-11-15w';   // change this string when app files change
var STATE = 'll-state';              // small settings copy written by the page (the worker cannot read localStorage)
var STATE_URL = new URL('ll-state.json', self.registration.scope).href;

function precache() {
  return caches.open(CACHE).then(function (c) {
    return fetch('index.html', { cache: 'reload' }).then(function (res) {
      var copy = res.clone();
      return res.text().then(function (html) {
        var urls = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
        var re = /(?:src|href)="([^"#]+)"/g, m;
        while ((m = re.exec(html))) if (!/^([a-z]+:)?\/\//i.test(m[1]) && !/^(mailto|data):/i.test(m[1])) urls.push(m[1]);
        return c.put('index.html', copy).then(function () {
          return Promise.all(urls.filter(function (u, i) { return urls.indexOf(u) === i; }).map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () { /* optional file */ }); }));
        });
      });
    });
  });
}

self.addEventListener('install', function (e) { e.waitUntil(precache().then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== STATE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // NASA / relay requests go straight to the network
  if (/ll-state\.json$/.test(url.pathname)) return;
  if (req.mode === 'navigate') { // page: newest when online, cached copy when offline
    e.respondWith(fetch(req).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put('index.html', cp); }); return r; })
      .catch(function () { return caches.match('index.html'); }));
    return;
  }
  // scripts, styles, images: newest from the network when online (so updates always arrive), cached copy when offline
  e.respondWith(fetch(req).then(function (r) { if (r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); } return r; })
    .catch(function () { return caches.match(req); }));
});

/* ---------------- reminders ---------------- */
function readState() {
  return caches.open(STATE).then(function (c) { return c.match(STATE_URL); }).then(function (r) { return r ? r.json() : {}; }).catch(function () { return {}; });
}
function writeState(s) {
  return caches.open(STATE).then(function (c) { return c.put(STATE_URL, new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json' } })); });
}
function show(state) {
  var tx = Remind.text(state.lang);
  return self.registration.showNotification(tx.title, { body: tx.body, tag: 'll-daily', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './index.html' } })
    .then(function () { state.lastNotified = Remind.localDay(new Date()); return writeState(state); });
}

// periodic background sync (Chromium, installed app): remind if due
self.addEventListener('periodicsync', function (e) {
  if (e.tag !== 'll-reminder') return;
  e.waitUntil(readState().then(function (s) { if (Remind.due(new Date(), s.settings, s.lastCheckin, s.lastNotified)) return show(s); }));
});

// web push from the relay (no payload): always show the reminder, the relay already skips people who checked in today
self.addEventListener('push', function (e) {
  e.waitUntil(readState().then(function (s) { return show(s || {}); }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].focus();
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || './index.html');
  }));
});
