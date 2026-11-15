'use strict';
const assert = require('assert');
const T = require('../js/trend.js');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('ok - ' + name); };
const e = (date, o) => Object.assign({ date }, o);

test('fewer than two dates -> null', () => {
  assert.strictEqual(T.changes([]), null); assert.strictEqual(T.changes([e('2027-01-01', { hr: 70 })]), null);
  assert.strictEqual(T.changes([e('2027-01-01', { hr: 70 }), e('2027-01-01', { sys: 110 })]), null);
});
test('status change green -> yellow is reported as worse, with both values', () => {
  const r = T.changes([e('2027-01-01', { hr: 70 }), e('2027-01-02', { hr: 110 })]);
  assert.strictEqual(r.latest, '2027-01-02'); assert.strictEqual(r.prev, '2027-01-01');
  assert.deepStrictEqual(r.items.map(i => [i.id, i.from, i.to, i.was, i.now, i.dir]), [['hr', 'ok', 'watch', 70, 110, 'worse']]);
  assert.strictEqual(r.worse, 1); assert.strictEqual(r.better, 0);
});
test('improvement is reported as better; unchanged and no-data indicators are left out; worst first', () => {
  const r = T.changes([e('2027-01-01', { hr: 130, spo2: 97, temp: 36.6 }), e('2027-01-02', { hr: 72, spo2: 85, temp: 36.7 })]);
  assert.deepStrictEqual(r.items.map(i => i.id + ':' + i.dir), ['spo2:worse', 'hr:better']); // spo2 ok->attention first; temp unchanged
  assert.strictEqual(r.worse, 1); assert.strictEqual(r.better, 1);
});
test('an indicator first measured today has no earlier status, so it is not a change', () => {
  const r = T.changes([e('2027-01-01', { hr: 70 }), e('2027-01-02', { hr: 70, sys: 200 })]);
  assert.deepStrictEqual(r.items, []);
});
console.log(n + ' trend tests passed');
