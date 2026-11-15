// Run: node tests/checkup.test.js
const assert = require('assert');
const C = require('../js/checkup.js');
const Core = require('../js/core.js');
const Demo = require('../js/demo.js');
const P = require('../js/osd569.js');
const O = require('../js/osdr.js');
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok -', name); }
const Q = id => C.question(id);

test('45 slides: 26 vitals, 9 symptoms, 2 red-flags, 8 labs; every slide has an organ except the red flag', () => {
  const n = k => C.QUESTIONS.filter(q => q.kind === k).length;
  assert.deepStrictEqual([n('vital'), n('symptom'), n('redflag'), n('lab'), C.QUESTIONS.length], [26, 9, 2, 8, 45]);
});
test('parse: numbers with comma, limits, integers, choices, skipped', () => {
  assert.strictEqual(C.parse(Q('hr'), '72,5').value, 72.5);
  assert.deepStrictEqual(C.parse(Q('hr'), '5000'), { ok: false, code: 'range', min: 20, max: 250 });
  assert.strictEqual(C.parse(Q('hr'), 'abc').code, 'notnum');
  assert.strictEqual(C.parse(Q('mood'), '3.5').code, 'integer');
  assert.strictEqual(C.parse(Q('fatigue'), '2').value, 2); assert.strictEqual(C.parse(Q('fatigue'), '7').code, 'choice');
  assert.strictEqual(C.parse(Q('emergency'), 'yes').value, 'yes'); assert.strictEqual(C.parse(Q('emergency'), 'maybe').code, 'choice');
  assert.ok(C.parse(Q('wbc'), '').skipped); assert.ok(C.parse(Q('hr'), undefined).skipped);
});
test('evaluate: one value gives green / yellow / red and a direction', () => {
  assert.deepStrictEqual(C.evaluate(Q('hr'), 70), { status: 'ok', dir: null });
  assert.deepStrictEqual(C.evaluate(Q('hr'), 110), { status: 'watch', dir: 'high' });
  assert.deepStrictEqual(C.evaluate(Q('hr'), 30), { status: 'attention', dir: 'low' });
  assert.strictEqual(C.evaluate(Q('wbc'), 12).status, 'watch'); assert.strictEqual(C.evaluate(Q('wbc'), 2).dir, 'low');
  assert.strictEqual(C.evaluate(Q('fatigue'), 1).status, 'ok'); assert.strictEqual(C.evaluate(Q('fatigue'), 2).status, 'watch'); assert.strictEqual(C.evaluate(Q('fatigue'), 3).status, 'attention');
  assert.strictEqual(C.evaluate(Q('emergency'), 'yes').status, 'attention'); assert.strictEqual(C.evaluate(Q('emergency'), 'no').status, 'ok');
  assert.strictEqual(C.evaluate(Q('hr'), null).status, 'nodata');
});
test('advice: none for green/no data, red always starts with callSurgeon, no medicines', () => {
  assert.deepStrictEqual(C.advice(Q('hr'), { status: 'ok', dir: null }), []);
  assert.deepStrictEqual(C.advice(Q('hr'), { status: 'nodata', dir: null }), []);
  const red = C.advice(Q('temp'), C.evaluate(Q('temp'), 39)); assert.strictEqual(red[0], 'callSurgeon'); assert.ok(red.includes('coolCabin'));
  assert.ok(C.advice(Q('glucose'), C.evaluate(Q('glucose'), 60)).includes('fastSugar'));
  assert.deepStrictEqual(C.advice(Q('emergency'), C.evaluate(Q('emergency'), 'yes')), ['callSurgeon', 'stopActivity']);
  C.QUESTIONS.forEach(q => { const t = C.ACTIONS[q.id]; assert.ok(t, q.id); Object.keys(t).forEach(d => t[d].forEach(a => assert.ok(/^[a-zA-Z]+$/.test(a)))); });
});
test('every non-green case of every question has actions (low and high where possible)', () => {
  C.QUESTIONS.forEach(q => {
    const z = C.zonesOf(q);
    if (q.kind === 'vital' && !z) return; // baseline-only slides have no zones
    const cases = q.kind === 'symptom' ? [2, 3] : q.kind === 'redflag' ? ['yes'] : [z.ok[0] - 0.01, z.watch[0] - 5, z.ok[1] + 0.01, z.watch[1] + 5];
    let nonOk = 0;
    cases.forEach(v => { const ev = C.evaluate(q, v); if (ev.status === 'ok') return; nonOk++; assert.ok(C.advice(q, ev).length > 0, q.id + ' ' + v); });
    assert.ok(nonOk >= 1, q.id);
  });
});
test('run: guided demo astronaut is mostly green with yellow cases and one red', () => {
  const r = C.run(Demo.guided());
  assert.strictEqual(r.overall, 'attention'); assert.deepStrictEqual(r.counts, { ok: 30, watch: 10, attention: 1, nodata: 4 });
  assert.strictEqual(r.sorted[0].id, 'temp'); assert.ok(r.items.find(i => i.id === 'lymph').skipped);
});
test('run: nothing answered is nodata, never ok', () => {
  const r = C.run({}); assert.strictEqual(r.overall, 'nodata'); assert.strictEqual(r.counts.ok, 0); assert.strictEqual(r.counts.nodata, 45);
});
test('toEntry: only the vitals that were answered; null when none', () => {
  assert.deepStrictEqual(C.toEntry({ hr: 72, sys: '138', mood: 2, exercise: 45, fatigue: 3, wbc: 9 }, '2026-11-14'), { date: '2026-11-14', hr: 72, sys: 138, mood: 2, exercise: 45 });
  assert.strictEqual(C.toEntry({ fatigue: 3 }, '2026-11-14'), null);
  assert.strictEqual(C.toEntry({ hr: 5000 }, '2026-11-14'), null);
});
test('crewRange: real OSD-569 and OSD-575 crew values (descriptive)', () => {
  const w = C.crewRange(P.CREW, 'wbc', P.PRE); assert.strictEqual(w.n, 4); assert.ok(w.pre[0] <= w.pre[1] && w.post[0] <= w.post[1]);
  const g = C.crewRange(O.CREW, 'glucose', O.PRE); assert.deepStrictEqual(g.pre, [56, 100]); assert.strictEqual(C.crewRange(O.CREW, 'hr', 3), null);
});
test('dashboard demo story: blood pressure creeps up and the last two days have a fever', () => {
  const d = Demo.generate(2026, 30); const avg = a => a.reduce((x, e) => x + e.sys, 0) / a.length; assert.ok(avg(d.slice(-3)) > avg(d.slice(0, 10)) + 8); assert.ok(d[29].temp > 38 && d[28].temp > 38 && d[27].temp < 37.5);
  assert.ok(d.every(e => e.dia <= e.sys - 20));
});
test('every action and question text exists in all four languages', () => {
  const I = require('../js/i18n.js'); const acts = new Set(); Object.values(C.ACTIONS).forEach(t => Object.values(t).forEach(l => l.forEach(a => acts.add(a))));
  ['en', 'tr', 'it', 'es'].forEach(l => {
    const D = I.DICT[l];
    acts.forEach(a => assert.ok(D['act.' + a], l + ' act.' + a));
    C.QUESTIONS.forEach(q => { if (q.kind === 'symptom' || q.kind === 'redflag') { assert.ok(D['cu.q.' + q.id + '.ask'], l + q.id); assert.ok(D['cu.q.' + q.id + '.help'], l + q.id); } if (q.kind === 'vital') assert.ok(D['ind.' + q.id] && D['info.' + q.id + '.how'], l + q.id); if (q.kind === 'lab') assert.ok(D[q.panel ? 'lab.' + q.id : 'o9.a.' + q.id] && (!q.panel || D['region.' + q.organ + '.title']), l + q.id); });
  });
});
console.log(n + ' checkup tests passed');

