/* Account UI shared by sign-up, login and settings: recovery-code dialog and the account panel. */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  const { h } = DB;
  const PAGES = ['app.html', 'dashboards.html', 'alerts.html', 'analyst.html', 'sources.html', 'goals.html', 'settings.html'];

  /** Only ever send people to one of our own app pages. */
  DB.safeNext = function (raw, fallback) {
    const base = String(raw || '').split(/[?#]/)[0].replace(/^\//, '');
    return PAGES.includes(base) ? base : fallback || 'app.html';
  };

  /**
   * There is no email yet, so this code is the only way back in after a forgotten password.
   * The dialog cannot be dismissed until the person says they have saved it.
   */
  DB.showRecoveryCode = function (code, onDone) {
    const saved = h('input', { type: 'checkbox', id: 'rc-saved' });
    const go = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, text: 'Continue', onclick: () => { dlg.close(); dlg.remove(); if (onDone) onDone(); } });
    saved.addEventListener('change', () => { go.disabled = !saved.checked; });
    const copy = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Copy', onclick: async () => { try { await navigator.clipboard.writeText(code); copy.textContent = 'Copied'; } catch (e) { copy.textContent = 'Select the code and copy it'; } } });
    const dl = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Download', onclick: () => {
      const url = URL.createObjectURL(new Blob([`dashboards.business recovery code\n\n${code}\n\nKeep this somewhere safe. It lets you reset your password if you forget it, and works once.\n`], { type: 'text/plain' }));
      const a = h('a', { href: url, download: 'recovery-code.txt' }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } });
    const dlg = h('dialog', { 'aria-labelledby': 'rc-title' },
      h('h2', { id: 'rc-title', text: 'Save your recovery code' }),
      h('p', { class: 'muted', style: { fontSize: '14px', marginBottom: '12px' }, text: 'We cannot email you yet, so if you forget your password this code is the only way back into your account. It is shown once and works once.' }),
      h('div', { class: 'rc-code', 'aria-label': 'Recovery code', text: code }),
      h('div', { style: { display: 'flex', gap: '8px', margin: '12px 0' } }, copy, dl),
      h('label', { class: 'check', for: 'rc-saved' }, saved, h('span', { text: 'I have saved it somewhere safe' })),
      h('div', { class: 'actions' }, go));
    dlg.addEventListener('cancel', (e) => e.preventDefault());
    document.body.appendChild(dlg); dlg.showModal();
  };

  const fieldRow = (label, input, id) => h('div', { class: 'field' }, h('label', { for: id, text: label }), input);
  const pwInput = (id, auto) => h('input', { id, type: 'password', autocomplete: auto, maxlength: 200 });

  DB.accountPanel = function (tenant) {
    const msg = (el) => (text, bad) => { el.className = 'hint' + (bad ? ' bad' : ' good'); el.textContent = text; };
    // change password
    const cur = pwInput('ac-cur', 'current-password'), next = pwInput('ac-new', 'new-password'), m1 = h('div', { role: 'status' });
    const changeForm = h('form', { onsubmit: async (e) => {
      e.preventDefault(); const say = msg(m1);
      const r = await DB.api('POST', '/api/auth/password', { current: cur.value, next: next.value });
      if (!r.ok) return say((r.error && r.error.message) || 'Could not change the password.', true);
      cur.value = next.value = ''; say('Password changed. Other devices have been signed out.');
    } }, h('h3', { text: 'Change password' }), fieldRow('Current password', cur, 'ac-cur'), fieldRow('New password (10 characters or more)', next, 'ac-new'), h('button', { class: 'btn btn-ghost', type: 'submit', text: 'Change password' }), m1);
    // new recovery code
    const rp = pwInput('ac-rp', 'current-password'), m2 = h('div', { role: 'status' });
    const recForm = h('form', { onsubmit: async (e) => {
      e.preventDefault(); const say = msg(m2);
      const r = await DB.api('POST', '/api/auth/recovery-code', { password: rp.value });
      if (!r.ok) return say((r.error && r.error.message) || 'Could not make a new code.', true);
      rp.value = ''; say(''); DB.showRecoveryCode(r.json.recoveryCode);
    } }, h('h3', { text: 'New recovery code' }), h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: '8px' }, text: 'Replaces the old one, which stops working.' }), fieldRow('Your password', rp, 'ac-rp'), h('button', { class: 'btn btn-ghost', type: 'submit', text: 'Make a new code' }), m2);
    // delete account
    const dp = pwInput('ac-dp', 'current-password'), m3 = h('div', { role: 'alert' });
    const del = h('dialog', { 'aria-label': 'Delete account' }, h('h2', { text: 'Delete your account?' }),
      h('p', { class: 'muted', style: { fontSize: '14px', marginBottom: '12px' }, text: 'This permanently deletes your login, workspace, branding and every imported row. We cannot restore it. Export your data first if you want a copy.' }),
      fieldRow('Your password', dp, 'ac-dp'), m3,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => del.close(), text: 'Cancel' }),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Delete everything', onclick: async () => { const r = await DB.api('DELETE', '/api/account', { password: dp.value }); if (!r.ok) { m3.className = 'hint bad'; m3.textContent = (r.error && r.error.message) || 'Could not delete.'; return; } tenant.clearLocal(); location.assign('index.html'); } })));
    return h('div', { class: 'panel', style: { marginTop: '16px' } },
      h('header', null, h('h2', { text: 'Account' }), h('span', { class: 'meta', text: tenant.user ? tenant.user.email : '' })),
      h('div', { class: 'two-col', style: { gap: '24px 28px' } }, changeForm, recForm),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '18px 0 0', paddingTop: '16px', borderTop: '1px solid var(--border)' } },
        tenant.data ? h('a', { class: 'btn btn-ghost btn-sm', href: '/api/data/export.csv', download: 'sales-export.csv', text: 'Export my data' }) : null,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => tenant.signOut(), text: 'Sign out' }),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => del.showModal(), text: 'Delete my account' })),
      h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '12px' }, text: 'To install on a phone: in Chrome use the menu and choose Install app. On iPhone, open this site in Safari, tap Share, then Add to Home Screen.' }), del);
  };
})();
