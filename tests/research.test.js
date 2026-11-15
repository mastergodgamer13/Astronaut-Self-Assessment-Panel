'use strict';
const assert = require('assert');
const R = require('../js/research.js'), C = require('../js/checkup.js');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('ok - ' + name); };

test('labs point to the study their data comes from, with a link on osdr.nasa.gov', () => {
  const r = R.forQuestion(C.question('creatinine')); assert.deepStrictEqual(r.studies.map(s => s.id), ['OSD-575']);
  assert.strictEqual(r.studies[0].url, 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575'); assert.strictEqual(r.term, 'kidney');
  assert.deepStrictEqual(R.forQuestion(C.question('wbc')).studies.map(s => s.id), ['OSD-569', 'OSD-575']);
});
test('other questions get a search word from their organ (or own word), no study', () => {
  assert.deepStrictEqual(R.forQuestion(C.question('hr')), { studies: [], term: 'cardiovascular' });
  assert.strictEqual(R.forQuestion(C.question('vision')).term, 'eye vision');
});
test('red-flag question and unknown questions give nothing', () => { assert.strictEqual(R.forQuestion(C.question('emergency')), null); assert.strictEqual(R.forQuestion(null), null); });
test('every check-up question either has a suggestion or is the red flag', () => {
  C.QUESTIONS.forEach(q => { if (q.kind !== 'redflag') assert.ok(R.forQuestion(q), q.id); });
});
console.log(n + ' research tests passed');
