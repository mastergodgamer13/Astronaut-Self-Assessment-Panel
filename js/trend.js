/*
 * trend.js — "what changed since the previous check-in". Pure (no DOM).
 * Compares each indicator's status now with its status as it was at the previous check-in date.
 */
(function (root) {
  'use strict';
  var req = (typeof module !== 'undefined' && module.exports && typeof require === 'function');
  var Core = req ? require('./core.js') : root.Core;

  var ORDER = Core.STATUS_ORDER; // nodata < ok < watch < attention

  /**
   * entries: core.js entries [{date, ...}]. -> { latest, prev, items:[{id, from, to, was, now, dir:'worse'|'better'}], worse, better } or null
   * when there are fewer than two check-in dates. Indicators that had no data at one of the two moments are left out.
   */
  function changes(entries) {
    var dates = {}; (entries || []).forEach(function (e) { if (e && e.date) dates[e.date] = true; });
    var ds = Object.keys(dates).sort();
    if (ds.length < 2) return null;
    var latest = ds[ds.length - 1], prev = ds[ds.length - 2];
    var a = Core.assess(entries), b = Core.assess(entries.filter(function (e) { return e.date <= prev; }));
    var items = [];
    Core.INDICATORS.forEach(function (ind) {
      var now = a.per[ind.id], was = b.per[ind.id];
      if (now.status === 'nodata' || was.status === 'nodata' || now.status === was.status) return;
      var wasV = was.series.length ? was.series[was.series.length - 1].value : null, nowV = now.series.length ? now.series[now.series.length - 1].value : null;
      items.push({ id: ind.id, from: was.status, to: now.status, was: wasV, now: nowV, dir: ORDER[now.status] > ORDER[was.status] ? 'worse' : 'better' });
    });
    items.sort(function (x, y) { return ORDER[y.to] - ORDER[x.to]; });
    return { latest: latest, prev: prev, items: items,
      worse: items.filter(function (i) { return i.dir === 'worse'; }).length, better: items.filter(function (i) { return i.dir === 'better'; }).length };
  }

  var api = { changes: changes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trend = api;
})(typeof window !== 'undefined' ? window : globalThis);
