/* sound.js: short soft tones for check results (off by default; turn on in the Display menu). */
(function (root) {
  'use strict';
  var actx = null;
  var NOTES = { ok: [[523, 0], [659, .12]], watch: [[440, 0], [440, .16]], attention: [[330, 0], [262, .18]], clear: [[523, 0], [659, .12], [784, .24], [1047, .36]] };
  function enabled() { try { return !!(root.Display && root.Display.get().sound); } catch (e) { return false; } }
  function play(kind) {
    if (!enabled()) return;
    var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    try {
      actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
      (NOTES[kind] || NOTES.ok).forEach(function (n) {
        var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + n[1];
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.07, t0 + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + .28);
        o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + .3);
      });
    } catch (e) { /* audio unavailable */ }
  }
  var api = { play: play };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Sound = api;
})(typeof window !== 'undefined' ? window : globalThis);
