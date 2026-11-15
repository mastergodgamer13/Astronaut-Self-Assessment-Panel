/* display.js — text size and high-contrast settings (functional only; the look is set in css/style.css). Remembered on this device. */
(function (root) {
  'use strict';
  var KEY = 'll_display', SIZES = ['normal', 'large', 'xlarge'];

  function clean(s) {
    s = s && typeof s === 'object' ? s : {};
    return { size: SIZES.indexOf(s.size) >= 0 ? s.size : 'normal', contrast: s.contrast === true, night: s.night === true, sound: s.sound === true };
  }
  function read() { try { return clean(JSON.parse(root.localStorage.getItem(KEY))); } catch (e) { return clean(null); } }
  function write(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: lasts for this page view */ } }

  function apply(s) {
    s = clean(s); var h = root.document.documentElement;
    SIZES.forEach(function (z) { h.classList.toggle('ts-' + z, s.size === z); });
    h.classList.toggle('hc', s.contrast);
    h.classList.toggle('night', s.night);
    return s;
  }

  var state = clean(null);
  function set(patch) { state = apply(Object.assign({}, state, patch)); write(state); return state; }
  function init() { state = apply(read()); return state; }

  var api = { SIZES: SIZES, clean: clean, apply: apply, set: set, init: init, get: function () { return state; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Display = api;
  if (root.document) init();
})(typeof window !== 'undefined' ? window : globalThis);
