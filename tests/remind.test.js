'use strict';
const assert = require('assert'); const R = require('../js/remind.js'); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok - ' + name); };
test('clean: time HH:MM, https relay, base64url key; defaults filled', () => {
  assert.deepStrictEqual(R.clean({}).settings, { enabled: false, time: '08:00', relay: '', vapid: '' });
  const k = 'B'.repeat(87);
  assert.deepStrictEqual(R.clean({ enabled: 1, time: '21:30', relay: 'https://x.workers.dev/', vapid: k }).settings, { enabled: true, time: '21:30', relay: 'https://x.workers.dev', vapid: k });
  assert.strictEqual(R.clean({ time: '25:00' }).code, 'time'); assert.strictEqual(R.clean({ time: '8:00' }).code, 'time');
  assert.strictEqual(R.clean({ relay: 'http://x' }).code, 'relay'); assert.strictEqual(R.clean({ vapid: 'short!' }).code, 'vapid');
});
test('due: only when enabled, after the time, no check-in today, not yet reminded today', () => {
  const s = { enabled: true, time: '08:00' }, at = (h, m) => new Date(2027, 2, 10, h, m);
  assert.strictEqual(R.due(at(7, 59), s, null, null), false); assert.strictEqual(R.due(at(8, 0), s, null, null), true);
  assert.strictEqual(R.due(at(9, 0), s, '2027-03-10', null), false); assert.strictEqual(R.due(at(9, 0), s, '2027-03-09', null), true);
  assert.strictEqual(R.due(at(9, 0), s, null, '2027-03-10'), false); assert.strictEqual(R.due(at(9, 0), { enabled: false, time: '08:00' }, null, null), false);
  assert.strictEqual(R.due(at(9, 0), null, null, null), false); assert.strictEqual(R.due(at(9, 0), { enabled: true, time: 'bad' }, null, null), false);
});
test('localDay and text fall back to English', () => {
  assert.strictEqual(R.localDay(new Date(2027, 0, 5, 23, 59)), '2027-01-05'); assert.strictEqual(R.text('xx'), R.text('en')); assert.ok(R.text('tr').title);
});
console.log(n + ' remind tests passed');
