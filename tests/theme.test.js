const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../site/js/theme.js');
const P = require('../site/js/profile.js');
const u = T.util;

const HEX = /^#[0-9A-F]{6}$/;
const BRANDS = {
  violet: '#6B4EFF', yellow: '#FFE600', white: '#FFFFFF', black: '#000000', grey: '#808080',
  navy: '#0B1F4B', lime: '#B8F03A', red: '#E10600', orange: '#F97316', teal: '#0D9488',
  pink: '#FF2D95', brown: '#5A3825', mint: '#A7F3D0', cyan: '#00E5FF', forest: '#14532D',
};

test('colour maths: known values', () => {
  assert.equal(u.contrast('#FFFFFF', '#000000').toFixed(2), '21.00');
  assert.equal(u.normHex('#abc'), '#AABBCC');
  assert.equal(u.normHex('javascript:alert(1)'), null);
  assert.equal(u.normHex('#12345'), null);
});

test('colour-blind simulation agrees with the independent palette validator', () => {
  // Reference readings taken from the dataviz validator earlier in this project.
  assert.ok(Math.abs(u.cvdDeltaE('#0A9A94', '#D63A5B') - 8.8) < 0.15);
  assert.ok(Math.abs(u.deltaE('#B06A12', '#0A9A94') - 21.0) < 0.3);
  assert.ok(Math.abs(u.cvdDeltaE('#1FA39C', '#E8607E') - 7.5) < 0.15);
});

function assertAccessible(theme, label) {
  for (const mode of ['light', 'dark']) {
    const v = theme[mode].vars, c = theme.checks[mode];
    for (const [k, val] of Object.entries(v)) {
      if (k === '--shadow' || k === '--logo-chip' || k === '--on-logo-chip') continue;
      assert.match(val, HEX, `${label} ${mode} ${k} is not a clean hex: ${val}`);
    }
    const surf = v['--surface'];
    const worst = mode === 'dark' ? v['--surface-2'] : v['--bg'];
    assert.ok(u.contrast(v['--text'], surf) >= 7, `${label} ${mode} body text`);
    assert.ok(u.contrast(v['--text-2'], worst) >= 6.95, `${label} ${mode} secondary text`);
    assert.ok(u.contrast(v['--text-3'], worst) >= 4.49, `${label} ${mode} muted text`);
    assert.ok(u.contrast(v['--primary'], worst) >= 4.49, `${label} ${mode} link colour`);
    assert.ok(u.contrast(v['--primary-ui'], worst) >= 2.99, `${label} ${mode} UI colour`);
    assert.ok(u.contrast(v['--on-primary'], v['--primary-fill']) >= 4.49, `${label} ${mode} button text`);
    assert.ok(u.contrast(v['--on-cta'], v['--cta-fill']) >= 4.49, `${label} ${mode} CTA text`);
    assert.ok(u.contrast(v['--primary-soft-text'], v['--primary-soft']) >= 4.49, `${label} ${mode} selected-nav text`);
    assert.ok(u.contrast(v['--primary-edge'], worst) >= 2.99 || u.contrast(v['--primary-edge'], v['--primary-fill']) < 1.01,
      `${label} ${mode} button edge must be visible`);
    for (const s of ['ok', 'warn', 'serious', 'critical']) {
      assert.ok(u.contrast(v['--' + s], worst) >= 4.49, `${label} ${mode} status ${s}`);
    }
    const ch = [1, 2, 3, 4].map((i) => v['--chart-' + i]);
    assert.equal(new Set(ch).size, 4, `${label} ${mode} chart colours distinct`);
    for (const col of ch) assert.ok(u.contrast(col, surf) >= 2.99, `${label} ${mode} chart colour ${col} vs card surface`);
    const [bLo, bHi] = mode === 'dark' ? [0.48, 0.67] : [0.43, 0.77];
    for (const col of ch) { const L = u.hexToLch(col).L; assert.ok(L >= bLo && L <= bHi, `${label} ${mode} chart colour ${col} lightness ${L.toFixed(3)} outside band`); assert.ok(u.hexToLch(col).C >= 0.1, `${label} ${mode} chart colour ${col} too grey`); }
    assert.ok(c.chart.minNormal >= 15, `${label} ${mode} chart normal-vision separation ${c.chart.minNormal.toFixed(1)}`);
    assert.ok(c.chart.minCvd >= 5, `${label} ${mode} chart CVD separation ${c.chart.minCvd.toFixed(1)}`);
  }
}

for (const [name, hex] of Object.entries(BRANDS)) {
  test(`brand colour ${name} (${hex}) produces an accessible theme`, () => {
    assertAccessible(T.buildTheme({ primary: hex, accent: null }), name);
  });
}

test('separate accent colour is also made readable', () => {
  assertAccessible(T.buildTheme({ primary: '#0B1F4B', accent: '#FFE600' }), 'navy+yellow');
  assertAccessible(T.buildTheme({ primary: '#FFFFFF', accent: '#FF5C7A' }), 'white+coral');
});

test('fuzz: 400 random brand colours stay accessible', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 400; i++) {
    const hex = u.toHex([rnd() * 255, rnd() * 255, rnd() * 255]);
    const accent = rnd() < 0.5 ? u.toHex([rnd() * 255, rnd() * 255, rnd() * 255]) : null;
    assertAccessible(T.buildTheme({ primary: hex, accent }), `fuzz ${hex}/${accent}`);
  }
});

