/* Public sign-up page: account, then workspace, then the one-time recovery code, then the branded app. */
(function () {
  'use strict';
  const DB = window.DB, P = window.DBProfile, T = window.DBTheme;

  // This page wears the dashboards.business brand, not a tenant's.
  const style = document.createElement('style');
  style.textContent = T.themeToCss(T.buildTheme({ primary: T.DEFAULT_BRAND.primary, accent: T.DEFAULT_BRAND.accent, font: 'inter' }), ':root');
  document.head.appendChild(style);
  document.documentElement.setAttribute('data-theme', 'light');

  const next = DB.safeNext(new URLSearchParams(location.search).get('next'));
  const initial = P.defaultProfile();
  try { initial.company.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; initial.company.locale = navigator.language || 'en-US'; } catch (e) { /* keep defaults */ }

  let recoveryCode = null; // held in memory only until the person has saved it

  async function create(profile, account) {
    if (account) {
      const a = await DB.api('POST', '/api/auth/signup', account);
      if (!a.ok) {
        const e = a.error || {};
        const msg = e.code === 'email_taken' ? 'An account with that email already exists. Log in instead.' : e.message || 'We could not create your account.';
        return { ok: false, errors: [{ field: e.field || '', message: msg }] };
      }
      recoveryCode = a.json.recoveryCode;
    }
    const t = await DB.api('POST', '/api/tenant', profile);
    if (!t.ok) {
      if (t.status === 401) return { ok: false, errors: [{ field: '', message: 'Your session ended. Please log in and try again.' }] };
      if (t.status === 409) { location.assign(next); return { ok: true }; }
      return { ok: false, errors: (t.error && t.error.fields) || [{ field: '', message: (t.error && t.error.message) || 'We could not create your workspace.' }] };
    }
    const go = () => location.assign(next);
    if (recoveryCode) DB.showRecoveryCode(recoveryCode, go); else go();
    return { ok: true };
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const me = await fetch('/api/auth/me').then((r) => r.json()).catch(() => ({ user: null }));
    if (me.user && me.tenant) { location.replace(next); return; }
    DB.profileForm.mount(document.getElementById('form-host'), { mode: 'create', profile: initial, onSubmit: create, needsAccount: !me.user, signedInAs: me.user && me.user.email });
  });
})();
