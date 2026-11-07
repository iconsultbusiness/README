/*
 * dashboards.business — customer profile schema.
 * One definition of what a tenant can store, shared by the signup form, the
 * app and the server. sanitizeProfile() is the only gate: anything that is not
 * explicitly allowed is dropped, so stored profiles are always safe to render.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./theme.js'));
  else root.DBProfile = factory(root.DBTheme);
})(typeof self !== 'undefined' ? self : this, function (Theme) {
  'use strict';

  const INDUSTRIES = {
    hospitality: {
      label: 'Café, restaurant or bar',
      volume: 'Orders', avg: 'Avg basket', efficiency: 'Labour cost', efficiencyDir: 'lower', efficiencyDefault: 28,
      mix: ['Food', 'Drinks', 'Retail', 'Other'], dailyRevenueDefault: 9000,
      sources: ['Point of sale', 'Accounting', 'Rostering', 'Spreadsheets'],
    },
    retail: {
      label: 'Retail or e-commerce',
      volume: 'Transactions', avg: 'Avg basket', efficiency: 'Labour cost', efficiencyDir: 'lower', efficiencyDefault: 16,
      mix: ['Apparel', 'Home', 'Beauty', 'Other'], dailyRevenueDefault: 14000,
      sources: ['Online store', 'Point of sale', 'Accounting', 'Spreadsheets'],
    },
    services: {
      label: 'Services or trades',
      volume: 'Jobs', avg: 'Avg job value', efficiency: 'Utilisation', efficiencyDir: 'higher', efficiencyDefault: 72,
      mix: ['Consulting', 'Installs', 'Support', 'Other'], dailyRevenueDefault: 6000,
      sources: ['Invoicing', 'CRM', 'Accounting', 'Spreadsheets'],
    },
  };
  const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'BRL', 'MXN', 'ZAR', 'INR', 'SGD', 'AED', 'JPY'];
  const MODES = ['auto', 'light', 'dark'];
  const LIMITS = { name: 60, appName: 40, location: 40, locations: 12, logoBytes: 250 * 1024 };

  function defaultProfile() {
    return {
      company: { name: '', website: '', industry: 'hospitality', currency: 'USD', locale: 'en-US', timezone: 'UTC', weekStart: 'mon' },
      locations: ['Main'],
      targets: { efficiency: INDUSTRIES.hospitality.efficiencyDefault, dailyRevenue: INDUSTRIES.hospitality.dailyRevenueDefault },
      brand: { primary: Theme.DEFAULT_BRAND.primary, accent: Theme.DEFAULT_BRAND.accent, font: 'inter', mode: 'auto', appName: '', logo: null, logoLum: null, icon192: null, icon512: null, showPoweredBy: true },
    };
  }

  const cleanText = (v, max) =>
    typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

  function validTimezone(tz) {
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); return typeof tz === 'string' && tz.length < 64; } catch (e) { return false; }
  }
  function validLocale(l) {
    try { return typeof l === 'string' && l.length < 20 && Intl.NumberFormat.supportedLocalesOf([l]).length > 0; } catch (e) { return false; }
  }
  function normaliseWebsite(v) {
    const raw = cleanText(v, 200);
    if (!raw) return '';
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
      if (!/^https?:$/.test(u.protocol) || u.username || u.password || !u.hostname.includes('.')) return null;
      return u.origin + (u.pathname === '/' ? '' : u.pathname);
    } catch (e) { return null; }
  }

  /** Decode a data: URL image and check its type by magic bytes, never by what the client claims. */
  function checkLogoDataUrl(url) {
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    if (!m) return 'Logo must be a PNG, JPEG or WebP image.';
    const approx = Math.floor((m[2].length * 3) / 4);
    if (approx > LIMITS.logoBytes) return 'Logo is too large (250 KB max).';
    const b = typeof Buffer !== 'undefined' ? Buffer.from(m[2].slice(0, 24), 'base64') : Uint8Array.from(atob(m[2].slice(0, 24)), (c) => c.charCodeAt(0));
    const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const isWebp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    const ok = (m[1] === 'png' && isPng) || (m[1] === 'jpeg' && isJpg) || (m[1] === 'webp' && isWebp);
    return ok ? null : 'Logo file does not match its type.';
  }

  /** App icons (192 and 512 px PNG) are generated in the browser from the logo; same magic-byte check as the logo. */
  function checkIconDataUrl(url, size) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    if (!m) return 'Icon must be a PNG.';
    if (Math.floor((m[1].length * 3) / 4) > 120 * 1024) return 'Icon is too large.';
    const b = typeof Buffer !== 'undefined' ? Buffer.from(m[1], 'base64') : Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
    if (!(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)) return 'Icon file does not match its type.';
    const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
    return w === size && h === size ? null : `Icon must be ${size} by ${size} pixels.`;
  }

  /**
   * Validate and normalise a profile. Returns { ok, profile, errors }.
   * `requireConsent` is true when a profile is first created.
   */
  function sanitizeProfile(raw, opts) {
    opts = opts || {};
    const errors = [];
    const err = (field, message) => errors.push({ field, message });
    const d = defaultProfile();
    raw = raw && typeof raw === 'object' ? raw : {};
    const c = raw.company || {}, b = raw.brand || {}, t = raw.targets || {};

    const name = cleanText(c.name, LIMITS.name);
    if (!name) err('company.name', 'Enter your business name.');

    const industry = INDUSTRIES[c.industry] ? c.industry : (c.industry === undefined ? d.company.industry : (err('company.industry', 'Pick an industry from the list.'), d.company.industry));
    const currency = CURRENCIES.includes(c.currency) ? c.currency : (c.currency === undefined ? d.company.currency : (err('company.currency', 'Unsupported currency.'), d.company.currency));
    const timezone = c.timezone === undefined ? d.company.timezone : (validTimezone(c.timezone) ? c.timezone : (err('company.timezone', 'Unknown time zone.'), d.company.timezone));
    const locale = c.locale === undefined ? d.company.locale : (validLocale(c.locale) ? c.locale : d.company.locale);
    const weekStart = c.weekStart === 'sun' ? 'sun' : 'mon';

    let website = '';
    if (c.website) {
      const w = normaliseWebsite(c.website);
      if (w === null) err('company.website', 'That website address does not look right.');
      else website = w;
    }

    let locs = Array.isArray(raw.locations) ? raw.locations : d.locations;
    locs = locs.map((l) => cleanText(l, LIMITS.location)).filter(Boolean);
    locs = locs.filter((l, i) => locs.findIndex((x) => x.toLowerCase() === l.toLowerCase()) === i);
    if (locs.length === 0) err('locations', 'Add at least one location.');
    if (locs.length > LIMITS.locations) { locs = locs.slice(0, LIMITS.locations); err('locations', `At most ${LIMITS.locations} locations in this plan.`); }

    const ind = INDUSTRIES[industry];
    const num = (v, lo, hi, dflt, field, label) => {
      if (v === undefined || v === null || v === '') return dflt;
      const n = Number(v);
      if (!Number.isFinite(n) || n < lo || n > hi) { err(field, `${label} must be between ${lo} and ${hi}.`); return dflt; }
      return Math.round(n * 100) / 100;
    };
    const targets = {
      efficiency: num(t.efficiency, 1, 100, ind.efficiencyDefault, 'targets.efficiency', ind.efficiency + ' target'),
      dailyRevenue: num(t.dailyRevenue, 1, 10000000, ind.dailyRevenueDefault, 'targets.dailyRevenue', 'Daily revenue target'),
    };

    const primary = Theme.util.normHex(b.primary);
    if (!primary) err('brand.primary', 'Pick a valid brand colour.');
    let accent = null;
    if (b.accent) { accent = Theme.util.normHex(b.accent); if (!accent) err('brand.accent', 'Pick a valid accent colour.'); }
    const font = b.font === undefined ? 'inter' : (Theme.FONTS[b.font] ? b.font : (err('brand.font', 'Unknown font.'), 'inter'));
    const mode = b.mode === undefined ? 'auto' : (MODES.includes(b.mode) ? b.mode : (err('brand.mode', 'Unknown colour mode.'), 'auto'));
    const appName = cleanText(b.appName, LIMITS.appName);

    let logo = null, logoLum = null;
    if (b.logo) {
      const e = checkLogoDataUrl(b.logo);
      if (e) err('brand.logo', e); else {
        logo = b.logo;
        logoLum = typeof b.logoLum === 'number' && b.logoLum >= 0 && b.logoLum <= 1 ? Math.round(b.logoLum * 1000) / 1000 : null;
      }
    }

    let icon192 = null, icon512 = null;
    if (b.icon192 && b.icon512) {
      const e1 = checkIconDataUrl(b.icon192, 192), e2 = checkIconDataUrl(b.icon512, 512);
      if (e1 || e2) err('brand.icon', e1 || e2); else { icon192 = b.icon192; icon512 = b.icon512; }
    }

    if (opts.requireConsent && !(raw.consent && raw.consent.brandAuthority === true)) {
      err('consent.brandAuthority', 'Please confirm you are allowed to use this name and logo.');
    }

    const profile = {
      company: { name, website, industry, currency, locale, timezone, weekStart },
      locations: locs,
      targets,
      brand: { primary: primary || d.brand.primary, accent, font, mode, appName, logo, logoLum, icon192, icon512, showPoweredBy: b.showPoweredBy !== false },
    };
    return { ok: errors.length === 0, profile, errors };
  }

  return { INDUSTRIES, CURRENCIES, MODES, LIMITS, defaultProfile, sanitizeProfile, checkLogoDataUrl, checkIconDataUrl, cleanText, normaliseWebsite };
});