test('new organ slides: each organ region has its own questions, all question ids have text', () => {
  const organs = new Set(C.QUESTIONS.filter(q => q.kind !== 'redflag').map(q => q.organ));
  ['lungs', 'kidneys', 'gut', 'mind', 'heart', 'bones'].forEach(o => assert.ok(organs.has(o), o));
  assert.strictEqual(C.evaluate(Q('spo2'), 97).status, 'ok');
  assert.strictEqual(C.evaluate(Q('spo2'), 92).status, 'watch');
  assert.strictEqual(C.evaluate(Q('spo2'), 85).status, 'attention');
  assert.strictEqual(C.evaluate(Q('urine'), 7).status, 'attention');
  assert.strictEqual(C.evaluate(Q('fluids'), 0.5).status, 'attention');
  assert.ok(C.advice(Q('spo2'), C.evaluate(Q('spo2'), 92)).includes('checkAir'));
  assert.ok(C.advice(Q('fluids'), C.evaluate(Q('fluids'), 1.0)).includes('drinkMore'));
});

test('baseline-only slides (reaction, grip) are recorded without a colour and do not crash', () => {
  ['reaction', 'grip'].forEach(id => {
    const ev = C.evaluate(Q(id), 300);
    assert.strictEqual(ev.status, 'nodata'); assert.strictEqual(ev.baselineOnly, true);
    assert.deepStrictEqual(C.advice(Q(id), ev), []);
  });
});

