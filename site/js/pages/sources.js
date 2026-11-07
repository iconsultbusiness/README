(function () {
  'use strict';
  const DB = window.DB, { h, icon } = DB;
  const MAX_BYTES = 5 * 1024 * 1024;
  const PLANNED = { hospitality: ['Point of sale', 'Accounting', 'Rostering'], retail: ['Online store', 'Point of sale', 'Accounting'], services: ['Invoicing', 'CRM', 'Accounting'] };
  const BLURB = { 'Point of sale': 'Sales, orders and baskets by location and hour.', Accounting: 'Cash, margin and invoices.', Rostering: 'Hours worked and labour cost.', 'Online store': 'Web orders, conversion and stock.', Invoicing: 'Jobs, invoices and what is overdue.', CRM: 'Leads, bookings and pipeline.' };

  DB.pages.sources = {
    title: 'Data sources',
    header() { return { title: 'Data sources', sub: 'Where your numbers come from' }; },
    render(c, el) {
      const { model: m, f, tenant: t, profile: p } = c, ind = m.ind, services = p.company.industry === 'services';
      const data = t.data;
      DB.clear(el);

      /* ---------- what is imported now ---------- */
      const stat = (label, value) => h('div', null, h('div', { class: 's', text: label }), h('div', { class: 't', text: value }));
      const current = h('div', { class: 'panel' }, h('header', null, h('h2', { text: 'Your sales data' }), data ? h('span', { class: 'pill ok', text: 'Live' }) : h('span', { class: 'pill warn', text: 'Sample data' })));
      if (data) {
        DB.add(current, 
          h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: '14px' } },
            stat('Rows', f.int(data.rows)), stat('From', f.day(data.from)), stat('To', f.day(data.to)), stat('Locations', data.locations.join(', ')),
            stat('Counts', data.hasVolume ? 'Included' : 'Not in file'), stat(services ? 'Utilisation' : 'Labour', data.hasEff ? 'Included' : 'Not in file')),
          data.lastImport ? h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: '12px' }, text: `Last import: ${data.lastImport.filename}, ${new Date(data.lastImport.at).toLocaleString(p.company.locale)}.` }) : null,
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('a', { class: 'btn btn-ghost btn-sm', href: '/api/data/export.csv', download: 'sales-export.csv', text: 'Export CSV' }),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => rmDlg.showModal(), text: 'Remove my data' })));
      } else {
        DB.add(current, h('p', { class: 'muted', style: { fontSize: '14px' }, text: t.demo ? 'This is a demo workspace, so it runs on generated numbers. Create a workspace to import your own sales.' : 'Nothing imported yet, so every number in the app is generated from your profile. Import a CSV below to see your own.' }));
      }
      const rmErr = h('div', { class: 'hint bad', role: 'alert' });
      const rmDlg = h('dialog', { 'aria-label': 'Remove data' }, h('h2', { text: 'Remove your sales data?' }),
        h('p', { class: 'muted', style: { marginBottom: '12px', fontSize: '14px' }, text: 'This deletes every imported row. The app goes back to sample data. Your workspace, branding and targets stay. This cannot be undone.' }), rmErr,
        h('div', { class: 'actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => rmDlg.close(), text: 'Cancel' }),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { const r = await DB.api('DELETE', '/api/data'); if (!r.ok) { rmErr.textContent = (r.error && r.error.message) || 'Could not remove the data.'; return; } try { localStorage.removeItem('db.rows.' + t.id); } catch (e) { /* storage blocked */ } location.reload(); }, text: 'Remove data' })));

      /* ---------- import ---------- */
      const col = services ? 'date, location, revenue, jobs, utilisation_pct' : 'date, location, revenue, orders, labour_cost';
      const fileIn = h('input', { type: 'file', id: 'csv-file', accept: '.csv,.txt,text/csv,text/plain', class: 'sr-only', onchange: (e) => { const file = e.target.files[0]; if (file) load(file); e.target.value = ''; } });
      const pick = h('label', { class: 'btn btn-primary', for: 'csv-file', text: t.demo ? 'Choose a CSV (preview only)' : 'Choose a CSV file' });
      const result = h('div', { 'aria-live': 'polite' });
      const tplLink = h('a', { class: 'btn btn-ghost btn-sm', href: '#', onclick: (e) => { e.preventDefault(); const url = URL.createObjectURL(new Blob([DBCsv.template(p.company.industry)], { type: 'text/csv' })); const a = h('a', { href: url, download: 'sales-template.csv' }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }, text: 'Download a template' });
      const importPanel = h('div', { class: 'panel', style: { marginTop: '12px' } },
        h('header', null, h('h2', { text: 'Import sales from a CSV' }), tplLink),
        h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: '12px' } }, `One row per day per location. Needed: date and revenue. Helpful: location, ${services ? 'jobs and utilisation_pct' : 'orders and labour_cost'}. Example columns: ${col}. Most point-of-sale and accounting systems can export this. Up to 5 MB, 12 locations, the latest 400 days.`),
        pick, fileIn, result);

      let state = { text: '', filename: '', order: undefined };
      async function load(file) {
        DB.clear(result);
        if (file.size > MAX_BYTES) { result.appendChild(h('div', { class: 'errors', role: 'alert' }, 'That file is over 5 MB. Export a shorter period.')); return; }
        state = { text: await file.text(), filename: file.name, order: undefined };
        analyse();
      }
      function analyse() {
        DB.clear(result);
        const r = DBCsv.parseSales(state.text, { industry: p.company.industry, dateOrder: state.order });
        const box = h('div', { style: { marginTop: '14px' } }, h('div', { class: 'muted', style: { fontSize: '13px', marginBottom: '8px' }, text: state.filename }));
        if (!r.ok) {
          if (r.ambiguousDates) {
            DB.add(box, h('div', { class: 'errors', role: 'alert' }, r.errors[0].message),
              h('div', { class: 'seg', role: 'group', 'aria-label': 'Date order' },
                h('button', { type: 'button', onclick: () => { state.order = 'dmy'; analyse(); }, text: 'Day first (31/12/2026)' }),
                h('button', { type: 'button', onclick: () => { state.order = 'mdy'; analyse(); }, text: 'Month first (12/31/2026)' })));
          } else DB.add(box, h('div', { class: 'errors', role: 'alert' }, h('b', { text: 'This file needs fixing before it can be imported' }), h('ul', null, r.errors.map((e) => h('li', { text: e.line ? `Line ${e.line}: ${e.message}` : e.message })))));
          result.appendChild(box); return;
        }
        const s = r.summary, ex = r.rows.slice(0, 5);
        DB.add(box, 
          h('div', { class: 'banner', style: { marginBottom: '10px' } }, h('span', null, h('b', { text: `${f.int(s.rows)} rows` }), ` from ${f.day(s.from)} to ${f.day(s.to)}, ${s.locations.length} ${s.locations.length === 1 ? 'location' : 'locations'}: ${s.locations.join(', ')}.`)),
          r.warnings.length ? h('ul', { class: 'notes', style: { marginBottom: '10px' } }, r.warnings.map((w) => h('li', { class: 'warn', text: w }))) : null,
          h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Date' }), h('th', { text: 'Location' }), h('th', { class: 'n', text: 'Revenue' }), h('th', { class: 'n', text: ind.volume }), h('th', { class: 'n', text: ind.efficiency }))),
            h('tbody', null, ex.map((x) => h('tr', null, h('td', { text: f.monthDay(x.date) }), h('td', { text: x.location }), h('td', { class: 'n', text: f.money(x.revenue) }), h('td', { class: 'n', text: x.volume === null ? '—' : f.int(x.volume) }), h('td', { class: 'n', text: x.eff === null ? '—' : f.pct(x.eff) })))))));
        if (t.demo) { DB.add(box, h('p', { class: 'muted', style: { marginTop: '12px', fontSize: '13px' } }, 'Looks good. ', h('a', { href: 'signup.html', style: { textDecoration: 'underline' }, text: 'Create a workspace' }), ' to import it.')); result.appendChild(box); return; }
        const mode = { v: 'replace' };
        const modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Import mode', style: { margin: '12px 0' } },
          h('button', { type: 'button', 'aria-pressed': 'true', onclick: (e) => { mode.v = 'replace'; paintMode(); }, text: 'Replace my data' }),
          h('button', { type: 'button', 'aria-pressed': 'false', disabled: data ? null : true, onclick: () => { mode.v = 'merge'; paintMode(); }, text: 'Add to my data' }));
        const paintMode = () => [...modeSeg.children].forEach((b, i) => b.setAttribute('aria-pressed', String(['replace', 'merge'][i] === mode.v)));
        const err = h('div', { class: 'hint bad', role: 'alert' });
        const go = h('button', { class: 'btn btn-cta', type: 'button', text: data ? 'Import' : 'Import and use my data', onclick: async () => {
          go.disabled = true; err.textContent = ''; go.textContent = 'Importing…';
          const res = await DB.api('POST', '/api/data/import', { csv: state.text, filename: state.filename, mode: mode.v, dateOrder: state.order });
          if (!res.ok) { go.disabled = false; go.textContent = 'Import'; const e = res.error || {}; err.textContent = e.errors ? e.errors.map((x) => (x.line ? `Line ${x.line}: ` : '') + x.message).join(' ') : (e.message || 'The import failed.'); return; }
          DB.toast('Imported. Loading your numbers…'); setTimeout(() => location.reload(), 600);
        } });
        DB.add(box, h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '10px' }, text: data ? 'Replace swaps everything for this file. Add keeps your current rows and updates matching days.' : 'Your locations will be set from the file.' }), data ? modeSeg : null, go, err);
        result.appendChild(box);
      }

      /* ---------- planned connectors ---------- */
      const planned = h('div', { class: 'panel', style: { marginTop: '12px' } }, h('header', null, h('h2', { text: 'Connectors we plan to add' }), h('span', { class: 'meta', text: 'not available yet' })),
        h('div', { class: 'cards' }, (PLANNED[p.company.industry] || []).map((s) => h('div', { class: 'card-link', style: { cursor: 'default' } },
          h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' } }, h('div', { class: 'mono-badge', 'aria-hidden': 'true', text: s.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() }), h('div', null, h('div', { class: 't', text: s }), h('span', { class: 'pill neutral', text: 'Planned' }))),
          h('div', { class: 's', text: BLURB[s] || '' })))));

      DB.add(el, current, importPanel, planned, rmDlg);
    },
  };
})();
