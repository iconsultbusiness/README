/* Log in, and reset a forgotten password with the recovery code from sign-up. */
(function () {
  'use strict';
  const DB = window.DB, { h } = DB, T = window.DBTheme;
  const style = document.createElement('style');
  style.textContent = T.themeToCss(T.buildTheme({ primary: T.DEFAULT_BRAND.primary, accent: T.DEFAULT_BRAND.accent, font: 'inter' }), ':root');
  document.head.appendChild(style);
  document.documentElement.setAttribute('data-theme', 'light');

  const next = DB.safeNext(new URLSearchParams(location.search).get('next'));
  const withPw = (input) => { const b = h('button', { type: 'button', 'aria-label': 'Show password', text: 'Show', onclick: () => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; } }); return h('div', { class: 'pw-wrap' }, input, b); };
  const field = (label, control, id) => h('div', { class: 'field' }, h('label', { for: id, text: label }), control);
  const host = document.getElementById('auth-host');

  async function goAfterLogin() {
    const me = await fetch('/api/auth/me').then((r) => r.json()).catch(() => null);
    location.assign(me && me.user && !me.tenant ? 'signup.html' : next);
  }

  function loginView() {
    const email = h('input', { id: 'l-email', type: 'email', autocomplete: 'username', inputmode: 'email', required: true });
    const pw = h('input', { id: 'l-pw', type: 'password', autocomplete: 'current-password', required: true, maxlength: 200 });
    const err = h('div', { class: 'hint bad', role: 'alert' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit', style: { width: '100%' }, text: 'Log in' });
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; err.textContent = '';
      const r = await DB.api('POST', '/api/auth/login', { email: email.value, password: pw.value });
      btn.disabled = false;
      if (!r.ok) { err.textContent = (r.error && r.error.message) || 'Could not log in.'; pw.value = ''; pw.focus(); return; }
      goAfterLogin();
    } }, field('Email', email, 'l-email'), field('Password', withPw(pw), 'l-pw'), err, btn);
    DB.clear(host).appendChild(h('div', { class: 'auth-card' }, h('h1', { text: 'Log in' }), h('p', { class: 'sub', text: 'Welcome back. Your numbers are waiting.' }), form,
      h('div', { class: 'alt' }, h('button', { type: 'button', onclick: recoverView, text: 'Forgot your password?' }), h('a', { href: 'signup.html', text: 'Create a workspace' }))));
    email.focus();
  }

  function recoverView() {
    const email = h('input', { id: 'r-email', type: 'email', autocomplete: 'username', required: true });
    const code = h('input', { id: 'r-code', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX', required: true, maxlength: 40 });
    const pw = h('input', { id: 'r-pw', type: 'password', autocomplete: 'new-password', required: true, maxlength: 200 });
    const err = h('div', { class: 'hint bad', role: 'alert' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit', style: { width: '100%' }, text: 'Reset password' });
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; err.textContent = '';
      const r = await DB.api('POST', '/api/auth/recover', { email: email.value, recoveryCode: code.value, newPassword: pw.value });
      btn.disabled = false;
      if (!r.ok) { err.textContent = (r.error && r.error.message) || 'Could not reset the password.'; return; }
      DB.showRecoveryCode(r.json.recoveryCode, goAfterLogin);
    } }, field('Email', email, 'r-email'), field('Recovery code from sign-up', code, 'r-code'), field('New password (10 characters or more)', withPw(pw), 'r-pw'), err, btn);
    DB.clear(host).appendChild(h('div', { class: 'auth-card' }, h('h1', { text: 'Reset your password' }), h('p', { class: 'sub', text: 'Enter the recovery code you saved when you signed up. It works once, and you will get a new one.' }), form,
      h('div', { class: 'alt' }, h('button', { type: 'button', onclick: loginView, text: 'Back to log in' }))));
    email.focus();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const me = await fetch('/api/auth/me').then((r) => r.json()).catch(() => null);
    if (me && me.user) { location.replace(me.tenant ? next : 'signup.html'); return; }
    loginView();
  });
})();