test('own-usual comparison: reaction slower / grip weaker / breath-hold shorter than usual by >10 % yellow, >20 % red', () => {
  assert.strictEqual(C.evaluate(Q('reaction'), 300, 290).status, 'ok');
  assert.strictEqual(C.evaluate(Q('reaction'), 330, 290).status, 'watch');
  assert.strictEqual(C.evaluate(Q('reaction'), 400, 290).status, 'attention');
  assert.strictEqual(C.evaluate(Q('reaction'), 250, 290).status, 'ok'); // faster is fine
  assert.strictEqual(C.evaluate(Q('grip'), 28, 35).status, 'watch');
  assert.strictEqual(C.evaluate(Q('grip'), 25, 35).status, 'attention');
  assert.strictEqual(C.evaluate(Q('breathhold'), 20, 32).status, 'attention');
  assert.ok(C.advice(Q('grip'), C.evaluate(Q('grip'), 28, 35)).includes('stretch'));
  assert.strictEqual(C.evaluate(Q('grip'), 28, '').status, 'nodata'); // no usual value: no colour
});

test('reactionMedian: median of valid taps, needs 3, ignores nonsense', () => {
  assert.strictEqual(C.reactionMedian([300, 250, 400, 280, 310]), 300);
  assert.strictEqual(C.reactionMedian([300, 250, 400, 280]), 290);
  assert.strictEqual(C.reactionMedian([300, 250]), null);
  assert.strictEqual(C.reactionMedian([300, 5, null, 250, 20000, 260]), 260);
  assert.strictEqual(C.reactionMedian(), null);
});

test('metabolic-panel labs: zones come from the NASA lab range, kidney and liver slides are optional', () => {
  const Q2 = id => C.question(id);
  assert.strictEqual(C.evaluate(Q2('creatinine'), 1.0).status, 'ok');
  assert.strictEqual(C.evaluate(Q2('creatinine'), 1.5).status, 'watch');
  assert.strictEqual(C.evaluate(Q2('creatinine'), 2.5).status, 'attention');
  assert.strictEqual(C.evaluate(Q2('egfr'), 50).status, 'watch');
  assert.strictEqual(C.evaluate(Q2('alt'), 100).status, 'attention');
  assert.strictEqual(C.parse(Q2('alt'), '').skipped, true);
  assert.ok(C.advice(Q2('creatinine'), C.evaluate(Q2('creatinine'), 1.5)).includes('reportLab'));
  assert.strictEqual(C.parse(Q2('creatinine'), '99').ok, false);
});
