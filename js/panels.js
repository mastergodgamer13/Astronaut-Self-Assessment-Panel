/*
 * panels.js — every card of the website is a panel the person can minimize, maximize and move (drag, or buttons / keyboard).
 * The layout is remembered in this browser. Pure helpers (arrange, move, clean) are testable without a DOM.
 */
(function (root) {
  'use strict';

  var KEY = 'll.layout.v1';

  /**
   * defaults: { zone: [panelId, ...] } (the built-in layout); saved: { panelId: { z: zone, o: order } }.
   * -> { zone: [panelId, ...] }. Unknown panels / zones in `saved` are ignored; panels without a saved place keep their default zone.
   */
  function arrange(defaults, saved) {
    var out = {}, pos = {};
    Object.keys(defaults).forEach(function (z) { out[z] = []; defaults[z].forEach(function (p, i) { pos[p] = { z: z, o: i, d: true }; }); });
    saved = saved || {};
    Object.keys(saved).forEach(function (p) {
      var s = saved[p];
      if (pos[p] && s && out.hasOwnProperty(s.z) && typeof s.o === 'number' && isFinite(s.o)) pos[p] = { z: s.z, o: s.o, d: false };
    });
    Object.keys(pos).forEach(function (p) { out[pos[p].z].push(p); });
    Object.keys(out).forEach(function (z) {
      out[z].sort(function (a, b) { return (pos[a].o - pos[b].o) || (pos[a].d === pos[b].d ? 0 : pos[a].d ? 1 : -1) || (a < b ? -1 : 1); });
    });
    return out;
  }

  /** Move one panel. dir: 'up' | 'down' (inside its zone) | 'left' | 'right' (to the neighbouring zone in zoneOrder, appended). Returns a new arrangement. */
  function move(arr, id, dir, zoneOrder) {
    var out = {}, zone = null;
    Object.keys(arr).forEach(function (z) { out[z] = arr[z].slice(); if (out[z].indexOf(id) >= 0) zone = z; });
    if (zone === null) return out;
    var list = out[zone], i = list.indexOf(id);
    if (dir === 'up' && i > 0) { list[i] = list[i - 1]; list[i - 1] = id; }
    else if (dir === 'down' && i < list.length - 1) { list[i] = list[i + 1]; list[i + 1] = id; }
    else if (dir === 'left' || dir === 'right') {
      var zs = (zoneOrder || Object.keys(out)).filter(function (z) { return out.hasOwnProperty(z); }), k = zs.indexOf(zone), n = k + (dir === 'right' ? 1 : -1);
      if (n >= 0 && n < zs.length) { list.splice(i, 1); out[zs[n]].push(id); }
    }
    return out;
  }

  /** Move `id` into `zone` before panel `beforeId` (or at the end). Used by drag and drop. */
  function drop(arr, id, zone, beforeId) {
    var out = {};
    Object.keys(arr).forEach(function (z) { out[z] = arr[z].filter(function (p) { return p !== id; }); });
    if (!out.hasOwnProperty(zone)) return arr;
    var j = beforeId ? out[zone].indexOf(beforeId) : -1;
    if (j < 0) out[zone].push(id); else out[zone].splice(j, 0, id);
    return out;
  }

  /** arrangement + minimized set -> the object that is stored. */
  function serialize(arr, minimized) {
    var s = { panels: {}, min: Object.keys(minimized || {}).filter(function (k) { return minimized[k]; }) };
    Object.keys(arr).forEach(function (z) { arr[z].forEach(function (p, i) { s.panels[p] = { z: z, o: i }; }); });
    return s;
  }

  var api = { KEY: KEY, arrange: arrange, move: move, drop: drop, serialize: serialize };

  /* ---------------- DOM part (browser only) ---------------- */
  if (typeof document !== 'undefined') {
    var tr = function (k) { return k; }, panels = {}, zoneOrder = [], zones = {}, groupOf = {}, minimized = {}, state = null, dragId = null;
    var zoneOfPanel = function (id) { return panels[id].node.parentNode.getAttribute('data-zone'); };
    var sameGroup = function (a, b) { return groupOf[a] === groupOf[b]; };

    var load = function () { try { return JSON.parse(window.localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    var store = function () { try { window.localStorage.setItem(KEY, JSON.stringify(serialize(current(), minimized))); } catch (e) { /* storage may be blocked */ } };
    var current = function () {
      var arr = {}; zoneOrder.forEach(function (z) { arr[z] = Array.prototype.map.call(zones[z].querySelectorAll(':scope > .panel'), function (n) { return n.getAttribute('data-pid'); }); });
      return arr;
    };
    var place = function (arr) {
      zoneOrder.forEach(function (z) { arr[z].forEach(function (p) { zones[z].appendChild(panels[p].node); }); });
      refresh();
    };

    var btn = function (cls, label, text) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pbtn ' + cls; b.textContent = text; b.setAttribute('data-label', label);
      return b;
    };

    var refresh = function () {
      Object.keys(panels).forEach(function (id) {
        var p = panels[id], isMin = !!minimized[id], isMax = p.node.classList.contains('panel-max');
        p.node.classList.toggle('panel-min', isMin);
        p.title.textContent = isMin ? tr(p.titleKey) : '';
        Array.prototype.forEach.call(p.bar.querySelectorAll('.pbtn'), function (b) {
          var k = b.getAttribute('data-label'); b.title = tr(k); b.setAttribute('aria-label', tr(p.titleKey) + ': ' + tr(k));
        });
        p.btnMin.textContent = isMin ? '▢' : '–'; p.btnMin.setAttribute('data-label', isMin ? 'panel.restore' : 'panel.min'); p.btnMin.setAttribute('aria-expanded', String(!isMin));
        p.btnMax.textContent = isMax ? '✕' : '⤢'; p.btnMax.setAttribute('data-label', isMax ? 'panel.exitmax' : 'panel.max');
        p.btnMin.title = tr(p.btnMin.getAttribute('data-label')); p.btnMax.title = tr(p.btnMax.getAttribute('data-label'));
        p.btnMin.setAttribute('aria-label', tr(p.titleKey) + ': ' + p.btnMin.title); p.btnMax.setAttribute('aria-label', tr(p.titleKey) + ': ' + p.btnMax.title);
      });
    };

    var act = function (id, dir) { var g = groupOf[zoneOfPanel(id)]; place(move(current(), id, dir, zoneOrder.filter(function (z) { return groupOf[z] === g; }))); store(); var g = panels[id].node.querySelector('.pbtn[data-dir="' + dir + '"]'); if (g) g.focus(); };

    var wrap = function (section) {
      var id = section.getAttribute('data-panel'), node = document.createElement('div'), bar = document.createElement('div'), body = document.createElement('div');
      node.className = 'panel'; node.setAttribute('data-pid', id); bar.className = 'panel-bar'; body.className = 'panel-body';
      var title = document.createElement('span'); title.className = 'panel-title';
      var grip = btn('pgrip', 'panel.drag', '⠿'); grip.setAttribute('aria-hidden', 'true'); grip.tabIndex = -1;
      var bl = btn('pmove', 'panel.left', '◀'), br = btn('pmove', 'panel.right', '▶'), bu = btn('pmove', 'panel.up', '▲'), bd = btn('pmove', 'panel.down', '▼');
      bl.setAttribute('data-dir', 'left'); br.setAttribute('data-dir', 'right'); bu.setAttribute('data-dir', 'up'); bd.setAttribute('data-dir', 'down');
      var bmin = btn('pmin', 'panel.min', '–'), bmax = btn('pmax', 'panel.max', '⤢');
      bar.appendChild(grip); bar.appendChild(title);
      var grp = document.createElement('span'); grp.className = 'panel-btns';
      [bl, bu, bd, br, bmin, bmax].forEach(function (b) { grp.appendChild(b); }); bar.appendChild(grp);
      section.parentNode.insertBefore(node, section); body.appendChild(section); node.appendChild(bar); node.appendChild(body);
      panels[id] = { node: node, bar: bar, title: title, titleKey: section.getAttribute('data-panel-title') || 'panel.generic', btnMin: bmin, btnMax: bmax };
      [bl, br, bu, bd].forEach(function (b) { b.addEventListener('click', function () { act(id, b.getAttribute('data-dir')); }); });
      bmin.addEventListener('click', function () { minimized[id] = !minimized[id]; refresh(); store(); });
      bmax.addEventListener('click', function () { setMax(id, !node.classList.contains('panel-max')); });
      // drag with the grip (mouse / touch via HTML5 drag where available)
      grip.addEventListener('mousedown', function () { node.draggable = true; });
      node.addEventListener('dragstart', function (e) { dragId = id; node.classList.add('dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch (x) { /* ignore */ } } });
      node.addEventListener('dragend', function () { dragId = null; node.draggable = false; node.classList.remove('dragging'); Object.keys(zones).forEach(function (z) { zones[z].classList.remove('drop-on'); }); });
      node.addEventListener('dragover', function (e) { if (dragId && dragId !== id) e.preventDefault(); });
      node.addEventListener('drop', function (e) {
        if (!dragId || dragId === id) return; e.preventDefault();
        var z = node.parentNode.getAttribute('data-zone'); if (!sameGroup(z, zoneOfPanel(dragId))) return; place(drop(current(), dragId, z, id)); store();
      });
    };

    var setMax = function (id, on) {
      Object.keys(panels).forEach(function (k) { panels[k].node.classList.remove('panel-max'); });
      if (on) { panels[id].node.classList.add('panel-max'); minimized[id] = false; }
      document.body.classList.toggle('has-max', !!on); refresh();
      if (on) panels[id].btnMax.focus();
    };

    api.init = function (opts) {
      tr = (opts && opts.t) || tr;
      Array.prototype.forEach.call(document.querySelectorAll('[data-zone]'), function (z) { var id = z.getAttribute('data-zone'); zones[id] = z; zoneOrder.push(id); groupOf[id] = z.getAttribute('data-zone-group') || id; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-panel]'), wrap);
      zoneOrder.forEach(function (z) {
        zones[z].addEventListener('dragover', function (e) { if (dragId && sameGroup(z, zoneOfPanel(dragId))) { e.preventDefault(); zones[z].classList.add('drop-on'); } });
        zones[z].addEventListener('dragleave', function () { zones[z].classList.remove('drop-on'); });
        zones[z].addEventListener('drop', function (e) { if (!dragId || !sameGroup(z, zoneOfPanel(dragId)) || e.target.closest('.panel') && e.target.closest('.panel').parentNode === zones[z] && e.target.closest('.panel').getAttribute('data-pid') !== dragId) return; e.preventDefault(); place(drop(current(), dragId, z, null)); store(); });
      });
      state = load();
      (state.min || []).forEach(function (p) { if (panels[p]) minimized[p] = true; });
      // layout only applies to zones that are on this page together (dash zones); other zones hold one panel each and are never mixed
      var defaults = current(), arr = {}; window.__panelDefaults = defaults;
      var groups = {}; zoneOrder.forEach(function (z) { (groups[groupOf[z]] = groups[groupOf[z]] || []).push(z); });
      Object.keys(groups).forEach(function (g) {
        var d = {}, sv = {}; groups[g].forEach(function (z) { d[z] = defaults[z]; });
        Object.keys(state.panels || {}).forEach(function (p) { if (state.panels[p] && groups[g].indexOf(state.panels[p].z) >= 0) sv[p] = state.panels[p]; });
        var a = arrange(d, sv); Object.keys(a).forEach(function (z) { arr[z] = a[z]; });
      });
      place(arr);
      // panels whose group has a single column cannot move sideways: hide those buttons
      Object.keys(panels).forEach(function (id) {
        var g = groupOf[zoneOfPanel(id)], n = zoneOrder.filter(function (z) { return groupOf[z] === g; }).length;
        if (n < 2) Array.prototype.forEach.call(panels[id].bar.querySelectorAll('.pmove[data-dir="left"], .pmove[data-dir="right"]'), function (b) { b.hidden = true; });
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var m = document.querySelector('.panel-max'); if (m) setMax(m.getAttribute('data-pid'), false); } });
    };
    api.relabel = function (t) { tr = t || tr; refresh(); };
    api.reset = function () {
      try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      minimized = {}; Object.keys(panels).forEach(function (k) { panels[k].node.classList.remove('panel-max'); }); document.body.classList.remove('has-max');
      var d = window.__panelDefaults; if (d) place(d); else refresh();
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Panels = api;
})(typeof window !== 'undefined' ? window : globalThis);
