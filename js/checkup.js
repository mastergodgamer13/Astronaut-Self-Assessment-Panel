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
    { id: 'hr', kind: 'vital', organ: 'heart' }, { id: 'sys', kind: 'vital', organ: 'heart' }, { id: 'dia', kind: 'vital', organ: 'heart' },
    { id: 'spo2', kind: 'vital', organ: 'lungs' }, { id: 'rr', kind: 'vital', organ: 'lungs' },
    { id: 'dyspnea', kind: 'vital', organ: 'lungs' }, { id: 'cough', kind: 'vital', organ: 'lungs' }, { id: 'breathhold', kind: 'vital', organ: 'lungs' },
    { id: 'sleep', kind: 'vital', organ: 'mind' }, { id: 'mood', kind: 'vital', organ: 'mind' }, { id: 'headache', kind: 'vital', organ: 'mind' },
    { id: 'reaction', kind: 'vital', organ: 'mind' }, { id: 'dizzy', kind: 'symptom', organ: 'mind' }, { id: 'vision', kind: 'symptom', organ: 'mind' },
    { id: 'urine', kind: 'vital', organ: 'kidneys' }, { id: 'fluids', kind: 'vital', organ: 'kidneys' },
    { id: 'urinations', kind: 'vital', organ: 'kidneys' },
    { id: 'creatinine', kind: 'lab', panel: 'cmp', organ: 'kidneys' }, { id: 'bun', kind: 'lab', panel: 'cmp', organ: 'kidneys' }, { id: 'egfr', kind: 'lab', panel: 'cmp', organ: 'kidneys' }, { id: 'swelling', kind: 'vital', organ: 'kidneys' }, { id: 'wtchange', kind: 'vital', organ: 'kidneys' }, { id: 'flank', kind: 'symptom', organ: 'kidneys' },
    { id: 'meals', kind: 'vital', organ: 'gut' }, { id: 'discomfort', kind: 'vital', organ: 'gut' },
    { id: 'nausea', kind: 'vital', organ: 'gut' }, { id: 'appetite', kind: 'vital', organ: 'gut' }, { id: 'stools', kind: 'vital', organ: 'gut' },
    { id: 'alt', kind: 'lab', panel: 'cmp', organ: 'liver' }, { id: 'ast', kind: 'lab', panel: 'cmp', organ: 'liver' },
    { id: 'glucose', kind: 'vital', organ: 'metabolism' }, { id: 'temp', kind: 'vital', organ: 'whole' },
    { id: 'exercise', kind: 'vital', organ: 'bones' }, { id: 'grip', kind: 'vital', organ: 'bones' },
    { id: 'pain', kind: 'symptom', organ: 'bones' }, { id: 'fatigue', kind: 'symptom', organ: 'bones' },
    { id: 'eyes', kind: 'symptom', organ: 'mind' }, { id: 'hearing', kind: 'symptom', organ: 'mind' },
    { id: 'skin', kind: 'symptom', organ: 'whole' }, { id: 'teeth', kind: 'symptom', organ: 'whole' },
    { id: 'radiation', kind: 'redflag', organ: null },
    { id: 'emergency', kind: 'redflag', organ: null },
    { id: 'wbc', kind: 'lab', organ: 'immune' }, { id: 'neut', kind: 'lab', organ: 'immune' }, { id: 'lymph', kind: 'lab', organ: 'immune' },
    { id: 'il6', kind: 'lab', panel: 'cyt', organ: 'immune' }, { id: 'tnfa', kind: 'lab', panel: 'cyt', organ: 'immune' }, { id: 'il8', kind: 'lab', panel: 'cyt', organ: 'immune' },
    { id: 'il10', kind: 'lab', panel: 'cyt', organ: 'immune' }, { id: 'mcp1', kind: 'lab', panel: 'cyt', organ: 'immune' }, { id: 'vegfa', kind: 'lab', panel: 'cyt', organ: 'immune' }
  ];

  // Cytokines (optional blood-test values, pg/mL). NO normal range exists in the NASA file and values swing a lot from day to day, so they are judged only
  // against the person's OWN usual value: yellow at 2x or more, never red on their own (prototype cut-off, needs review).
  var CYT = {
    il6:   { unit: 'pg/mL', min: 0.01, max: 100000, step: 0.01 }, tnfa:  { unit: 'pg/mL', min: 0.01, max: 100000, step: 0.01 },
    il8:   { unit: 'pg/mL', min: 0.01, max: 100000, step: 0.01 }, il10:  { unit: 'pg/mL', min: 0.01, max: 100000, step: 0.01 },
    mcp1:  { unit: 'pg/mL', min: 0.01, max: 100000, step: 0.01 }, vegfa: { unit: 'pg/mL', min: 0.01, max: 100000, step: 0.01 }
  };
  var FOLD = { watch: 2 };

  // Metabolic-panel labs (optional). Lab range = the range printed in the NASA file (OSD-575 CMP); yellow zone = that range widened by half its width (prototype).
  var CMP = {
    creatinine: { unit: 'mg/dL', min: 0.1, max: 15, step: 0.01, ok: [0.6, 1.35], watch: [0.4, 1.7] },
    bun:        { unit: 'mg/dL', min: 1, max: 200, step: 1, ok: [7, 25], watch: [3, 35] },
    egfr:       { unit: 'mL/min/1.73m²', min: 5, max: 200, step: 1, ok: [60, 200], watch: [45, 200] },
    alt:        { unit: 'U/L', min: 1, max: 2000, step: 1, ok: [9, 46], watch: [0, 65] },
    ast:        { unit: 'U/L', min: 1, max: 2000, step: 1, ok: [10, 40], watch: [0, 55] }
  };

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
    creatinine: { low: ['drinkMore', 'reportLab'], high: ['drinkMore', 'rest', 'reportLab'] },
    bun:     { low: ['nutrition', 'reportLab'], high: ['drinkMore', 'rest', 'reportLab'] },
    egfr:    { any: ['drinkMore', 'rest', 'reportLab'] },
    alt:     { any: ['rest', 'hydrate', 'reportLab'] },
    ast:     { any: ['rest', 'hydrate', 'reportLab'] },
    breathhold: { low: ['rest', 'breathe', 'checkAir', 'tellCrew'] },
    reaction: { high: ['rest', 'sleepSchedule', 'hydrate', 'checkAir', 'tellCrew'] },
    grip: { low: ['exercise', 'stretch', 'nutrition', 'tellCrew'] },
    dyspnea: { high: ['sitUpright', 'breathe', 'checkAir', 'tellCrew'] },
    cough:   { high: ['hydrate', 'checkAir', 'hygiene', 'tellCrew'] },
    urinations: { low: ['drinkMore', 'tellCrew'], high: ['dailyLog', 'tellCrew'] },
    swelling: { high: ['rest', 'lessSalt', 'tellCrew'] },
    wtchange: { low: ['nutrition', 'drinkMore', 'tellCrew'], high: ['lessSalt', 'tellCrew'] },
    nausea:  { high: ['smallMeals', 'hydrate', 'rest', 'tellCrew'] },
    appetite: { high: ['smallMeals', 'nutrition', 'tellCrew'] },
    stools:  { low: ['hydrate', 'exercise', 'dailyLog', 'tellCrew'], high: ['hydrate', 'hygiene', 'tellCrew'] }, // baseline-only: recorded, no fixed zones, no actions
    spo2:    { low: ['sitUpright', 'breathe', 'checkAir', 'remeasure', 'tellCrew'] },
    rr:      { high: ['rest', 'breathe', 'checkAir', 'remeasure'], low: ['remeasure', 'tellCrew'] },
    headache: { high: ['rest', 'hydrate', 'checkAir', 'tellCrew'] },
    urine:   { high: ['drinkMore', 'remeasure'] },
    fluids:  { low: ['drinkMore', 'dailyLog'] },
    flank:   { any: ['drinkMore', 'rest', 'tellCrew'] },
    meals:   { low: ['smallMeals', 'nutrition', 'tellCrew'] },
    discomfort: { high: ['smallMeals', 'hydrate', 'rest', 'tellCrew'] },
    fatigue: { any: ['sleepSchedule', 'exercise', 'nutrition', 'hydrate'] },
    dizzy:   { any: ['sitDown', 'slowPosture', 'hydrate', 'tellCrew'] },
    vision:  { any: ['logVision', 'eyeTest', 'tellCrew'] },
    pain:    { any: ['exercise', 'stretch', 'nutrition', 'tellCrew'] },
    eyes:    { any: ['restEyes', 'logVision', 'eyeTest', 'tellCrew'] },
    hearing: { any: ['quietPlace', 'logHearing', 'tellCrew'] },
    skin:    { any: ['cleanSkin', 'logSkin', 'tellCrew'] },
    teeth:   { any: ['brushTeeth', 'logTeeth', 'tellCrew'] },
    radiation: { any: ['shelter', 'tellCrew'] },
    emergency: { any: ['stopActivity'] },
    wbc:     { low: ['hygiene', 'sleepSchedule', 'nutrition', 'reportLab'], high: ['rest', 'hydrate', 'hygiene', 'reportLab'] },
    neut:    { low: ['hygiene', 'sleepSchedule', 'nutrition', 'reportLab'], high: ['rest', 'hydrate', 'hygiene', 'reportLab'] },
    il6:     { high: ['rest', 'hydrate', 'hygiene', 'reportLab'] }, tnfa: { high: ['rest', 'hydrate', 'hygiene', 'reportLab'] }, il8: { high: ['rest', 'hydrate', 'hygiene', 'reportLab'] },
    il10:    { high: ['rest', 'hydrate', 'hygiene', 'reportLab'] }, mcp1: { high: ['rest', 'hydrate', 'hygiene', 'reportLab'] }, vegfa: { high: ['rest', 'hydrate', 'hygiene', 'reportLab'] },
    lymph:   { low: ['hygiene', 'sleepSchedule', 'nutrition', 'reportLab'], high: ['rest', 'hydrate', 'hygiene', 'reportLab'] }
  };

  function question(id) { return QUESTIONS.filter(function (q) { return q.id === id; })[0]; }

  /** Input limits for a number question (sanity limits only, not clinical). */
  function limits(q) {
    if (q.kind === 'vital') { var i = Core.getIndicator(q.id); return { min: i.min, max: i.max, step: i.step, integer: !!i.integer, unit: i.unit }; }
    if (q.panel === 'cyt') { var y = CYT[q.id]; return { min: y.min, max: y.max, step: y.step, integer: false, unit: y.unit }; }
    if (q.panel === 'cmp') { var c = CMP[q.id]; return { min: c.min, max: c.max, step: c.step, integer: false, unit: c.unit }; }
    if (q.kind === 'lab') { var a = Immune.ANALYTES[q.id], l = Immune.LIMITS[q.id]; return { min: l.min, max: l.max, step: a.decimals ? 0.1 : 1, integer: false, unit: a.unit }; }
    return null;
  }

  function zonesOf(q) { return q.panel === 'cyt' ? null : q.panel === 'cmp' ? { ok: CMP[q.id].ok, watch: CMP[q.id].watch } : q.kind === 'vital' ? Core.REFERENCE[q.id] || null : q.kind === 'lab' ? Immune.REFERENCE[q.id] : null; }

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
  // Measurements with no fixed normal range: judged against the person's OWN usual value (percent change in the worse direction).
  var WORSE = { reaction: 'high', grip: 'low', breathhold: 'low' };
  var PCT = { watch: 0.10, attention: 0.20 }; // prototype cut-offs, need review

  function evaluate(q, value, usual) {
    if (value === undefined || value === null) return { status: 'nodata', dir: null };
    if (q.kind === 'symptom') return { status: value >= 3 ? 'attention' : value === 2 ? 'watch' : 'ok', dir: 'any' };
    if (q.kind === 'redflag') return { status: value === 'yes' ? 'attention' : 'ok', dir: 'any' };
    var z = zonesOf(q);
    if (!z) {
      var u = Number(usual);
      if (q.panel === 'cyt') { // fold change against the person's own usual value; high only
        if (!(u > 0)) return { status: 'nodata', dir: null, baselineOnly: true };
        var fold = value / u, up = fold >= FOLD.watch;
        return { status: up ? 'watch' : 'ok', dir: up ? 'high' : null, baselineOnly: true, usual: u, pct: Math.round((fold - 1) * 100), fold: Math.round(fold * 10) / 10 };
      }
      if (!WORSE[q.id] || !(u > 0)) return { status: 'nodata', dir: null, baselineOnly: true };
      var pct = (value - u) / u, worse = WORSE[q.id] === 'high' ? pct : -pct; // positive = worse than usual
      return { status: worse > PCT.attention ? 'attention' : worse > PCT.watch ? 'watch' : 'ok', dir: worse > PCT.watch ? WORSE[q.id] : null, baselineOnly: true, usual: u, pct: Math.round(pct * 100) };
    }
    var status = Core.zoneOf(z, value);
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
      var p = parse(q, answers ? answers[q.id] : undefined), ev = p.ok && !p.skipped ? evaluate(q, p.value, answers ? answers['usual_' + q.id] : undefined) : { status: 'nodata', dir: null };
      return { q: q, id: q.id, value: p.ok && !p.skipped ? p.value : null, skipped: !p.ok || !!p.skipped, status: ev.status, dir: ev.dir,
        actions: p.ok && !p.skipped ? advice(q, ev) : [] };
    });
    var counts = { ok: 0, watch: 0, attention: 0, nodata: 0 };
    items.forEach(function (i) { counts[i.status]++; });
    var order = Core.STATUS_ORDER;
    var sorted = items.slice().sort(function (a, b) { return order[b.status] - order[a.status]; });
    return { items: items, sorted: sorted, counts: counts, overall: Core.worstStatus(items.map(function (i) { return i.status; })) };
  }

  /** Median reaction time (ms) of tap trials; early taps (null) are ignored. Needs at least 3 valid trials, else null. */
  function reactionMedian(trials) {
    var v = (trials || []).filter(function (x) { return typeof x === 'number' && isFinite(x) && x >= 80 && x <= 2000; }).sort(function (a, b) { return a - b; });
    if (v.length < 3) return null;
    var m = Math.floor(v.length / 2);
    return Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
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

  var api = { FOLD: FOLD, CYT: CYT, PCT: PCT, QUESTIONS: QUESTIONS, ACTIONS: ACTIONS, question: question, limits: limits, zonesOf: zonesOf, parse: parse, evaluate: evaluate, advice: advice, run: run, toEntry: toEntry, reactionMedian: reactionMedian, crewRange: crewRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Checkup = api;
})(typeof window !== 'undefined' ? window : globalThis);
