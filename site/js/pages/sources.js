(function () {
  'use strict';
  const DB = window.DB, { h } = DB;
  const BLURB = {
    'Point of sale': 'Sales, orders and baskets by location and hour.', Accounting: 'Cash, margin and invoices.', Rostering: 'Hours worked and labour cost.',
    Spreadsheets: 'Upload a CSV or link a sheet for anything else.', 'Online store': 'Web orders, conversion and stock.', Invoicing: 'Jobs, invoices and what is overdue.', CRM: 'Leads, bookings and pipeline.',
  };
  DB.pages.sources = {
    title: 'Data sources',
    header() { return { title: 'Data sources', sub: 'Where your numbers come from' }; },
    render(c, el) {
      const { model: m } = c;
      DB.clear(el);
      el.append(
        h('div', { class: 'banner' }, h('span', null, h('b', null, 'No live connectors yet. '), 'Every figure in this workspace is generated sample data shaped by your profile. The cards below show what we would connect for ', m.ind.label.toLowerCase(), ', and are not clickable until a connector exists.')),
        h('div', { class: 'cards' }, m.ind.sources.map((s) => h('div', { class: 'card-link', style: { cursor: 'default' } },
          h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px' } }, h('div', { class: 'mono-badge', 'aria-hidden': 'true', text: s.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() }), h('div', null, h('div', { class: 't', text: s }), h('span', { class: 'pill warn', text: 'Sample data' }))),
          h('div', { class: 's', text: BLURB[s] || '' }),
          h('button', { class: 'btn btn-ghost btn-sm', disabled: true, title: 'Not available in this preview', text: 'Connect' })))));
    },
  };
})();
