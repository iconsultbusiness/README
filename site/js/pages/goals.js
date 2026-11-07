(function () {
  'use strict';
  const DB = window.DB, { h } = DB;
  DB.pages.goals = {
    title: 'Goals',
    header() { return { title: 'Goals', sub: 'The targets everything else is measured against' }; },
    render(c, el) {
      const { model: m, f, profile: p, tenant } = c, t = m.today, ind = m.ind;
      const perLocTarget = p.targets.dailyRevenue / m.locations.length;

      const rows = t.perLocation.map((x) => {
        const pctRev = x.rev / (perLocTarget * Math.max(t.curveShare, 0.05));
        const bar = (valueFrac, markFrac, color) => h('div', { class: 'progress', role: 'img', 'aria-label': `${Math.round(valueFrac * 100)} percent of target` }, h('i', { style: { width: Math.min(100, valueFrac * 100) + '%', background: color } }), markFrac != null ? h('u', { style: { left: Math.min(100, markFrac * 100) + '%' } }) : null);
        const effGap = m.higherIsBetter ? x.eff / p.targets.efficiency : p.targets.efficiency / Math.max(x.eff, 0.1);
        return h('li', { style: { display: 'block' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' } }, h('div', { class: 't', text: x.name }), h('span', { class: 'pill ' + (x.bad ? 'crit' : pctRev >= 1 ? 'ok' : 'warn'), text: x.bad ? (m.higherIsBetter ? 'Below target' : 'Over target') : pctRev >= 1 ? (m.real ? 'Met target' : 'Ahead') : (m.real ? 'Below target' : 'Behind pace') })),
          h('div', { class: 's', text: `Revenue ${f.money(x.rev)} of ${f.money(perLocTarget)} daily target` }), bar(x.rev / perLocTarget, t.curveShare, 'var(--chart-1)'),
          m.hasEff === false ? null : h('div', { class: 's', style: { marginTop: '10px' }, text: `${ind.efficiency} ${f.pct(x.eff)} against ${f.pct(p.targets.efficiency, 0)}` }), m.hasEff === false ? null : bar(Math.min(effGap, 1), null, x.bad ? 'var(--critical)' : 'var(--ok)'));
      });
      const progress = h('div', { class: 'panel' }, h('header', null, h('h2', { text: m.real ? `${f.day(m.latest)} by location` : 'Today by location' }), h('span', { class: 'meta', text: m.real ? 'the line marks the daily target' : 'the line marks where you should be by now' })), h('ul', { class: 'rows' }, rows));

      /* editable targets: these drive alerts, goals and the demo data */
      const rev = h('input', { id: 'g-rev', type: 'number', min: 1, step: 'any', inputmode: 'decimal', value: p.targets.dailyRevenue });
      const eff = h('input', { id: 'g-eff', type: 'number', min: 1, max: 100, step: 'any', inputmode: 'decimal', value: p.targets.efficiency });
      const msg = h('div', { class: 'hint', role: 'status' });
      const canSave = true; // signed in as the owner, or the demo
      const save = h('button', { class: 'btn btn-primary', type: 'submit', disabled: canSave ? null : true, text: 'Save targets' });
      const form = h('form', { onsubmit: async (e) => {
        e.preventDefault(); save.disabled = true; msg.className = 'hint'; msg.textContent = 'Saving…';
        const next = JSON.parse(JSON.stringify(tenant.profile)); next.targets = { dailyRevenue: rev.value, efficiency: eff.value };
        const r = await tenant.save(next);
        if (!r.ok) { msg.className = 'hint bad'; msg.textContent = r.errors.map((x) => x.message).join(' '); save.disabled = false; return; }
        DB.toast(r.local && tenant.demo ? 'Updated for this session only (demo)' : 'Targets saved'); DB.ctx.refresh();
      } },
        h('div', { class: 'field' }, h('label', { for: 'g-rev', text: `Daily revenue target, all locations (${p.company.currency})` }), rev),
        h('div', { class: 'field' }, h('label', { for: 'g-eff', text: `${ind.efficiency} target (%)` }), eff, h('div', { class: 'hint', text: ind.efficiencyDir === 'lower' ? 'Alerts fire when it goes above this.' : 'Alerts fire when it drops below this.' })),
        save, msg);
      const targets = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Your targets' })), form);

      DB.clear(el); DB.add(el, h('div', { class: 'panels two' }, progress, targets));
    },
  };
})();
