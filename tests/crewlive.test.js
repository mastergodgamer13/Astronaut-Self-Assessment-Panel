'use strict';
const assert = require('assert');
const CL = require('../js/crewlive.js');
const Live = require('../js/live.js');
let n = 0;
async function test(name, fn) { await fn(); n++; console.log('ok - ' + name); }

const CMP = [
  'ANALYTE,VALUE,RANGE_MIN,RANGE_MAX,UNITS,TEST_TYPE,SUBJECT_ID,SEX,timepoint',
  'GLUCOSE,83,65,99,mg/dL,CMP,C001,M,L-92', 'GLUCOSE,69,65,99,mg/dL,CMP,C002,F,L-92', 'GLUCOSE,90,65,99,mg/dL,CMP,C001,M,R+1', 'GLUCOSE,103,65,99,mg/dL,CMP,C003,F,R+1', 'GLUCOSE,44,65,99,mg/dL,CMP,C002,F,R+45',
  'CREATININE,1.24,0.6,1.35,mg/dL,CMP,C001,M,L-92', 'CREATININE,NA,0.6,1.35,mg/dL,CMP,C002,F,L-92',
  'BILIRUBIN; TOTAL,0.7,0.2,1.2,mg/dL,CMP,C001,M,L-92', 'eGFR NON-AFR. AMERICAN,73,60,N/A,mL/min/1.73m2,CMP,C001,M,L-92'
].join('\n');

