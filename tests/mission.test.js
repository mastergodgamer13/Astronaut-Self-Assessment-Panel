'use strict';
const assert = require('assert'); const M = require('../js/mission.js'); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok - ' + name); };
test('parseTp / makeTp: any number of days before launch or after return', () => {
  assert.deepStrictEqual(M.parseTp('L-92'), { phase: 'pre', days: 92 }); assert.deepStrictEqual(M.parseTp('R+1'), { phase: 'post', days: 1 });
  assert.deepStrictEqual(M.parseTp('L-0'), { phase: 'pre', days: 0 }); assert.deepStrictEqual(M.parseTp(' R+3650 '), { phase: 'post', days: 3650 });
  ['', 'L92', 'L-', 'R+3651', 'x', 'L-1.5', 'L--3', null, undefined].forEach(x => assert.strictEqual(M.parseTp(x), null, String(x)));
  assert.strictEqual(M.makeTp('pre', 30), 'L-30'); assert.strictEqual(M.makeTp('post', 0), 'R+0');
  assert.strictEqual(M.makeTp('post', -1), null); assert.strictEqual(M.makeTp('post', 1.5), null); assert.strictEqual(M.makeTp('mid', 1), null); assert.strictEqual(M.makeTp('pre', 4000), null);
});
test('sortTps: earliest pre-flight first, then post-flight by days; invalid dropped', () => {
  assert.deepStrictEqual(M.sortTps(['R+45', 'L-3', 'bad', 'L-92', 'R+1', 'L-44']), ['L-92', 'L-44', 'L-3', 'R+1', 'R+45']);
  assert.deepStrictEqual(M.sortTps(['L-5', 'L-300', 'R+200', 'R+9']), ['L-300', 'L-5', 'R+9', 'R+200']);
});
test('cleanMission: optional dates, return after launch, minPre 1-10 (default 3)', () => {
  assert.deepStrictEqual(M.cleanMission({}), { ok: true, mission: { launch: null, ret: null, minPre: 3 } });
  assert.deepStrictEqual(M.cleanMission({ launch: '2027-03-01', ret: '2027-09-01', minPre: '5' }).mission, { launch: '2027-03-01', ret: '2027-09-01', minPre: 5 });
  assert.strictEqual(M.cleanMission({ launch: '2027-02-30' }).code, 'date'); assert.strictEqual(M.cleanMission({ launch: 'x' }).code, 'date');
  assert.strictEqual(M.cleanMission({ launch: '2027-03-01', ret: '2027-03-01' }).code, 'order'); assert.strictEqual(M.cleanMission({ launch: '2027-03-02', ret: '2027-03-01' }).code, 'order');
  assert.strictEqual(M.cleanMission({ minPre: 0 }).code, 'minPre'); assert.strictEqual(M.cleanMission({ minPre: 11 }).code, 'minPre'); assert.strictEqual(M.cleanMission({ minPre: 2.5 }).code, 'minPre');
});
test('tpFromDate: before launch, on/after return, in flight, missing dates', () => {
  const m = { launch: '2027-03-01', ret: '2027-09-01' };
  assert.deepStrictEqual(M.tpFromDate('2027-02-01', m), { phase: 'pre', days: 28, tp: 'L-28' });
  assert.strictEqual(M.tpFromDate('2027-03-01', m).tp, 'L-0');
  assert.strictEqual(M.tpFromDate('2027-09-01', m).tp, 'R+0'); assert.strictEqual(M.tpFromDate('2027-09-10', m).tp, 'R+9');
  assert.deepStrictEqual(M.tpFromDate('2027-06-01', m), { phase: 'flight', days: 92 });
  assert.strictEqual(M.tpFromDate('2027-06-01', { launch: '2027-03-01', ret: null }), null); // return unknown: cannot say
  assert.strictEqual(M.tpFromDate('2027-02-01', { launch: '2027-03-01', ret: null }).tp, 'L-28');
  assert.strictEqual(M.tpFromDate('bad', m), null); assert.strictEqual(M.tpFromDate('2027-06-01', null), null);
  assert.strictEqual(M.tpFromDate('2010-01-01', m), null); // more than 3650 days
});
console.log(n + ' mission tests passed');
