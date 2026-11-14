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
  await test('only OSD-<number> ids are studies; other databases are external and get no OSDR link', () => {
    const r = L.normalizeSearch({ hits: [{ _source: { 'Study Identifier': 'GSE12345', 'Study Title': 'x' } }, { _source: { accession: 'PXD000001' } }, { id: '575' }] });
    assert.deepStrictEqual(r.studies.map(s => [s.id, s.external]), [['GSE12345', true], ['PXD000001', true], ['OSD-575', false]]);
    assert.strictEqual(L.pageUrl('GSE12345'), ''); assert.ok(L.pageUrl('OSD-575').endsWith('/OSD-575'));
    assert.ok(r.raw.includes('GSE12345'));
  });
  await test('real NASA hit layout: Mission is an object, release date is epoch seconds, newest first', () => {
    const r = L.normalizeSearch({ hits: { hits: [
      { _source: { 'Study Identifier': 'OSD-1', Mission: { Name: 'Old' }, 'Study Public Release Date': 1512561600 } },
      { _source: { 'Study Identifier': 'OSD-2', Mission: { Name: 'SpaceX Inspiration4' }, 'Study Public Release Date': 1717200000 } }] } });
    assert.deepStrictEqual(r.studies.map(s => [s.mission, s.release]), [['Old', '2017-12-06'], ['SpaceX Inspiration4', '2024-06-01']]);
  });
  await test('relay address: used for API calls, study links stay on NASA, bad value falls back', () => {
    L.setBase('https://my-relay.example.workers.dev/');
    assert.strictEqual(L.metaUrl('OSD-575'), 'https://my-relay.example.workers.dev/osdr/data/osd/meta/575');
    assert.strictEqual(L.pageUrl('OSD-575'), 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575');
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
    assert.ok(a.url.includes('ffield=organism') && a.url.includes('type=cgene') && a.url.includes('sort='));
    const h = await L.search(() => Promise.resolve({ ok: false, status: 503 }), {}); assert.deepStrictEqual([h.ok, h.error, h.status], [false, 'http', 503]);
    const nw = await L.search(() => Promise.reject(new Error('cors')), {}); assert.deepStrictEqual([nw.ok, nw.error], [false, 'network']);
    const sh = await L.search(ok({ foo: 1 }), {}); assert.deepStrictEqual([sh.ok, sh.error, sh.keys], [false, 'shape', ['foo']]);
    const all = await L.search(ok(ES), { human: false }); assert.ok(!all.url.includes('ffield'));
    // OSDR has two sources; both are asked and merged, newest first, duplicates removed, other databases dropped
    const calls = []; const mk = (id, ts) => ({ _source: { 'Study Identifier': id, 'Study Public Release Date': ts, 'Data Source Type': 'cgene' } });
    const two = await L.search(u => { calls.push(u); return ok({ hits: { total: 2, hits: u.includes('type=alsda') ? [mk('OSD-2', 1717200000), mk('OSD-3', 1512561600)] : [mk('OSD-1', 1751241600), mk('OSD-3', 1512561600), { _source: { Accession: 'PXD1' } }] } })(); }, { term: 'x', page: 2, size: 10 });
    assert.strictEqual(calls.length, 2); assert.ok(calls.every(u => u.includes('from=20&size=10'))); // from is an offset
    assert.deepStrictEqual(two.studies.map(s => s.id), ['OSD-1', 'OSD-2', 'OSD-3']);
    const half = await L.search(u => u.includes('type=cgene') ? Promise.reject(new Error('x')) : ok(ES)(), {});
    assert.ok(half.ok && half.studies.length === 2); // one source failing does not hide the other
  });
  await test('diagnose: reports each call separately', async () => {
    const f = url => url.includes('/meta/') ? ok({ study: { 'OSD-575': {} } })() : ok(ES)();
    const d = await L.diagnose(f); assert.ok(d.ok && d.search.ok && d.meta.ok);
    const d2 = await L.diagnose(() => Promise.reject(new Error('x'))); assert.ok(!d2.ok); assert.strictEqual(d2.search.error, 'network');
  });
  const META = { hits: 1, study: { 'OSD-575': { additionalInformation: { organisms: { links: { homosapiens: '<a>Homo sapiens</a>' } } },
    studies: [{ title: 'Serum panel', description: 'Blood glucose in crew', publicReleaseDate: '14-May-2024',
      assays: [{ measurementType: { annotationValue: 'Immunoassay' }, technologyType: { annotationValue: 'Multiplex' } }], factors: [{ factorName: 'Time' }, { factorName: 'Spaceflight' }] }] } } };
  const FILES = { studies: { 'OSD-575': { study_files: [
    { file_name: 'a.zip', remote_url: '/geode-py/ws/a.zip', file_size: 5 }, { file_name: 'cbc.csv', remote_url: '/geode-py/ws/cbc.csv', file_size: '120' } ] } } };
  await test('normalizeMeta / normalizeFiles: fields read, tables first, urls made absolute', () => {
    const m = L.normalizeMeta(META, 'OSD-575');
    assert.deepStrictEqual([m.title, m.release, m.assays, m.factors], ['Serum panel', '14-May-2024', ['Immunoassay (Multiplex)'], ['Time', 'Spaceflight']]);
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
