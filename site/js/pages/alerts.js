(function () {
  'use strict';
  const DB = window.DB, { h, icon } = DB;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

  DB.pages.alerts = {
    title: 'Alerts',
    header(c) { return { title: 'Alerts', sub: 'Set a target once. Hear about it when it slips.' }; },
    render(c, el) {
      const { model: m, f, profile: p, tenant } = c, D = DB.data;
      const kCustom = 'db.rules.' + tenant.id, kState = 'db.rulestate.' + tenant.id;
      const rules = () => { const st = read(kState, {}); return D.defaultRules(p).concat(read(kCustom, [])).map((r) => ({ ...r, enabled: st[r.id] !== undefined ? st[r.id] : r.enabled })); };
      const sev = { critical: 'var(--critical)', warn: 'var(--warn)', ok: 'var(--ok)', info: 'var(--text-3)' };

      const feed = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Happening now' }), h('span', { class: 'meta', text: `${m.alerts.length} items` })),
        m.alerts.length ? h('ul', { class: 'alerts' }, m.alerts.map((a) => h('li', null, h('span', { class: 'dot', style: { background: sev[a.severity] }, 'aria-hidden': 'true' }), h('div', null, h('b', { text: a.title }), a.body), h('time', { text: a.ago })))) : h('div', { class: 'empty', text: 'Nothing needs your attention.' }));

      const list = h('ul', { class: 'rows' });
      const rulesPanel = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Rules' }), h('button', { class: 'btn btn-primary btn-sm', onclick: () => dlg.showModal() }, icon('plus', 14), 'Add rule')),
        h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: '8px' }, text: 'Each rule shows how often it would have fired in the last 28 days, so you can tune it before it bothers anyone. Notifications are not delivered in this preview.' }), list);

      const paint = () => {
        DB.clear(list);
        rules().forEach((r) => {
          const ev = D.evalRule(r, m), pct = Math.round((ev.count / ev.cells) * 100);
          const cb = h('input', { type: 'checkbox', checked: r.enabled ? true : null, 'aria-label': 'Enable rule', onchange: (e) => { const st = read(kState, {}); st[r.id] = e.target.checked; write(kState, st); paint(); } });
          list.appendChild(h('li', null, h('label', { class: 'switch' }, cb, h('i')),
            h('div', { class: 'grow' }, h('div', { class: 't', text: D.ruleTitle(r, p) }),
              h('div', { class: 's', text: `${ev.count} of ${ev.cells} location-days (${pct}%)` + (ev.last ? ` · last ${f.day(ev.last.date)} at ${ev.last.location}` : '') + ` · ${r.channel === 'email' ? 'email' : 'push'}` })),
            ev.count && pct > 40 ? h('span', { class: 'pill warn', text: 'Noisy' }) : null,
            r.builtin ? h('span', { class: 'pill neutral', text: 'From your targets' }) : h('button', { class: 'icon-btn', 'aria-label': 'Delete rule', onclick: () => { write(kCustom, read(kCustom, []).filter((x) => x.id !== r.id)); paint(); } }, icon('trash', 16))));
        });
      };

      /* add-rule dialog */
      const sel = (id, opts) => h('select', { id }, opts.map(([v, l]) => h('option', { value: v, text: l })));
      const metric = sel('r-metric', [['revenue', 'Daily revenue (per location)'], ['volume', m.ind.volume + ' (per location)'], ['avg', m.ind.avg], ['efficiency', m.ind.efficiency]]);
      const op = sel('r-op', [['<', 'falls below'], ['>', 'goes above']]);
      const val = h('input', { id: 'r-val', type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'e.g. 2500' });
      const chan = sel('r-chan', [['push', 'Push notification'], ['email', 'Email']]);
      const err = h('div', { class: 'hint bad', role: 'alert' });
      const form = h('form', { method: 'dialog', onsubmit: (e) => {
        const v = Number(val.value);
        if (!val.value || !Number.isFinite(v) || v <= 0) { e.preventDefault(); err.textContent = 'Enter a number above zero.'; val.focus(); return; }
        const custom = read(kCustom, []);
        if (custom.length >= 20) { e.preventDefault(); err.textContent = 'You can have up to 20 custom rules.'; return; }
        custom.push({ id: 'c-' + Date.now().toString(36), metric: metric.value, op: op.value, value: v, channel: chan.value, enabled: true });
        write(kCustom, custom); val.value = ''; err.textContent = ''; paint(); DB.toast('Rule added');
      } },
        h('h2', { text: 'New alert rule' }),
        h('div', { class: 'field' }, h('label', { for: 'r-metric', text: 'When' }), metric),
        h('div', { class: 'field' }, h('label', { for: 'r-op', text: 'At any location, if it' }), op),
        h('div', { class: 'field' }, h('label', { for: 'r-val', text: 'Value' }), val, err),
        h('div', { class: 'field' }, h('label', { for: 'r-chan', text: 'Tell me by' }), chan),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => dlg.close(), text: 'Cancel' }), h('button', { class: 'btn btn-primary', type: 'submit', text: 'Add rule' })));
      const dlg = h('dialog', { 'aria-label': 'New alert rule' }, form);
      paint();
      DB.clear(el); el.append(h('div', { class: 'panels two' }, rulesPanel, feed), dlg);
    },
  };
})();
