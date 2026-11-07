(function () {
  'use strict';
  const DB = window.DB, { h, icon } = DB;

  DB.pages.today = {
    title: 'Today',
    header(c) {
      const m = c.model, last = m.days[m.days.length - 1].date;
      const clock = c.f.time(m.nowHour, m.minute);
      return {
        title: 'Today',
        sub: `${c.f.day(last)} · ${m.locations.length} ${m.locations.length === 1 ? 'location' : 'locations'}${m.demoClock ? ' · demo clock ' + clock : ''}`,
      };
    },
    render(c, el) {
      const { f, model: m, profile: p } = c, t = m.today, ind = m.ind, last14 = m.totals.slice(-15, -1);
      const lastDow = f.weekday(m.days[m.days.length - 1].date);
      const delta = (a, b) => ((a - b) / Math.max(b, 1e-9)) * 100;
      const dirIcon = (v) => icon(v >= 0 ? 'up' : 'down', 12);
      const effBad = m.higherIsBetter ? t.effSoFar < p.targets.efficiency : t.effSoFar > p.targets.efficiency;
      const effFmt = (v) => f.pct(v);

      const kpi = (label, value, deltaEl, series, color, tag) => {
        const sp = DB.s('svg', { class: 'spark', 'aria-hidden': 'true' });
        const node = h('div', { class: 'kpi' }, h('div', { class: 'k' }, h('span', { text: label }), tag || null), h('div', { class: 'v num', text: value }), deltaEl, sp);
        DB.charts.spark(sp, { values: series, color });
        return node;
      };
      const dEl = (v, text, goodWhenUp) => Math.abs(v) < 0.5 ? h('div', { class: 'd muted' }, text) : h('div', { class: 'd ' + ((v >= 0) === goodWhenUp ? 'good' : 'bad') }, dirIcon(v), text);
      const revD = delta(t.revSoFar, t.revLw), volD = delta(t.volSoFar, t.volLw), avgD = delta(t.avgSoFar, t.avgLw);

      const kpis = h('section', { class: 'kpis', 'aria-label': 'Key numbers' },
        kpi('Revenue so far', f.money(t.revSoFar), dEl(revD, `${f.signedPct(revD)} vs last ${lastDow}`, true), last14.map((d) => d.rev), '--chart-1'),
        kpi(ind.volume, f.int(t.volSoFar), dEl(volD, `${f.signedPct(volD)} vs last ${lastDow}`, true), last14.map((d) => d.vol), '--chart-3'),
        kpi(ind.efficiency, effFmt(t.effSoFar), h('div', { class: 'd ' + (effBad ? 'bad' : 'good') }, icon(effBad ? 'down' : 'check', 12), `target ${f.pct(p.targets.efficiency, 0)}`), last14.map((d) => d.eff), '--chart-2', effBad ? h('span', { class: 'pill crit', text: m.higherIsBetter ? 'Below' : 'Over' }) : null),
        kpi(ind.avg, f.money2(t.avgSoFar), dEl(avgD, `${f.signedPct(avgD)} vs last ${lastDow}`, true), last14.map((d) => d.avg), '--chart-4'));

      /* revenue so far (cumulative) */
      const lwCum = []; t.hourlyLw.reduce((a, v, i) => (lwCum[i] = a + v), 0);
      const svgHour = DB.s('svg', { class: 'chart', role: 'img', 'aria-label': `Revenue so far today compared with last ${lastDow}.` });
      const hourPanel = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Revenue so far today' }), h('span', { class: 'meta', text: `vs last ${lastDow}` })), svgHour,
        h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--chart-1)' } }), 'Today'), h('span', null, h('i', { class: 'dash' }), `Last ${lastDow}`)));
      DB.charts.line(svgHour, {
        height: 230, xLabels: m.hours.map((x) => f.hour(x)), yFmt: (v) => f.compact(v), tipValue: (v) => f.money(v), label: 'Cumulative revenue by hour',
        tipTitle: (i) => f.hour(m.hours[i]) + (m.hours[i] === m.nowHour ? ' (now)' : ''),
        series: [{ name: `Last ${lastDow}`, color: '--text-3', values: lwCum, dashed: true }, { name: 'Today', color: '--chart-1', values: t.hourlyTodayCum, area: true, labelLast: 'now · ' + f.money(t.revSoFar) }],
      });

      /* analyst teaser, written from the data */
      const crit = m.alerts.find((a) => a.severity === 'critical'), paceTxt = `On track for ${f.money(t.projected)} today against a ${f.money(p.targets.dailyRevenue)} target.`;
      const teaser = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'AI analyst' }), h('span', { class: 'meta', text: 'from your sample data' })),
        h('p', { style: { marginBottom: '10px' } }, h('b', { text: crit ? crit.title + '. ' : 'Nothing is off target right now. ' }), crit ? crit.body : ''),
        h('p', { class: 'muted', style: { marginBottom: '14px', fontSize: '13px' }, text: paceTxt }),
        h('a', { class: 'btn btn-primary btn-sm', href: DB.shell.carry('analyst.html'), text: 'Ask a question' }));

      const locRows = [...t.perLocation].sort((a, b) => b.rev - a.rev).map((x) => ({ label: x.name, value: x.rev, note: `${ind.efficiency} ${f.pct(x.eff)}` }));
      const svgLoc = DB.s('svg', { class: 'chart', role: 'img', 'aria-label': 'Revenue so far by location.' });
      const locPanel = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Revenue by location' }), h('span', { class: 'meta', text: 'so far today' })), svgLoc);
      DB.charts.hbar(svgLoc, { rows: locRows, fmt: (v) => f.money(v) });

      const sev = { critical: 'var(--critical)', warn: 'var(--warn)', ok: 'var(--ok)', info: 'var(--text-3)' };
      const alertPanel = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Alerts' }), h('a', { class: 'meta', href: DB.shell.carry('alerts.html'), text: 'View all' })),
        m.alerts.length ? h('ul', { class: 'alerts' }, m.alerts.slice(0, 4).map((a) => h('li', null, h('span', { class: 'dot', style: { background: sev[a.severity] }, 'aria-hidden': 'true' }), h('div', null, h('b', { text: a.title }), a.body), h('time', { text: a.ago })))) : h('div', { class: 'empty', text: 'All clear.' }));

      const svgMix = DB.s('svg', { class: 'chart', role: 'img', 'aria-label': 'Sales mix: ' + m.mix.map((x) => `${x.label} ${Math.round(x.share * 100)} percent`).join(', ') });
      const colors = ['--chart-1', '--chart-2', '--chart-3', '--chart-4'];
      const mixPanel = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Sales mix' }), h('span', { class: 'meta', text: 'share of revenue so far' })), svgMix,
        h('div', { class: 'legend' }, m.mix.map((x, i) => h('span', null, h('i', { style: { background: `var(${colors[i]})` } }), x.label))));
      DB.charts.stack(svgMix, { segs: m.mix.map((x, i) => ({ label: x.label, value: x.share * t.revSoFar, color: colors[i] })), fmt: (v) => f.money(v) });

      const status = (x) => {
        const gap = (x.eff - p.targets.efficiency) / p.targets.efficiency * (m.higherIsBetter ? -1 : 1);
        return x.bad ? h('span', { class: 'pill crit' }, '▲ ' + (m.higherIsBetter ? 'Below target' : 'Over target')) : gap > -0.06 ? h('span', { class: 'pill warn' }, '● Watch') : h('span', { class: 'pill ok' }, '✓ On target');
      };
      const table = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Locations' }), h('span', { class: 'meta', text: 'live' })),
        h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Location' }), h('th', { class: 'n', text: 'Revenue' }), h('th', { class: 'n', text: ind.efficiency }), h('th', { text: 'Status' }))),
          h('tbody', null, t.perLocation.map((x) => h('tr', null, h('td', { text: x.name }), h('td', { class: 'n', text: f.money(x.rev) }), h('td', { class: 'n', text: f.pct(x.eff) }), h('td', null, status(x))))))));

      DB.clear(el);
      el.append(kpis, h('div', { class: 'panels two' }, hourPanel, teaser), h('div', { class: 'panels two', style: { marginTop: '12px' } }, h('div', { class: 'grid' }, locPanel, mixPanel), h('div', { class: 'grid' }, alertPanel, table)));
    },
  };
})();
