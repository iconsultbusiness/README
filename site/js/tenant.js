/*
 * Loads the signed-in customer's workspace and applies their branding.
 *
 * Source of truth is the server (session cookie, GET /api/auth/me). The last profile is cached in
 * localStorage so the page paints in the right colours at once and the installed app opens offline;
 * that cache is cleared on sign-out. `?demo` opens a sample workspace that needs no account or server.
 */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  const LAST = 'db.profile.last';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
  const readJson = (k) => { try { return JSON.parse(get(k) || 'null'); } catch (e) { return null; } };
  const JSON_POST = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

  function demoProfile() {
    const p = DBProfile.defaultProfile();
    p.company.name = 'Demo Café Group';
    p.company.timezone = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    p.company.locale = navigator.language || 'en-US';
    p.locations = ['Downtown', 'Harbour', 'Station'];
    p.brand.appName = 'dashboards.business';
    return DBProfile.sanitizeProfile(p).profile;
  }

  DB.api = async function (method, path, body) {
    const r = await fetch(path, JSON_POST(method, body));
    let j = null; try { j = await r.json(); } catch (e) { /* no body */ }
    return { ok: r.ok, status: r.status, json: j, error: j && j.error };
  };

  const tenant = (DB.tenant = {
    id: null, profile: null, user: null, data: null, demo: false, offline: false, theme: null,

    /** Resolves to 'ok' | 'login' | 'signup'. */
    async load() {
      const q = new URLSearchParams(location.search);
      if (q.has('demo')) { tenant.demo = true; tenant.id = 'demo'; tenant.profile = demoProfile(); tenant.applyTheme(); return 'ok'; }
      const cached = readJson(LAST);
      if (cached) { tenant.profile = cached.profile; tenant.id = cached.id; tenant.applyTheme(); }
      let me;
      try {
        const r = await fetch('/api/auth/me', { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error('status ' + r.status);
        me = await r.json();
      } catch (e) {
        if (cached) { tenant.offline = true; tenant.user = cached.user || null; tenant.data = cached.data || null; return 'ok'; }
        return 'login';
      }
      if (!me.user) { tenant.clearLocal(); return 'login'; }
      tenant.user = me.user;
      if (!me.tenant) return 'signup';
      tenant.id = me.tenant.id; tenant.profile = me.tenant.profile; tenant.data = me.tenant.data;
      set(LAST, JSON.stringify({ id: tenant.id, profile: tenant.profile, user: tenant.user, data: tenant.data }));
      tenant.applyTheme();
      return 'ok';
    },

    /** Imported rows, newest data from the server, with the last copy kept for offline use. */
    async loadRows() {
      const key = 'db.rows.' + tenant.id;
      try {
        const r = await fetch('/api/data/rows');
        if (!r.ok) throw new Error('status ' + r.status);
        const j = await r.json();
        set(key, JSON.stringify(j.rows)); return j.rows;
      } catch (e) { const c = readJson(key); if (c) { tenant.offline = true; return c; } throw e; }
    },

    async save(profile) {
      const r = DBProfile.sanitizeProfile(profile, {});
      if (!r.ok) return { ok: false, errors: r.errors };
      if (tenant.demo) { tenant.profile = r.profile; tenant.applyTheme(); return { ok: true, local: true }; }
      const res = await DB.api('PUT', '/api/tenant', r.profile);
      if (!res.ok) return { ok: false, errors: (res.error && res.error.fields) || [{ field: '', message: (res.error && res.error.message) || 'Could not save.' }] };
      tenant.profile = res.json.profile; tenant.data = res.json.data;
      set(LAST, JSON.stringify({ id: tenant.id, profile: tenant.profile, user: tenant.user, data: tenant.data }));
      tenant.applyTheme();
      return { ok: true };
    },

    clearLocal() {
      try { Object.keys(localStorage).filter((k) => k.startsWith('db.')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* storage blocked */ }
    },
    async signOut() {
      try { await DB.api('POST', '/api/auth/logout', {}); } catch (e) { /* offline: still clear locally */ }
      tenant.clearLocal();
      location.assign('login.html');
    },

    preferredMode() {
      const stored = get('db.mode.' + tenant.id);
      return ['auto', 'light', 'dark'].includes(stored) ? stored : (tenant.profile && tenant.profile.brand.mode) || 'auto';
    },
    setMode(m) { set('db.mode.' + tenant.id, m); tenant.applyMode(); },
    resolvedMode() {
      const m = tenant.preferredMode();
      return m === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m;
    },
    applyMode() {
      document.documentElement.setAttribute('data-theme', tenant.resolvedMode());
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && tenant.theme) meta.setAttribute('content', tenant.theme[tenant.resolvedMode()].vars['--surface']);
      window.dispatchEvent(new Event('db:themechange'));
    },

    applyTheme() {
      const b = tenant.profile.brand;
      tenant.theme = DBTheme.buildTheme({ primary: b.primary, accent: b.accent, font: b.font, logoLum: b.logoLum });
      let style = document.getElementById('tenant-theme');
      if (!style) { style = document.createElement('style'); style.id = 'tenant-theme'; document.head.appendChild(style); }
      style.textContent = DBTheme.themeToCss(tenant.theme, ':root');
      const href = DBTheme.fontLinkHref(tenant.theme.font);
      let link = document.getElementById('tenant-font');
      if (href) {
        if (!link) { link = document.createElement('link'); link.id = 'tenant-font'; link.rel = 'stylesheet'; document.head.appendChild(link); }
        if (link.getAttribute('href') !== href) link.setAttribute('href', href);
      } else if (link) link.remove();
      const headLink = (rel, id) => { let l = document.getElementById(id); if (!l) { l = document.createElement('link'); l.id = id; l.rel = rel; document.head.appendChild(l); } return l; };
      if (b.logo) { const i = headLink('icon', 'tenant-icon'); i.setAttribute('href', b.logo); i.removeAttribute('type'); document.querySelectorAll('link[rel="icon"]:not(#tenant-icon)').forEach((x) => x.remove()); }
      // installable app: this customer's name, colours and icon, not ours
      if (tenant.id && tenant.id !== 'demo') {
        headLink('manifest', 'tenant-manifest').setAttribute('href', '/api/public/manifest/' + encodeURIComponent(tenant.id));
        if (b.icon192) headLink('apple-touch-icon', 'tenant-touch').setAttribute('href', '/api/public/icon/' + encodeURIComponent(tenant.id) + '/192.png');
      }
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
      tenant.applyMode();
    },
    displayName() { const b = tenant.profile.brand, c = tenant.profile.company; return b.appName || c.name; },
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (tenant.profile && tenant.preferredMode() === 'auto') tenant.applyMode(); });
})();
