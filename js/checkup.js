/*
 * checkup.js — the guided check-up: one question per slide, a status per answer, and self-care actions. Pure (no DOM).
 *
 * SAFETY: statuses come from PROTOTYPE reference zones (core.js / immune.js), not from a diagnosis. Actions are general
 * self-care and "when to call" steps; there are no medicines or doses. Every red result says: contact the flight surgeon /
 * ground medical team now. All content needs review by a flight surgeon before real use.
 */
(function (root) {
  'use strict';
  var req = (typeof module !== 'undefined' && module.exports && typeof require === 'function');
  var Core = req ? require('./core.js') : root.Core;
  var Immune = req ? require('./immune.js') : root.Immune;

  // kind: vital (number, zones from Core.REFERENCE) | symptom (0-3) | redflag (yes/no) | lab (number, zones from Immune.REFERENCE, optional)
  var QUESTIONS = [
    { id: 'hr', kind: 'vital' }, { id: 'sys', kind: 'vital' }, { id: 'dia', kind: 'vital' }, { id: 'glucose', kind: 'vital' },
    { id: 'temp', kind: 'vital' }, { id: 'sleep', kind: 'vital' }, { id: 'mood', kind: 'vital' }, { id: 'exercise', kind: 'vital' },
    { id: 'fatigue', kind: 'symptom' }, { id: 'dizzy', kind: 'symptom' }, { id: 'vision', kind: 'symptom' }, { id: 'pain', kind: 'symptom' },
    { id: 'emergency', kind: 'redflag' },
    { id: 'wbc', kind: 'lab' }, { id: 'neut', kind: 'lab' }, { id: 'lymph', kind: 'lab' }
  ];

  // action ids (texts in i18n 'act.<id>'), by question and direction ('low' / 'high' / 'any')
  var ACTIONS = {
    hr:      { high: ['rest', 'breathe', 'hydrate', 'noCaffeine', 'remeasure'], low: ['remeasure', 'slowPosture', 'tellCrew'] },
    sys:     { high: ['rest', 'breathe', 'lessSalt', 'remeasure'], low: ['slowPosture', 'hydrate', 'remeasure'] },
    dia:     { high: ['rest', 'breathe', 'lessSalt', 'remeasure'], low: ['slowPosture', 'hydrate', 'remeasure'] },
    glucose: { high: ['remeasure', 'hydrate', 'lessSugar', 'exercise'], low: ['fastSugar', 'remeasure', 'tellCrew'] },
    temp:    { high: ['coolCabin', 'hydrate', 'rest', 'remeasure'], low: ['warm', 'remeasure', 'tellCrew'] },
    sleep:   { low: ['sleepSchedule', 'dimLight', 'noCaffeine', 'relax'], high: ['sleepSchedule', 'tellCrew'] },
    mood:    { low: ['talk', 'exercise', 'sleepSchedule', 'dailyLog'] },
    exercise: { low: ['exercise', 'stretch', 'nutrition', 'dailyLog'] },
    fatigue: { any: ['sleepSchedule', 'exercise', 'nutrition', 'hydrate'] },
    dizzy:   { any: ['sitDown', 'slowPosture', 'hydrate', 'tellCrew'] },
    vision:  { any: ['logVision', 'eyeTest', 'tellCrew'] },
    pain:    { any: ['exercise', 'stretch', 'nutrition', 'tellCrew'] },
    emergency: { any: ['stopActivity'] },
    wbc:     { low: ['hygiene', 'sleepSchedule', 'nutrition', 'reportLab'], high: ['rest', 'hydrate', 'hygiene', 'reportLab'] },
    neut:    { low: ['hygiene', 'sleepSchedule', 'nutrition', 'reportLab'], high: ['rest', 'hydrate', 'hygiene', 'reportLab'] },
    lymph:   { low: ['hygiene', 'sleepSchedule', 'nutrition', 'reportLab'], high: ['rest', 'hydrate', 'hygiene', 'reportLab'] }
  };

  function question(id) { return QUESTIONS.filter(function (q) { return q.id === id; })[0]; }

  /** Input limits for a number question (sanity limits only, not clinical). */
  function limits(q) {
    if (q.kind === 'vital') { var i = Core.getIndicator(q.id); return { min: i.min, max: i.max, step: i.step, integer: !!i.integer, unit: i.unit }; }
    if (q.kind === 'lab') { var a = Immune.ANALYTES[q.id], l = Immune.LIMITS[q.id]; return { min: l.min, max: l.max, step: a.decimals ? 0.1 : 1, integer: false, unit: a.unit }; }
    return null;
  }

  function zonesOf(q) { return q.kind === 'vital' ? Core.REFERENCE[q.id] : q.kind === 'lab' ? Immune.REFERENCE[q.id] : null; }

  /**
   * Parse and check one raw answer.
   * -> { ok:true, skipped:true } | { ok:true, value } | { ok:false, code:'notnum'|'range'|'integer'|'choice', min?, max? }
   */
  function parse(q, raw) {
    if (raw === undefined || raw === null || raw === '' || raw === 'skip') return { ok: true, skipped: true };
    if (q.kind === 'symptom') { var n = Number(raw); return [0, 1, 2, 3].indexOf(n) >= 0 ? { ok: true, value: n } : { ok: false, code: 'choice' }; }
    if (q.kind === 'redflag') return raw === 'yes' || raw === 'no' ? { ok: true, value: raw } : { ok: false, code: 'choice' };
    var v = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
    if (!isFinite(v)) return { ok: false, code: 'notnum' };
    var L = limits(q);
    if (v < L.min || v > L.max) return { ok: false, code: 'range', min: L.min, max: L.max };
    if (L.integer && Math.floor(v) !== v) return { ok: false, code: 'integer' };
    return { ok: true, value: v };
  }

  /** Status of one parsed value: { status, dir } with status in nodata|ok|watch|attention and dir in 'low'|'high'|'any'|null. */
  function evaluate(q, value) {
    if (value === undefined || value === null) return { status: 'nodata', dir: null };
    if (q.kind === 'symptom') return { status: value >= 3 ? 'attention' : value === 2 ? 'watch' : 'ok', dir: 'any' };
    if (q.kind === 'redflag') return { status: value === 'yes' ? 'attention' : 'ok', dir: 'any' };
    var z = zonesOf(q), status = Core.zoneOf(z, value);
    return { status: status, dir: value < z.ok[0] ? 'low' : value > z.ok[1] ? 'high' : null };
  }

  /** Action ids for a result. Red always starts with 'callSurgeon'. Green has none. */
  function advice(q, ev) {
    if (ev.status === 'ok' || ev.status === 'nodata') return [];
    var table = ACTIONS[q.id] || {}, list = (table[ev.dir] || table.any || []).slice();
    if (ev.status === 'attention') list.unshift('callSurgeon');
    return list;
  }

  /** answers: { id: raw }. -> { items:[{q, value, skipped, status, dir, actions}], overall, counts } with problems first. */
  function run(answers) {
    var items = QUESTIONS.map(function (q) {
      var p = parse(q, answers ? answers[q.id] : undefined), ev = p.ok && !p.skipped ? evaluate(q, p.value) : { status: 'nodata', dir: null };
      return { q: q, id: q.id, value: p.ok && !p.skipped ? p.value : null, skipped: !p.ok || !!p.skipped, status: ev.status, dir: ev.dir,
        actions: p.ok && !p.skipped ? advice(q, ev) : [] };
    });
    var counts = { ok: 0, watch: 0, attention: 0, nodata: 0 };
    items.forEach(function (i) { counts[i.status]++; });
    var order = Core.STATUS_ORDER;
    var sorted = items.slice().sort(function (a, b) { return order[b.status] - order[a.status]; });
    return { items: items, sorted: sorted, counts: counts, overall: Core.worstStatus(items.map(function (i) { return i.status; })) };
  }

  /** Daily check-in record (core.js entry) from the vital answers that were given, or null when there is none. */
  function toEntry(answers, date) {
    var raw = { date: date };
    QUESTIONS.forEach(function (q) { if (q.kind === 'vital' && answers && answers[q.id] !== undefined && answers[q.id] !== '') raw[q.id] = answers[q.id]; });
    var v = Core.validateEntry(raw);
    return v.ok ? v.entry : null;
  }

  /**
   * Real crew values for one question, from a crew table { C001: { id: [..] | { values:[..] } } } and the first post-flight index.
   * -> { n, pre:[min,max], post:[min,max] } (descriptive; 4 people) or null when the table has no such measurement.
   */
  function crewRange(crew, id, preN) {
    var pre = [], post = [];
    Object.keys(crew || {}).forEach(function (c) {
      var x = crew[c][id]; if (!x) return; var v = Array.isArray(x) ? x : x.values; if (!v) return;
      v.forEach(function (n, i) { if (typeof n !== 'number' || !isFinite(n)) return; if (i < preN) pre.push(n); else if (i === preN) post.push(n); });
    });
    if (!pre.length && !post.length) return null;
    var mm = function (a) { return a.length ? [Math.min.apply(null, a), Math.max.apply(null, a)] : null; };
    return { n: Object.keys(crew).length, pre: mm(pre), post: mm(post) };
  }

  var api = { QUESTIONS: QUESTIONS, ACTIONS: ACTIONS, question: question, limits: limits, zonesOf: zonesOf, parse: parse, evaluate: evaluate, advice: advice, run: run, toEntry: toEntry, crewRange: crewRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Checkup = api;
})(typeof window !== 'undefined' ? window : globalThis);
