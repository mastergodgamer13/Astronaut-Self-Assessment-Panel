/*
 * crewlive.js — reads the real Inspiration4 crew blood-test tables from NASA OSDR and turns them into ranges.
 * Files (confirmed live, same layout): OSD-575 "...CMP.upload_SUBMITTED.csv" (metabolic panel) and OSD-569 "...CBC.upload_SUBMITTED.csv" (blood count).
 * Columns: ANALYTE,VALUE,RANGE_MIN,RANGE_MAX,UNITS,TEST_TYPE,SUBJECT_ID,SEX,<time point>. Time points: L-92, L-44, L-3 (pre-flight), R+1 ... (after return).
 * Pure: the network function is injected, so it is testable without internet. Read-only; nothing is stored.
 */
(function (root) {
  'use strict';

  var SOURCES = [
    { study: 'OSD-575', file: /CMP\.upload_SUBMITTED\.csv$/i, names: {
      'GLUCOSE': 'glucose', 'CREATININE': 'creatinine', 'UREA NITROGEN (BUN)': 'bun', 'EGFR NON-AFR. AMERICAN': 'egfr', 'ALT': 'alt', 'AST': 'ast' } },
    { study: 'OSD-569', file: /CBC\.upload_SUBMITTED\.csv$/i, names: {
      'WHITE BLOOD CELL COUNT': 'wbc', 'ABSOLUTE NEUTROPHILS': 'neut', 'ABSOLUTE LYMPHOCYTES': 'lymph' } }
  ];

  function splitLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '"') q = !q; else if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out;
  }

  /** CSV text -> [{ analyte, value, lo, hi, unit, subject, tp }]. Rows with a non-numeric value (NA) are dropped. */
  function parseCsv(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return [];
    var head = splitLine(lines[0]).map(function (h) { return h.trim().toUpperCase(); });
    var ix = function (n) { return head.indexOf(n); };
    var iA = ix('ANALYTE'), iV = ix('VALUE'), iL = ix('RANGE_MIN'), iH = ix('RANGE_MAX'), iU = ix('UNITS'), iS = ix('SUBJECT_ID');
    var iT = head.length - 1; // last column holds the time point (header is TEST_DATE or timepoint)
    if (iA < 0 || iV < 0 || iS < 0) return [];
    var num = function (s) { var n = Number(String(s).trim()); return String(s).trim() !== '' && isFinite(n) ? n : null; };
    var rows = [];
    lines.slice(1).forEach(function (l) {
      var c = splitLine(l), v = num(c[iV]);
      if (v === null) return;
      rows.push({ analyte: String(c[iA]).trim().toUpperCase(), value: v, lo: num(c[iL]), hi: num(c[iH]), unit: String(c[iU] || '').trim(), subject: String(c[iS]).trim(), tp: String(c[iT]).trim() });
    });
    return rows;
  }

  function isPre(tp) { return /^L-/i.test(tp); }
  function isFirstPost(tp) { return /^R\+1$/i.test(tp); }
  function mm(a) { return a.length ? [Math.min.apply(null, a), Math.max.apply(null, a)] : null; }

  /** rows + name map -> { id: { unit, lo, hi, n, pre:[min,max]|null, post:[min,max]|null } } (post = first time point after return, R+1). */
  function rangesFromRows(rows, names) {
    var out = {};
    rows.forEach(function (r) {
      var id = names[r.analyte]; if (!id) return;
      var o = out[id] = out[id] || { unit: r.unit, lo: r.lo, hi: r.hi, subjects: {}, pre: [], post: [] };
      o.subjects[r.subject] = true;
      if (isPre(r.tp)) o.pre.push(r.value); else if (isFirstPost(r.tp)) o.post.push(r.value);
    });
    Object.keys(out).forEach(function (id) {
      var o = out[id]; out[id] = { unit: o.unit, lo: o.lo, hi: o.hi, n: Object.keys(o.subjects).length, pre: mm(o.pre), post: mm(o.post) };
    });
    return out;
  }

  function getJson(fetchFn, url) {
    return Promise.resolve().then(function () { return fetchFn(url); }).then(function (res) {
      if (!res || !res.ok) throw new Error('http ' + (res && res.status));
      return res.json();
    });
  }
  function getText(fetchFn, url) {
    return Promise.resolve().then(function () { return fetchFn(url); }).then(function (res) {
      if (res && res.ok) return res.text();
      var code = 'http ' + (res && res.status);
      // an old relay answers file downloads with its own 404 text ("Only /osdr/..., /geode-py/..."); say so instead of a bare 404
      return Promise.resolve(res && res.text ? res.text() : '').catch(function () { return ''; }).then(function (body) {
        throw new Error(res && res.status === 404 && /Only \/osdr\//.test(String(body)) ? 'old-relay' : code);
      });
    });
  }

  /**
   * Live load. Live = live.js module (filesUrl, normalizeFiles, getBase, DIRECT). File links are rebuilt on the relay address.
   * Resolves { ok, ranges, studies:[ids loaded], errors:[{study, message}] }; never rejects.
   */
  function load(fetchFn, Live) {
    var ranges = {}, studies = [], errors = [];
    return Promise.all(SOURCES.map(function (src) {
      return getJson(fetchFn, Live.filesUrl(src.study)).then(function (j) {
        var f = Live.normalizeFiles(j, src.study).filter(function (x) { return src.file.test(x.name); })[0];
        if (!f || !f.url) throw new Error('file not found');
        var url = f.url.indexOf(Live.DIRECT) === 0 ? Live.getBase() + f.url.slice(Live.DIRECT.length) : f.url;
        return getText(fetchFn, url);
      }).then(function (text) {
        var r = rangesFromRows(parseCsv(text), src.names), ids = Object.keys(r);
        if (!ids.length) throw new Error('no known analytes');
        ids.forEach(function (id) { r[id].src = src.study; ranges[id] = r[id]; });
        studies.push(src.study);
      }).catch(function (e) { errors.push({ study: src.study, message: String(e && e.message || e) }); });
    })).then(function () { return { ok: studies.length > 0, ranges: ranges, studies: studies.sort(), errors: errors }; });
  }

  var api = { SOURCES: SOURCES, parseCsv: parseCsv, rangesFromRows: rangesFromRows, load: load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Crewlive = api;
})(typeof window !== 'undefined' ? window : globalThis);
