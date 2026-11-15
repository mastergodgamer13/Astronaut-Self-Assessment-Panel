/* Orbit: the readiness ring (one arc per body region) and the quiet starfield.
   Pure drawing helpers: no data of its own. Status colours come from CSS. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function polar(cx, cy, r, deg) {
    var a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arc(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }
  // segments: [{id,status,label}], opts: {overall, centerTop, centerBottom, selected, onSelect, aria}
  function ring(segments, opts) {
    opts = opts || {};
    var size = 240, c = size / 2, r = 98, n = Math.max(segments.length, 1), gap = 5, span = 360 / n;
    var svg = s('svg', { viewBox: '0 0 ' + size + ' ' + size, class: 'orbit-ring', role: 'group', 'aria-label': opts.aria || 'Readiness' });
    svg.setAttribute('data-overall', opts.overall || 'nodata');
    svg.appendChild(s('circle', { cx: c, cy: c, r: 70, class: 'orbit-core' }));
    svg.appendChild(s('circle', { cx: c, cy: c, r: 116, class: 'orbit-halo' }));
    var tick = s('g', { class: 'orbit-ticks', 'aria-hidden': 'true' });
    for (var i = 0; i < 60; i++) {
      var p0 = polar(c, c, 111, i * 6), p1 = polar(c, c, i % 5 ? 113 : 116, i * 6);
      tick.appendChild(s('line', { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] }));
    }
    svg.appendChild(tick);
    segments.forEach(function (seg, k) {
      var a0 = k * span + gap / 2, a1 = (k + 1) * span - gap / 2;
      var g = s('g', { class: 'orbit-seg', 'data-status': seg.status, 'data-region': seg.id, tabindex: '0', role: 'button', 'aria-label': seg.label });
      g.style.setProperty('--i', k);
      if (opts.selected === seg.id) g.classList.add('selected');
      g.appendChild(s('path', { d: arc(c, c, r, a0, a1), class: 'orbit-hit' }));
      g.appendChild(s('path', { d: arc(c, c, r, a0, a1), class: 'orbit-arc', pathLength: '100' }));
      var mid = polar(c, c, r + 0, (a0 + a1) / 2);
      g.appendChild(s('circle', { cx: mid[0], cy: mid[1], r: 3.2, class: 'orbit-dot' }));
      var t = s('title', {}); t.textContent = seg.label; g.appendChild(t);
      function pick() { if (opts.onSelect) opts.onSelect(seg.id); }
      g.addEventListener('click', pick);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      svg.appendChild(g);
    });
    var top = s('text', { x: c, y: c - 6, 'text-anchor': 'middle', class: 'orbit-top' });
    top.textContent = opts.centerTop || '';
    var bot = s('text', { x: c, y: c + 20, 'text-anchor': 'middle', class: 'orbit-bot' });
    bot.textContent = opts.centerBottom || '';
    svg.appendChild(top); svg.appendChild(bot);
    return svg;
  }

  // progress ring for the check-up: fraction 0..1
  function progress(fraction, label) {
    var size = 64, c = 32, r = 26;
    var svg = s('svg', { viewBox: '0 0 64 64', class: 'orbit-progress', 'aria-hidden': 'true' });
    svg.appendChild(s('circle', { cx: c, cy: c, r: r, class: 'op-track' }));
    var p = s('circle', { cx: c, cy: c, r: r, class: 'op-bar', pathLength: '100', 'stroke-dasharray': '100', 'stroke-dashoffset': String(100 - Math.max(0, Math.min(1, fraction)) * 100), transform: 'rotate(-90 32 32)' });
    svg.appendChild(p);
    var a = polar(c, c, r, fraction * 360);
    svg.appendChild(s('circle', { cx: a[0], cy: a[1], r: 4, class: 'op-sat' }));
    var t = s('text', { x: c, y: c + 4, 'text-anchor': 'middle', class: 'op-num' }); t.textContent = label || '';
    svg.appendChild(t);
    return svg;
  }

  // starfield: static dots with a slow twinkle; nothing runs when motion is reduced
  function stars() {
    if (document.getElementById('starfield')) return;
    var cv = document.createElement('canvas'); cv.id = 'starfield'; cv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(cv, document.body.firstChild);
    var ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
    var list = [], w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), raf = 0;
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    function seed() {
      w = window.innerWidth; h = window.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(160, w * h / 9000)); list = [];
      for (var i = 0; i < n; i++) list.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + .25, a: Math.random() * .5 + .15, p: Math.random() * 6.28, s: Math.random() * .6 + .2 });
    }
    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      list.forEach(function (o) {
        var k = mq.matches ? 1 : .65 + .35 * Math.sin(t / 1000 * o.s + o.p);
        ctx.globalAlpha = o.a * k; ctx.fillStyle = '#cfe1ff';
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.2832); ctx.fill();
      });
    }
    function loop(t) { draw(t); if (!mq.matches && !document.hidden) raf = requestAnimationFrame(loop); }
    function start() { cancelAnimationFrame(raf); draw(0); if (!mq.matches) raf = requestAnimationFrame(loop); }
    seed(); start();
    window.addEventListener('resize', function () { seed(); start(); });
    document.addEventListener('visibilitychange', start);
  }

  var api = { ring: ring, progress: progress, stars: stars, arc: arc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Orbit = api;
})(typeof window !== 'undefined' ? window : globalThis);
