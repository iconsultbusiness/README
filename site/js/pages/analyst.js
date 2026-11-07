(function () {
  'use strict';
  const DB = window.DB, { h, icon } = DB;
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  /* Rule-based answers computed from the sample data. NOT a language model. */
  function analyse(q, c) {
    const { model: m, f, profile: p } = c, ind = m.ind, text = q.toLowerCase();
    const done = m.totals.slice(0, -1);
    const bySeries = (name) => m.series.find((s) => s.name === name);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
    const typical = (day) => mean(done.filter((d) => d.dow === day.dow && d.date !== day.date).map((d) => d.rev));
    const para = (t) => h('p', { text: t });
    const table = (head, rows) => h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, head.map((t, i) => h('th', { class: i ? 'n' : '', text: t })))), h('tbody', null, rows.map((r) => h('tr', null, r.map((v, i) => h('td', { class: i ? 'n' : '', text: v })))))));

    const named = WEEKDAYS.findIndex((d) => text.includes(d));
    if (/(slow|weak|worst|quiet|bad day|down on|why was|drop)/.test(text)) {
      let day;
      if (named >= 0) day = [...done].reverse().find((d) => d.dow === named);
      else day = done.slice(-28).map((d) => ({ d, r: d.rev / typical(d) })).sort((a, b) => a.r - b.r)[0].d;
      const idx = m.days.findIndex((d) => d.date === day.date), tp = typical(day), drop = (day.rev / tp - 1) * 100;
      const volTyp = mean(done.filter((d) => d.dow === day.dow && d.date !== day.date).map((d) => d.vol)), avgTyp = mean(done.filter((d) => d.dow === day.dow && d.date !== day.date).map((d) => d.avg));
      const rows = m.series.map((s) => { const t = mean(s.days.slice(0, -1).filter((d) => d.dow === day.dow && d.date !== day.date).map((d) => d.rev)); return { name: s.name, v: s.days[idx].rev, t, gap: s.days[idx].rev - t }; }).sort((a, b) => a.gap - b.gap);
      const dv = (day.vol / volTyp - 1) * 100, da = (day.avg / avgTyp - 1) * 100;
      const rel = (v) => (Math.abs(v) < 1 ? 'in line with typical' : `${Math.abs(v).toFixed(0)}% ${v < 0 ? 'below' : 'above'} typical`);
      return [
        para(`${named >= 0 ? 'The most recent ' + f.weekday(day.date) + ' was ' + f.day(day.date) : 'The weakest day in the last four weeks was ' + f.day(day.date)}. It brought in ${f.money(day.rev)}, ${Math.abs(drop).toFixed(0)}% ${drop < 0 ? 'below' : 'above'} a typical ${f.weekday(day.date)} of ${f.money(tp)}.`),
        para(`${ind.volume} were ${rel(dv)} and ${ind.avg.toLowerCase()} was ${rel(da)}, so ${Math.abs(dv) > Math.abs(da) ? (dv < 0 ? 'fewer ' + ind.volume.toLowerCase() : 'more ' + ind.volume.toLowerCase()) + ' explain most of it' : (da < 0 ? 'smaller' : 'larger') + ' spend per sale explains most of it'}.`),
        m.locations.length > 1 ? table(['Location', 'That day', 'Typical', 'Gap'], rows.map((r) => [r.name, f.money(r.v), f.money(r.t), f.money(r.gap)])) : null,
      ];
    }
    if (/(labou?r|utili[sz]ation|efficien|over target|off target|staff|roster)/.test(text)) {
      const rows = m.series.map((s) => { const d7 = s.days.slice(-8, -1), d28 = s.days.slice(-29, -1); const bad = (d) => (m.higherIsBetter ? d.eff < p.targets.efficiency : d.eff > p.targets.efficiency); return { name: s.name, wk: mean(d7.map((d) => d.eff)), over: d28.filter(bad).length }; });
      const today = m.today.perLocation;
      const worst = [...rows].sort((a, b) => b.over - a.over)[0];
      return [
        para(`${worst.name} is the one to watch: ${ind.efficiency.toLowerCase()} was ${m.higherIsBetter ? 'below' : 'over'} your ${f.pct(p.targets.efficiency, 0)} target on ${worst.over} of the last 28 days.`),
        table(['Location', 'Today so far', 'Last 7 days', 'Days off target (28)'], rows.map((r) => [r.name, f.pct(today.find((x) => x.name === r.name).eff), f.pct(r.wk), String(r.over)])),
      ];
    }
    if (/(best|top|highest|record|strongest)/.test(text)) {
      const best = [...done.slice(-28)].sort((a, b) => b.rev - a.rev)[0];
      const loc = m.series.map((s) => ({ name: s.name, rev: s.days.slice(-29, -1).reduce((a, d) => a + d.rev, 0) })).sort((a, b) => b.rev - a.rev);
      return [para(`Your best day in the last four weeks was ${f.day(best.date)} with ${f.money(best.rev)}.`), para(`${loc[0].name} is your strongest location over that time with ${f.money(loc[0].rev)}${loc.length > 1 ? ', ' + Math.round((loc[0].rev / loc.reduce((a, x) => a + x.rev, 0)) * 100) + '% of the total' : ''}.`)];
    }
    if (/(forecast|tomorrow|projected|predict|end of day|on track|pace)/.test(text)) {
      const next = (m.days[m.days.length - 1].dow + 1) % 7, tmw = mean(done.filter((d) => d.dow === next).slice(-4).map((d) => d.rev));
      const dayAfter = new Date(Date.parse(m.days[m.days.length - 1].date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
      return [para(`At this point in the day you are on track for ${f.money(m.today.projected)}, which is ${f.signedPct((m.today.projected / p.targets.dailyRevenue - 1) * 100)} against your ${f.money(p.targets.dailyRevenue)} target.`), para(`Tomorrow is a ${f.weekday(dayAfter)}. The last four have averaged ${f.money(tmw)}.`)];
    }
    if (/(week|how am i|how are we|doing|target|summary|overview)/.test(text)) {
      const last = m.days.length - 1, start = p.company.weekStart === 'sun' ? 0 : 1, off = (m.days[last].dow - start + 7) % 7, ws = last - off;
      const wtd = m.totals.slice(ws, last).reduce((a, d) => a + d.rev, 0) + m.today.revSoFar, prev = m.totals.slice(ws - 7, ws - 7 + off).reduce((a, d) => a + d.rev, 0) + m.totals[ws - 7 + off].rev * (m.today.revLw / m.totals[ws - 7 + off].rev);
      return [para(`Week to date you have ${f.money(wtd)} against ${f.money(prev)} for the same point last week (${f.signedPct((wtd / prev - 1) * 100)}).`), para(`Today is tracking to ${f.money(m.today.projected)}. ${m.alerts.filter((a) => a.severity === 'critical').length ? 'There are alerts that need attention: ' + m.alerts.filter((a) => a.severity === 'critical').map((a) => a.title).join('; ') + '.' : 'Nothing is off target.'}`)];
    }
    return [para('I can answer questions like these from your sample data:'), h('ul', null, SUGGESTIONS.map((s) => h('li', { text: s })))];
  }
  const SUGGESTIONS = ['Why was our slowest day slow?', 'Which location is off target?', 'What was our best day?', 'Are we on track for today?', 'How are we doing this week?'];

  DB.pages.analyst = {
    title: 'AI analyst',
    header() { return { title: 'AI analyst', sub: 'Ask about your numbers in plain English' }; },
    render(c, el) {
      const log = h('div', { class: 'chat', 'aria-live': 'polite' });
      const input = h('input', { type: 'text', 'aria-label': 'Ask a question', placeholder: 'Ask about your numbers…', maxlength: 200, autocomplete: 'off' });
      const ask = (q) => {
        q = q.trim(); if (!q) return;
        log.appendChild(h('div', { class: 'msg user', text: q }));
        const bot = h('div', { class: 'msg bot' }, analyse(q, DB.ctx));
        log.appendChild(bot); bot.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); input.value = '';
      };
      log.appendChild(h('div', { class: 'msg bot' }, h('p', { text: `Hi. I know your ${c.profile.locations.length === 1 ? 'location' : c.profile.locations.length + ' locations'}, your ${c.model.ind.efficiency.toLowerCase()} target and your daily goal. What would you like to know?` })));
      DB.clear(el);
      el.append(
        h('div', { class: 'banner' }, h('span', null, h('b', null, 'Preview. '), 'Answers are worked out by rules over your sample data, not by an AI model, so they are only as good as the questions it recognises. Live answers need a connected data source and a language model.')),
        h('div', { class: 'panel' },
          log, h('div', { class: 'chips' }, SUGGESTIONS.map((s) => h('button', { class: 'chip', type: 'button', onclick: () => ask(s), text: s }))),
          h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); ask(input.value); } }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, icon('send', 16), 'Ask'))));
    },
  };
})();
