/* views.js — "Pre/post-flight" (dashboard), "Compare users" and "Real data (OSDR)" views. Browser only. All logic is in core.js / osdr.js. */
(function (root) {
  'use strict';

  var sel = { cmpInd: 'hr', analyte: 'glucose', crew: 'C001', cbc: 'wbc', rr: 'wbc', tool: 'pipeline-transcriptome-de' };

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function picker(ctx, items, current, onPick, label) {
    var wrap = el('div', { class: 'picker', role: 'group', 'aria-label': label });
    items.forEach(function (it) {
      var b = el('button', { type: 'button', 'class': 'pick' + (it.id === current ? ' active' : ''), 'aria-pressed': String(it.id === current), text: it.label });
      b.addEventListener('click', function () { onPick(it.id); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ---------- Compare users ---------- */
  function renderCompare(ctx, box) {
    var t = ctx.t, Core = ctx.Core;
    box.innerHTML = '';
    box.appendChild(el('h2', { text: t('cmp.title') }));
    box.appendChild(el('p', { class: 'hint', text: t('cmp.intro') }));
    var users = ctx.store.users();
    if (!users.length) { box.appendChild(el('p', { class: 'empty', text: t('cmp.empty') })); return; }

    var assessed = users.map(function (u) { return { user: u, a: Core.assess(u.entries) }; });
    // who to look at first: red before yellow before green before no data; ties by number of red, then yellow items
    var RANK = { attention: 0, watch: 1, ok: 2, nodata: 3 };
    var order = assessed.slice().sort(function (a, b) {
      return (RANK[a.a.overall] - RANK[b.a.overall]) || (b.a.counts.attention - a.a.counts.attention) || (b.a.counts.watch - a.a.counts.watch) || a.user.name.localeCompare(b.user.name);
    });
    box.appendChild(el('h3', { text: t('cmp.first.title') }));
    var ol = el('ol', { class: 'cmpfirst' });
    order.forEach(function (x) {
      ol.appendChild(el('li', null, [ctx.chip(x.a.overall), ' ', el('strong', { text: x.user.name }), ' ',
        el('span', { class: 'meta', text: t('cmp.first.counts', { red: x.a.counts.attention, yellow: x.a.counts.watch, green: x.a.counts.ok }) })]));
    });
    box.appendChild(ol); box.appendChild(el('p', { class: 'hint', text: t('cmp.first.note') }));
    var head = el('tr', null, [el('th', { scope: 'col', text: t('cmp.indicator') })]);
    assessed.forEach(function (x) {
      head.appendChild(el('th', { scope: 'col' }, [x.user.name, el('div', { class: 'meta', text: t('cmp.readings', { n: x.user.entries.length }) })]));
    });
    var tbody = el('tbody');
    Core.INDICATORS.forEach(function (ind) {
      var tr = el('tr', null, [el('th', { scope: 'row', text: ctx.indLabel(ind) + ' (' + ctx.unitOf(ind) + ')' })]);
      assessed.forEach(function (x) {
        var res = x.a.per[ind.id];
        var latest = res.series.length ? res.series[res.series.length - 1].value : null;
        tr.appendChild(el('td', null, [
          el('div', { class: 'cell-val', text: latest === null ? '—' : ctx.fmt(latest, ind) }),
          ctx.chip(res.status)
        ]));
      });
      tbody.appendChild(tr);
    });
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [head]), tbody])]));

    // overlay chart for one indicator
    box.appendChild(el('h3', { text: t('cmp.chartTitle') }));
    box.appendChild(picker(ctx, Core.INDICATORS.map(function (i) { return { id: i.id, label: ctx.indLabel(i) }; }), sel.cmpInd,
      function (id) { sel.cmpInd = id; renderCompare(ctx, box); }, t('cmp.pick')));
    var ind = Core.getIndicator(sel.cmpInd);
    var series = [], allT = [];
    users.forEach(function (u) {
      var pts = Core.seriesFor(u.entries, ind.id).map(function (p) { var x = Date.parse(p.date + 'T00:00:00Z'); allT.push(x); return { x: x, y: p.value, title: p.date + ': ' + ctx.fmt(p.value, ind) + ' ' + ctx.unitOf(ind) }; });
      series.push({ name: u.name, points: pts });
    });
    if (!allT.length) { box.appendChild(el('p', { class: 'empty', text: '—' })); return; }
    var xMin = Math.min.apply(null, allT), xMax = Math.max.apply(null, allT);
    function d(x) { return new Date(x).toISOString().slice(0, 10); }
    var chart = Charts.multiChart({
      series: series, xMin: xMin, xMax: xMax, unit: ctx.unitOf(ind), decimals: ind.step < 1 ? 1 : 0,
      xTicks: xMax === xMin ? [{ x: xMin, text: d(xMin) }] : [{ x: xMin, text: d(xMin) }, { x: xMax, text: d(xMax) }],
      aria: t('cmp.chartAria', { label: ctx.indLabel(ind) })
    });
    box.appendChild(chart);
    box.appendChild(Charts.legend(users.map(function (u) { return u.name; })));
  }

  /* ---------- Dashboard: typed-in pre-/post-flight values of the selected user ---------- */
  function renderFlight(ctx, box, records) {
    var t = ctx.t, O = ctx.Osdr;
    box.innerHTML = '';
    var sum = O.flightSummary(records);
    if (!sum.tps.length) { box.appendChild(el('p', { class: 'empty', text: t('fl.none') })); return; }
    var names = Object.keys(O.ANALYTES);
    var head = el('tr', null, [el('th', { scope: 'col', text: t('osdr.tp') })]);
    names.forEach(function (a) { head.appendChild(el('th', { scope: 'col', text: t('osdr.a.' + a) + ' (' + O.ANALYTES[a].unit + ')' })); });
    var tbody = el('tbody');
    sum.tps.forEach(function (tp, i) {
      var tr = el('tr', null, [el('th', { scope: 'row' }, [tp, el('div', { class: 'meta', text: t('fl.group.' + O.groupOf(tp)) })])]);
      names.forEach(function (a) {
        var an = O.ANALYTES[a], dd = an.decimals === 0 ? 1 : 2, p = sum.analytes[a].points[i];
        if (p.value === null) { tr.appendChild(el('td', { text: '—' })); return; }
        var kids = [p.value.toFixed(an.decimals)];
        if (p.flag) kids.push(el('span', { class: 'flag ' + p.flag, title: t('osdr.' + p.flag), text: p.flag === 'low' ? ' ▼' : ' ▲' }));
        if (p.delta !== null) kids.push(el('div', { class: 'meta', text: (p.delta >= 0 ? '+' : '') + p.delta.toFixed(dd) }));
        if (p.vsPre) kids.push(el('div', { class: 'meta', text: (p.vsPre === 'below' ? '↓ ' : '↑ ') + t('pp.' + p.vsPre) }));
        tr.appendChild(el('td', null, kids));
      });
      tbody.appendChild(tr);
    });
    var preTotal = sum.tps.filter(function (tp) { return O.groupOf(tp) === 'pre'; }).length;
    var pre = el('tr', { class: 'sumrow' }, [el('th', { scope: 'row', text: t('fl.preMean') })]);
    names.forEach(function (a) {
      var an = O.ANALYTES[a], s = sum.analytes[a];
      pre.appendChild(el('td', null, s.preN ? [s.preMean.toFixed(an.decimals === 0 ? 1 : 2), el('div', { class: 'meta', text: t('fl.n', { n: s.preN, total: preTotal }) })] : ['—']));
    });
    tbody.appendChild(pre);
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [head]), tbody])]));
    box.appendChild(el('p', { class: 'meta', text: '▼ ' + t('osdr.low') + ' · ▲ ' + t('osdr.high') + ' · ' + t('osdr.delta') + ' (+/−)' }));
    box.appendChild(el('p', { class: 'meta', text: t('fl.note') }));
  }

  /* ---------- Dashboard: pre-flight vs post-flight (real OSDR data, descriptive) ---------- */
  // opts.sub = true: shown inside the "Real data" tab (sub-heading, no repeated badge)
  function renderPrePost(ctx, box, opts) {
    var t = ctx.t, O = ctx.Osdr;
    box.innerHTML = '';
    if (opts && opts.sub) {
      box.appendChild(el('h3', { text: t('pp.title') }));
    } else {
      box.appendChild(el('h2', { text: t('pp.title') }));
      box.appendChild(el('div', { class: 'badge real', text: t('osdr.badge') }));
    }
    box.appendChild(el('p', { class: 'msg', text: t('pp.intro') }));
    box.appendChild(picker(ctx, O.crewIds().map(function (c) { return { id: c, label: c }; }), sel.crew,
      function (id) { sel.crew = id; renderPrePost(ctx, box, opts); }, t('pp.crew')));

    var data = O.prePost(sel.crew);
    var posts = O.TIMEPOINTS.slice(O.PRE);
    var head = el('tr', null, [el('th', { scope: 'col', text: t('osdr.analyte') }), el('th', { scope: 'col', text: t('pp.pre') })]);
    posts.forEach(function (tp) { head.appendChild(el('th', { scope: 'col', text: t('pp.post') + ' ' + tp })); });
    var tbody = el('tbody');
    Object.keys(O.ANALYTES).forEach(function (a) {
      var an = O.ANALYTES[a], d = data[a], dd = an.decimals === 0 ? 1 : 2;
      var tr = el('tr', null, [
        el('th', { scope: 'row', text: t('osdr.a.' + a) + ' (' + an.unit + ')' }),
        el('td', null, [d.preMean.toFixed(dd), el('div', { class: 'meta', text: t('pp.range') + ': ' + d.preMin.toFixed(an.decimals) + '–' + d.preMax.toFixed(an.decimals) })])
      ]);
      d.post.forEach(function (p) {
        var kids = [p.value.toFixed(an.decimals)];
        if (p.flag) kids.push(el('span', { class: 'flag ' + p.flag, title: t('osdr.' + p.flag), text: p.flag === 'low' ? ' ▼' : ' ▲' }));
        kids.push(el('div', { class: 'meta', text: (p.delta >= 0 ? '+' : '') + p.delta.toFixed(dd) }));
        if (p.vsPre) kids.push(el('div', { class: 'meta', text: (p.vsPre === 'below' ? '↓ ' : '↑ ') + t('pp.' + p.vsPre) }));
        tr.appendChild(el('td', null, kids));
      });
      tbody.appendChild(tr);
    });
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [head]), tbody])]));
    box.appendChild(el('p', { class: 'meta', text: '▼ ' + t('osdr.low') + ' · ▲ ' + t('osdr.high') + ' · ' + t('osdr.delta') + ' (+/−)' }));
    box.appendChild(el('p', { class: 'msg', text: t('pp.note') }));
    box.appendChild(el('p', { class: 'meta' }, [t('osdr.source') + ' ', el('a', { href: O.SOURCE_URL, target: '_blank', rel: 'noopener noreferrer', text: t('osdr.link') })]));
  }

  /* ---------- OSD-635 gene results (table is loaded on demand: js/osd635-genes.js) ---------- */
  var genesWaiting = null;
  function loadGenes(ok, fail) {
    if (root.Osd635Genes) { ok(); return; }
    if (genesWaiting) { genesWaiting.push({ ok: ok, fail: fail }); return; }
    genesWaiting = [{ ok: ok, fail: fail }];
    var sc = document.createElement('script');
    sc.src = 'js/osd635-genes.js?v=20261115f';
    sc.onload = function () { var w = genesWaiting; genesWaiting = null; w.forEach(function (x) { x.ok(); }); };
    sc.onerror = function () { var w = genesWaiting; genesWaiting = null; w.forEach(function (x) { x.fail(); }); };
    document.head.appendChild(sc);
  }

  function fmtP(p) { return p === null ? '—' : (p < 0.001 ? p.toExponential(2) : p.toFixed(4)); }
  function fmtMean(x) { return x === null ? '—' : x.toFixed(1); }

  function geneTable(ctx, genes, withEnsembl) {
    var t = ctx.t, Ex = ctx.Expression;
    var cols = ['ge.h.gene'].concat(withEnsembl ? ['ge.h.ensembl'] : [], ['ge.h.log2fc', 'ge.h.fc', 'ge.h.padj', 'ge.h.class', 'ge.h.flight', 'ge.h.ground']);
    var head = el('tr', null, cols.map(function (k) { return el('th', { scope: 'col', text: t(k) }); }));
    var body = el('tbody');
    genes.forEach(function (g) {
      var cls = Ex.classify(g.log2fc, g.padj);
      var arrow = cls === 'up' ? '▲ ' : cls === 'down' ? '▼ ' : '';
      var fc = g.log2fc === null ? '—' : Ex.foldChange(g.log2fc).toFixed(2);
      var cells = [el('th', { scope: 'row' }, [g.symbol || g.ensembl, g.name ? el('div', { class: 'meta', text: g.name }) : null])];
      if (withEnsembl) cells.push(el('td', { text: g.ensembl }));
      cells.push(el('td', { text: g.log2fc === null ? '—' : g.log2fc.toFixed(2) }), el('td', { text: fc }), el('td', { text: fmtP(g.padj) }),
        el('td', { text: arrow + t('ge.c.' + cls) }), el('td', { text: fmtMean(g.flightMean) }), el('td', { text: fmtMean(g.groundMean) }));
      body.appendChild(el('tr', null, cells));
    });
    return el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [head]), body])]);
  }

  function renderGenes(ctx, box) {
    var t = ctx.t, O = ctx.Osd635, Ex = ctx.Expression, D = root.Osd635Genes;
    box.innerHTML = '';
    var D0 = Ex.DEFAULTS, a = O.analyze(D);
    box.appendChild(el('h4', { text: t('ge.title') }));
    box.appendChild(el('p', { class: 'msg', text: t('ge.contrast') }));
    box.appendChild(el('p', { class: 'hint', text: t('ge.thresholds', { p: D0.padj, l: D0.log2fc, f: Ex.foldChange(D0.log2fc).toFixed(2) }) }));

    var sb = el('tbody');
    Ex.CLASSES.forEach(function (c) {
      if (c === 'nodata' && !a.counts.nodata) return;
      sb.appendChild(el('tr', null, [el('th', { scope: 'row', text: (c === 'up' ? '▲ ' : c === 'down' ? '▼ ' : '') + t('ge.c.' + c) }), el('td', { text: a.counts[c].toLocaleString('en-US') })]));
    });
    sb.appendChild(el('tr', { class: 'sumrow' }, [el('th', { scope: 'row', text: t('ge.total') }), el('td', { text: a.total.toLocaleString('en-US') })]));
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [el('tr', null, [el('th', { scope: 'col', text: t('ge.h.class') }), el('th', { scope: 'col', text: t('ge.h.count') })])]), sb])]));
    box.appendChild(el('p', { class: 'meta', text: t('ge.stated', { stated: O.STUDY.statedSignificantGenes.toLocaleString('en-US'), n: (a.counts.up + a.counts.down).toLocaleString('en-US') }) }));

    var pts = [], clip = 0, XL = 14, YL = 100;
    D.rows.forEach(function (r) {
      if (r[3] === null || r[4] === null) return;
      var y = r[4] > 0 ? -Math.log10(r[4]) : YL; if (y > YL) clip++;
      pts.push({ x: r[3], y: y, c: Ex.classify(r[3], r[4]) });
    });
    box.appendChild(el('h4', { text: t('ge.volTitle') }));
    box.appendChild(Charts.volcano({ points: pts, xLimit: XL, yLimit: YL, xCut: D0.log2fc, yCut: -Math.log10(D0.padj), xLabel: t('ge.volX'), yLabel: t('ge.volY'), aria: t('ge.volAria', { n: pts.length.toLocaleString('en-US') }) }));
    box.appendChild(Charts.classLegend(['up', 'down', 'below', 'ns'].map(function (c) { return { cls: c, text: t('ge.c.' + c) }; })));
    box.appendChild(el('p', { class: 'meta', text: t('ge.volNote', { y: YL, n: clip }) }));

    box.appendChild(el('h4', { text: t('ge.featured') }));
    box.appendChild(geneTable(ctx, O.bySymbol(D, O.FEATURED), false));

    var lab = el('label', { class: 'genesearch' }, [el('span', { text: t('ge.search') }), el('input', { type: 'search', maxlength: '40', autocomplete: 'off', placeholder: t('ge.searchPh') })]);
    var res = el('div', { 'aria-live': 'polite' });
    box.appendChild(lab); box.appendChild(res);
    lab.querySelector('input').addEventListener('input', function (ev) {
      var q = ev.target.value; res.innerHTML = '';
      if (!q.trim()) return;
      var hits = O.find(D, q, 10);
      res.appendChild(hits.length ? geneTable(ctx, hits, true) : el('p', { class: 'empty', text: t('ge.none') }));
    });

    ['up', 'down'].forEach(function (c) {
      box.appendChild(el('h4', { text: t(c === 'up' ? 'ge.topUp' : 'ge.topDown') }));
      box.appendChild(geneTable(ctx, O.top(D, c, 10), true));
    });
    box.appendChild(el('p', { class: 'meta', text: t('ge.topNote') }));
    box.appendChild(el('p', { class: 'msg', text: t('ge.note') }));
  }

  /* ---------- Real data: OSD-635 study information ---------- */
  function renderOsd635(ctx, box) {
    var t = ctx.t, O = ctx.Osd635, S = O.STUDY;
    box.innerHTML = '';
    box.appendChild(el('h3', { text: t('o6.title') + ': ' + S.id }));
    box.appendChild(el('div', { class: 'badge real', text: t('o6.badge') }));
    box.appendChild(el('p', { class: 'msg', text: S.title }));
    box.appendChild(el('p', { class: 'hint', text: t('o6.what') }));

    var rows = [
      [t('o6.f.cell'), S.cell + ' — ' + S.organism],
      [t('o6.f.design'), t('o6.v.design', { f: O.count('flight'), g: O.count('ground') })],
      [t('o6.f.culture'), t('o6.v.culture', { d: S.cultureDays, c: S.cultureTempC })],
      [t('o6.f.mission'), S.mission + ', ' + S.program + ', ' + S.missionStart + ' – ' + S.missionEnd],
      [t('o6.f.hardware'), S.hardware],
      [t('o6.f.sequencing'), S.platform + ', ' + S.library]
    ];
    var tb = el('tbody');
    rows.forEach(function (r) { tb.appendChild(el('tr', null, [el('th', { scope: 'row', text: r[0] }), el('td', { text: r[1] })])); });
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [tb])]));

    var head = el('tr', null, ['o6.sample', 'o6.group', 'o6.depth', 'o6.rrna'].map(function (k) { return el('th', { scope: 'col', text: t(k) }); }));
    var body = el('tbody');
    O.SAMPLES.forEach(function (s) {
      body.appendChild(el('tr', null, [
        el('th', { scope: 'row', text: s.id }), el('td', { text: t('o6.g.' + s.group) }),
        el('td', { text: s.readDepth.toLocaleString('en-US') }), el('td', { text: s.rrna.toFixed(2) + ' %' })
      ]));
    });
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [head]), body])]));

    var gbox = el('div', { class: 'genes' });
    box.appendChild(gbox);
    gbox.appendChild(el('p', { class: 'hint', text: t('ge.loading') }));
    loadGenes(function () { renderGenes(ctx, gbox); }, function () { gbox.innerHTML = ''; gbox.appendChild(el('p', { class: 'callout', role: 'alert', text: t('ge.error') })); });
    box.appendChild(el('p', { class: 'meta' }, [t('o6.source', { files: S.sourceFiles.join(', ') }) + ' ', el('a', { href: O.DOI_URL, target: '_blank', rel: 'noopener noreferrer', text: t('o6.paper') })]));
  }


  /* CBC line chart for one analyte (all crew), shared by the OSD-569 section and the immune-system region */
  function cbcChart(ctx, box, id) {
    var t = ctx.t, O = ctx.Osd569;
    // chart: one CBC analyte over time, one line per crew member, laboratory range(s) as shaded band(s)
    var can = O.analyte(id), crewList = O.crewIds(), rg = {}, bands = [];
    crewList.forEach(function (c) {
      var k = O.CREW[c][id];
      k.values.forEach(function (v, i) { if (k.lo[i] !== null && k.hi[i] !== null && !rg[k.lo[i] + '–' + k.hi[i]]) { rg[k.lo[i] + '–' + k.hi[i]] = 1; bands.push({ lo: k.lo[i], hi: k.hi[i] }); } });
    });
    box.appendChild(el('p', { class: 'hint', text: t('o9.cbc.range', { r: Object.keys(rg).join('; '), unit: can.unit }) }));
    var clabel = t('o9.a.' + id);
    box.appendChild(Charts.multiChart({
      series: crewList.map(function (c) {
        var k = O.CREW[c][id], pts = [];
        k.values.forEach(function (v, i) { if (v !== null) pts.push({ x: i, y: v, title: O.TIMEPOINTS[i] + ' (' + c + '): ' + v.toFixed(can.decimals) + ' ' + can.unit }); });
        return { name: c, points: pts };
      }),
      xMin: 0, xMax: O.TIMEPOINTS.length - 1, bands: bands, unit: can.unit, decimals: can.decimals,
      xTicks: O.TIMEPOINTS.map(function (tp, i) { return { x: i, text: tp }; }),
      marks: [{ x: O.PRE - 0.5, text: t('osdr.flight') }],
      aria: t('o9.cbc.chartAria', { label: clabel })
    }));
    box.appendChild(Charts.legend(crewList));
  }

  /* pre-flight vs post-flight CBC table for one crew member; ids = analyte ids or null for all */
  function cbcTable(ctx, box, crew, ids) {
    var t = ctx.t, O = ctx.Osd569;
    var list = O.ANALYTES.filter(function (a) { return !ids || ids.indexOf(a.id) >= 0; });
    var data = O.prePost(crew), posts = O.TIMEPOINTS.slice(O.PRE);
    var head = el('tr', null, [el('th', { scope: 'col', text: t('osdr.analyte') }), el('th', { scope: 'col', text: t('pp.pre') })]);
    posts.forEach(function (tp) { head.appendChild(el('th', { scope: 'col', text: t('pp.post') + ' ' + tp })); });
    var body = el('tbody');
    list.forEach(function (an) {
      var d = data[an.id], dd = an.decimals + 1;
      var first = d.preMean === null ? '—' : d.preMean.toFixed(dd);
      var tr = el('tr', null, [el('th', { scope: 'row', text: t('o9.a.' + an.id) }),
        el('td', null, [first, d.preN ? el('div', { class: 'meta', text: t('pp.range') + ': ' + d.preMin.toFixed(an.decimals) + '–' + d.preMax.toFixed(an.decimals) + ' (n=' + d.preN + ')' }) : null])]);
      d.post.forEach(function (p) {
        if (p.value === null) { tr.appendChild(el('td', { text: '—' })); return; }
        var kids = [p.value.toFixed(an.decimals)];
        if (p.flag) kids.push(el('span', { class: 'flag ' + p.flag, title: t('osdr.' + p.flag), text: p.flag === 'low' ? ' ▼' : ' ▲' }));
        if (p.delta !== null) kids.push(el('div', { class: 'meta', text: (p.delta >= 0 ? '+' : '') + p.delta.toFixed(dd) }));
        if (p.vsPre) kids.push(el('div', { class: 'meta', text: (p.vsPre === 'below' ? '↓ ' : '↑ ') + t('pp.' + p.vsPre) }));
        tr.appendChild(el('td', null, kids));
      });
      body.appendChild(tr);
    });
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [head]), body])]));
  }

  /* ---------- OSD-569: blood count + direct RNA-seq gene results (real data) ---------- */
  function renderOsd569(ctx, box) {
    var t = ctx.t, O = ctx.Osd569, Ex = ctx.Expression, S = O.STUDY;
    box.innerHTML = '';
    box.appendChild(el('h3', { text: t('o9.title') }));
    box.appendChild(el('div', { class: 'badge real', text: t('o9.badge') }));
    box.appendChild(el('p', { class: 'msg', text: S.title }));
    box.appendChild(el('p', { class: 'hint', text: t('o9.what') }));
    var rows = [
      [t('o9.f.mission'), t('o9.v.mission', { m: S.mission, s: S.missionStart, e: S.missionEnd })],
      [t('o9.f.crew'), t('o9.v.crew')],
      [t('o9.f.tests'), t('o9.v.tests', { a: S.cbcAnalyzer })],
      [t('o9.f.rna'), t('o9.v.rna', { n: O.NANOPORE.samples, d: S.longRead })]
    ];
    var tb = el('tbody');
    rows.forEach(function (r) { tb.appendChild(el('tr', null, [el('th', { scope: 'row', text: r[0] }), el('td', { text: r[1] })])); });
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [tb])]));

    // complete blood count, pre-flight vs post-flight, per crew member (shared crew picker)
    box.appendChild(el('h4', { text: t('o9.cbc.title') }));
    box.appendChild(el('p', { class: 'msg', text: t('o9.cbc.intro') }));
    box.appendChild(picker(ctx, O.ANALYTES.map(function (a) { return { id: a.id, label: t('o9.a.' + a.id) }; }), sel.cbc,
      function (id) { sel.cbc = id; renderOsd569(ctx, box); }, t('osdr.analyte')));
    cbcChart(ctx, box, sel.cbc);
    box.appendChild(picker(ctx, O.crewIds().map(function (c) { return { id: c, label: c }; }), sel.crew,
      function (id) { sel.crew = id; renderOsd569(ctx, box); }, t('pp.crew')));
    cbcTable(ctx, box, sel.crew, null);
    box.appendChild(el('p', { class: 'meta', text: '▼ ' + t('osdr.low') + ' · ▲ ' + t('osdr.high') + ' · ' + t('osdr.delta') + ' (+/−)' }));
    box.appendChild(el('p', { class: 'msg', text: t('o9.cbc.note') }));
    O.EXCLUDED.forEach(function (x) {
      box.appendChild(el('p', { class: 'meta', text: t('o9.cbc.excl', { crew: x.crew, tp: x.tp, fields: x.fields.map(function (f) { return t('o9.a.' + f); }).join('; ') }) }));
    });

    // gene results: class counts per comparison (cut-offs from expression.js), then the genes that pass both
    box.appendChild(el('h4', { text: t('o9.g.title') }));
    box.appendChild(el('p', { class: 'msg', text: t('o9.g.intro', { n: O.COMPARISONS.length, nd: t('ge.c.nodata') }) }));
    var D = Ex.DEFAULTS;
    box.appendChild(el('p', { class: 'hint', text: t('ge.thresholds', { p: D.padj, l: D.log2fc, f: Ex.foldChange(D.log2fc).toFixed(2) }) }));
    var classes = ['up', 'down', 'below', 'ns', 'nodata'];
    box.appendChild(picker(ctx, O.TOOLS.map(function (k) { return { id: k, label: t('o9.g.tool.' + k) }; }), sel.tool,
      function (id) { sel.tool = id; renderOsd569(ctx, box); }, t('o9.g.toolPick')));
    box.appendChild(Charts.divergingBars({
      rows: O.COMPARISONS.map(function (cmp) { var k = O.classCounts(cmp.id, sel.tool); return { label: cmp.id, down: k.down, up: k.up }; }),
      downText: t('ge.c.down'), upText: t('ge.c.up'), aria: t('o9.g.chartAria', { tool: t('o9.g.tool.' + sel.tool) })
    }));
    box.appendChild(el('p', { class: 'meta', text: t('o9.g.chartNote') }));
    var gh = el('tr', null, [el('th', { scope: 'col', text: t('o9.g.col.cmp') }), el('th', { scope: 'col', text: t('o9.g.col.genes') }), el('th', { scope: 'col', text: '' })]);
    classes.forEach(function (c) { gh.appendChild(el('th', { scope: 'col', text: t('ge.c.' + c) })); });
    var gb = el('tbody');
    O.COMPARISONS.forEach(function (cmp) {
      O.TOOLS.forEach(function (tool, k) {
        var c = O.classCounts(cmp.id, tool), tr = el('tr', null);
        if (k === 0) {
          tr.appendChild(el('th', { scope: 'row', rowspan: String(O.TOOLS.length) }, [cmp.id, el('div', { class: 'meta', text: cmp.cmp })]));
          tr.appendChild(el('td', { rowspan: String(O.TOOLS.length), text: cmp.genes.toLocaleString('en-US') }));
        }
        tr.appendChild(el('td', { text: t('o9.g.tool.' + tool) }));
        classes.forEach(function (cl) { tr.appendChild(el('td', { text: c[cl].toLocaleString('en-US') })); });
        gb.appendChild(tr);
      });
    });
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [gh]), gb])]));
    box.appendChild(el('p', { class: 'msg', text: t('o9.g.note') }));

    var lg = O.listedGenes();
    box.appendChild(el('p', { class: 'hint', text: t('o9.g.listed', { c: O.LISTED.comparison, t: t('o9.g.tool.' + O.LISTED.tool) }) }));
    var lh = el('tr', null, ['o9.g.gene', 'ge.h.log2fc', 'o9.g.fc', 'ge.h.padj', 'ge.h.class'].map(function (k) { return el('th', { scope: 'col', text: t(k) }); }));
    var lb = el('tbody');
    lg.forEach(function (g) {
      lb.appendChild(el('tr', null, [el('th', { scope: 'row', text: g.ensembl }), el('td', { text: (g.log2fc >= 0 ? '+' : '') + g.log2fc.toFixed(2) }),
        el('td', { text: g.fc < 1 ? g.fc.toFixed(3) : g.fc.toFixed(2) }), el('td', { text: g.padj.toExponential(2) }), el('td', { text: t('ge.c.' + g.cls) })]));
    });
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [lh]), lb])]));
    box.appendChild(el('p', { class: 'meta', text: t('o9.g.listedNote') }));
    box.appendChild(el('p', { class: 'meta' }, [t('o9.source') + ' ', el('a', { href: O.DOI_URL, target: '_blank', rel: 'noopener noreferrer', text: t('o9.paper') })]));
  }


  /* ---------- Body-map region: real crew reference data (not the user's own data) ---------- */
  function renderRegionRef(ctx, box, ids) {
    var t = ctx.t, O = ctx.Osd569;
    box.innerHTML = '';
    box.appendChild(el('h4', { text: t('rr.title') }));
    box.appendChild(el('div', { class: 'badge real', text: t('rr.badge') }));
    box.appendChild(el('p', { class: 'msg', text: t('rr.intro') }));
    box.appendChild(picker(ctx, ids.map(function (a) { return { id: a, label: t('o9.a.' + a) }; }), ids.indexOf(sel.rr) >= 0 ? sel.rr : ids[0],
      function (id) { sel.rr = id; renderRegionRef(ctx, box, ids); }, t('osdr.analyte')));
    cbcChart(ctx, box, ids.indexOf(sel.rr) >= 0 ? sel.rr : ids[0]);
    box.appendChild(picker(ctx, O.crewIds().map(function (c) { return { id: c, label: c }; }), sel.crew,
      function (id) { sel.crew = id; renderRegionRef(ctx, box, ids); }, t('pp.crew')));
    cbcTable(ctx, box, sel.crew, ids);
    box.appendChild(el('p', { class: 'meta', text: '▼ ' + t('osdr.low') + ' · ▲ ' + t('osdr.high') + ' · ' + t('osdr.delta') + ' (+/−)' }));
    box.appendChild(el('p', { class: 'msg', text: t('o9.cbc.note') }));
    box.appendChild(el('p', { class: 'meta' }, [t('rr.source') + ' ', el('a', { href: O.DOI_URL, target: '_blank', rel: 'noopener noreferrer', text: t('o9.paper') })]));
  }

  /* ---------- the user's own immune cell values (descriptive; never a status) ---------- */
  function renderImmuneOwn(ctx, box, records, inRegion, assess) {
    var t = ctx.t, I = ctx.Immune;
    box.innerHTML = '';
    var sum = I.summary(records);
    if (inRegion) {
      box.appendChild(el('h4', { text: t('im.own.title') }));
      box.appendChild(el('div', { class: 'badge man', text: t('im.own.badge') }));
      if (assess) {
        Object.keys(I.ANALYTES).forEach(function (a) {
          var res = assess.per[a], an = I.ANALYTES[a], wrap = el('div', { class: 'ind' });
          wrap.appendChild(el('div', { class: 'ind-head' }, [el('div', null, [el('strong', { text: t('o9.a.' + a) }), ' ', ctx.chip(res.status)])]));
          wrap.appendChild(el('p', { class: 'msg', text: t('msg.' + res.status) }));
          var rf = I.REFERENCE[a], meta = t('ref.line', { oklo: rf.ok[0], okhi: rf.ok[1], wlo: rf.watch[0], whi: rf.watch[1], unit: an.unit }) + ' ' +
            (res.baselineStatus === 'nodata' ? t('reason.' + res.reasonCode, res.reasonParams)
            : t('im.stat.meta', { mean: res.baseline.mean.toFixed(an.decimals + 1), sd: res.baseline.sd.toFixed(an.decimals + 1), n: res.baseline.n, rn: res.recentN, rmean: res.recentMean.toFixed(an.decimals + 1), unit: an.unit, z: res.z.toFixed(1) }));
          wrap.appendChild(el('div', { class: 'meta', text: meta }));
          box.appendChild(wrap);
        });
        box.appendChild(el('p', { class: 'msg', text: t('im.stat.note') }));
      }
    }
    if (!sum.tps.length) { box.appendChild(el('p', { class: 'empty', text: t(inRegion ? 'im.own.empty' : 'im.none') })); return; }
    var names = Object.keys(I.ANALYTES);
    var head = el('tr', null, [el('th', { scope: 'col', text: t('osdr.tp') })]);
    names.forEach(function (a) { head.appendChild(el('th', { scope: 'col', text: t('o9.a.' + a) })); });
    var tbody = el('tbody');
    sum.tps.forEach(function (tp, i) {
      var tr = el('tr', null, [el('th', { scope: 'row' }, [tp, el('div', { class: 'meta', text: t('fl.group.' + ctx.Osdr.groupOf(tp)) })])]);
      names.forEach(function (a) {
        var an = I.ANALYTES[a], dd = an.decimals + 1, p = sum.analytes[a].points[i];
        if (p.value === null) { tr.appendChild(el('td', { text: '—' })); return; }
        var kids = [p.value.toFixed(an.decimals)];
        if (p.flag) kids.push(el('span', { class: 'flag ' + p.flag, title: t('osdr.' + p.flag), text: p.flag === 'low' ? ' ▼' : ' ▲' }));
        if (p.delta !== null) kids.push(el('div', { class: 'meta', text: (p.delta >= 0 ? '+' : '') + p.delta.toFixed(dd) }));
        if (p.vsPre) kids.push(el('div', { class: 'meta', text: (p.vsPre === 'below' ? '↓ ' : '↑ ') + t('pp.' + p.vsPre) }));
        tr.appendChild(el('td', null, kids));
      });
      tbody.appendChild(tr);
    });
    var pre = el('tr', { class: 'sumrow' }, [el('th', { scope: 'row', text: t('fl.preMean') })]);
    names.forEach(function (a) {
      var an = I.ANALYTES[a], s = sum.analytes[a];
      pre.appendChild(el('td', null, s.preN ? [s.preMean.toFixed(an.decimals + 1), el('div', { class: 'meta', text: t('fl.n', { n: s.preN, total: sum.tps.filter(function (tp) { return ctx.Osdr.groupOf(tp) === 'pre'; }).length }) })] : ['—']));
    });
    tbody.appendChild(pre);
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [head]), tbody])]));
    box.appendChild(el('p', { class: 'meta', text: '▼ ' + t('osdr.low') + ' · ▲ ' + t('osdr.high') + ' · ' + t('osdr.delta') + ' (+/−)' }));
    box.appendChild(el('p', { class: 'meta', text: t('im.note') }));
  }

  /* ---------- Inspirations: the three NASA studies used to gather ideas ---------- */
  var INSPIRATIONS = [
    { id: 'osd575', study: 'OSD-575', jump: 'osdr' },
    { id: 'osd569', study: 'OSD-569', jump: 'o569' },
    { id: 'osd635', study: 'OSD-635', jump: 'o635' }
  ];
  function renderInspirations(ctx, box) {
    var t = ctx.t;
    box.innerHTML = '';
    box.appendChild(el('h2', { text: t('insp.title') }));
    box.appendChild(el('p', { class: 'msg', text: t('insp.intro') }));
    var grid = el('div', { class: 'insp-grid' });
    INSPIRATIONS.forEach(function (s) {
      var card = el('article', { class: 'insp-card' });
      card.appendChild(el('h3', { text: t('insp.' + s.id + '.name') }));
      card.appendChild(el('p', { class: 'msg', text: t('insp.' + s.id + '.what') }));
      card.appendChild(el('p', { class: 'msg' }, [el('strong', { text: t('insp.idea') + ' ' }), t('insp.' + s.id + '.idea')]));
      var row = el('div', { class: 'insp-links' });
      var go = el('button', { type: 'button', class: 'ghost', text: t('insp.open') });
      go.addEventListener('click', function () { var n = document.getElementById(s.jump); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      row.appendChild(go);
      row.appendChild(el('a', { href: 'https://osdr.nasa.gov/bio/repo/data/studies/' + s.study, target: '_blank', rel: 'noopener noreferrer', text: t('insp.page', { id: s.study }) }));
      card.appendChild(row);
      grid.appendChild(card);
    });
    box.appendChild(grid);
    box.appendChild(el('p', { class: 'meta', text: t('insp.more') }));
  }

  /* ---------- Real data (OSDR) ---------- */
  function renderOsdr(ctx, box) {
    var t = ctx.t, O = ctx.Osdr;
    box.innerHTML = '';
    box.appendChild(el('h2', { text: t('osdr.title') }));
    box.appendChild(el('div', { class: 'badge real', text: t('osdr.badge') }));
    box.appendChild(el('p', { class: 'msg', text: t('osdr.what') }));

    var an = O.ANALYTES[sel.analyte];
    box.appendChild(picker(ctx, Object.keys(O.ANALYTES).map(function (k) { return { id: k, label: t('osdr.a.' + k) }; }), sel.analyte,
      function (id) { sel.analyte = id; renderOsdr(ctx, box); }, t('osdr.analyte')));
    box.appendChild(el('p', { class: 'hint', text: t('osdr.range', { lo: an.lo, hi: an.hi, unit: an.unit }) }));

    var crew = O.crewIds();
    var series = crew.map(function (c) {
      return { name: c, points: O.summary(c, sel.analyte).points.map(function (p, i) { return { x: i, y: p.value, title: p.tp + ': ' + p.value.toFixed(an.decimals) + ' ' + an.unit }; }) };
    });
    var label = t('osdr.a.' + sel.analyte) + ' (' + an.unit + ')';
    box.appendChild(Charts.multiChart({
      series: series, xMin: 0, xMax: O.TIMEPOINTS.length - 1, band: { lo: an.lo, hi: an.hi }, unit: an.unit, decimals: an.decimals,
      xTicks: O.TIMEPOINTS.map(function (tp, i) { return { x: i, text: tp }; }),
      marks: [{ x: O.PRE - 0.5, text: t('osdr.flight') }],
      aria: t('osdr.chartAria', { label: label })
    }));
    box.appendChild(Charts.legend(crew));

    // table: time points x crew; out-of-range values are marked with a symbol AND text
    var head = el('tr', null, [el('th', { scope: 'col', text: t('osdr.tp') })]);
    crew.forEach(function (c) { head.appendChild(el('th', { scope: 'col', text: c })); });
    var tbody = el('tbody');
    var sums = crew.map(function (c) { return O.summary(c, sel.analyte); });
    O.TIMEPOINTS.forEach(function (tp, i) {
      var tr = el('tr', null, [el('th', { scope: 'row', text: tp })]);
      sums.forEach(function (s) {
        var p = s.points[i], txt = p.value.toFixed(an.decimals);
        var kids = [txt];
        if (p.flag) kids.push(el('span', { class: 'flag ' + p.flag, title: t('osdr.' + p.flag), text: p.flag === 'low' ? ' ▼' : ' ▲' }));
        if (p.delta !== null) kids.push(el('div', { class: 'meta', text: (p.delta >= 0 ? '+' : '') + p.delta.toFixed(an.decimals === 0 ? 1 : 2) }));
        tr.appendChild(el('td', null, kids));
      });
      tbody.appendChild(tr);
    });
    var pre = el('tr', { class: 'sumrow' }, [el('th', { scope: 'row', text: t('osdr.preMean') })]);
    sums.forEach(function (s) { pre.appendChild(el('td', { text: s.preMean.toFixed(an.decimals === 0 ? 1 : 2) })); });
    tbody.appendChild(pre);
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'cmp' }, [el('thead', null, [head]), tbody])]));
    box.appendChild(el('p', { class: 'meta', text: '▼ ' + t('osdr.low') + ' · ▲ ' + t('osdr.high') + ' · ' + t('osdr.delta') + ' (+/−)' }));

    O.outsideAt(sel.analyte, 2).forEach(function (o) {
      box.appendChild(el('div', { class: 'callout', role: 'note', text: t('osdr.out', { tp: o.tp, n: o.n, total: o.total, min: o.min, max: o.max, unit: an.unit }) }));
    });
    var pp = el('div', { class: 'prepost-sub' });
    box.appendChild(pp);
    renderPrePost(ctx, pp, { sub: true });
    box.appendChild(el('p', { class: 'msg', text: t('osdr.limits') }));
    box.appendChild(el('p', { class: 'meta', text: t('osdr.fileNote') }));
    box.appendChild(el('p', { class: 'meta' }, [t('osdr.source') + ' ', el('a', { href: O.SOURCE_URL, target: '_blank', rel: 'noopener noreferrer', text: t('osdr.link') })]));
  }

  /* ---------- Live NASA catalog (OSDR API, called from the browser) ---------- */
  /** Prepares a catalog search (term + results) so the Live tab opens already showing it. */
  function searchLive(ctx, term, done) {
    live.term = term; live.res = { loading: true };
    try { ctx.Live.setBase(window.localStorage.getItem('ll_proxy') || ''); } catch (e) { /* storage blocked */ }
    ctx.Live.search(function (u) { return window.fetch(u); }, { term: term, human: live.human, size: 50 }).then(function (r) { live.res = r; if (done) done(); });
    if (done) done();
  }
  var live = { term: '', human: true, diag: null, res: null, busy: false, proxy: '', open: null, detail: null };
  try { live.proxy = window.localStorage.getItem('ll_proxy') || ''; } catch (e) { live.proxy = ''; }


  function fmtSize(n) { return n === null ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B'; }

  function liveDetail(ctx, d) {
    var t = ctx.t, box = el('div', { class: 'msg' });
    if (!d || d.loading) { box.appendChild(document.createTextNode(t('lv.busy'))); return box; }
    if (!d.ok) { box.appendChild(el('p', { text: t('lv.err.' + (d.metaError || d.filesError), { status: d.metaStatus, keys: '' }) })); return box; }
    if (d.meta) {
      var m = d.meta;
      if (m.description) box.appendChild(el('p', { text: m.description.length > 600 ? m.description.slice(0, 600) + '…' : m.description }));
      var facts = [[t('lv.d.assays'), m.assays.join(', ')], [t('lv.d.factors'), m.factors.join(', ')], [t('lv.d.release'), m.release]].filter(function (x) { return x[1]; });
      facts.forEach(function (x) { box.appendChild(el('div', { class: 'meta', text: x[0] + ': ' + x[1] })); });
    } else box.appendChild(el('p', { text: t('lv.d.nometa') }));
    if (d.filesError) box.appendChild(el('p', { text: t('lv.d.nofiles') }));
    else {
      var tables = d.files.filter(function (f) { return f.table; });
      box.appendChild(el('strong', { text: t('lv.d.files', { n: d.files.length, tables: tables.length }) }));
      var ul = el('ul');
      d.files.slice(0, 40).forEach(function (f) {
        ul.appendChild(el('li', { text: (f.table ? '▦ ' : '') + f.name + (f.size ? ' (' + fmtSize(f.size) + ')' : '') }));
      });
      box.appendChild(ul);
      if (d.files.length > 40) box.appendChild(el('div', { class: 'meta', text: t('lv.d.more', { n: d.files.length - 40 }) }));
      box.appendChild(el('div', { class: 'meta', text: t('lv.d.next') }));
    }
    return box;
  }

  function renderLive(ctx, box) {
    var t = ctx.t, L = ctx.Live;
    box.innerHTML = '';
    box.appendChild(el('h2', { text: t('lv.title') }));
    box.appendChild(el('div', { class: 'badge real', text: t('lv.badge') }));
    box.appendChild(el('p', { class: 'msg', text: t('lv.what') }));
    function again() { renderLive(ctx, box); }
    L.setBase(live.proxy);
    var fetchFn = function (u) { return window.fetch(u); };

    // 1. connection check
    var chk = el('button', { type: 'button', text: t(live.busy ? 'lv.busy' : 'lv.check') });
    chk.addEventListener('click', function () {
      live.busy = true; live.diag = null; again();
      L.diagnose(fetchFn).then(function (d) { live.busy = false; live.diag = d; again(); });
    });
    box.appendChild(chk);
    if (live.diag) {
      var d = live.diag, ul = el('ul', { class: 'msg' });
      [['search', d.search], ['meta', d.meta]].forEach(function (p) {
        var r = p[1];
        ul.appendChild(el('li', { text: t('lv.diag.' + p[0]) + ': ' + (r.ok ? t('lv.ok') : t('lv.err.' + r.error, { status: r.status, keys: r.keys.join(', ') })) }));
      });
      box.appendChild(ul);
      box.appendChild(el('p', { class: 'msg', text: d.ok ? t('lv.diag.good') : t('lv.diag.bad') }));
    }

    // proxy address (only needed when the browser blocks direct calls); kept in this browser only
    var pf = el('div', { class: 'msg' });
    var pin = el('input', { type: 'url', name: 'proxy', value: live.proxy, placeholder: 'https://....workers.dev', 'aria-label': t('lv.proxy') });
    pin.addEventListener('change', function () {
      live.proxy = pin.value.trim(); L.setBase(live.proxy);
      try { window.localStorage.setItem('ll_proxy', live.proxy); } catch (e) { /* storage can be unavailable */ }
    });
    pf.appendChild(el('label', null, [el('span', { text: t('lv.proxy') }), pin]));
    pf.appendChild(el('small', { class: 'meta', text: t('lv.proxy.hint') }));
    box.appendChild(pf);
    box.appendChild(relayCheck(ctx, function () { return pin.value; }));

    // 2. search
    var f = el('form', { novalidate: 'novalidate' });
    var inp = el('input', { type: 'search', name: 'term', value: live.term, placeholder: t('lv.ph'), 'aria-label': t('lv.ph') });
    var cb = el('input', { type: 'checkbox', name: 'human' }); cb.checked = live.human;
    f.appendChild(el('label', { class: 'full' }, [el('span', { text: t('lv.term') }), inp]));
    f.appendChild(el('label', null, [cb, ' ', t('lv.human')]));
    f.appendChild(el('button', { type: 'submit', text: t('lv.search') }));
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); live.term = inp.value; live.human = cb.checked; live.res = { loading: true }; again();
      L.search(fetchFn, { term: live.term, human: live.human, size: 50 }).then(function (r) { live.res = r; again(); });
    });
    box.appendChild(f);

    // 3. results
    var r = live.res;
    if (!r) return;
    if (r.loading) { box.appendChild(el('p', { class: 'msg', text: t('lv.busy') })); return; }
    if (!r.ok) { box.appendChild(el('p', { class: 'msg', text: t('lv.err.' + r.error, { status: r.status, keys: (r.keys || []).join(', ') }) })); return; }
    var osdr = r.studies.filter(function (s) { return !s.external; }), hidden = r.studies.length - osdr.length;
    box.appendChild(el('p', { class: 'msg', text: t('lv.count', { n: osdr.length, total: r.total }) + (hidden ? ' ' + t('lv.hidden', { n: hidden }) : '') }));
    if (r.raw) {
      var rawBox = el('details', { class: 'msg' }, [el('summary', { text: t('lv.raw') }), el('pre', { text: r.raw })]);
      box.appendChild(rawBox);
    }
    osdr.forEach(function (s) {
      var card = el('div', { class: 'ind' });
      card.appendChild(el('div', { class: 'ind-head' }, [el('div', null, [el('strong', { text: s.id }), ' ', s.title || t('lv.notitle')])]));
      var meta = [s.organism, s.projectType, s.mission, s.release].filter(Boolean).join(' · ');
      if (meta) card.appendChild(el('div', { class: 'meta', text: meta }));
      if (s.topics.length) card.appendChild(el('div', { class: 'meta', text: s.topics.map(function (k) { return t('lv.topic.' + k); }).join(' · ') }));
      var det = el('button', { type: 'button', text: t(live.open === s.id ? 'lv.hide' : 'lv.details') });
      det.addEventListener('click', function () {
        if (live.open === s.id) { live.open = null; again(); return; }
        live.open = s.id; live.detail = { loading: true }; again();
        L.studyDetail(fetchFn, s.id).then(function (d) { if (live.open === s.id) { live.detail = d; again(); } });
      });
      card.appendChild(det); card.appendChild(document.createTextNode(' '));
      card.appendChild(el('a', { href: L.pageUrl(s.id), target: '_blank', rel: 'noopener noreferrer', text: t('lv.open') }));
      if (live.open === s.id) card.appendChild(liveDetail(ctx, live.detail));
      box.appendChild(card);
    });
    box.appendChild(el('p', { class: 'msg', text: t('lv.note') }));
  }


  // "Check relay" button: asks the relay itself whether it is the current version and whether it reaches NASA
  function relayCheck(ctx, getAddress) {
    var t = ctx.t, out = el('div', { class: 'relaycheck' }), msg = el('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
    var btn = el('button', { type: 'button', text: t('diag.relay.btn') });
    btn.addEventListener('click', function () {
      msg.className = 'msg'; msg.textContent = t('diag.relay.busy');
      ctx.Diag.checkRelay(function (u) { return window.fetch(u); }, getAddress()).then(function (r) {
        var key = r.status === 'current' ? (r.nasa ? 'diag.relay.current' : 'diag.relay.currentNoNasa') : 'diag.relay.' + r.status;
        msg.className = 'msg' + (r.status === 'current' && r.nasa ? '' : ' form-msg err'); msg.textContent = (r.status === 'current' && r.nasa ? '✓ ' : '✗ ') + t(key, { http: r.http === null ? 'no answer' : r.http });
      });
    });
    out.appendChild(btn); out.appendChild(msg); return out;
  }

  /* ---------- Guided check-up: one question per slide ---------- */
  var wiz = { i: -1, answers: {}, checked: {}, demo: false, err: '', saveMsg: '', live: { state: 'idle' }, auto: false };

  // real crew values read from NASA are remembered in this browser, so a reload or being offline does not fall back to the bundled copies
  var CREW_KEY = 'll_crew';
  function crewRelay() {
    var p = ''; try { p = window.localStorage.getItem('ll_proxy') || ''; } catch (e) { p = ''; }
    return p || (window.LL_CONFIG && window.LL_CONFIG.relay) || '';
  }
  try {
    var saved = JSON.parse(window.localStorage.getItem(CREW_KEY) || 'null');
    if (saved && saved.ranges && saved.studies && saved.studies.length) wiz.live = { state: 'ok', ranges: saved.ranges, studies: saved.studies, errors: [], at: saved.at, cached: true };
  } catch (e) { /* nothing saved, or storage blocked */ }

  function loadCrew(ctx, box, hooks, silent) {
    var proxy = crewRelay(); ctx.Live.setBase(proxy);
    var before = wiz.live;
    if (!silent) { wiz.live = { state: 'busy', ranges: before.ranges, studies: before.studies, at: before.at, cached: before.cached }; renderCheckup(ctx, box, hooks); }
    return ctx.Crewlive.load(function (u) { return window.fetch(u); }, ctx.Live).then(function (r) {
      if (r.ok) {
        var at = new Date().toISOString().slice(0, 10);
        wiz.live = { state: 'ok', ranges: r.ranges, studies: r.studies, errors: r.errors, at: at, cached: false };
        try { window.localStorage.setItem(CREW_KEY, JSON.stringify({ ranges: r.ranges, studies: r.studies, at: at })); } catch (e) { /* storage may be full or blocked */ }
      } else if (before.ranges) wiz.live = { state: 'ok', ranges: before.ranges, studies: before.studies, errors: r.errors, at: before.at, cached: true, failed: true };
      else wiz.live = { state: 'err', errors: r.errors };
      renderCheckup(ctx, box, hooks);
    });
  }

  function wizLabel(ctx, q) { return q.kind === 'vital' ? ctx.t('ind.' + q.id) : q.panel ? ctx.t('lab.' + q.id) : q.kind === 'lab' ? ctx.t('o9.a.' + q.id) : ctx.t('cu.q.' + q.id + '.ask'); }

  function wizValueText(ctx, item) {
    var t = ctx.t, q = item.q;
    if (item.value === null) return '—';
    if (q.kind === 'symptom') return t('cu.sev.' + item.value);
    if (q.kind === 'redflag') return t(item.value === 'yes' ? 'cu.yes' : 'cu.no');
    return item.value + ' ' + ctx.Checkup.limits(q).unit;
  }


  // chart + numbers for one analyte read live from NASA; `mine` = the user's own answer (optional)
  function crewChart(ctx, id, liveR, mine) {
    var t = ctx.t, C = ctx.Checkup, q = C.QUESTIONS.filter(function (x) { return x.id === id; })[0], z = q ? C.zonesOf(q) : null;
    var rows = [{ label: t('cu.chart.pre'), lo: liveR.pre ? liveR.pre[0] : null, hi: liveR.pre ? liveR.pre[1] : null, color: '#5ab4ff' },
                { label: t('cu.chart.post'), lo: liveR.post ? liveR.post[0] : null, hi: liveR.post ? liveR.post[1] : null, color: '#ff9f43' }];
    var name = q ? wizLabel(ctx, q) : id;
    return root.Charts.rangeChart({ zones: z, lab: liveR.lo !== null || liveR.hi !== null ? [liveR.lo, liveR.hi] : null, rows: rows, unit: liveR.unit,
      marker: mine !== undefined && mine !== null && isFinite(mine) ? { value: Number(mine), label: t('cu.chart.you') } : null,
      labels: { ok: t('cu.chart.zoneOk'), watch: t('cu.chart.zoneWatch'), lab: t('cu.chart.lab') },
      aria: name + ': ' + t('cu.crew.line', { src: liveR.src, n: liveR.n, pre: liveR.pre ? liveR.pre.join('–') : '—', post: liveR.post ? liveR.post.join('–') : '—', unit: liveR.unit }) });
  }

  function crewSummary(ctx) {
    var t = ctx.t, box = el('div', { class: 'crewsum' }), ids = Object.keys(wiz.live.ranges || {});
    box.appendChild(el('strong', { text: t('cu.live.sumTitle') }));
    ids.forEach(function (id) {
      var r = wiz.live.ranges[id], q = ctx.Checkup.QUESTIONS.filter(function (x) { return x.id === id; })[0];
      var card = el('div', { class: 'crewcard' });
      card.appendChild(el('h4', { text: (q ? wizLabel(ctx, q) : id) + ' · ' + r.src }));
      var f = function (a) { return a ? a[0] + '–' + a[1] : '—'; };
      card.appendChild(el('p', { class: 'meta', text: t('cu.crew.line', { src: r.src, n: r.n, pre: f(r.pre), post: f(r.post), unit: r.unit }) + (r.lo !== null || r.hi !== null ? ' · ' + t('cu.live.lab', { lo: r.lo === null ? '—' : r.lo, hi: r.hi === null ? '—' : r.hi, unit: r.unit }) : '') }));
      card.appendChild(crewChart(ctx, id, r, null));
      box.appendChild(card);
    });
    return box;
  }

  function crewBlock(ctx, q) {
    var t = ctx.t, C = ctx.Checkup, src = null, r = null, unit = '', liveR = wiz.live && wiz.live.ranges && wiz.live.ranges[q.id];
    if (liveR) { // real NASA file, read live
      var fl = function (a) { return a ? a[0] + '–' + a[1] : '—'; }, lb = el('div', { class: 'callout' });
      lb.appendChild(el('strong', { text: t('cu.crew.title') + ' ' })); lb.appendChild(el('span', { class: 'badge real', text: wiz.live.cached ? t('cu.live.badgeSaved', { date: wiz.live.at || '?' }) : t('cu.live.badge') }));
      lb.appendChild(el('p', { class: 'meta', text: t('cu.crew.line', { src: liveR.src, n: liveR.n, pre: fl(liveR.pre), post: fl(liveR.post), unit: liveR.unit }) }));
      if (liveR.lo !== null || liveR.hi !== null) lb.appendChild(el('p', { class: 'meta', text: t('cu.live.lab', { lo: liveR.lo === null ? '—' : liveR.lo, hi: liveR.hi === null ? '—' : liveR.hi, unit: liveR.unit }) }));
      var mineP = ctx.Checkup.parse(q, wiz.answers[q.id]); lb.appendChild(crewChart(ctx, q.id, liveR, mineP.ok && !mineP.skipped ? mineP.value : null));
      return lb;
    }
    if (q.kind === 'lab' && !q.panel) { src = 'OSD-569'; r = C.crewRange(ctx.Osd569.CREW, q.id, ctx.Osd569.PRE); unit = ctx.Osd569.analyte(q.id).unit; }
    else if (q.panel) { /* no bundled copy of this analyte: only the live file has it */ }
    else if (q.id === 'glucose') { src = 'OSD-575'; r = C.crewRange(ctx.Osdr.CREW, q.id, ctx.Osdr.PRE); unit = ctx.Osdr.ANALYTES.glucose ? ctx.Osdr.ANALYTES.glucose.unit : 'mg/dL'; }
    var box = el('div', { class: 'callout' });
    box.appendChild(el('strong', { text: t('cu.crew.title') }));
    if (!r) { box.appendChild(el('p', { class: 'meta', text: t('cu.crew.none') })); return box; }
    var f = function (a) { return a ? a[0] + '–' + a[1] : '—'; };
    box.appendChild(el('p', { class: 'meta', text: t('cu.crew.line', { src: src, n: r.n, pre: f(r.pre), post: f(r.post), unit: unit }) }));
    return box;
  }

  function wizFeedback(ctx, q, box) {
    var t = ctx.t, C = ctx.Checkup, raw = wiz.answers[q.id], p = C.parse(q, raw);
    box.innerHTML = '';
    if (!wiz.checked[q.id] || !p.ok) return;
    if (p.skipped) { box.appendChild(el('p', { class: 'msg', text: t('cu.nodata') })); return; }
    var ev = C.evaluate(q, p.value, wiz.answers['usual_' + q.id]), acts = C.advice(q, ev);
    if (ev.baselineOnly && ev.status === 'nodata') { box.appendChild(el('p', { class: 'msg', text: t('cu.baseline') })); return; }
    box.appendChild(el('div', null, [ctx.chip(ev.status)]));
    box.appendChild(el('p', { class: 'msg', text: ev.status === 'ok' ? t('cu.okmsg') : t('msg.' + ev.status) }));
    if (ev.baselineOnly) box.appendChild(el('div', { class: 'meta', text: t('cu.vsUsual', { ref: ev.usual, pct: Math.abs(ev.pct), word: t(ev.dir ? 'cu.worse' : 'cu.same') }) }));
    var z = C.zonesOf(q);
    if (z) box.appendChild(el('div', { class: 'meta', text: t('ref.line', { oklo: z.ok[0], okhi: z.ok[1], wlo: z.watch[0], whi: z.watch[1], unit: C.limits(q).unit }) }));
    if (acts.length) {
      box.appendChild(el('strong', { text: t('cu.actions') }));
      var ol = el('ol', { class: 'msg' });
      acts.forEach(function (a) { ol.appendChild(el('li', { class: a === 'callSurgeon' ? 'act-red' : '', text: t('act.' + a) })); });
      box.appendChild(ol);
    }
    if (q.kind === 'lab' || q.id === 'glucose') box.appendChild(crewBlock(ctx, q)); // real crew data exists only for these measurements
  }

  /** 5-trial tap reaction test; writes the median (ms) into the answer input. */
  function reactionTest(ctx, inp) {
    var t = ctx.t, trials = [], timer = null, startAt = 0, state = 'idle';
    var wrap = el('div', { class: 'callout rt' });
    var pad = el('button', { type: 'button', class: 'rt-pad', text: t('cu.rt.start') });
    var info = el('p', { class: 'meta', 'aria-live': 'polite', text: t('cu.rt.intro') });
    wrap.appendChild(el('strong', { text: t('cu.rt.title') })); wrap.appendChild(info); wrap.appendChild(pad);
    function arm() {
      state = 'wait'; pad.className = 'rt-pad wait'; pad.textContent = t('cu.rt.wait');
      timer = setTimeout(function () { state = 'go'; startAt = Date.now(); pad.className = 'rt-pad go'; pad.textContent = t('cu.rt.go'); }, 1200 + Math.random() * 2500);
    }
    pad.addEventListener('click', function () {
      if (state === 'idle') { trials = []; arm(); return; }
      if (state === 'wait') { clearTimeout(timer); info.textContent = t('cu.rt.early'); arm(); return; }
      if (state === 'go') {
        var ms = Date.now() - startAt; trials.push(ms);
        info.textContent = t('cu.rt.trial', { n: trials.length, ms: ms });
        if (trials.length < 5) { arm(); return; }
        state = 'idle'; pad.className = 'rt-pad'; pad.textContent = t('cu.rt.again');
        var m = ctx.Checkup.reactionMedian(trials);
        info.textContent = t('cu.rt.done', { ms: m });
        if (m !== null) inp.value = String(m);
      }
    });
    return wrap;
  }

  function renderCheckup(ctx, box, hooks) {
    var t = ctx.t, C = ctx.Checkup, N = C.QUESTIONS.length;
    box.innerHTML = '';
    function go(i) { wiz.i = i; wiz.err = ''; renderCheckup(ctx, box, hooks); var h = box.querySelector('h3'); if (h) h.focus(); }
    function reset(demo) { wiz.answers = demo ? ctx.Demo.guided() : {}; wiz.checked = {}; wiz.demo = demo; wiz.saveMsg = ''; go(0); }

    box.appendChild(el('h2', { text: t('cu.title') }));
    if (wiz.demo && wiz.i >= 0) box.appendChild(el('div', { class: 'badge sim', text: t('cu.demoBadge') }));

    if (wiz.i < 0) {
      box.appendChild(el('p', { class: 'msg', text: t('cu.intro') }));
      box.appendChild(el('div', { class: 'callout', text: t('cu.disclaimer') }));
      var b1 = el('button', { type: 'button', text: t('cu.startOwn') }), b2 = el('button', { type: 'button', text: t('cu.startDemo') });
      b1.addEventListener('click', function () { reset(false); }); b2.addEventListener('click', function () { reset(true); });
      box.appendChild(b1); box.appendChild(document.createTextNode(' ')); box.appendChild(b2);
      // real crew values from NASA files (needs the relay address from the Live NASA tab); bundled copies are used otherwise
      var lv = el('div', { class: 'callout' }), lb = el('button', { type: 'button', text: t(wiz.live.state === 'busy' ? 'cu.live.busy' : 'cu.live.load') }), L = wiz.live;
      lv.appendChild(el('strong', { text: t('cu.live.title') })); lv.appendChild(el('p', { class: 'meta', text: t('cu.live.hint') }));
      var rin = el('input', { type: 'url', name: 'relay', value: crewRelay(), placeholder: 'https://....workers.dev', 'aria-label': t('cu.live.relay') });
      rin.addEventListener('change', function () { var v = rin.value.trim(); try { window.localStorage.setItem('ll_proxy', v); } catch (e) { /* storage blocked */ } ctx.Live.setBase(v); });
      lv.appendChild(el('label', null, [el('span', { class: 'meta', text: t('cu.live.relay') }), rin]));
      lb.addEventListener('click', function () { var v = rin.value.trim(); try { window.localStorage.setItem('ll_proxy', v); } catch (e) { /* storage blocked */ } loadCrew(ctx, box, hooks, false); });
      lv.appendChild(lb); lv.appendChild(relayCheck(ctx, function () { return rin.value; }));
      if (L.state === 'ok') {
        lv.appendChild(el('p', { class: 'msg', text: (L.cached ? t('cu.live.cached', { date: L.at || '?', studies: L.studies.join(', ') }) : t('cu.live.ok', { studies: L.studies.join(', ') })) + (L.errors && L.errors.length && !L.failed ? ' ' + t('cu.live.partial', { studies: L.errors.map(function (e) { return e.study; }).join(', ') }) : '') }));
        if (L.failed) lv.appendChild(el('p', { class: 'form-msg err', role: 'alert', text: t('cu.live.refreshFail') }));
      } else if (L.state === 'err') {
        lv.appendChild(el('p', { class: 'form-msg err', role: 'alert', text: (L.errors && L.errors.some(function (e) { return e.message === 'old-relay'; }) ? t('cu.live.oldRelay') : t('cu.live.err') + (L.errors && L.errors[0] ? ' (' + L.errors[0].study + ': ' + L.errors[0].message + ')' : '')) }));
      } else if (!crewRelay()) lv.appendChild(el('p', { class: 'meta', text: t('cu.live.bundled') }));
      if (L.state === 'ok' && L.ranges && Object.keys(L.ranges).length) lv.appendChild(crewSummary(ctx));
      // with a saved relay address the values refresh themselves once per visit
      if (!wiz.auto && crewRelay() && L.state !== 'busy') { wiz.auto = true; setTimeout(function () { loadCrew(ctx, box, hooks, true); }, 0); }
      box.appendChild(lv);
      return;
    }

    // progress
    var pct = Math.round(Math.min(wiz.i, N) / N * 100);
    box.appendChild(el('div', { class: 'meta', text: wiz.i < N ? t('cu.progress', { n: wiz.i + 1, total: N }) : t('cu.result.title') }));
    var bar = el('div', { class: 'wiz-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, [el('span', { style: 'width:' + pct + '%' })]);
    box.appendChild(bar);
    if (wiz.demo) box.appendChild(el('div', { class: 'meta', text: t('cu.demoNote') }));

    if (wiz.i >= N) { renderWizResult(ctx, box, hooks, go, reset); return; }

    var q = C.QUESTIONS[wiz.i], slide = el('form', { class: 'slide', novalidate: 'novalidate' });
    if (q.organ) slide.appendChild(el('div', { class: 'meta organ-tag', text: t('region.' + q.organ + '.title') }));
    slide.appendChild(el('h3', { tabindex: '-1', text: q.kind === 'vital' || q.kind === 'lab' ? wizLabel(ctx, q) : t('cu.q.' + q.id + '.ask') }));
    if (q.kind === 'vital' || q.kind === 'lab') slide.appendChild(el('p', { class: 'msg', text: t('cu.enter', { what: wizLabel(ctx, q) }) }));
    slide.appendChild(el('p', { class: 'meta', text: q.kind === 'vital' ? t('info.' + q.id + '.how') : q.kind === 'lab' ? t('cu.optional') : t('cu.q.' + q.id + '.help') }));

    if (ctx.t('tools.' + q.id) !== 'tools.' + q.id) slide.appendChild(el('p', { class: 'meta tools', text: t('cu.tools') + ' ' + t('tools.' + q.id) }));
    var read;
    var cur = wiz.answers[q.id];
    if (q.kind === 'symptom' || q.kind === 'redflag') {
      var opts = q.kind === 'symptom' ? [0, 1, 2, 3] : ['no', 'yes'], fs = el('fieldset', { class: 'opts' }, [el('legend', { text: t('cu.q.' + q.id + '.ask') })]);
      opts.forEach(function (o) {
        var r = el('input', { type: 'radio', name: 'ans', value: String(o) });
        if (cur !== undefined && cur !== '' && String(cur) === String(o)) r.checked = true;
        fs.appendChild(el('label', null, [r, ' ', q.kind === 'symptom' ? t('cu.sev.' + o) : t(o === 'yes' ? 'cu.yes' : 'cu.no')]));
      });
      slide.appendChild(fs);
      read = function () { var c = slide.querySelector('input[name=ans]:checked'); return c ? c.value : ''; };
    } else {
      var L = C.limits(q), inp = el('input', { type: 'number', name: 'ans', inputmode: 'decimal', step: String(L.step), min: String(L.min), max: String(L.max), 'aria-label': wizLabel(ctx, q) });
      if (cur !== undefined && cur !== '') inp.value = String(cur);
      slide.appendChild(el('label', null, [inp, ' ', el('span', { text: L.unit })]));
      read = function () { return inp.value; };
      if (q.id === 'reaction') slide.appendChild(reactionTest(ctx, inp));
      if (!C.zonesOf(q)) { // no fixed normal range: ask for the person's own usual value
        var ukey = 'usual_' + q.id, saved = ''; try { saved = window.localStorage.getItem('ll.' + ukey) || ''; } catch (e) { /* storage may be blocked */ }
        if (wiz.answers[ukey] === undefined && saved) wiz.answers[ukey] = saved;
        var uin = el('input', { type: 'number', name: 'usual', inputmode: 'decimal', step: String(L.step), min: String(L.min), max: String(L.max), 'aria-label': t('cu.usual') });
        if (wiz.answers[ukey] !== undefined && wiz.answers[ukey] !== '') uin.value = String(wiz.answers[ukey]);
        slide.appendChild(el('label', null, [el('span', { text: t('cu.usual') + ' ' }), uin, ' ', el('span', { text: L.unit })]));
        slide.appendChild(el('p', { class: 'meta', text: t('cu.usualHelp') }));
        uin.addEventListener('input', function () { wiz.answers[ukey] = uin.value; wiz.checked[q.id] = false; try { window.localStorage.setItem('ll.' + ukey, uin.value); } catch (e) { /* ignore */ } });
      }
    }
    var errBox = el('p', { class: 'form-msg err', role: 'alert', text: wiz.err });
    slide.appendChild(errBox);
    var fb = el('div', { class: 'wiz-fb', 'aria-live': 'polite' });
    slide.appendChild(fb); wizFeedback(ctx, q, fb);

    var back = el('button', { type: 'button', text: t('cu.back') }); back.disabled = wiz.i === 0;
    var skip = el('button', { type: 'button', text: t('cu.skip') });
    var main = el('button', { type: 'submit', text: t(wiz.checked[q.id] ? (wiz.i === N - 1 ? 'cu.review' : 'cu.next') : 'cu.check') });
    back.addEventListener('click', function () { go(wiz.i - 1); });
    skip.addEventListener('click', function () { wiz.answers[q.id] = ''; wiz.checked[q.id] = true; go(wiz.i + 1); });
    slide.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (wiz.checked[q.id] && String(read()) === String(wiz.answers[q.id] === undefined ? '' : wiz.answers[q.id])) { go(wiz.i + 1); return; }
      var raw = read(), p = C.parse(q, raw);
      if (p.ok && p.skipped) { errBox.textContent = ''; wiz.answers[q.id] = ''; wiz.checked[q.id] = true; go(wiz.i + 1); return; }
      if (!p.ok) { wiz.err = t('cu.err.' + p.code, { min: p.min, max: p.max }); errBox.textContent = wiz.err; return; }
      wiz.err = ''; errBox.textContent = ''; wiz.answers[q.id] = raw; wiz.checked[q.id] = true;
      wizFeedback(ctx, q, fb); main.textContent = t(wiz.i === N - 1 ? 'cu.review' : 'cu.next'); main.focus();
    });
    var nav = el('div', { class: 'wiz-nav' }, [back, skip, main]);
    slide.appendChild(nav);
    box.appendChild(slide);
    var first = slide.querySelector('input'); if (first && !wiz.checked[q.id]) first.focus();
  }

  function todayStr() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  /** Plain-text summary of a finished check-up (for sharing / pasting into a message). */
  function summaryText(ctx, run) {
    var t = ctx.t, lines = [t('cu.print.header', { date: todayStr() }), t('status.' + run.overall) + ' — ' + t('cu.result.counts', run.counts), ''];
    run.sorted.forEach(function (it) {
      if (it.status === 'nodata') return;
      lines.push(t('status.' + it.status) + ': ' + wizLabel(ctx, it.q) + ' ' + wizValueText(ctx, it));
      it.actions.forEach(function (a) { lines.push('  - ' + t('act.' + a)); });
    });
    lines.push('', t('cu.disclaimer'));
    return lines.join('\n');
  }

  function renderWizResult(ctx, box, hooks, go, reset) {
    var t = ctx.t, C = ctx.Checkup, run = C.run(wiz.answers), slide = el('div', { class: 'slide' });
    slide.appendChild(el('h3', { tabindex: '-1', text: t('cu.result.title') }));
    slide.appendChild(el('div', null, [ctx.chip(run.overall)]));
    slide.appendChild(el('p', { class: 'msg', text: t('cu.result.counts', run.counts) }));
    slide.appendChild(el('p', { class: 'msg', text: run.overall === 'attention' ? t('cu.result.red') : run.overall === 'watch' ? t('cu.result.yellow') : run.overall === 'ok' ? t('cu.result.allok') : t('cu.nodata') }));
    slide.appendChild(el('p', { class: 'meta', text: t('rs.note') }));
    slide.appendChild(el('strong', { text: t('cu.list') }));
    run.sorted.forEach(function (it) {
      var d = el('details', { class: 'wiz-item' });
      if (it.status === 'attention' || it.status === 'watch') d.setAttribute('open', 'open');
      d.appendChild(el('summary', null, [ctx.chip(it.status), ' ', wizLabel(ctx, it.q), ': ', wizValueText(ctx, it)]));
      if (it.actions.length) { var ol = el('ol', { class: 'msg' }); it.actions.forEach(function (a) { ol.appendChild(el('li', { class: a === 'callSurgeon' ? 'act-red' : '', text: t('act.' + a) })); }); d.appendChild(ol); }
      else d.appendChild(el('p', { class: 'meta', text: it.status === 'ok' ? t('cu.okmsg') : t('cu.nodata') }));
      var rel = (it.status === 'watch' || it.status === 'attention') && ctx.Research ? ctx.Research.forQuestion(it.q) : null;
      if (rel) {
        var rb = el('div', { class: 'research noprint' }); rb.appendChild(el('strong', { text: t('rs.title') + ' ' }));
        rel.studies.forEach(function (s) { rb.appendChild(el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: t('rs.study', { id: s.id }) + ' — ' + t('rs.why.' + s.id) })); rb.appendChild(document.createTextNode(' ')); });
        if (rel.term && hooks.openLive) { var sb = el('button', { type: 'button', text: t('rs.search', { term: rel.term }) }); sb.addEventListener('click', function () { hooks.openLive(rel.term); }); rb.appendChild(sb); }
        d.appendChild(rb);
      }
      slide.appendChild(d);
    });
    var msg = el('p', { class: 'form-msg', 'aria-live': 'polite', text: wiz.saveMsg });
    var save = el('button', { type: 'button', text: t('cu.save') }), again = el('button', { type: 'button', text: t('cu.again') }), back = el('button', { type: 'button', text: t('cu.back') });
    save.addEventListener('click', function () {
      if (wiz.demo) { wiz.saveMsg = t('cu.nosave.demo'); msg.className = 'form-msg err'; msg.textContent = wiz.saveMsg; return; }
      var r = hooks.save(wiz.answers); wiz.saveMsg = t(r.key, { date: r.date });
      msg.className = 'form-msg ' + (r.ok ? 'good' : 'err'); msg.textContent = wiz.saveMsg;
    });
    again.addEventListener('click', function () { wiz.i = -1; wiz.demo = false; renderCheckup(ctx, box, hooks); });
    back.addEventListener('click', function () { go(ctx.Checkup.QUESTIONS.length - 1); });
    var pr = el('button', { type: 'button', text: t('cu.print') }), sh = el('button', { type: 'button', text: t('cu.share') });
    pr.addEventListener('click', function () { document.body.classList.add('print-checkup'); window.print(); setTimeout(function () { document.body.classList.remove('print-checkup'); }, 500); });
    sh.addEventListener('click', function () {
      var text = summaryText(ctx, run);
      var done = function (k) { msg.className = 'form-msg good'; msg.textContent = t(k); };
      if (navigator.share) navigator.share({ title: t('cu.print.header', { date: todayStr() }), text: text }).catch(function () { /* cancelled */ });
      else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done('cu.share.copied'); }, function () { msg.className = 'form-msg err'; msg.textContent = text; });
      else { msg.className = 'form-msg'; msg.textContent = text; }
    });
    slide.insertBefore(el('div', { class: 'printhead' }, [el('strong', { text: t('cu.print.header', { date: todayStr() }) })]), slide.firstChild);
    slide.appendChild(msg); slide.appendChild(el('div', { class: 'wiz-nav noprint' }, [back, save, pr, sh, again]));
    box.appendChild(slide);
  }


  /* ---------- Reviewer view: every indicator, its zones, wording and actions in one place ---------- */
  function renderReview(ctx, box) {
    var t = ctx.t, C = ctx.Checkup, Core = ctx.Core;
    box.innerHTML = '';
    box.appendChild(el('h2', { text: t('rv.title') }));
    box.appendChild(el('p', { class: 'msg', text: t('rv.intro') }));
    var pb = el('button', { type: 'button', class: 'noprint', text: t('rv.print') }); pb.addEventListener('click', function () { window.print(); });
    box.appendChild(pb);

    box.appendChild(el('h3', { text: t('rv.rules') }));
    var D = Core.DEFAULTS, pc = C.PCT || { watch: 0.1, attention: 0.2 };
    var ul = el('ul', { class: 'msg' });
    [t('rv.rule.zone'), t('rv.rule.baseline', { n: D.baselineN, w: D.watchZ, a: D.attentionZ, r: D.recentN }), t('rv.rule.own', { w: Math.round(pc.watch * 100), a: Math.round(pc.attention * 100) }),
     t('rv.rule.symptom'), t('rv.rule.redflag'), t('rv.rule.red')].forEach(function (s) { ul.appendChild(el('li', { text: s })); });
    box.appendChild(ul);

    box.appendChild(el('h3', { text: t('rv.statusTexts') }));
    var sl = el('ul', { class: 'msg' });
    ['ok', 'watch', 'attention', 'nodata'].forEach(function (s) { sl.appendChild(el('li', null, [ctx.chip(s), ' ' + (s === 'ok' ? t('cu.okmsg') : t('msg.' + s))])); });
    box.appendChild(sl);

    box.appendChild(el('h3', { text: t('rv.items') }));
    var tbl = el('table', { class: 'cmp reviewtbl' }), head = el('tr');
    ['rv.col.item', 'rv.col.organ', 'rv.col.green', 'rv.col.yellow', 'rv.col.red', 'rv.col.actions', 'rv.col.basis'].forEach(function (k) { head.appendChild(el('th', { scope: 'col', text: t(k) })); });
    tbl.appendChild(el('thead', null, [head]));
    var body = el('tbody');
    var fmtZ = function (a) { return a[0] + '–' + a[1]; };
    C.QUESTIONS.forEach(function (q) {
      var z = C.zonesOf(q), L = C.limits(q), unit = L ? L.unit : '', label = q.kind === 'vital' ? t('ind.' + q.id) : q.panel ? t('lab.' + q.id) : q.kind === 'lab' ? t('o9.a.' + q.id) : t('cu.q.' + q.id + '.ask');
      var green, yellow, red, basis;
      if (q.kind === 'symptom') { green = '0–1'; yellow = '2'; red = '3'; basis = t('rv.basis.symptom'); }
      else if (q.kind === 'redflag') { green = t('cu.no'); yellow = '—'; red = t('cu.yes'); basis = t('rv.basis.redflag'); }
      else if (z) { green = fmtZ(z.ok) + ' ' + unit; yellow = t('rv.outsideGreen', { lo: z.watch[0], hi: z.watch[1] }) + ' ' + unit; red = t('rv.outsideYellow'); basis = q.panel ? t('rv.basis.cmp') : q.kind === 'lab' ? t('rv.basis.immune') : t('rv.basis.proto'); }
      else { green = t('rv.ownGreen'); yellow = t('rv.ownYellow', { p: Math.round((C.PCT || { watch: 0.1 }).watch * 100) }); red = t('rv.ownRed', { p: Math.round((C.PCT || { attention: 0.2 }).attention * 100) }); basis = t('rv.basis.own'); }
      var acts = C.ACTIONS[q.id] || {}, cell = el('td');
      Object.keys(acts).forEach(function (dir) {
        cell.appendChild(el('div', { class: 'meta', text: t('rv.dir.' + dir) + ':' }));
        var o = el('ol', { class: 'msg' }); acts[dir].forEach(function (a) { o.appendChild(el('li', { text: t('act.' + a) })); }); cell.appendChild(o);
      });
      if (!Object.keys(acts).length) cell.appendChild(el('span', { class: 'meta', text: t('rv.noActions') }));
      body.appendChild(el('tr', null, [el('th', { scope: 'row', text: label + (unit ? ' (' + unit + ')' : '') }), el('td', { text: q.organ ? t('region.' + q.organ + '.title') : '—' }),
        el('td', { text: green }), el('td', { text: yellow }), el('td', { text: red }), cell, el('td', { class: 'meta', text: basis })]));
    });
    tbl.appendChild(body);
    box.appendChild(el('div', { class: 'tablewrap' }, [tbl]));
    box.appendChild(el('p', { class: 'meta', text: t('rv.note') }));
  }

  root.Views = { searchLive: searchLive, renderReview: renderReview, renderCheckup: renderCheckup, renderLive: renderLive, renderCompare: renderCompare, renderOsdr: renderOsdr, renderInspirations: renderInspirations, renderPrePost: renderPrePost, renderFlight: renderFlight, renderOsd635: renderOsd635, renderOsd569: renderOsd569, renderRegionRef: renderRegionRef, renderImmuneOwn: renderImmuneOwn };
})(typeof window !== 'undefined' ? window : globalThis);
