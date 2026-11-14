// Run: node tests/live.test.js
const assert = require('assert');
const L = require('../js/live.js');
let n = 0;
function test(name, fn) { return Promise.resolve().then(fn).then(() => { n++; console.log('ok -', name); }); }
const ok = data => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
const ES = { hits: { total: { value: 2 }, hits: [
  { _id: 'OSD-575', _source: { 'Study Identifier': 'OSD-575', 'Study Title': 'Inspiration4 serum metabolic panel', organism: 'Homo sapiens', 'Project Type': 'Spaceflight Study', 'Mission Name': 'Inspiration4' } },
  { _source: { 'Study Identifier': 'OSD-569', 'Study Title': 'Whole blood immune cells', organism: 'Homo sapiens', 'Study Description': 'neutrophil and lymphocyte counts' } },
  { _source: { 'Study Title': 'no id' } } ] } };

(async () => {
  await test('urls', () => {
    assert.strictEqual(L.searchUrl({ term: 'blood', from: 1, size: 5, filters: [['organism', 'Homo sapiens']] }),
      'https://osdr.nasa.gov/osdr/data/search?term=blood&from=1&size=5&ffield=organism&fvalue=Homo%20sapiens');
    assert.strictEqual(L.metaUrl('OSD-575'), 'https://osdr.nasa.gov/osdr/data/osd/meta/575');
    assert.strictEqual(L.idNumber('OSD-12'), 12);
  });
  await test('relay address: used for API calls, study links stay on NASA, bad value falls back', () => {
    L.setBase('https://my-relay.example.workers.dev/');
    assert.strictEqual(L.metaUrl('OSD-575'), 'https://my-relay.example.workers.dev/osdr/data/osd/meta/575');
    assert.ok(L.pageUrl('OSD-575').startsWith('https://osdr.nasa.gov/'));
    assert.strictEqual(L.setBase('javascript:alert(1)'), 'https://osdr.nasa.gov'); assert.strictEqual(L.setBase(''), 'https://osdr.nasa.gov');
  });
  await test('normalizeSearch: elasticsearch-style hits, skips hits without id, tags topics', () => {
    const r = L.normalizeSearch(ES);
    assert.strictEqual(r.recognized, true); assert.strictEqual(r.total, 2); assert.strictEqual(r.studies.length, 2);
    assert.strictEqual(r.studies[0].id, 'OSD-575'); assert.ok(r.studies[0].topics.includes('blood') && r.studies[0].topics.includes('metabolism'));
    assert.ok(r.studies[1].topics.includes('immune'));
    assert.ok(L.isHuman(r.studies[0])); assert.ok(L.isSpaceflight(r.studies[0]));
  });
  await test('normalizeSearch: other layouts accepted, unknown layout reported (never invented)', () => {
    assert.strictEqual(L.normalizeSearch({ hits: [{ id: '4', title: 'x' }] }).studies[0].id, 'OSD-4');
    assert.strictEqual(L.normalizeSearch({ results: [{ accession: 'OSD-9' }] }).studies[0].id, 'OSD-9');
    assert.strictEqual(L.normalizeSearch({ foo: 1 }).recognized, false);
  });
  await test('search: ok, http error, network error, unknown shape', async () => {
    const a = await L.search(ok(ES), { term: 'blood' }); assert.ok(a.ok); assert.strictEqual(a.studies.length, 2);
    assert.ok(a.url.includes('ffield=organism'));
    const h = await L.search(() => Promise.resolve({ ok: false, status: 503 }), {}); assert.deepStrictEqual([h.ok, h.error, h.status], [false, 'http', 503]);
    const nw = await L.search(() => Promise.reject(new Error('cors')), {}); assert.deepStrictEqual([nw.ok, nw.error], [false, 'network']);
    const sh = await L.search(ok({ foo: 1 }), {}); assert.deepStrictEqual([sh.ok, sh.error, sh.keys], [false, 'shape', ['foo']]);
    const all = await L.search(ok(ES), { human: false }); assert.ok(!all.url.includes('ffield'));
  });
  await test('diagnose: reports each call separately', async () => {
    const f = url => url.includes('/meta/') ? ok({ study: { 'OSD-575': {} } })() : ok(ES)();
    const d = await L.diagnose(f); assert.ok(d.ok && d.search.ok && d.meta.ok);
    const d2 = await L.diagnose(() => Promise.reject(new Error('x'))); assert.ok(!d2.ok); assert.strictEqual(d2.search.error, 'network');
  });
  const META = { hits: 1, study: { 'OSD-575': { title: 'Serum panel', description: 'Blood glucose in crew', publicReleaseDate: '2023-01-01',
      additionalInformation: { organisms: [{ organism: 'Homo sapiens' }], assays: [{ measurementType: 'clinical chemistry' }] }, factors: [{ name: 'Spaceflight' }] } },
    studies: { 'OSD-575': { comments: [{ name: 'Mission Name', value: 'Inspiration4' }, { name: 'Project Type', value: 'Spaceflight Study' }] } } };
  const FILES = { studies: { 'OSD-575': { study_files: [
    { file_name: 'a.zip', remote_url: '/geode-py/ws/a.zip', file_size: 5 }, { file_name: 'cbc.csv', remote_url: '/geode-py/ws/cbc.csv', file_size: '120' } ] } } };
  await test('normalizeMeta / normalizeFiles: fields read, tables first, urls made absolute', () => {
    const m = L.normalizeMeta(META, 'OSD-575');
    assert.deepStrictEqual([m.title, m.mission, m.projectType, m.organisms, m.assays, m.factors], ['Serum panel', 'Inspiration4', 'Spaceflight Study', ['Homo sapiens'], ['clinical chemistry'], ['Spaceflight']]);
    assert.ok(m.topics.includes('blood'));
    const f = L.normalizeFiles(FILES, 'OSD-575');
    assert.deepStrictEqual(f.map(x => x.name), ['cbc.csv', 'a.zip']); assert.ok(f[0].table && !f[1].table);
    assert.strictEqual(f[0].url, 'https://osdr.nasa.gov/geode-py/ws/cbc.csv'); assert.strictEqual(f[0].size, 120);
    assert.deepStrictEqual(L.normalizeFiles({}, 'OSD-1'), []); assert.strictEqual(L.normalizeMeta({}, 'OSD-1').title, '');
  });
  await test('studyDetail: both calls reported separately, partial failure kept', async () => {
    const d = await L.studyDetail(url => url.includes('/meta/') ? ok(META)() : ok(FILES)(), 'OSD-575');
    assert.ok(d.ok && d.meta.title === 'Serum panel' && d.files.length === 2);
    const p = await L.studyDetail(url => url.includes('/meta/') ? Promise.reject(new Error('x')) : ok(FILES)(), 'OSD-575');
    assert.ok(p.ok && p.meta === null && p.metaError === 'network' && p.files.length === 2);
    const n0 = await L.studyDetail(() => Promise.reject(new Error('x')), 'OSD-575'); assert.ok(!n0.ok);
  });
  console.log(n + ' live tests passed');
})().catch(e => { console.error(e); process.exit(1); });
