/* App shell: sidebar with the customer's logo and name, theme toggle, mobile drawer, page bootstrap. */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  const { h, icon } = DB;
  DB.pages = DB.pages || {};

  const NAV = [
    { id: 'today', href: 'app.html', label: 'Today', icon: 'home' },
    { id: 'dashboards', href: 'dashboards.html', label: 'Dashboards', icon: 'bars' },
    { id: 'alerts', href: 'alerts.html', label: 'Alerts', icon: 'bell' },
    { id: 'analyst', href: 'analyst.html', label: 'AI analyst', icon: 'spark' },
  ];
  const NAV_SETUP = [
    { id: 'sources', href: 'sources.html', label: 'Data sources', icon: 'db' },
    { id: 'goals', href: 'goals.html', label: 'Goals', icon: 'target' },
    { id: 'settings', href: 'settings.html', label: 'Brand & settings', icon: 'gear' },
  ];
  const TABS = ['today', 'dashboards', 'alerts', 'analyst'];

  function carry(href) {
    const q = new URLSearchParams(location.search), keep = new URLSearchParams();
    if (q.get('t')) keep.set('t', q.get('t'));
    if (q.has('demo')) keep.set('demo', '');
    const extra = keep.toString().replace('demo=', 'demo');
    if (!extra) return href;
    return href + (href.includes('?') ? '&' : '?') + extra;
  }
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

  function brandBlock(profile) {
    const b = profile.brand, name = DB.tenant.displayName();
    if (b.logo) return h('a', { class: 'brand', href: carry('app.html'), 'aria-label': name + ' home' }, h('span', { class: 'logo-chip' }, h('img', { src: b.logo, alt: profile.company.name + ' logo' })));
    return h('a', { class: 'brand', href: carry('app.html'), 'aria-label': name + ' home' }, h('span', { class: 'monogram', 'aria-hidden': 'true' }, initials(profile.company.name)), h('span', { class: 'name' }, name));
  }

  function navLinks(items, page) {
    return items.map((n) => h('a', { href: carry(n.href), 'aria-current': n.id === page ? 'page' : null }, icon(n.icon), n.label));
  }

  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; const b = document.getElementById('install-btn'); if (b) b.hidden = false; });

  function statusBlock(t, model) {
    if (model.real) {
      const d = t.data || {};
      return h('div', { class: 'status live' }, h('b', { text: 'Your data' }), `${model.locations.length} ${model.locations.length === 1 ? 'location' : 'locations'}, up to ${DB.makeFormat(t.profile).day(model.latest)}.`, d.lastImport ? ` Last import: ${d.lastImport.filename}.` : '');
    }
    return h('div', { class: 'status' }, h('b', { text: 'Sample data' }), t.demo ? 'This is a demo workspace. Everything shown is generated.' : 'Nothing imported yet, so everything shown is generated from your profile. ', t.demo ? null : h('a', { href: carry('sources.html'), style: { textDecoration: 'underline' }, text: 'Import your sales' }));
  }
  function accountBlock(t) {
    const out = [];
    out.push(h('button', { class: 'btn btn-ghost btn-sm', id: 'install-btn', type: 'button', hidden: installEvent ? null : true, style: { margin: '10px 0 0', width: '100%' }, onclick: async () => { if (installEvent) { installEvent.prompt(); await installEvent.userChoice; installEvent = null; document.getElementById('install-btn').hidden = true; } }, text: 'Install as an app' }));
    if (t.demo) out.push(h('a', { class: 'btn btn-primary btn-sm', href: 'signup.html', style: { margin: '10px 0 0', width: '100%' }, text: 'Create your workspace' }));
    else out.push(h('div', { class: 'acct' }, h('span', { class: 'who', title: t.user && t.user.email, text: (t.user && t.user.email) || '' }), h('button', { class: 'linkish', type: 'button', onclick: () => t.signOut(), text: 'Sign out' })));
    return h('div', null, out);
  }

  async function start(pageId) {
    const root = document.getElementById('root');
    const t = DB.tenant;
    const status = await t.load();
    if (status !== 'ok') { location.replace((status === 'signup' ? 'signup.html' : 'login.html') + '?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)); return; }
    const page = DB.pages[pageId];
    const profile = t.profile;
    let model;
    const makeModel = () => (t.rows ? DB.data.buildReal(t.profile, t.rows) : DB.data.build(t.profile, t.id));
    try { if (t.data && !t.demo) t.rows = await t.loadRows(); } catch (e) { root.textContent = 'We could not load your data. Check your connection and reload.'; return; }
    model = makeModel();
    const ctx = { tenant: t, profile, model, f: DB.makeFormat(profile), page: pageId };
    DB.ctx = ctx;
    // re-run the whole page when branding, specs or data change
    ctx.refresh = () => { ctx.profile = t.profile; ctx.model = makeModel(); ctx.f = DB.makeFormat(t.profile); DB.clear(content); render(); updateHeader(); };

    document.title = (page.title || 'App') + ' — ' + DB.tenant.displayName();
    DB.clear(root); root.className = 'app';

    const side = h('aside', { class: 'side', id: 'side', 'aria-label': 'Main' },
      brandBlock(profile),
      h('nav', { 'aria-label': 'App' }, navLinks(NAV, pageId), h('div', { class: 'label' }, 'Setup'), navLinks(NAV_SETUP, pageId)),
      h('div', { class: 'spacer' }),
      statusBlock(t, model),
      profile.brand.showPoweredBy ? h('div', { class: 'powered' }, 'Powered by ', h('a', { href: '/' }, 'dashboards.business')) : null,
      accountBlock(t));
    const scrim = h('div', { class: 'scrim', onclick: () => side.classList.remove('open') });
    const menuBtn = h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Open menu', 'aria-controls': 'side', onclick: () => { side.classList.add('open'); side.querySelector('a').focus(); } }, icon('menu'));
    const title = h('h1', { text: '' }), sub = h('span', { class: 'sub' });
    const modeBtn = h('button', { class: 'icon-btn', onclick: () => { const order = ['auto', 'light', 'dark']; t.setMode(order[(order.indexOf(t.preferredMode()) + 1) % 3]); paintMode(); } });
    const paintMode = () => {
      const m = t.preferredMode();
      DB.clear(modeBtn).appendChild(icon(t.resolvedMode() === 'dark' ? 'moon' : 'sun'));
      modeBtn.setAttribute('aria-label', 'Colour mode: ' + m + '. Switch.'); modeBtn.title = 'Colour mode: ' + m;
    };
    const actions = h('span', { class: 'actions', style: { display: 'contents' } });
    const topbar = h('div', { class: 'topbar' }, menuBtn, title, sub, h('div', { class: 'right' }, actions, modeBtn, h('div', { class: 'avatar', title: profile.company.name, 'aria-hidden': 'true' }, initials(profile.company.name))));
    const content = h('div', { id: 'content' });
    const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'App' }, TABS.map((id) => { const n = NAV.find((x) => x.id === id); return h('a', { href: carry(n.href), 'aria-current': id === pageId ? 'page' : null }, icon(n.icon, 22), n.label.replace('AI analyst', 'Ask')); }));
    const main = h('main', { class: 'main', id: 'main' }, topbar, t.offline ? h('div', { class: 'banner', role: 'status' }, h('span', null, h('b', null, 'You are offline. '), 'Showing the last saved version of your workspace.')) : null,
      t.demo ? h('div', { class: 'banner' }, h('span', null, h('b', null, 'Demo workspace. '), 'This is not a customer account. ', h('a', { href: 'signup.html', style: { textDecoration: 'underline' } }, 'Create yours'), ' to see your own branding and locations here.')) : null, content, tabbar);
    DB.add(root, side, scrim, main);
    side.addEventListener('keydown', (e) => { if (e.key === 'Escape') side.classList.remove('open'); });
    paintMode();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});

    function updateHeader() {
      const c = DB.ctx;
      const hd = typeof page.header === 'function' ? page.header(c) : {};
      title.textContent = hd.title || page.title; sub.textContent = hd.sub || '';
      DB.clear(actions); if (hd.actions) actions.appendChild(hd.actions);
    }
    function render() { page.render(DB.ctx, content); }
    updateHeader(); render();
    window.addEventListener('db:themechange', paintMode);
  }

  DB.shell = { start, carry };
  // pages declare themselves with <body data-page="..."> so no inline script is needed (CSP forbids it)
  document.addEventListener('DOMContentLoaded', () => { const id = document.body.dataset.page; if (id && DB.pages[id]) start(id); });
})();
