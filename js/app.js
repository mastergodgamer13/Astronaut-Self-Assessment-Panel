/* app.js — UI wiring. All health logic lives in core.js. */
(function () {
  'use strict';

  var ICON = { ok: '✓', watch: '!', attention: '▲', nodata: '–' };
  var t = I18n.t;

  var state = { tab: 'checkup', mode: 'manual', region: null };
  var store = null; // created in init(), after the language is known

  // localStorage that never throws (blocked storage -> data lives in memory for this page view)
  function safeStorage() {
    var mem = {};
    return {
      getItem: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; } },
      setItem: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }
    };
  }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function indLabel(ind) { return t('ind.' + ind.id); }
  function unitOf(ind) { return ['pts', 'h', 'scale', 'meals'].indexOf(ind.unit) >= 0 ? t('unit.' + ind.unit) : ind.unit; }
  function fmt(x, ind) { return typeof x === 'number' ? (ind && ind.step < 1 ? x.toFixed(1) : String(Math.round(x * 10) / 10)) : '—'; }

  function entries() { return store.entriesOf(store.current()); }

  function chip(status) {
    return el('span', { class: 'chip ' + status }, [ICON[status] + ' ' + t('status.' + status)]);
  }

  /* ---------- charts (plain SVG, no dependencies) ---------- */
  function chart(ind, res) {
    var W = 560, H = 170, L = 38, R = 10, T = 12, B = 22;
    var pts = res.series;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('chart.aria', { label: indLabel(ind), n: pts.length }));
    if (pts.length < 2) return svg;

    var vals = pts.map(function (p) { return p.value; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var b = res.baseline;
    var bandLo = null, bandHi = null;
    if (b && b.sd > 0) {
      bandLo = b.mean - Core.DEFAULTS.watchZ * b.sd;
      bandHi = b.mean + Core.DEFAULTS.watchZ * b.sd;
      lo = Math.min(lo, bandLo); hi = Math.max(hi, bandHi);
    }
    if (hi === lo) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    function X(i) { return L + (W - L - R) * (i / (pts.length - 1)); }
    function Y(v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); }
    function add(tag, attrs, text) {
      var n = document.createElementNS(svgNS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text) n.textContent = text;
      svg.appendChild(n); return n;
    }

    if (bandLo !== null) {
      add('rect', { x: L, y: Y(bandHi), width: W - L - R, height: Y(bandLo) - Y(bandHi), fill: '#6aa8ff', opacity: 0.14 });
      add('line', { x1: L, x2: W - R, y1: Y(b.mean), y2: Y(b.mean), stroke: '#6aa8ff', 'stroke-dasharray': '4 4', opacity: 0.7 });
    }
    var bn = Core.DEFAULTS.baselineN;
    if (pts.length > bn) {
      var xd = (X(bn - 1) + X(bn)) / 2;
      add('line', { x1: xd, x2: xd, y1: T, y2: H - B, stroke: '#9aa6c2', 'stroke-dasharray': '2 3' });
      add('text', { x: xd + 4, y: T + 9 }, t('chart.after'));
    }
    add('text', { x: 4, y: Y(hi) + 10 }, fmt(hi - pad, ind));
    add('text', { x: 4, y: Y(lo) - 2 }, fmt(lo + pad, ind));
    add('text', { x: L, y: H - 6 }, t('chart.reading', { n: 1 }));
    add('text', { x: W - R, y: H - 6, 'text-anchor': 'end' }, t('chart.reading', { n: pts.length }));

    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.value).toFixed(1); }).join(' ');
    add('path', { d: d, fill: 'none', stroke: '#e8edf7', 'stroke-width': 1.8 });
    pts.forEach(function (p, i) {
      var c = add('circle', { cx: X(i), cy: Y(p.value), r: 2.6, fill: i < bn ? '#6aa8ff' : '#e8edf7' });
      var t = document.createElementNS(svgNS, 'title');
      t.textContent = p.date + ': ' + fmt(p.value, ind) + ' ' + unitOf(ind);
      c.appendChild(t);
    });
    return svg;
  }

  // saves the vital answers of the guided check-up as today's check-in of the selected user
  function saveCheckup(answers) {
    if (!store.current()) { var r = store.add('Astronaut'); if (!r || !r.ok) return { ok: false, key: 'users.needUser' }; } // first save creates a default user
    var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    var entry = Checkup.toEntry(answers, date);
    if (!entry) return { ok: false, key: 'cu.nosave.vitals' };
    store.saveEntry(store.current(), entry); if (window.Pwa) Pwa.checkedIn(date); render();
    return { ok: true, key: 'cu.saved', date: date };
  }

  /* ---------- rendering ---------- */
  var assessment = null;

  // adds the immune indicators (own blood-count values, immune.js) to the core assessment; the demo has none
  function withImmune(base) {
    var im = Immune.assess(store.immuneOf(store.current()), { minPre: store.missionOf(store.current()).minPre });
    var ids = Object.keys(im.per), all = base.counts;
    ids.forEach(function (id) { base.per[id] = im.per[id]; all[im.per[id].status]++; });
    var statuses = Object.keys(base.per).map(function (k) { return base.per[k].status; });
    base.overall = Core.worstStatus(statuses); base.total += ids.length; base.immune = im;
    return base;
  }

  function regionStatus(regionId) {
    var def = Content.REGIONS[regionId], ids = def.indicators.concat(def.own || []);
    if (!ids.length) return 'nodata';
    return Core.worstStatus(ids.map(function (id) { return assessment.per[id].status; }));
  }

  function renderOverall() {
    var c = assessment.counts, box = $('overall');
    box.innerHTML = '';
    var line = el('div', null, [chip(assessment.overall), ' ', t('overall.label')]);
    var detail = el('div', { class: 'meta' }, [
      t('overall.counts', { ok: c.ok, watch: c.watch, attention: c.attention, nodata: c.nodata, total: assessment.total }) + ' ' + t('overall.note')
    ]);
    box.appendChild(line); box.appendChild(detail);
  }

  function renderBody() {
    Array.prototype.forEach.call(document.querySelectorAll('#body .region'), function (g) {
      var id = g.getAttribute('data-region');
      g.setAttribute('data-status', regionStatus(id));
      g.classList.toggle('selected', state.region === id);
    });
    var list = $('region-list'); list.innerHTML = '';
    Object.keys(Content.REGIONS).forEach(function (id) {
      var b = el('button', { type: 'button', 'data-region': id, 'aria-pressed': String(state.region === id) }, [
        el('span', { text: t('region.' + id + '.title') }), chip(regionStatus(id))
      ]);
      if (state.region === id) b.className = 'selected';
      b.addEventListener('click', function () { selectRegion(id); });
      list.appendChild(el('li', null, [b]));
    });
  }

  function renderDetail() {
    var box = $('detail'); box.innerHTML = '';
    if (!state.region) { box.appendChild(el('p', { class: 'hint', text: t('detailsHint') })); return; }
    var def = Content.REGIONS[state.region];
    box.appendChild(el('h3', { text: t('region.' + state.region + '.title') }));
    box.appendChild(el('p', { class: 'msg', text: t('region.' + state.region + '.blurb') }));
    box.appendChild(el('div', { class: 'tags' }, def.hazards.map(function (h) { return el('span', { text: t('hazard.' + h) }); })));
    box.appendChild(el('div', { class: 'meta' }, [t('hazardNote') + ' ', el('span', { class: 'draft', text: t('draft') })]));

    if (def.osdr) { var own = el('div', { class: 'immune-own' }); box.appendChild(own); Views.renderImmuneOwn(ctx(), own, store.immuneOf(store.current()), true, assessment.immune);
      var rr = el('div', { class: 'osd569 region-ref' }); box.appendChild(rr); Views.renderRegionRef(ctx(), rr, def.osdr); }

    def.indicators.forEach(function (id) {
      var ind = Core.getIndicator(id), res = assessment.per[id];
      var wrap = el('div', { class: 'ind' });
      var latest = res.series.length ? res.series[res.series.length - 1].value : null;
      wrap.appendChild(el('div', { class: 'ind-head' }, [
        el('div', null, [el('strong', { text: indLabel(ind) }), ' ', chip(res.status)]),
        el('div', { class: 'val' }, [latest === null ? '—' : fmt(latest, ind), ' ', el('small', { text: unitOf(ind) })])
      ]));
      wrap.appendChild(el('p', { class: 'msg', text: t('msg.' + res.status) }));
      var rf = Core.REFERENCE[id], meta = [];
      meta.push(rf ? t('ref.line', { oklo: rf.ok[0], okhi: rf.ok[1], wlo: rf.watch[0], whi: rf.watch[1], unit: unitOf(ind) }) : t('ref.none'));
      if (res.baselineStatus === 'nodata') meta.push(res.reasonCode ? t('reason.' + res.reasonCode, res.reasonParams) : res.reason);
      else meta.push(t('meta', { mean: fmt(res.baseline.mean, ind), sd: fmt(res.baseline.sd, ind), unit: unitOf(ind), n: res.baseline.n,
        rn: res.recentN, rmean: fmt(res.recentMean, ind), z: res.z.toFixed(1) }));
      meta = meta.join(' ');
      wrap.appendChild(el('div', { class: 'meta', text: meta }));
      if (res.series.length >= 2) wrap.appendChild(chart(ind, res)); else wrap.appendChild(el('p', { class: 'meta', text: t('chart.need') }));
      wrap.appendChild(el('p', { class: 'msg' }, [el('strong', { text: t('why') + ' ' }), t('info.' + id + '.why')]));
      wrap.appendChild(el('p', { class: 'msg' }, [el('strong', { text: t('how') + ' ' }), t('info.' + id + '.how'),
        el('span', { class: 'draft', text: t('draft') })]));
      box.appendChild(wrap);
    });
  }

  function renderBadge() {
    var b = $('source-badge');
    var u = store.currentUser();
    b.className = 'badge man';
    b.textContent = u ? t('badgeMan', { user: u.name, n: u.entries.length }) : t('users.none');
  }

  function applyStatic() {
    document.title = t('docTitle');
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (n) { n.setAttribute('placeholder', t(n.getAttribute('data-i18n-ph'))); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria]'), function (n) { n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria'))); });
    Array.prototype.forEach.call(document.querySelectorAll('#body .region'), function (g) {
      g.setAttribute('aria-label', t('region.' + g.getAttribute('data-region') + '.title'));
    });
    var sel = $('lang'); if (sel) sel.value = I18n.get();
    if (window.Panels && Panels.relabel) Panels.relabel(t);
    if (window.Pwa) Pwa.relabel();
  }

  var viewCtx = null;
  function ctx() {
    if (!viewCtx) viewCtx = { t: t, Core: Core, Osdr: Osdr, Osd635: Osd635, Osd569: Osd569, Immune: Immune, Live: Live, Checkup: Checkup, Crewlive: Crewlive, Demo: Demo, Expression: Expression, store: store, chip: chip, indLabel: indLabel, unitOf: unitOf, fmt: fmt };
    return viewCtx;
  }

  function renderTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      var on = b.getAttribute('data-tab') === state.tab;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
    });
    ['checkup', 'dash', 'compare', 'osdr', 'live'].forEach(function (id) { $('view-' + id).hidden = state.tab !== id; });
  }

  function render() {
    assessment = withImmune(Core.assess(entries()));
    applyStatic(); updateFormLabels(); updateMissionLabels(); updateFlightLabels(); updateImmuneLabels();
    renderTabs(); renderUsers();
    renderBadge(); renderOverall(); renderBody(); renderDetail();
    if (state.tab === 'dash') {
      Views.renderPrePost(ctx(), $('prepost'));
      Views.renderFlight(ctx(), $('flight-summary'), store.flightOf(store.current()));
      Views.renderImmuneOwn(ctx(), $('immune-summary'), store.immuneOf(store.current()));
    }
    if (state.tab === 'compare') Views.renderCompare(ctx(), $('cmp'));
    if (state.tab === 'osdr') { Views.renderInspirations(ctx(), $('inspiration')); Views.renderOsdr(ctx(), $('osdr')); Views.renderOsd635(ctx(), $('o635')); Views.renderOsd569(ctx(), $('o569')); }
    if (state.tab === 'checkup' && !state.checkupDrawn) { state.checkupDrawn = true; Views.renderCheckup(ctx(), $('checkup'), { save: saveCheckup }); }
    if (state.tab === 'live' && !state.liveDrawn) { state.liveDrawn = true; Views.renderLive(ctx(), $('live')); }
  }

  /* ---------- users ---------- */
  function renderUsers() {
    var sel = $('user-select'), users = store.users();
    sel.innerHTML = '';
    users.forEach(function (u) {
      var o = el('option', { value: u.id, text: u.name });
      if (u.id === store.current()) o.selected = true;
      sel.appendChild(o);
    });
    var none = !users.length;
    sel.disabled = none; $('user-remove').disabled = none;
    $('user-none').hidden = !none;
    Array.prototype.forEach.call(document.querySelectorAll('#checkin input,#checkin button,#flightform input,#flightform select,#flightform button,#immuneform input,#immuneform select,#immuneform button'), function (x) { x.disabled = none; });
    $('clear-manual').disabled = none; $('clear-flight').disabled = none; $('clear-immune').disabled = none;
  }

  function userMsg(text, cls) { var m = $('user-msg'); m.className = 'form-msg ' + (cls || ''); m.textContent = text; }

  function selectRegion(id) { state.region = id; renderBody(); renderDetail(); }

  /* ---------- check-in form ---------- */
  function errText(v) {
    if (!v.codes) return v.errors.join(' ');
    return v.codes.map(function (c) {
      var ind = c.id ? Core.getIndicator(c.id) : null;
      return t('err.' + c.code, { label: ind ? indLabel(ind) : '', n: c.n, min: c.min, max: c.max, unit: ind ? unitOf(ind) : '' });
    }).join(' ');
  }
  // relabel the form in place so typed values are not lost when the language changes
  function updateFormLabels() {
    Array.prototype.forEach.call(document.querySelectorAll('#checkin [data-ind]'), function (s) {
      var ind = Core.getIndicator(s.getAttribute('data-ind'));
      s.textContent = indLabel(ind) + ' (' + unitOf(ind) + ')';
    });
  }

  function buildForm() {
    var f = $('checkin'); f.innerHTML = '';
    var today = new Date().toISOString().slice(0, 10);
    f.appendChild(el('label', { class: 'full' }, [el('span', { 'data-i18n': 'fDate', text: t('fDate') }), el('input', { type: 'date', name: 'date', value: today, required: 'required' })]));
    // one collapsible group per body region, so the long list stays easy to scan
    Object.keys(Content.REGIONS).forEach(function (rid) {
      var inds = Core.INDICATORS.filter(function (i) { return i.region === rid; });
      if (!inds.length) return;
      var g = el('details', { class: 'fgroup full', open: 'open' }, [el('summary', { 'data-i18n': 'region.' + rid + '.title', text: t('region.' + rid + '.title') })]);
      var grid = el('div', { class: 'fgrid' });
      inds.forEach(function (ind) {
        grid.appendChild(el('label', null, [el('span', { 'data-ind': ind.id, text: indLabel(ind) + ' (' + unitOf(ind) + ')' }),
          el('input', { type: 'number', name: ind.id, step: String(ind.step), min: String(ind.min), max: String(ind.max), inputmode: 'decimal' })]));
      });
      g.appendChild(grid); f.appendChild(g);
    });
    f.appendChild(el('button', { type: 'submit', 'data-i18n': 'save', text: t('save') }));
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var raw = {};
      Array.prototype.forEach.call(f.elements, function (inp) { if (inp.name) raw[inp.name] = inp.value; });
      var v = Core.validateEntry(raw), msg = $('form-msg');
      if (!store.current()) { msg.className = 'form-msg err'; msg.textContent = t('users.needUser'); return; }
      if (!v.ok) { msg.className = 'form-msg err'; msg.textContent = errText(v); return; }
      store.saveEntry(store.current(), v.entry); // one entry per date: replaced if it exists
      if (window.Pwa) Pwa.checkedIn(v.entry.date);
      msg.className = 'form-msg good'; msg.textContent = t('savedFor', { date: v.entry.date });
      state.mode = 'manual'; render();
    });
  }


  /* ---------- customizable pre-/post-flight periods ---------- */
  // A time point is "before launch" (L-<days>) or "after return" (R+<days>); the person types any number of days, or picks a date
  // and the selected user's mission dates are used to work it out. The hidden input "tp" carries the label.
  function buildTpChooser(prefix) {
    var hidden = el('input', { type: 'hidden', name: 'tp' });
    var phase = el('select', { 'data-tp': prefix + '-phase', 'aria-label': t('tp.phase') });
    ['pre', 'post'].forEach(function (p) { phase.appendChild(el('option', { value: p, text: '' })); });
    phase.value = 'post';
    var days = el('input', { type: 'number', min: '0', max: String(Mission.MAX_DAYS), step: '1', inputmode: 'numeric', value: '1', 'data-tp': prefix + '-days', 'aria-label': t('tp.days') });
    var date = el('input', { type: 'date', 'data-tp': prefix + '-date', 'aria-label': t('tp.date') });
    var out = el('small', { class: 'meta', 'data-tp': prefix + '-out', 'aria-live': 'polite' });
    function sync() { var tp = Mission.makeTp(phase.value, days.value); hidden.value = tp || ''; out.textContent = tp ? t('tp.result', { tp: tp, group: t('fl.group.' + phase.value) }) : t('tp.invalid'); }
    date.addEventListener('change', function () {
      var r = Mission.tpFromDate(date.value, store.missionOf(store.current()));
      if (!r) { out.textContent = t('tp.needDates'); return; }
      if (r.phase === 'flight') { out.textContent = t('tp.inflight', { days: r.days }); hidden.value = ''; return; }
      phase.value = r.phase; days.value = String(r.days); sync();
    });
    phase.addEventListener('change', sync); days.addEventListener('input', sync);
    sync();
    var wrapEl = el('div', { class: 'full tpchooser' }, [
      el('span', { 'data-tp': prefix + '-lab', class: 'tplab' }),
      el('div', { class: 'tprow' }, [phase, days, el('span', { 'data-tp': prefix + '-unit', class: 'meta' })]),
      el('label', null, [el('span', { 'data-tp': prefix + '-datelab' }), date]), out, hidden]);
    wrapEl.sync = sync;
    return wrapEl;
  }
  function relabelTpChooser(f, prefix) {
    var q = function (k) { return f.querySelector('[data-tp="' + prefix + '-' + k + '"]'); };
    q('lab').textContent = t('osdr.tp'); q('unit').textContent = t('tp.unit'); q('datelab').textContent = t('tp.date');
    var ph = q('phase'); ph.options[0].textContent = t('tp.pre'); ph.options[1].textContent = t('tp.post');
    ph.setAttribute('aria-label', t('tp.phase')); q('days').setAttribute('aria-label', t('tp.days'));
    f.querySelector('.tpchooser').sync();
  }

  function buildMissionForm() {
    var f = $('missionform'); f.innerHTML = '';
    f.appendChild(el('label', null, [el('span', { 'data-ms': 'launch' }), el('input', { type: 'date', name: 'launch' })]));
    f.appendChild(el('label', null, [el('span', { 'data-ms': 'ret' }), el('input', { type: 'date', name: 'ret' })]));
    f.appendChild(el('label', { class: 'full' }, [el('span', { 'data-ms': 'minPre' }), el('input', { type: 'number', name: 'minPre', min: '1', max: '10', step: '1', value: '3', inputmode: 'numeric' }), el('small', { class: 'meta', 'data-ms': 'minPreHint' })]));
    f.appendChild(el('button', { type: 'submit', 'data-ms': 'save' }));
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = $('mission-msg'), raw = {};
      Array.prototype.forEach.call(f.elements, function (i) { if (i.name) raw[i.name] = i.value; });
      if (!store.current()) { msg.className = 'form-msg err'; msg.textContent = t('users.needUser'); return; }
      var r = store.saveMission(store.current(), raw);
      if (!r.ok) { msg.className = 'form-msg err'; msg.textContent = t('ms.err.' + r.code); return; }
      msg.className = 'form-msg good'; msg.textContent = t('ms.saved'); render();
    });
  }
  function updateMissionLabels() {
    var f = $('missionform'), m = store.missionOf(store.current());
    var set = function (k, txt) { f.querySelector('[data-ms="' + k + '"]').textContent = txt; };
    set('launch', t('ms.launch')); set('ret', t('ms.return')); set('minPre', t('ms.minPre')); set('minPreHint', t('ms.minPreHint')); set('save', t('ms.save'));
    // show the selected user's saved values (only when the user changes, so typing is not overwritten)
    var key = store.current() + '|' + JSON.stringify(m);
    if (f.getAttribute('data-shown') !== key) { f.elements.launch.value = m.launch || ''; f.elements.ret.value = m.ret || ''; f.elements.minPre.value = String(m.minPre); f.setAttribute('data-shown', key); }
  }

  /* ---------- pre-/post-flight form (rules: Osdr) ---------- */
  function flightErrText(v) {
    return v.codes.map(function (c) {
      var an = c.id ? Osdr.ANALYTES[c.id] : null;
      return t('fl.err.' + c.code, { label: c.id ? t('osdr.a.' + c.id) : '', min: c.min, max: c.max, unit: an ? an.unit : '' });
    }).join(' ');
  }
  function buildFlightForm() {
    var f = $('flightform'); f.innerHTML = '';
    f.appendChild(buildTpChooser('fl'));
    Object.keys(Osdr.ANALYTES).forEach(function (a) {
      var an = Osdr.ANALYTES[a];
      f.appendChild(el('label', null, [el('span', { 'data-fl-a': a }),
        el('input', { type: 'number', name: a, step: an.decimals ? '0.1' : '1', min: String(Osdr.LIMITS[a].min), max: String(Osdr.LIMITS[a].max), inputmode: 'decimal' }),
        el('small', { class: 'meta', 'data-fl-lab': a })]));
    });
    f.appendChild(el('button', { type: 'submit', 'data-fl': 'save' }));
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var raw = {};
      Array.prototype.forEach.call(f.elements, function (inp) { if (inp.name) raw[inp.name] = inp.value; });
      var v = Osdr.validateFlight(raw), msg = $('flight-msg');
      if (!store.current()) { msg.className = 'form-msg err'; msg.textContent = t('users.needUser'); return; }
      if (!v.ok) { msg.className = 'form-msg err'; msg.textContent = flightErrText(v); return; }
      store.saveFlight(store.current(), v.entry); // one record per time point: replaced if it exists
      msg.className = 'form-msg good'; msg.textContent = t('fl.saved', { tp: v.entry.tp, group: t('fl.group.' + Osdr.groupOf(v.entry.tp)) });
      render();
    });
  }
  function updateFlightLabels() {
    var f = $('flightform');
    relabelTpChooser(f, 'fl');
    f.querySelector('[data-fl="save"]').textContent = t('fl.save');
    Array.prototype.forEach.call(f.querySelectorAll('[data-fl-a]'), function (s) {
      var a = s.getAttribute('data-fl-a'); s.textContent = t('osdr.a.' + a) + ' (' + Osdr.ANALYTES[a].unit + ')';
    });
    Array.prototype.forEach.call(f.querySelectorAll('[data-fl-lab]'), function (s) {
      var an = Osdr.ANALYTES[s.getAttribute('data-fl-lab')]; s.textContent = t('fl.lab', { lo: an.lo, hi: an.hi });
    });
  }

  /* ---------- immune cells form (rules: Immune) ---------- */
  function immuneErrText(v) {
    return v.codes.map(function (c) {
      var an = c.id ? Immune.ANALYTES[c.id] : null;
      return t('fl.err.' + c.code, { label: c.id ? t('o9.a.' + c.id) : '', min: c.min, max: c.max, unit: an ? an.unit : '' });
    }).join(' ');
  }
  function buildImmuneForm() {
    var f = $('immuneform'); f.innerHTML = '';
    f.appendChild(buildTpChooser('im'));
    Object.keys(Immune.ANALYTES).forEach(function (a) {
      var an = Immune.ANALYTES[a];
      f.appendChild(el('label', null, [el('span', { 'data-im-a': a }),
        el('input', { type: 'number', name: a, step: an.decimals ? '0.1' : '1', min: String(Immune.LIMITS[a].min), max: String(Immune.LIMITS[a].max), inputmode: 'decimal' }),
        el('small', { class: 'meta', 'data-im-lab': a })]));
    });
    f.appendChild(el('button', { type: 'submit', 'data-im': 'save' }));
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var raw = {};
      Array.prototype.forEach.call(f.elements, function (inp) { if (inp.name) raw[inp.name] = inp.value; });
      var v = Immune.validate(raw), msg = $('immune-msg');
      if (!store.current()) { msg.className = 'form-msg err'; msg.textContent = t('users.needUser'); return; }
      if (!v.ok) { msg.className = 'form-msg err'; msg.textContent = immuneErrText(v); return; }
      store.saveImmune(store.current(), v.entry); // one record per time point: replaced if it exists
      msg.className = 'form-msg good'; msg.textContent = t('fl.saved', { tp: v.entry.tp, group: t('fl.group.' + Osdr.groupOf(v.entry.tp)) });
      render();
    });
  }
  function updateImmuneLabels() {
    var f = $('immuneform');
    relabelTpChooser(f, 'im');
    f.querySelector('[data-im="save"]').textContent = t('fl.save');
    Array.prototype.forEach.call(f.querySelectorAll('[data-im-a]'), function (s) { s.textContent = t('o9.a.' + s.getAttribute('data-im-a')); });
    Array.prototype.forEach.call(f.querySelectorAll('[data-im-lab]'), function (s) {
      var an = Immune.ANALYTES[s.getAttribute('data-im-lab')]; s.textContent = t('im.lab', { lo: an.lo, hi: an.hi });
    });
  }

  function init() {
    I18n.init();
    store = Store.create(safeStorage(), { legacyName: t('users.legacyName') });
    var sel = $('lang');
    I18n.LANGS.forEach(function (l) { sel.appendChild(el('option', { value: l.code, text: l.name })); });
    sel.addEventListener('change', function () { I18n.set(sel.value); $('form-msg').textContent = ''; $('flight-msg').textContent = ''; $('immune-msg').textContent = ''; render(); });
    buildForm();
    buildMissionForm();
    buildFlightForm();
    buildImmuneForm();
    Panels.init({ t: t });
    if (window.Pwa) Pwa.init({ t: t, lang: function () { return I18n.get(); } });
    $('layout-reset').addEventListener('click', function () { Panels.reset(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); render(); });
    });
    $('user-select').addEventListener('change', function () { store.select($('user-select').value); userMsg(''); state.mode = 'manual'; render(); });
    $('user-add').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var r = store.add($('user-name').value);
      if (!r.ok) { userMsg(t('users.err.' + r.code, { max: r.max }), 'err'); return; }
      $('user-name').value = '';
      userMsg(t('users.added', { user: r.user.name }), 'good');
      state.mode = 'manual'; render();
    });
    $('user-remove').addEventListener('click', function () {
      var u = store.currentUser(); if (!u) return;
      if (window.confirm(t('users.confirmRemove', { user: u.name }))) { store.remove(u.id); userMsg(''); render(); }
    });
    $('clear-immune').addEventListener('click', function () {
      var u = store.currentUser();
      if (!u || !u.immune.length) return;
      if (window.confirm(t('im.confirmClear', { user: u.name }))) { store.clearImmune(u.id); $('immune-msg').textContent = ''; render(); }
    });
    $('clear-flight').addEventListener('click', function () {
      var u = store.currentUser();
      if (!u || !u.flight.length) return;
      if (window.confirm(t('fl.confirmClear', { user: u.name }))) { store.clearFlight(u.id); $('flight-msg').textContent = ''; render(); }
    });
    $('clear-manual').addEventListener('click', function () {
      var u = store.currentUser();
      if (!u || !u.entries.length) return;
      if (window.confirm(t('confirmClear', { user: u.name }))) { store.clearEntries(u.id); render(); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('#body .region'), function (g) {
      var id = g.getAttribute('data-region');
      g.addEventListener('click', function () { selectRegion(id); });
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRegion(id); } });
    });
    state.region = 'mind';
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
