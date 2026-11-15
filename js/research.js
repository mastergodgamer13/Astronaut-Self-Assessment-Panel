/*
 * research.js — which NASA research to point to for a check-up question. Pure (no DOM).
 * PROPOSED mapping, not reviewed by a scientist: it only helps people find reading material, and it never changes a status.
 */
(function (root) {
  'use strict';

  // study pages this project already reads data from; why = i18n key suffix (rs.why.<study>)
  var STUDIES = {
    'OSD-575': { url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575' },
    'OSD-569': { url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569' }
  };

  var STUDY_FOR = { creatinine: ['OSD-575'], bun: ['OSD-575'], egfr: ['OSD-575'], alt: ['OSD-575'], ast: ['OSD-575'], glucose: ['OSD-575'],
    wbc: ['OSD-569', 'OSD-575'], neut: ['OSD-569', 'OSD-575'], lymph: ['OSD-569', 'OSD-575'] };

  // search words for the Live NASA catalog (the catalog is searched in English)
  var TERM_FOR_ORGAN = { heart: 'cardiovascular', lungs: 'lung', mind: 'cognition', kidneys: 'kidney', gut: 'gut microbiome', bones: 'bone muscle',
    whole: 'thermoregulation', immune: 'immune', liver: 'liver', metabolism: 'metabolism' };
  var TERM_FOR_ID = { vision: 'eye vision', sleep: 'sleep', dizzy: 'vestibular', fatigue: 'fatigue', grip: 'muscle strength', reaction: 'cognition' };

  /** -> { studies:[{id,url}], term } or null (nothing sensible to suggest, e.g. the emergency question). */
  function forQuestion(q) {
    if (!q || q.kind === 'redflag') return null;
    var term = TERM_FOR_ID[q.id] || (q.organ ? TERM_FOR_ORGAN[q.organ] : null);
    var studies = (STUDY_FOR[q.id] || []).map(function (id) { return { id: id, url: STUDIES[id].url }; });
    if (!term && !studies.length) return null;
    return { studies: studies, term: term };
  }

  var api = { STUDIES: STUDIES, forQuestion: forQuestion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Research = api;
})(typeof window !== 'undefined' ? window : globalThis);
