/*
 * demo.js — SIMULATED data generator. Every value produced here is FICTIONAL.
 * Parameters are arbitrary, chosen only to demonstrate how the app reacts to drifts.
 * They make no claim about real astronaut physiology.
 */
(function (root) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeGauss(rand) {
    return function () {
      var u = 0, v = 0;
      while (u === 0) u = rand();
      v = rand();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** 30 fictional mission days. Drifts start on day 14 (sleep), 18 (heart rate), 20 (mood), 22 (blood pressure); fever on the last two days; exercise drops from day 23 and grip strength slips from day 22. */
  function generate(seed, days) {
    days = days || 30;
    var rand = mulberry32(seed || 2026);
    var g = makeGauss(rand);
    var g2 = makeGauss(mulberry32((seed || 2026) + 99)); // separate stream so the older indicators keep their values
    var out = [];
    for (var d = 1; d <= days; d++) {
      var sleepDrift = d >= 14 ? -0.12 * (d - 13) : 0;
      var hrDrift = d >= 18 ? 0.5 * (d - 17) : 0;
      var moodDrift = d >= 20 ? -0.06 * (d - 19) : 0;
      var mood = Math.round(Math.min(5, Math.max(1, 4 + moodDrift + g() * 0.5)));
      var exDrift = d >= 23 ? -9 * (d - 22) : 0;
      var gripDrift = d >= 22 ? -0.45 * (d - 21) : 0;
      var sysDrift = d >= 22 ? 2.2 * (d - 21) : 0;
      var sys = Math.round(118 + sysDrift + g() * 4);
      var dia = Math.round(76 + g() * 3);
      out.push({
        date: '2030-03-' + pad(d),   // fictional calendar; labelled "Mission day" in the UI
        day: d,
        hr: Math.round(62 + hrDrift + g() * 2),
        sys: sys,
        dia: Math.min(dia, sys - 20),
        glucose: Math.round(92 + g() * 5),
        temp: Math.round((36.6 + (d >= days - 1 ? 2.0 : 0) + g() * 0.2) * 10) / 10,
        sleep: Math.round(Math.max(0, 7.2 + sleepDrift + g() * 0.4) * 10) / 10,
        mood: mood,
        exercise: Math.max(0, Math.round(125 + exDrift + g2() * 8)),
        grip: Math.round((38 + gripDrift + g2() * 0.6) * 2) / 2
      });
    }
    return out;
  }

  /** Answers of the FICTIONAL guided-demo astronaut (made-up values): mostly green, several yellow, one red (temperature). */
  function guided() {
    return { hr: 72, sys: 138, dia: 82, glucose: 118, temp: 38.6, sleep: 5.2, mood: 2, headache: 1, reaction: 340, spo2: 97, rr: 16, urine: 5, fluids: 1.2, flank: 0, dyspnea: 1, cough: 0, breathhold: 30, usual_breathhold: 32, usual_reaction: 290, usual_grip: 35, urinations: 5, swelling: 0, wtchange: -0.4, nausea: 1, appetite: 1, stools: 1, meals: 3, discomfort: 1, exercise: 40, grip: 33, fatigue: 2, dizzy: 1, vision: 1, pain: 1, emergency: 'no', eyes: 1, hearing: 0, skin: 0, teeth: 1, radiation: 'no', wbc: 11.8, creatinine: 1.4, alt: 22, neut: 5200, lymph: '' };
  }

  var api = { generate: generate, guided: guided };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Demo = api;
})(typeof window !== 'undefined' ? window : globalThis);
