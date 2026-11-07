/* Public sign-up page: collects the profile, creates the workspace, and drops the customer into their branded app. */
(function () {
  'use strict';
  const DB = window.DB, P = window.DBProfile, T = window.DBTheme;
  const PAGES = ['app.html', 'dashboards.html', 'alerts.html', 'analyst.html', 'sources.html', 'goals.html'];

  // This page wears the dashboards.business brand, not a tenant's.
  const style = document.createElement('style');
  style.textContent = T.themeToCss(T.buildTheme({ primary: T.DEFAULT_BRAND.primary, accent: T.DEFAULT_BRAND.accent, font: 'inter' }), ':root');
  document.head.appendChild(style);
  document.documentElement.setAttribute('data-theme', 'light');

  const q = new URLSearchParams(location.search);
  const next = PAGES.includes(q.get('next') && q.get('next').split('?')[0]) ? q.get('next').split('?')[0] : 'app.html';

  const initial = P.defaultProfile();
  try { initial.company.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; initial.company.locale = navigator.language || 'en-US'; } catch (e) { /* keep defaults */ }

  async function create(profile) {
    const body = JSON.stringify(profile);
    let res;
    try { res = await fetch('/api/tenants', { method: 'POST', headers: { 'content-type': 'application/json' }, body }); } catch (e) { res = null; }
    if (res && res.status === 201) {
      const j = await res.json();
      DB.tenant.saveSession({ id: j.id, token: j.token });
      try { localStorage.setItem('db.profile.' + j.id, JSON.stringify(j.profile)); } catch (e) { /* storage blocked */ }
      location.assign(next + '?t=' + encodeURIComponent(j.id));
      return { ok: true };
    }
    if (res && res.status !== 404 && res.status !== 405) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, errors: (j.error && j.error.fields) || [{ field: '', message: (j.error && j.error.message) || 'We could not create your workspace.' }] };
    }
    // No API here (static preview): keep the workspace in this browser so the flow still works.
    const id = 'local-' + Math.random().toString(36).slice(2, 12);
    DB.tenant.saveSession({ id, token: null });
    try { localStorage.setItem('db.profile.' + id, JSON.stringify(profile)); } catch (e) { return { ok: false, errors: [{ field: '', message: 'This browser blocks storage, so a local workspace cannot be saved.' }] }; }
    location.assign(next + '?t=' + encodeURIComponent(id));
    return { ok: true };
  }

  document.addEventListener('DOMContentLoaded', () => {
    DB.profileForm.mount(document.getElementById('form-host'), { mode: 'create', profile: initial, onSubmit: create });
  });
})();
