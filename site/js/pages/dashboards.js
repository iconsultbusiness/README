(function () {
  'use strict';
  const DB = window.DB, { h, icon } = DB;
  const TABS = [['overview', 'All dashboards'], ['locations', 'Location comparison'], ['weekly', 'Weekly performance']];

  function weekIndexes(m) {
    const last = m.days.length - 1, start = m.profile.company.weekStart === 'sun' ? 0 : 1;
    const offset = (m.days[last].dow - start + 7) % 7, thisStart = last - offset;
    return { last, thisStart, prevStart: thisStart - 7, offset };
  }

  function overview(c, go) {
    const { model: m, f } = c;
    const card = (title, desc, onClick, href, svgSeries) => {
      const sp = DB.s('svg', { 'aria-hidden': 'true', style: { width: '100%' } });
      const el = h(href ? 'a' : 'button', { class: 'card-link', href: href || null, type: href ? null : 'button', onclick: onClick || null }, h('div', { class: 't', text: title }), h('div', { class: 's', text: desc }), sp);
      DB.charts.spark(sp, { values: svgSeries, color: '--chart-1', height: 38 });
      return el;
    };
    const t28 = m.totals.slice(-29, -1).map((d) => d.rev);
    return h('div', null,
      h('div', { class: 'cards' },
        card('Today', 'Live revenue, volume, ' + m.ind.efficiency.toLowerCase() + ' and alerts.', null, DB.shell.carry('app.html'), m.totals.slice(-15, -1).map((d) => d.rev)),
        card('Location comparison', `${m.locations.length} ${m.locations.length === 1 ? 'location' : 'locations'} side by side over 28 days.`, () => go('locations'), null, t28),
        card('Weekly performance', 'This week against last week, day by day.', () => go('weekly'), null, m.totals.slice(-15, -1).map((d) => d.vol))),
      h('div', { class: 'panel', style: { marginTop: '12px' } }, h('header', null, h('h2', { text: `Templates for ${m.ind.label.toLowerCase()}` }), h('span', { class: 'meta', text: 'preview' })),
        h('p', { class: 'muted', style: { fontSize: '13px' }, text: 'Your dashboards are pre-built from your industry. Custom dashboards and a template library arrive once live data sources are connected.' })));
  }

  function locations(c) {
    const { model: m, f, profile: p } = c;
    const days = m.days.slice(-29, -1);
    const yMax = Math.max(...m.series.flatMap((s) => s.days.slice(-29, -1).map((d) => d.rev))) * 1.1;
    const wrap = h('div', { class: 'panels halves' });
    m.series.forEach((s) => {
      const ds = s.days.slice(-29, -1);
      const live = ds.filter((d) => !d.missing), withEff = live.filter((d) => Number.isFinite(d.eff));
      const revTotal = live.reduce((a, d) => a + d.rev, 0);
      const effW = withEff.reduce((a, d) => a + d.rev, 0);
      const eff = !withEff.length ? null : m.higherIsBetter ? withEff.reduce((a, d) => a + d.eff, 0) / withEff.length : withEff.reduce((a, d) => a + d.eff * d.rev, 0) / Math.max(effW, 1e-9);
      const bad = eff !== null && (m.higherIsBetter ? eff < p.targets.efficiency : eff > p.targets.efficiency);
      const svg = DB.s('svg', { class: 'chart', role: 'img', 'aria-label': `${s.name}: daily revenue over the last 28 days.` });
      wrap.appendChild(h('div', { class: 'panel' },
        h('header', null, h('h2', { text: s.name }), eff === null ? null : h('span', { class: 'pill ' + (bad ? 'crit' : 'ok'), text: `${m.ind.efficiency} ${f.pct(eff)}` })),
        h('div', { class: 'muted', style: { fontSize: '13px', marginBottom: '6px' }, text: `${f.money(revTotal)} over 28 days · ${f.money(revTotal / 28)} a day` }), svg));
      DB.charts.line(svg, { height: 130, yWidth: 44, yMax, xLabels: days.map((d) => f.monthDay(d.date)), xEvery: 7, yFmt: (v) => f.compact(v), tipValue: (v) => f.money(v), tipTitle: (i) => f.day(days[i].date), series: [{ name: s.name, color: '--chart-1', values: ds.map((d) => (d.missing ? null : d.rev)) }] });
    });
    return h('div', null, h('p', { class: 'muted', style: { fontSize: '13px', margin: '0 0 12px' }, text: 'Every chart uses the same scale, so heights compare directly. One colour because it is one measure: daily revenue.' }), wrap);
  }

  function weekly(c) {
    const { model: m, f, profile: p } = c, w = weekIndexes(m), t = m.today;
    const groups = [];
    for (let k = 0; k < 7; k++) {
      const ti = w.thisStart + k, li = w.prevStart + k;
      const thisV = ti < w.last ? m.totals[ti].rev : ti === w.last ? t.revSoFar : 0;
      groups.push({ label: f.weekdayShort(m.days[li].date), title: f.weekday(m.days[li].date), values: [thisV, m.totals[li].rev] });
    }
    const svg = DB.s('svg', { class: 'chart', role: 'img', 'aria-label': 'Revenue by weekday, this week against last week.' });
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const thisRev = sum(groups.map((g) => g.values[0])), lastRev = sum(groups.slice(0, w.offset + 1).map((g) => g.values[1]));
    const row = (label, a, b, fmt, goodUp) => { const d = ((a - b) / b) * 100; return h('tr', null, h('td', { text: label }), h('td', { class: 'n', text: fmt(a) }), h('td', { class: 'n', text: fmt(b) }), h('td', { class: 'n ' + ((d >= 0) === goodUp ? 'good' : 'bad'), text: f.signedPct(d) })); };
    const vol = (i0, i1) => sum(m.totals.slice(i0, i1 + 1).map((d, i, arr) => (i0 + i === w.last ? t.volSoFar : d.vol)));
    const panel = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Revenue by day' }), h('span', { class: 'meta', text: 'this week vs last week' })), svg,
      h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--chart-1)' } }), 'This week'), h('span', null, h('i', { style: { background: 'var(--chart-2)' } }), 'Last week')));
    DB.charts.vbar(svg, { height: 230, groups, series: [{ name: 'This week', color: '--chart-1' }, { name: 'Last week', color: '--chart-2' }], yFmt: (v) => f.compact(v) });
    const tbl = h('div', { class: 'panel', style: { marginTop: '12px' } }, h('header', null, h('h2', { text: 'Week to date' }), h('span', { class: 'meta', text: `${w.offset + 1} of 7 days` })),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Measure' }), h('th', { class: 'n', text: 'This week' }), h('th', { class: 'n', text: 'Same days last week' }), h('th', { class: 'n', text: 'Change' }))),
        h('tbody', null, row('Revenue', thisRev, lastRev, (v) => f.money(v), true), row(m.ind.volume, vol(w.thisStart, w.last), vol(w.prevStart, w.prevStart + w.offset), (v) => f.int(v), true)))));
    return h('div', null, panel, tbl);
  }

  DB.pages.dashboards = {
    title: 'Dashboards',
    header(c) { return { title: 'Dashboards', sub: 'Built from your industry and locations' }; },
    render(c, el) {
      let tab = (location.hash || '#overview').slice(1);
      if (!TABS.some((t) => t[0] === tab)) tab = 'overview';
      const body = h('div');
      const go = (id) => { history.replaceState(null, '', '#' + id); paint(); };
      const bar = h('div', { class: 'tabs', role: 'tablist' });
      const paint = () => {
        tab = (location.hash || '#overview').slice(1); if (!TABS.some((t) => t[0] === tab)) tab = 'overview';
        DB.clear(bar); TABS.forEach(([id, label]) => bar.appendChild(h('button', { class: 'chip', role: 'tab', 'aria-selected': String(id === tab), style: id === tab ? { background: 'var(--primary-fill)', color: 'var(--on-primary)', borderColor: 'var(--primary-edge)' } : null, onclick: () => go(id), text: label })));
        DB.clear(body); body.appendChild({ overview: overview, locations: locations, weekly: weekly }[tab](c, go));
      };
      DB.clear(el); DB.add(el, bar, body); paint();
      window.addEventListener('hashchange', paint);
    },
  };
})();