(async () => {
  await test('parseCsv: header-based, drops NA values, N/A range becomes null', () => {
    const r = CL.parseCsv(CMP);
    assert.strictEqual(r.length, 8);
    assert.deepStrictEqual(r[0], { analyte: 'GLUCOSE', value: 83, lo: 65, hi: 99, unit: 'mg/dL', subject: 'C001', tp: 'L-92' });
    assert.strictEqual(r.filter(x => x.analyte === 'EGFR NON-AFR. AMERICAN')[0].hi, null);
    assert.deepStrictEqual(CL.parseCsv(''), []); assert.deepStrictEqual(CL.parseCsv('a,b\n1,2'), []);
  });
  await test('rangesFromRows: pre = all L- values, post = R+1 only, unknown analytes ignored', () => {
    const r = CL.rangesFromRows(CL.parseCsv(CMP), CL.SOURCES[0].names);
    assert.deepStrictEqual(r.glucose, { unit: 'mg/dL', lo: 65, hi: 99, n: 3, pre: [69, 83], post: [90, 103] });
    assert.deepStrictEqual(r.creatinine.pre, [1.24, 1.24]); assert.strictEqual(r.creatinine.post, null);
    assert.ok(!r.bilirubin && !('BILIRUBIN; TOTAL' in r));
  });
  const filesJson = id => ({ studies: { [id]: { study_files: [
    { file_name: id === 'OSD-575' ? 'LSDS-8_CMP.upload_SUBMITTED.csv' : 'LSDS-7_CBC.upload_SUBMITTED.csv', file_size: 10, remote_url: '/geode-py/ws/studies/' + id + '/download/source?datamanager_file=x.csv' },
    { file_name: 'other.xlsx', remote_url: '/geode-py/other.xlsx' } ] } } });
  const CBC = 'ANALYTE,VALUE,RANGE_MIN,RANGE_MAX,UNITS,TEST_TYPE,SUBJECT_ID,SEX,TEST_DATE\nWHITE BLOOD CELL COUNT,5.4,3.8,10.8,Thousand/uL,CBC,C001,M,L-92\nWHITE BLOOD CELL COUNT,11.8,3.8,10.8,Thousand/uL,CBC,C001,M,R+1';
  await test('load: finds the right files, downloads through the relay address, merges both studies', async () => {
    Live.setBase('https://relay.example.workers.dev');
    const calls = [];
    const fetchFn = async u => { calls.push(u);
      if (/\/osdr\/data\/osd\/files\/575/.test(u)) return { ok: true, json: async () => filesJson('OSD-575') };
      if (/\/osdr\/data\/osd\/files\/569/.test(u)) return { ok: true, json: async () => filesJson('OSD-569') };
      if (/OSD-575\/download/.test(u)) return { ok: true, text: async () => CMP };
      if (/OSD-569\/download/.test(u)) return { ok: true, text: async () => CBC };
      return { ok: false, status: 404 }; };
    const r = await CL.load(fetchFn, Live);
    assert.strictEqual(r.ok, true); assert.deepStrictEqual(r.studies, ['OSD-569', 'OSD-575']);
    assert.strictEqual(r.ranges.glucose.src, 'OSD-575'); assert.strictEqual(r.ranges.wbc.src, 'OSD-569');
    assert.deepStrictEqual(r.ranges.wbc.post, [11.8, 11.8]);
    assert.ok(calls.filter(u => /download/.test(u)).every(u => u.indexOf('https://relay.example.workers.dev/geode-py/') === 0));
    Live.setBase('');
  });
  await test('load: one study failing is reported, the other still works; all failing gives ok:false and never throws', async () => {
    const only569 = async u => /files\/569/.test(u) ? { ok: true, json: async () => filesJson('OSD-569') } : /OSD-569\/download/.test(u) ? { ok: true, text: async () => CBC } : { ok: false, status: 403 };
    const r = await CL.load(only569, Live);
    assert.strictEqual(r.ok, true); assert.deepStrictEqual(r.studies, ['OSD-569']); assert.strictEqual(r.errors.length, 1); assert.strictEqual(r.errors[0].study, 'OSD-575');
    const none = await CL.load(async () => { throw new Error('blocked by CORS'); }, Live);
    assert.strictEqual(none.ok, false); assert.strictEqual(none.errors.length, 2);
  });
  await test('old relay (404 with its own "Only /osdr/..." text on downloads) is reported as old-relay', async () => {
    const oldRelay = async u => /\/files\//.test(u) ? { ok: true, json: async () => filesJson(/569/.test(u) ? 'OSD-569' : 'OSD-575') } : { ok: false, status: 404, text: async () => 'Only /osdr/... and /biodata/... are relayed' };
    const r = await CL.load(oldRelay, Live);
    assert.strictEqual(r.ok, false); assert.ok(r.errors.every(e => e.message === 'old-relay'));
    const plain = await CL.load(async u => /\/files\//.test(u) ? { ok: true, json: async () => filesJson(/569/.test(u) ? 'OSD-569' : 'OSD-575') } : { ok: false, status: 404, text: async () => 'not found' }, Live);
    assert.ok(plain.errors.every(e => e.message === 'http 404'));
  });
  await test('cytokine file (Analyte,Concentration,Timepoint,ID,Unit): IL-6 and TNF-alpha read, pre = L- values, post = R+1, no lab range', () => {
    const CYT = 'Analyte,Concentration,Timepoint,ID,Unit,Timepoint2,Type,Percent\nIL-6,2.87,L-92,C001,pg/ml,Preflight,HD71,1\nIL-6,4.49,L-92,C002,pg/ml,Preflight,HD71,1\nIL-6,6.86,R+1,C001,pg/ml,Postflight,HD71,1\nIL-6,1.65,R+45,C001,pg/ml,Postflight,HD71,1\nTNF\u03b1,62.39,L-92,C001,pg/ml,Preflight,HD71,1\nIL-17A,9,L-92,C001,pg/ml,Preflight,HD71,1';
    const src = CL.SOURCES.filter(x => /immune/.test(String(x.file)))[0];
    assert.ok(src.optional && src.file.test('LSDS-8_Multiplex_serum.immune.EvePanel_SUBMITTED.csv') && !src.file.test('LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv'));
    const r = CL.rangesFromRows(CL.parseCsv(CYT), src.names);
    assert.deepStrictEqual(Object.keys(r).sort(), ['il6', 'tnfa']);
    assert.deepStrictEqual(r.il6.pre, [2.87, 4.49]); assert.deepStrictEqual(r.il6.post, [6.86, 6.86]);
    assert.strictEqual(r.il6.n, 2); assert.strictEqual(r.il6.unit, 'pg/ml'); assert.strictEqual(r.il6.lo, null); assert.strictEqual(r.il6.hi, null);
  });
  console.log(n + ' crewlive tests passed');
})().catch(e => { console.error(e); process.exit(1); });
