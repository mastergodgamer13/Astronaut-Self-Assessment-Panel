/*
 * mission.js — customizable pre-flight / post-flight periods. Pure (no DOM).
 * A time point is "L-<days>" (days before launch) or "R+<days>" (days after return), any number of days from 0 to 3650.
 * Each astronaut has their own mission: optional launch and return dates (to turn a date into a time point) and how many
 * pre-flight values are needed before a change against the baseline is judged.
 */
(function (root) {
  'use strict';
  var MAX_DAYS = 3650, DAY = 86400000;

  /** 'L-30' -> { phase: 'pre', days: 30 }; 'R+45' -> { phase: 'post', days: 45 }; anything else -> null. */
  function parseTp(label) {
    var m = /^(L-|R\+)(\d{1,4})$/.exec(String(label === undefined || label === null ? '' : label).trim());
    if (!m) return null;
    var d = Number(m[2]); if (d > MAX_DAYS) return null;
    return { phase: m[1] === 'L-' ? 'pre' : 'post', days: d };
  }
  function makeTp(phase, days) {
    var d = Number(days);
    if ((phase !== 'pre' && phase !== 'post') || !isFinite(d) || Math.floor(d) !== d || d < 0 || d > MAX_DAYS) return null;
    return (phase === 'pre' ? 'L-' : 'R+') + d;
  }
  /** Time order: earliest pre-flight first (largest L-), then post-flight by days after return. Invalid labels are dropped. */
  function sortTps(list) {
    return (list || []).filter(function (t) { return parseTp(t); }).sort(function (a, b) {
      var x = parseTp(a), y = parseTp(b);
      if (x.phase !== y.phase) return x.phase === 'pre' ? -1 : 1;
      return x.phase === 'pre' ? y.days - x.days : x.days - y.days;
    });
  }

  function isoDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
  }

  /** Mission settings as typed -> { ok, mission:{launch, ret, minPre} } | { ok:false, code }. Dates are optional; return must be after launch. */
  function cleanMission(raw) {
    raw = raw || {};
    var L = raw.launch === undefined || raw.launch === null || raw.launch === '' ? null : String(raw.launch);
    var R = raw.ret === undefined || raw.ret === null || raw.ret === '' ? null : String(raw.ret);
    if ((L !== null && isoDay(L) === null) || (R !== null && isoDay(R) === null)) return { ok: false, code: 'date' };
    if (L !== null && R !== null && isoDay(R) <= isoDay(L)) return { ok: false, code: 'order' };
    var mp = raw.minPre === undefined || raw.minPre === null || raw.minPre === '' ? 3 : Number(raw.minPre);
    if (!isFinite(mp) || Math.floor(mp) !== mp || mp < 1 || mp > 10) return { ok: false, code: 'minPre' };
    return { ok: true, mission: { launch: L, ret: R, minPre: mp } };
  }

  /**
   * Which time point does a calendar date belong to?
   * -> { phase: 'pre', days, tp } before launch | { phase: 'post', days, tp } on or after return | { phase: 'flight', days } in between | null (dates missing/invalid).
   * The launch day counts as L-0 and the return day as R+0.
   */
  function tpFromDate(date, mission) {
    var d = isoDay(date); if (d === null || !mission) return null;
    var L = isoDay(mission.launch), R = isoDay(mission.ret);
    if (L !== null && d <= L) { var a = Math.round((L - d) / DAY); return a <= MAX_DAYS ? { phase: 'pre', days: a, tp: makeTp('pre', a) } : null; }
    if (R !== null && d >= R) { var b = Math.round((d - R) / DAY); return b <= MAX_DAYS ? { phase: 'post', days: b, tp: makeTp('post', b) } : null; }
    if (L !== null && R !== null) return { phase: 'flight', days: Math.round((d - L) / DAY) };
    return null;
  }

  var api = { MAX_DAYS: MAX_DAYS, parseTp: parseTp, makeTp: makeTp, sortTps: sortTps, cleanMission: cleanMission, tpFromDate: tpFromDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Mission = api;
})(typeof window !== 'undefined' ? window : globalThis);
