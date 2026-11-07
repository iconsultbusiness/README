/*
 * Business + brand profile form with live, scoped preview.
 * Used by the public sign-up page (create) and by Brand & settings inside the app (edit).
 */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  const { h, icon } = DB, P = window.DBProfile, T = window.DBTheme;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const hexOk = (v) => T.util.normHex(v);

  function timezones() {
    try { if (Intl.supportedValuesOf) return Intl.supportedValuesOf('timeZone'); } catch (e) { /* older browser */ }
    return ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
  }

  DB.profileForm = {
    mount(host, opts) {
      const mode = opts.mode, st = clone(opts.profile);
      const touched = { primary: mode === 'edit', targets: mode === 'edit' };
      let previewMode = 'light';

      /* ---------- helpers ---------- */
      const field = (label, control, hint, id) => h('div', { class: 'field' }, h('label', { for: id, text: label }), control, hint ? h('div', { class: 'hint', text: hint }) : null, h('div', { class: 'err', id: id + '-err', role: 'alert' }));
      const sel = (id, options, value, onchange) => h('select', { id, onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, text: l, selected: v === value ? true : null })));
      const seg = (name, options, value, onpick) => {
        const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': name });
        const paint = (v) => options.forEach(([val], i) => wrap.children[i].setAttribute('aria-pressed', String(val === v)));
        options.forEach(([val, label]) => wrap.appendChild(h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { paint(val); onpick(val); }, text: label })));
        paint(value); return wrap;
      };

      /* ---------- business ---------- */
      const nameIn = h('input', { id: 'f-name', type: 'text', maxlength: 60, autocomplete: 'organization', value: st.company.name, placeholder: 'e.g. Acme Roasters', oninput: (e) => { st.company.name = e.target.value; refresh(); } });
      const siteIn = h('input', { id: 'f-site', type: 'text', inputmode: 'url', autocomplete: 'url', value: st.company.website, placeholder: 'yourbusiness.com', oninput: (e) => { st.company.website = e.target.value; pullBtn.disabled = !e.target.value.trim(); } });
      const pullBtn = h('button', { class: 'btn btn-ghost', type: 'button', disabled: st.company.website ? null : true, onclick: () => pull(), text: 'Pull my branding' });
      const foundHost = h('div', { 'aria-live': 'polite' });

      const industry = sel('f-ind', Object.entries(P.INDUSTRIES).map(([k, v]) => [k, v.label]), st.company.industry, (v) => {
        st.company.industry = v;
        if (!touched.targets) { st.targets.efficiency = P.INDUSTRIES[v].efficiencyDefault; st.targets.dailyRevenue = P.INDUSTRIES[v].dailyRevenueDefault; effIn.value = st.targets.efficiency; revIn.value = st.targets.dailyRevenue; }
        paintTargetLabels();
      });
      const currency = sel('f-cur', P.CURRENCIES.map((c) => [c, c]), st.company.currency, (v) => { st.company.currency = v; });
      const tzSelect = sel('f-tz', timezones().map((z) => [z, z.replace(/_/g, ' ')]), st.company.timezone, (v) => { st.company.timezone = v; });
      if (![...tzSelect.options].some((o) => o.value === st.company.timezone)) tzSelect.insertBefore(h('option', { value: st.company.timezone, text: st.company.timezone, selected: true }), tzSelect.firstChild);
      const week = seg('Week starts on', [['mon', 'Monday'], ['sun', 'Sunday']], st.company.weekStart, (v) => { st.company.weekStart = v; });

      const locIn = h('input', { id: 'f-loc', type: 'text', maxlength: 40, placeholder: 'e.g. Downtown', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addLoc(); } } });
      const locList = h('ul', { class: 'chip-list', 'aria-label': 'Your locations' });
      const addLoc = () => {
        const v = P.cleanText(locIn.value, 40); if (!v) return;
        if (st.locations.length >= P.LIMITS.locations) { DB.toast(`Up to ${P.LIMITS.locations} locations`); return; }
        if (!st.locations.some((l) => l.toLowerCase() === v.toLowerCase())) st.locations.push(v);
        locIn.value = ''; paintLocs(); locIn.focus();
      };
      const paintLocs = () => {
        DB.clear(locList);
        st.locations.forEach((l, i) => locList.appendChild(h('li', null, l, h('button', { type: 'button', 'aria-label': 'Remove ' + l, onclick: () => { st.locations.splice(i, 1); paintLocs(); } }, icon('close', 12)))));
      };

      const effIn = h('input', { id: 'f-eff', type: 'number', min: 1, max: 100, step: 'any', inputmode: 'decimal', value: st.targets.efficiency, oninput: (e) => { touched.targets = true; st.targets.efficiency = e.target.value; } });
      const revIn = h('input', { id: 'f-rev', type: 'number', min: 1, step: 'any', inputmode: 'decimal', value: st.targets.dailyRevenue, oninput: (e) => { touched.targets = true; st.targets.dailyRevenue = e.target.value; } });
      const effLabel = h('label', { for: 'f-eff' }), effHint = h('div', { class: 'hint' });
      const paintTargetLabels = () => {
        const ind = P.INDUSTRIES[st.company.industry];
        effLabel.textContent = ind.efficiency + ' target (%)';
        effHint.textContent = ind.efficiencyDir === 'lower' ? 'Alerts fire when it goes above this.' : 'Alerts fire when it drops below this.';
      };

      /* ---------- brand ---------- */
      const primaryColor = h('input', { type: 'color', id: 'f-pc', 'aria-label': 'Brand colour', value: st.brand.primary.toLowerCase(), oninput: (e) => setPrimary(e.target.value, true) });
      const primaryHex = h('input', { type: 'text', id: 'f-ph', 'aria-label': 'Brand colour hex', maxlength: 7, value: st.brand.primary, oninput: (e) => { const v = hexOk(e.target.value); e.target.setAttribute('aria-invalid', String(!v)); if (v) setPrimary(v, true, true); } });
      const accentOn = h('input', { type: 'checkbox', id: 'f-ao', checked: st.brand.accent ? true : null, onchange: (e) => { if (e.target.checked) { st.brand.accent = st.brand.accent || T.DEFAULT_BRAND.accent; } else st.brand.accent = null; paintAccent(); refresh(); } });
      const accentColor = h('input', { type: 'color', id: 'f-ac', 'aria-label': 'Button colour', value: (st.brand.accent || T.DEFAULT_BRAND.accent).toLowerCase(), oninput: (e) => { st.brand.accent = hexOk(e.target.value); accentHex.value = st.brand.accent; refresh(); } });
      const accentHex = h('input', { type: 'text', id: 'f-ah', 'aria-label': 'Button colour hex', maxlength: 7, value: st.brand.accent || '', oninput: (e) => { const v = hexOk(e.target.value); e.target.setAttribute('aria-invalid', String(!v)); if (v) { st.brand.accent = v; accentColor.value = v.toLowerCase(); refresh(); } } });
      const accentRow = h('div', { class: 'color-row', style: { marginTop: '8px' } }, accentColor, accentHex);
      const paintAccent = () => { accentRow.style.display = st.brand.accent ? 'flex' : 'none'; };
      const swatchHost = h('div', { class: 'swatches', 'aria-label': 'Suggested colours' });
      let suggested = [];
      const paintSwatches = () => {
        DB.clear(swatchHost);
        suggested.forEach((s) => swatchHost.appendChild(h('button', { class: 'swatch', type: 'button', 'aria-pressed': String(s.hex === st.brand.primary), title: s.source, onclick: () => setPrimary(s.hex, true) }, h('i', { style: { background: s.hex } }), s.hex + (s.label ? ' · ' + s.label : ''))));
      };
      function setPrimary(hex, byUser, fromHex) {
        hex = hexOk(hex); if (!hex) return;
        if (byUser) touched.primary = true;
        st.brand.primary = hex; primaryColor.value = hex.toLowerCase(); if (!fromHex) primaryHex.value = hex; primaryHex.removeAttribute('aria-invalid');
        paintSwatches(); refresh();
      }

      const fontSel = sel('f-font', Object.entries(T.FONTS).map(([k, v]) => [k, v.label]), st.brand.font, (v) => { st.brand.font = v; refresh(); });
      const modeSeg = seg('Default colour mode', [['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']], st.brand.mode, (v) => { st.brand.mode = v; previewMode = v === 'dark' ? 'dark' : 'light'; refresh(); });
      const appNameIn = h('input', { id: 'f-app', type: 'text', maxlength: 40, value: st.brand.appName, placeholder: 'Defaults to your business name', oninput: (e) => { st.brand.appName = e.target.value; refresh(); } });
      const poweredIn = h('input', { type: 'checkbox', id: 'f-pw', checked: st.brand.showPoweredBy ? true : null, onchange: (e) => { st.brand.showPoweredBy = e.target.checked; refresh(); } });

      /* logo */
      const logoFrame = h('div', { class: 'logo-frame' });
      const logoMsg = h('div', { class: 'hint', role: 'status' });
      const fileIn = h('input', { type: 'file', id: 'f-logo', accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif', class: 'sr-only', onchange: (e) => { const f = e.target.files[0]; if (f) fromFile(f); e.target.value = ''; } });
      const removeLogo = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { st.brand.logo = null; st.brand.logoLum = null; paintLogo(); refresh(); }, text: 'Remove' });
      const paintLogo = () => {
        DB.clear(logoFrame);
        logoFrame.appendChild(st.brand.logo ? h('img', { src: st.brand.logo, alt: 'Your logo' }) : h('span', { text: 'No logo yet' }));
        removeLogo.style.display = st.brand.logo ? '' : 'none';
      };
      async function useLogo(src) {
        logoMsg.className = 'hint'; logoMsg.textContent = 'Reading logo…';
        try {
          const img = await DB.img.loadImage(src);
          const out = DB.img.encode(img), a = DB.img.analyse(out.canvas);
          st.brand.logo = out.url; st.brand.logoLum = a.lum;
          if (a.dominant) { suggested = suggested.filter((s) => s.label !== 'from logo'); if (!suggested.some((s) => T.util.deltaE(s.hex, a.dominant) < 4)) suggested.unshift({ hex: a.dominant, source: 'Most prominent colour in your logo', label: 'from logo' }); if (!touched.primary) setPrimary(a.dominant, false); else paintSwatches(); }
          logoMsg.textContent = a.dominant ? 'Logo added. We read its main colour as a suggestion.' : 'Logo added. It has no strong colour, so pick a brand colour yourself.';
          paintLogo(); refresh();
        } catch (e) { logoMsg.className = 'hint err'; logoMsg.textContent = e.message || 'Could not use that logo.'; }
      }
      function fromFile(f) {
        if (!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(f.type)) { logoMsg.className = 'hint err'; logoMsg.textContent = 'Use a PNG, JPEG, WebP, GIF or SVG file.'; return; }
        if (f.size > 3 * 1024 * 1024) { logoMsg.className = 'hint err'; logoMsg.textContent = 'That file is over 3 MB.'; return; }
        const r = new FileReader(); r.onload = () => useLogo(r.result); r.onerror = () => { logoMsg.textContent = 'Could not read that file.'; }; r.readAsDataURL(f);
      }

      /* website lookup */
      async function pull() {
        const url = siteIn.value.trim(); if (!url) return;
        pullBtn.disabled = true; pullBtn.textContent = 'Looking…'; DB.clear(foundHost);
        const fail = (m) => foundHost.appendChild(h('div', { class: 'found' }, h('div', { class: 'hint err', role: 'alert', text: m })));
        try {
          const r = await fetch('/api/brand/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
          const j = await r.json().catch(() => null);
          if (!r.ok) { fail((j && j.error && j.error.message) || 'We could not look that site up. You can still upload a logo and pick colours below.'); return; }
          showFound(j);
        } catch (e) { fail('Brand lookup needs the dashboards.business server. Upload your logo and pick colours below instead.'); }
        finally { pullBtn.disabled = !siteIn.value.trim(); pullBtn.textContent = 'Pull my branding'; }
      }
      function showFound(j) {
        const host = new URL(j.url).hostname.replace(/^www\./, '');
        const box = h('div', { class: 'found' }, h('h3', { text: 'Found on ' + host }));
        if (j.name && !st.company.name.trim()) { st.company.name = j.name; nameIn.value = j.name; }
        else if (j.name && j.name !== st.company.name) box.appendChild(h('div', { style: { marginBottom: '8px' } }, 'Business name on the site: ', h('b', { text: j.name }), ' ', h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { st.company.name = j.name; nameIn.value = j.name; refresh(); }, text: 'Use it' })));
        const cols = j.colors.filter((c) => !c.neutral);
        const fromLogo = suggested.filter((s) => s.label === 'from logo' && !cols.some((c) => T.util.deltaE(c.hex, s.hex) < 4));
        suggested = fromLogo.concat(cols.map((c) => ({ hex: c.hex, source: c.source })));
        if (cols.length && !touched.primary) setPrimary(cols[0].hex, false); else paintSwatches();
        box.appendChild(h('div', { class: 'hint', text: cols.length ? `${cols.length} brand ${cols.length === 1 ? 'colour' : 'colours'} added to the suggestions below. Check they look right.` : 'The site does not publish a brand colour.' }));
        if (j.logos.length) {
          const pressed = (b) => { box.querySelectorAll('.logos button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); };
          box.appendChild(h('div', { class: 'hint', style: { margin: '10px 0 6px' }, text: 'Pick the logo to use:' }));
          box.appendChild(h('div', { class: 'logos' }, j.logos.map((l) => { const b = h('button', { type: 'button', 'aria-pressed': 'false', title: l.source, onclick: () => { pressed(b); useLogo(l.proxy); } }, h('img', { src: l.proxy, alt: l.source, loading: 'lazy' })); return b; })));
        }
        (j.notes || []).forEach((n) => box.appendChild(h('div', { class: 'hint', text: n })));
        DB.clear(foundHost); foundHost.appendChild(box);
      }

      /* ---------- live preview ---------- */
      const pvStyle = h('style'), pvFont = h('link', { rel: 'stylesheet' });
      document.head.appendChild(pvStyle);
      const pv = h('div', { class: 'preview', 'data-theme': previewMode });
      const notesHost = h('ul', { class: 'notes' });
      const pvToggle = h('div', { class: 'seg', role: 'group', 'aria-label': 'Preview mode' });
      ['light', 'dark'].forEach((m) => pvToggle.appendChild(h('button', { type: 'button', 'aria-pressed': String(m === previewMode), onclick: () => { previewMode = m; refresh(); }, text: m === 'light' ? 'Light' : 'Dark' })));

      function chartSvg() {
        const mk = (vals) => vals.map((v, i) => (i ? 'L' : 'M') + (8 + i * 40) + ' ' + (92 - v)).join('');
        const svg = DB.s('svg', { viewBox: '0 0 300 100', width: '100%', role: 'img', 'aria-label': 'Preview of the four chart colours' });
        [[[10, 18, 30, 34, 48, 58, 66, 74], 1], [[8, 14, 12, 26, 30, 36, 44, 46], 2], [[4, 8, 16, 14, 22, 24, 30, 34], 3], [[2, 4, 6, 10, 8, 14, 16, 20], 4]].forEach(([v, n]) => svg.appendChild(DB.s('path', { d: mk(v), fill: 'none', style: { stroke: `var(--chart-${n})` }, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
        return svg;
      }
      function brandBlock() {
        const name = st.brand.appName.trim() || st.company.name.trim() || 'Your business';
        if (st.brand.logo) return h('div', { class: 'pv-brand' }, h('span', { class: 'logo-chip' }, h('img', { src: st.brand.logo, alt: '' })));
        return h('div', { class: 'pv-brand' }, h('span', { class: 'monogram', 'aria-hidden': 'true', text: name.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('') }), h('span', { class: 'nm', text: name }));
      }
      let raf = 0;
      function refresh() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paintPreview); }
      function paintPreview() {
        const theme = T.buildTheme({ primary: st.brand.primary, accent: st.brand.accent, font: st.brand.font, logoLum: st.brand.logoLum });
        pvStyle.textContent = T.themeToCss(theme, '.preview');
        const href = T.fontLinkHref(theme.font);
        if (href) { if (pvFont.getAttribute('href') !== href) pvFont.setAttribute('href', href); if (!pvFont.isConnected) document.head.appendChild(pvFont); } else pvFont.remove();
        pv.setAttribute('data-theme', previewMode);
        [...pvToggle.children].forEach((b, i) => b.setAttribute('aria-pressed', String(['light', 'dark'][i] === previewMode)));
        const f = DB.makeFormat(Object.assign(clone(st), { company: Object.assign(clone(st.company), { locale: st.company.locale || 'en-US' }) }));
        const ind = P.INDUSTRIES[st.company.industry];
        DB.clear(pv);
        pv.append(
          h('div', { class: 'pv-head' }, h('span', { text: 'Live preview' }), h('span', { text: (st.brand.appName.trim() || st.company.name.trim() || 'Your business') })),
          h('div', { class: 'pv-body' },
            h('div', { class: 'pv-side' }, brandBlock(), h('div', { class: 'pv-nav on', text: 'Today' }), h('div', { class: 'pv-nav', text: 'Dashboards' }), h('div', { class: 'pv-nav', text: 'Alerts' }), h('div', { class: 'pv-nav', text: 'Goals' })),
            h('div', { class: 'pv-main' },
              h('div', { class: 'pv-top' }, h('b', { text: 'Today' }), h('button', { class: 'btn btn-primary', type: 'button', tabindex: -1, text: 'Primary' }), h('button', { class: 'btn btn-cta', type: 'button', tabindex: -1, text: 'Action' })),
              h('div', { class: 'pv-kpis' }, h('div', { class: 'pv-kpi' }, h('div', { class: 'k', text: 'Revenue' }), h('div', { class: 'v', text: f.money(8420) })), h('div', { class: 'pv-kpi' }, h('div', { class: 'k', text: ind.efficiency }), h('div', { class: 'v', text: '27.4%' }))),
              h('div', { class: 'pv-card' }, chartSvg(), h('div', { class: 'pv-legend' }, [1, 2, 3, 4].map((n, i) => h('span', null, h('i', { style: { background: `var(--chart-${n})` } }), ind.mix[i])))),
              h('div', { class: 'pv-pills' }, h('span', { class: 'pill ok', text: '✓ On target' }), h('span', { class: 'pill warn', text: '● Watch' }), h('span', { class: 'pill crit', text: '▲ Over' })))));
        const seen = new Set(), items = [];
        theme.notes.forEach((n) => { const k = n.replace(/^(light|dark): /, ''); if (!seen.has(k)) { seen.add(k); items.push(['', 'We ' + k.charAt(0).toLowerCase() + k.slice(1).replace(/^primary colour adjusted/, 'adjusted your primary colour').replace(/^accent colour adjusted/, 'adjusted your button colour')]); } });
        theme.warnings.forEach((w) => items.push(['warn', w]));
        const c = theme.checks;
        items.push(['', `Text, links and buttons meet WCAG AA contrast in light and dark (lowest ${Math.min(c.light.buttonText, c.dark.buttonText, c.light.linkOnSurface, c.dark.linkOnSurface).toFixed(1)}:1).`]);
        items.push([c.light.chartNeedsSecondaryEncoding || c.dark.chartNeedsSecondaryEncoding ? 'warn' : '', c.light.chartNeedsSecondaryEncoding || c.dark.chartNeedsSecondaryEncoding ? 'Two chart colours are close for some colour-blind viewers, so charts always carry labels and legends too.' : 'Chart colours are checked so they stay apart for people with colour-blindness.']);
        DB.clear(notesHost); items.forEach(([cls, t]) => notesHost.appendChild(h('li', { class: cls, text: t })));
      }

      /* ---------- submit ---------- */
      const errBox = h('div', { class: 'errors', role: 'alert', style: { display: 'none' }, tabindex: -1 });
      const consent = h('input', { type: 'checkbox', id: 'f-consent' });
      const submit = h('button', { class: 'btn btn-cta', type: 'submit', text: opts.submitLabel || (mode === 'create' ? 'Create my dashboard' : 'Save changes') });
      const form = h('form', { novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const draft = clone(st); draft.consent = { brandAuthority: consent.checked };
        const r = P.sanitizeProfile(draft, { requireConsent: mode === 'create' });
        if (!r.ok) return showErrors(r.errors);
        submit.disabled = true; const label = submit.textContent; submit.textContent = 'Saving…';
        let res; try { res = await opts.onSubmit(Object.assign(r.profile, { consent: draft.consent })); } catch (err) { res = { ok: false, errors: [{ field: '', message: err.message || 'Something went wrong.' }] }; }
        submit.disabled = false; submit.textContent = label;
        if (!res.ok) showErrors(res.errors);
      } });
      function showErrors(errors) {
        DB.clear(errBox); errBox.style.display = 'block';
        errBox.append(h('b', { text: 'Please check these details' }), h('ul', null, errors.map((x) => h('li', { text: x.message }))));
        errBox.focus(); errBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }

      /* ---------- assemble ---------- */
      form.append(
        errBox,
        h('fieldset', null, h('legend', { text: 'Your business' }),
          field('Business name', nameIn, null, 'f-name'),
          h('div', { class: 'field' }, h('label', { for: 'f-site', text: 'Website (optional)' }), h('div', { class: 'inline' }, siteIn, pullBtn), h('div', { class: 'hint', text: 'We read the public colours and logo your site already publishes. You confirm everything below.' }), foundHost),
          h('div', { class: 'two-col' }, field('Industry', industry, null, 'f-ind'), field('Currency', currency, null, 'f-cur')),
          h('div', { class: 'two-col' }, field('Time zone', tzSelect, null, 'f-tz'), h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Week starts on' }), week)),
          h('div', { class: 'field' }, h('label', { for: 'f-loc', text: 'Locations' }), h('div', { class: 'inline' }, locIn, h('button', { class: 'btn btn-ghost', type: 'button', onclick: addLoc, text: 'Add' })), locList)),
        h('fieldset', null, h('legend', { text: 'Your targets' }),
          h('div', { class: 'two-col' }, h('div', { class: 'field' }, h('label', { for: 'f-rev', text: 'Daily revenue target, all locations' }), revIn), h('div', { class: 'field' }, effLabel, effIn, effHint))),
        h('fieldset', null, h('legend', { text: 'Your brand' }),
          h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Logo' }), h('div', { class: 'logo-box' }, logoFrame, h('div', null, h('label', { class: 'btn btn-ghost btn-sm', for: 'f-logo', text: 'Upload logo' }), ' ', removeLogo, logoMsg)), fileIn),
          h('div', { class: 'field' }, h('label', { for: 'f-pc', text: 'Brand colour' }), h('div', { class: 'color-row' }, primaryColor, primaryHex), swatchHost,
            h('label', { class: 'check', style: { margin: '10px 0 0' } }, accentOn, h('span', { text: 'Use a different colour for main buttons' })), accentRow),
          h('div', { class: 'two-col' }, field('Font', fontSel, null, 'f-font'), h('div', { class: 'field' }, h('span', { class: 'lab', text: 'Default colour mode' }), modeSeg)),
          field('Name shown in the app (optional)', appNameIn, 'Leave blank to use your business name. Your team sees this, not ours.', 'f-app'),
          h('label', { class: 'check' }, poweredIn, h('span', { text: 'Show “Powered by dashboards.business” in the sidebar' }))),
        mode === 'create' ? h('label', { class: 'check' }, consent, h('span', { text: 'I am allowed to use this business name and logo, and I agree to the terms. (Needed because your branding is applied across your team’s app.)' })) : null,
        h('div', null, submit));

      host.append(h('div', { class: 'setup' }, form, h('aside', { class: 'sticky', 'aria-label': 'Preview of your branded app' }, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, h('h2', { style: { fontSize: '15px' }, text: 'How your team will see it' }), pvToggle), pv, notesHost)));
      paintLocs(); paintTargetLabels(); paintLogo(); paintAccent(); paintSwatches(); paintPreview();
      return { state: st };
    },
  };
})();