test('a brand colour is kept as-is when it is already accessible', () => {
  const t = T.buildTheme({ primary: '#6B4EFF' });
  assert.equal(t.dark.vars['--primary-fill'], '#6B4EFF');
  assert.equal(t.light.vars['--primary-fill'], '#6B4EFF');
});

test('yellow keeps its look: fill stays yellow, text on it turns dark', () => {
  const t = T.buildTheme({ primary: '#FFE600' });
  assert.equal(t.light.vars['--primary-fill'], '#FFE600');
  assert.equal(t.light.vars['--on-primary'], '#0F1222');
  assert.ok(u.contrast(t.light.vars['--primary'], t.light.vars['--bg']) >= 4.5, 'links are a darker yellow-brown');
});

test('near-grey brand falls back to a coloured first chart series and says so', () => {
  const t = T.buildTheme({ primary: '#808080' });
  assert.ok(t.warnings.length >= 1);
  assert.ok(u.hexToLch(t.light.vars['--chart-1']).C >= 0.1);
});

test('invalid input never throws and never leaks into CSS', () => {
  const t = T.buildTheme({ primary: 'red; } body{display:none', accent: 'url(javascript:1)', font: '"; x' });
  const css = T.themeToCss(t, ':root');
  assert.ok(!/display:none|javascript|url\(/.test(css));
  assert.equal(t.font, 'inter');
  assert.ok(t.warnings.some((w) => /invalid/i.test(w)));
});

test('logo chip appears only when the logo would vanish', () => {
  const darkLogoOnDark = T.buildTheme({ primary: '#6B4EFF', logoLum: 0.02 });
  assert.equal(darkLogoOnDark.dark.vars['--logo-chip'], '#FFFFFF');
  assert.equal(darkLogoOnDark.light.vars['--logo-chip'], 'transparent');
  const lightLogoOnLight = T.buildTheme({ primary: '#6B4EFF', logoLum: 0.97 });
  assert.notEqual(lightLogoOnLight.light.vars['--logo-chip'], 'transparent');
});

/* ---------------- profile validation ---------------- */
const goodProfile = () => ({
  company: { name: "Joe's Café", website: 'joescafe.com', industry: 'hospitality', currency: 'AUD', timezone: 'Australia/Sydney' },
  locations: ['Downtown', 'Harbour'],
  targets: { efficiency: 27, dailyRevenue: 8000 },
  brand: { primary: '#C2410C', font: 'lora', mode: 'light', appName: "Joe's Numbers" },
  consent: { brandAuthority: true },
});

test('profile: a good profile passes and is normalised', () => {
  const r = P.sanitizeProfile(goodProfile(), { requireConsent: true });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.profile.company.website, 'https://joescafe.com');
  assert.equal(r.profile.brand.primary, '#C2410C');
});

test('profile: consent is required on creation', () => {
  const p = goodProfile(); delete p.consent;
  const r = P.sanitizeProfile(p, { requireConsent: true });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.field === 'consent.brandAuthority'));
});

test('profile: hostile input is rejected or neutralised', () => {
  const p = goodProfile();
  p.company.name = '<img src=x onerror=alert(1)>Evil';
  p.company.website = 'javascript:alert(1)';
  p.brand.primary = 'url(//evil)';
  p.brand.font = 'Comic Sans; } body{';
  p.brand.logo = 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+';
  p.locations = ['A', 'a', '<b>B</b>', ''];
  const r = P.sanitizeProfile(p, { requireConsent: true });
  assert.ok(!r.ok);
  const fields = r.errors.map((e) => e.field);
  for (const f of ['company.website', 'brand.primary', 'brand.font', 'brand.logo']) assert.ok(fields.includes(f), f);
  assert.ok(!/[<>]/.test(r.profile.company.name));
  assert.equal(r.profile.locations.filter((l) => l.toLowerCase() === 'a').length, 1, 'duplicate locations collapse');
});

test('profile: logo must really be the image type it claims', () => {
  const fake = 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)></svg>').toString('base64');
  assert.ok(P.checkLogoDataUrl(fake));
  const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
  assert.equal(P.checkLogoDataUrl(png), null);
  const big = 'data:image/png;base64,' + Buffer.alloc(300 * 1024, 1).toString('base64');
  assert.match(P.checkLogoDataUrl(big), /too large/);
});

test('muted brand colours keep their hue in charts instead of falling back to the default', () => {
  for (const hex of ['#0F766E', '#7C2D12', '#1E3A8A', '#4D7C0F', '#9D174D']) {
    const t = T.buildTheme({ primary: hex });
    for (const mode of ['light', 'dark']) {
      const first = t[mode].vars['--chart-1'];
      const dh = Math.abs(u.hexToLch(first).h - u.hexToLch(hex).h);
      assert.ok(Math.min(dh, 360 - dh) < 12, `${hex} ${mode}: chart series 1 ${first} must keep the brand hue`);
      assert.equal(t.checks[mode].chartBrandSlotReplaced, false, `${hex} ${mode} should not be replaced`);
    }
  }
});
