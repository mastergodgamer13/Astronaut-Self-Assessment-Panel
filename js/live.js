/*
 * live.js — live access to the NASA OSDR catalog (Open Science Data Repository). Works in the browser (window.Live) and Node.
 * Pure: the network function is injected (fetchFn), so it is testable without internet.
 *
 * The API shape is read DEFENSIVELY (several response layouts accepted) because it could not be called while writing this
 * module; the in-app "Check connection" button reports exactly what NASA answered.
 * Docs: https://www.nasa.gov/?p=696974   Search: /osdr/data/search?term=&from=&size=&ffield=&fvalue=   Metadata: /osdr/data/osd/meta/{id}
 */
(function (root) {
  'use strict';

  var DIRECT = 'https://osdr.nasa.gov';
  var BASE = DIRECT; // can be replaced by a relay address (see worker/osdr-proxy.js) when the browser blocks direct calls
  function setBase(u) { u = String(u || '').trim().replace(/\/+$/, ''); BASE = /^https:\/\/[^\s]+$/.test(u) ? u : DIRECT; return BASE; }
  function getBase() { return BASE; }

  // topic tags found by keyword in title/description. A heuristic to help find health studies, not a classification of record.
  var TOPICS = {
    blood:       ['blood', 'serum', 'plasma', 'hematolog', 'haemat', 'cbc', 'erythro', 'platelet', 'anemia', 'anaemia'],
    immune:      ['immune', 'immun', 'leukocyte', 'lymphocyte', 'neutrophil', 'cytokine', 't cell', 'inflammat'],
    metabolism:  ['metabol', 'glucose', 'insulin', 'lipid', 'diabet', 'nutrition'],
    heart:       ['cardi', 'heart', 'vascular', 'aort', 'endotheli', 'blood pressure', 'artery'],
    bone_muscle: ['bone', 'muscle', 'skeletal', 'osteo', 'atrophy', 'sarcopen'],
    brain_eyes:  ['brain', 'neuro', 'cogniti', 'eye', 'ocular', 'retina', 'sleep', 'circadian'],
    radiation:   ['radiation', 'dna damage', 'telomere', 'genom'],
    microbiome:  ['microbio', 'gut', 'microbiota']
  };

  function str(x) { return x === undefined || x === null ? '' : (Array.isArray(x) ? x.join(', ') : String(x)); }

  function pick(o, keys) {
    for (var i = 0; i < keys.length; i++) if (o && o[keys[i]] !== undefined && o[keys[i]] !== null && o[keys[i]] !== '') return o[keys[i]];
    return '';
  }

  function idNumber(id) { var m = /(\d+)/.exec(str(id)); return m ? Number(m[1]) : null; }

  function searchUrl(o) {
    o = o || {};
    var q = [];
    if (o.term !== undefined) q.push('term=' + encodeURIComponent(o.term));
    q.push('from=' + (o.from || 0), 'size=' + (o.size || 25));
    if (o.type) q.push('type=' + encodeURIComponent(o.type));
    (o.filters || []).forEach(function (f) { q.push('ffield=' + encodeURIComponent(f[0]), 'fvalue=' + encodeURIComponent(f[1])); });
    return BASE + '/osdr/data/search?' + q.join('&');
  }
  function metaUrl(id) { return BASE + '/osdr/data/osd/meta/' + idNumber(id); }
  function studyPageUrl(id) { return DIRECT + '/osdr/data/osd/files/' + idNumber(id); }
  // human-readable study page on the OSDR website (repository root: https://osdr.nasa.gov/bio/repo)
  function pageUrl(id) { return DIRECT + '/bio/repo/data/studies/OSD-' + idNumber(id); }

  function topicsOf(text) {
    var low = str(text).toLowerCase(), out = [];
    Object.keys(TOPICS).forEach(function (k) { if (TOPICS[k].some(function (w) { return low.indexOf(w) >= 0; })) out.push(k); });
    return out;
  }

  /** One search hit (any accepted layout) -> normalized study; null if it has no study id. */
  function normalizeHit(h) {
    var s = (h && (h._source || h.source)) || h || {};
    var id = pick(s, ['Study Identifier', 'study_identifier', 'Accession', 'accession', 'identifier', 'id']) || (h && (h._id || h.id)) || '';
    if (!/\d/.test(str(id))) return null;
    id = /^OSD-/i.test(str(id)) ? str(id).toUpperCase() : (/^\d+$/.test(str(id)) ? 'OSD-' + id : str(id));
    var title = str(pick(s, ['Study Title', 'study_title', 'title', 'Title']));
    var desc = str(pick(s, ['Study Description', 'study_description', 'description', 'Description']));
    return {
      id: id, n: idNumber(id), title: title, description: desc,
      organism: str(pick(s, ['organism', 'Organism', 'Study Organism'])),
      projectType: str(pick(s, ['Project Type', 'project_type'])),
      mission: str(pick(s, ['Mission Name', 'mission', 'Mission', 'Flight Program'])),
      assay: str(pick(s, ['Study Assay Technology Type', 'Study Assay Measurement Type', 'assay'])),
      source: str(pick(s, ['Data Source Type', 'type'])),
      topics: topicsOf(title + ' ' + desc + ' ' + str(pick(s, ['Study Assay Measurement Type', 'Study Factor Name'])))
    };
  }

  /** Whole search response (any accepted layout) -> { total, studies[] }. */
  function normalizeSearch(r) {
    var hits = null, total = null;
    if (r && r.hits) {
      if (Array.isArray(r.hits)) hits = r.hits;
      else if (Array.isArray(r.hits.hits)) { hits = r.hits.hits; total = r.hits.total; }
    }
    if (!hits && r && Array.isArray(r.results)) hits = r.results;
    if (!hits && r && Array.isArray(r.studies)) hits = r.studies;
    if (!hits) return { total: 0, studies: [], recognized: false };
    if (total && typeof total === 'object') total = total.value;
    var studies = [], seen = {};
    hits.forEach(function (h) { var s = normalizeHit(h); if (s && !seen[s.id]) { seen[s.id] = 1; studies.push(s); } });
    return { total: typeof total === 'number' ? total : studies.length, studies: studies, recognized: true };
  }

  /** Is this study about humans? (organism says Homo sapiens). */
  function isHuman(s) { return /homo sapiens|human/i.test(s.organism); }
  function isSpaceflight(s) { return /spaceflight|space flight|flight/i.test(s.projectType + ' ' + s.mission) || !s.projectType; }

  /** Network wrapper: never throws; returns { ok, status, data, error }. */
  function getJson(fetchFn, url) {
    return Promise.resolve().then(function () { return fetchFn(url); }).then(function (res) {
      if (!res || !res.ok) return { ok: false, status: res ? res.status : 0, data: null, error: 'http' };
      return res.json().then(function (data) { return { ok: true, status: res.status, data: data }; },
        function () { return { ok: false, status: res.status, data: null, error: 'notjson' }; });
    }, function () { return { ok: false, status: 0, data: null, error: 'network' }; });
  }

  /** Searches the catalog. opts: { term, human (default true), page, size, fetchFn } */
  function search(fetchFn, opts) {
    opts = opts || {};
    var filters = [];
    if (opts.human !== false) filters.push(['organism', 'Homo sapiens']);
    var url = searchUrl({ term: opts.term || '', from: opts.page || 0, size: opts.size || 25, filters: filters });
    return getJson(fetchFn, url).then(function (r) {
      if (!r.ok) return { ok: false, status: r.status, error: r.error, url: url, studies: [], total: 0 };
      var n = normalizeSearch(r.data);
      if (!n.recognized) return { ok: false, status: r.status, error: 'shape', url: url, studies: [], total: 0, keys: Object.keys(r.data || {}) };
      return { ok: true, status: r.status, url: url, studies: n.studies, total: n.total };
    });
  }


  function filesUrl(id) { return BASE + '/osdr/data/osd/files/' + idNumber(id); }
  var TABLE_EXT = /\.(csv|tsv|txt|xlsx|xls)$/i;

  /** Study metadata response -> { id, title, description, release, organisms[], assays[], factors[], mission, projectType } (any missing part stays empty). */
  function normalizeMeta(r, id) {
    var key = 'OSD-' + idNumber(id), st = (r && r.study && (r.study[key] || r.study[Object.keys(r.study)[0]])) || {};
    var info = st.additionalInformation || {};
    function names(a, f) { return (Array.isArray(a) ? a : []).map(function (x) { return str(typeof x === 'object' && x ? (x[f] || x.name || x.term || x.text || '') : x); }).filter(Boolean); }
    var comments = (r && r.studies && r.studies[key] && r.studies[key].comments) || (r && r.studies && (r.studies[Object.keys(r.studies)[0]] || {}).comments) || [];
    var cm = {};
    (Array.isArray(comments) ? comments : []).forEach(function (c) { if (c && c.name) cm[c.name] = c.value; });
    var assays = info.assays || st.assays;
    return {
      id: key, title: str(st.title), description: str(st.description), release: str(st.publicReleaseDate),
      organisms: names(info.organisms, 'organism').length ? names(info.organisms, 'organism') : (Array.isArray(info.organisms) ? info.organisms.map(str) : []),
      assays: Array.isArray(assays) ? assays.map(function (a) { return str(a.measurementType || a.technologyType || a.name || (typeof a === 'string' ? a : '')); }).filter(Boolean) : [],
      factors: names(st.factors, 'name'),
      mission: str(cm['Mission Name']), projectType: str(cm['Project Type']),
      topics: topicsOf(str(st.title) + ' ' + str(st.description))
    };
  }

  /** Files response -> [{ name, url, size, category, table }] sorted tables first. */
  function normalizeFiles(r, id) {
    var key = 'OSD-' + idNumber(id), root = (r && r.studies && (r.studies[key] || r.studies[Object.keys(r.studies)[0]])) || {};
    var list = root.study_files || root.files || [];
    var out = (Array.isArray(list) ? list : []).map(function (f) {
      var name = str(f.file_name || f.name), url = str(f.remote_url || f.url);
      if (!name) return null;
      return { name: name, url: url ? (/^https?:/.test(url) ? url : DIRECT + (url.charAt(0) === '/' ? '' : '/') + url) : '',
        size: typeof f.file_size === 'number' ? f.file_size : Number(f.file_size) || null, category: str(f.category || f.subcategory), table: TABLE_EXT.test(name) };
    }).filter(Boolean);
    out.sort(function (a, b) { return (b.table ? 1 : 0) - (a.table ? 1 : 0) || a.name.localeCompare(b.name); });
    return out;
  }

  /** Loads one study's metadata and file list (two calls, reported separately). */
  function studyDetail(fetchFn, id) {
    return Promise.all([getJson(fetchFn, metaUrl(id)), getJson(fetchFn, filesUrl(id))]).then(function (rs) {
      var m = rs[0], f = rs[1];
      return {
        id: id,
        meta: m.ok ? normalizeMeta(m.data, id) : null, metaError: m.ok ? null : m.error, metaStatus: m.status,
        files: f.ok ? normalizeFiles(f.data, id) : [], filesError: f.ok ? null : f.error, filesStatus: f.status,
        ok: m.ok || f.ok
      };
    });
  }

  /** Connection check: one search + one metadata call; reports what happened for each. */
  function diagnose(fetchFn) {
    var u1 = searchUrl({ term: '', size: 1 }), u2 = metaUrl('OSD-575');
    return Promise.all([getJson(fetchFn, u1), getJson(fetchFn, u2)]).then(function (rs) {
      var s = rs[0], m = rs[1];
      var sOk = s.ok && normalizeSearch(s.data).recognized;
      var mOk = m.ok && !!(m.data && (m.data.study || m.data.studies));
      return {
        search: { ok: sOk, status: s.status, error: s.ok ? (sOk ? null : 'shape') : s.error, keys: s.ok ? Object.keys(s.data || {}) : [] , url: u1 },
        meta:   { ok: mOk, status: m.status, error: m.ok ? (mOk ? null : 'shape') : m.error, keys: m.ok ? Object.keys(m.data || {}) : [], url: u2 },
        ok: sOk && mOk
      };
    });
  }

  var api = { filesUrl: filesUrl, normalizeMeta: normalizeMeta, normalizeFiles: normalizeFiles, studyDetail: studyDetail, DIRECT: DIRECT, setBase: setBase, getBase: getBase, TOPICS: TOPICS, searchUrl: searchUrl, metaUrl: metaUrl, pageUrl: pageUrl, studyPageUrl: studyPageUrl, idNumber: idNumber,
    topicsOf: topicsOf, normalizeHit: normalizeHit, normalizeSearch: normalizeSearch, isHuman: isHuman, isSpaceflight: isSpaceflight,
    getJson: getJson, search: search, diagnose: diagnose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Live = api;
})(typeof window !== 'undefined' ? window : globalThis);
