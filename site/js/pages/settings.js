(function () {
  'use strict';
  const DB = window.DB, { h } = DB;
  DB.pages.settings = {
    title: 'Brand & settings',
    header() { return { title: 'Brand & settings', sub: 'Your name, logo, colours, locations and targets' }; },
    render(c, el) {
      const t = c.tenant;
      DB.clear(el);
      if (!t.demo && t.mode !== 'local' && !t.token) {
        el.appendChild(h('div', { class: 'banner' }, h('span', null, h('b', null, 'View only. '), 'This browser does not hold the edit key for this workspace, so changes cannot be saved. Open it from the browser you signed up with.')));
      }
      if (t.demo) el.appendChild(h('div', { class: 'banner' }, h('span', null, 'Changes to the demo workspace last for this tab only. ', h('a', { href: 'signup.html', style: { textDecoration: 'underline' }, text: 'Create your own workspace' }), ' to keep them.')));
      const host = h('div'); el.appendChild(host);
      DB.profileForm.mount(host, {
        mode: 'edit', profile: t.profile, submitLabel: 'Save changes',
        onSubmit: async (profile) => {
          const r = await t.save(profile);
          if (r.ok) { DB.toast('Saved. Applying your branding…'); setTimeout(() => location.reload(), 500); }
          return r;
        },
      });
    },
  };
})();
