/*
 * remind.js — daily check-in reminder rules. Pure (no DOM), shared by the page and the service worker (importScripts).
 * Settings are stored in this browser; the notification text exists in every app language.
 */
(function (root) {
  'use strict';

  var DEFAULTS = { enabled: false, time: '08:00', relay: '', vapid: '' };

  var TEXT = {
    en: { title: 'Daily check-up', body: 'Time for your daily health check. It takes a minute.' },
    tr: { title: 'Günlük kontrol', body: 'Günlük sağlık kontrolünüzün zamanı geldi. Bir dakika sürer.' },
    it: { title: 'Controllo giornaliero', body: 'È ora del tuo controllo di salute giornaliero. Basta un minuto.' },
    es: { title: 'Chequeo diario', body: 'Es hora de tu chequeo de salud diario. Lleva un minuto.' },
    fr: { title: 'Bilan quotidien', body: 'C’est l’heure de votre bilan de santé quotidien. Cela prend une minute.' },
    de: { title: 'Täglicher Check', body: 'Zeit für Ihren täglichen Gesundheitscheck. Er dauert eine Minute.' },
    ru: { title: 'Ежедневная проверка', body: 'Пора пройти ежедневную проверку здоровья. Это займёт минуту.' },
    ja: { title: '毎日のチェック', body: '毎日の健康チェックの時間です。1分で終わります。' },
    zh: { title: '每日自检', body: '该做每日健康自检了，只需一分钟。' }
  };

  function minutes(hhmm) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  /** Raw settings -> { ok, settings } | { ok:false, code:'time'|'relay'|'vapid' }. relay: https address or empty; vapid: base64url public key or empty. */
  function clean(raw) {
    raw = raw || {};
    var time = raw.time === undefined || raw.time === null || raw.time === '' ? DEFAULTS.time : String(raw.time);
    if (minutes(time) === null) return { ok: false, code: 'time' };
    var relay = String(raw.relay || '').trim().replace(/\/+$/, '');
    if (relay && !/^https:\/\/[^\s]+$/.test(relay)) return { ok: false, code: 'relay' };
    var vapid = String(raw.vapid || '').trim();
    if (vapid && !/^[A-Za-z0-9_-]{60,120}$/.test(vapid)) return { ok: false, code: 'vapid' };
    return { ok: true, settings: { enabled: !!raw.enabled, time: time, relay: relay, vapid: vapid } };
  }

  function two(n) { return (n < 10 ? '0' : '') + n; }
  /** Local calendar day of a Date as YYYY-MM-DD. */
  function localDay(d) { return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }

  /** Is a reminder due now? Enabled, past the chosen local time, no check-in today yet, not already reminded today. */
  function due(now, s, lastCheckin, lastNotified) {
    if (!s || !s.enabled) return false;
    var t = minutes(s.time); if (t === null) return false;
    var today = localDay(now);
    return now.getHours() * 60 + now.getMinutes() >= t && lastCheckin !== today && lastNotified !== today;
  }

  function text(lang) { return TEXT[lang] || TEXT.en; }

  var api = { DEFAULTS: DEFAULTS, TEXT: TEXT, minutes: minutes, clean: clean, localDay: localDay, due: due, text: text };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Remind = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
