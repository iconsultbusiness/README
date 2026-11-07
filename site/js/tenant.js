/*
 * Loads the signed-in customer's profile and applies their branding.
 *
 * Source of truth is the server (GET /api/tenants/:id). A cached copy in
 * localStorage lets the page paint in the right colours immediately and keeps the
 * preview working on a static host with no API ("local" workspaces).
 * There are no accounts yet: the workspace id selects the tenant and the edit key
 * from sign-up (kept in this browser) authorises changes.
 */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  const SESSION = 'db.session';
  const cacheKey = (id) => 'db.profile.' + id;
  const modeKey = (id) => 'db.mode.' + id;
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
  const del = (k) => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } };
  const readJson = (k) => { try { return JSON.parse(get(k) || 'null'); } catch (e) { return null; } };

  function demoProfile() {
    const p = DBProfile.defaultProfile();
    p.company.name = 'Demo Café Group';
    p.company.timezone = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    p.company.locale = navigator.language || 'en-US';
    p.locations = ['Downtown', 'Harbour', 'Station'];
    p.brand.appName = 'dashboards.business';
    return DBProfile.sanitizeProfile(p).profile;
  }

  const tenant = (DB.tenant = {
    id: null, token: null, profile: null, demo: false, mode: 'api', theme: null,
    session: () => readJson(SESSION),
    saveSession(s) { set(SESSION, JSON.stringify(s)); },
    signOut() { del(SESSION); },

    /** Paint with the cached profile straight away, then refresh from the server. */
    async load() {
      const q = new URLSearchParams(location.search);
      const sess = readJson(SESSION) || {};
      const demo = q.has('demo');
      const id = demo ? 'demo' : q.get('t') || sess.id || null;
      if (!id) return null;
      tenant.id = id; tenant.demo = demo;
      tenant.token = q.get('t') && q.get('t') !== sess.id ? null : sess.token || null;
      if (demo) { tenant.profile = demoProfile(); tenant.applyTheme(); return tenant; }
      const cached = readJson(cacheKey(id));
      if (cached) { tenant.profile = cached; tenant.applyTheme(); }
      if (/^local-/.test(id)) { tenant.mode = 'local'; return cached ? tenant : null; }
      try {
        const r = await fetch('/api/tenants/' + encodeURIComponent(id), { headers: { accept: 'application/json' } });
        if (r.status === 404) { if (!q.get('t')) tenant.signOut(); return null; }
        if (!r.ok) throw new Error('status ' + r.status);
        const j = await r.json();
        tenant.profile = j.profile; set(cacheKey(id), JSON.stringify(j.profile));
        tenant.applyTheme();
      } catch (e) {
        if (!cached) return null;
        tenant.offline = true;
      }
      return tenant;
    },

    /** Save changes. Uses the edit key when there is a server, localStorage otherwise. */
    async save(profile) {
      const r = DBProfile.sanitizeProfile(profile, {});
      if (!r.ok) return { ok: false, errors: r.errors };
      if (tenant.demo || tenant.mode === 'local') {
        if (tenant.demo) { tenant.profile = r.profile; tenant.applyTheme(); return { ok: true, local: true }; }
        tenant.profile = r.profile; set(cacheKey(tenant.id), JSON.stringify(r.profile)); tenant.applyTheme();
        return { ok: true, local: true };
      }
      if (!tenant.token) return { ok: false, errors: [{ field: '', message: 'This browser does not hold the edit key for this workspace.' }] };
      const res = await fetch('/api/tenants/' + encodeURIComponent(tenant.id), {
        method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tenant.token }, body: JSON.stringify(r.profile),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, errors: (j.error && j.error.fields) || [{ field: '', message: (j.error && j.error.message) || 'Could not save.' }] };
      tenant.profile = j.profile; set(cacheKey(tenant.id), JSON.stringify(j.profile)); tenant.applyTheme();
      return { ok: true };
    },

    preferredMode() {
      const stored = get(modeKey(tenant.id));
      return ['auto', 'light', 'dark'].includes(stored) ? stored : (tenant.profile && tenant.profile.brand.mode) || 'auto';
    },
    setMode(m) { set(modeKey(tenant.id), m); tenant.applyMode(); },
    resolvedMode() {
      const m = tenant.preferredMode();
      return m === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m;
    },
    applyMode() {
      document.documentElement.setAttribute('data-theme', tenant.resolvedMode());
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
      let icon = document.querySelector('link[rel="icon"]');
      if (b.logo) { if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); } icon.setAttribute('href', b.logo); icon.removeAttribute('type'); }
      tenant.applyMode();
    },
    displayName() { const b = tenant.profile.brand, c = tenant.profile.company; return b.appName || c.name; },
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (tenant.profile && tenant.preferredMode() === 'auto') tenant.applyMode(); });
})();
