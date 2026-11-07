/*
 * dashboards.business — tenant theme engine (white label)
 *
 * Takes a customer's brand colours and produces a complete, accessible theme:
 *   - light and dark token sets built from the same brand hue
 *   - text / link / button / focus colours that meet WCAG contrast
 *   - a four-slot chart palette checked for colour-blind separation
 * It never trusts input: every output colour is generated from numbers and
 * emitted as #RRGGBB, so a tenant can never inject CSS.
 *
 * Runs in the browser (window.DBTheme) and in Node (require) so the server
 * and the tests use exactly the same code.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DBTheme = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Colour maths                                                        */
  /* ------------------------------------------------------------------ */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function parseHex(hex) {
    if (typeof hex !== 'string') return null;
    let h = hex.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const toHex = (rgb) =>
    '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const normHex = (hex) => { const p = parseHex(hex); return p ? toHex(p) : null; };

  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const fromLin = (c) => {
    c = clamp(c, 0, 1);
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  };

  function relLum(hex) {
    const [r, g, b] = parseHex(hex).map(toLin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const la = relLum(a), lb = relLum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function linToLab([r, g, b]) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }
  function labToLin([L, a, b]) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }
  const hexToLab = (hex) => linToLab(parseHex(hex).map(toLin));
  function hexToLch(hex) {
    const [L, a, b] = hexToLab(hex);
    let h = (Math.atan2(b, a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { L, C: Math.hypot(a, b), h };
  }
  /** OKLCH -> hex. Out-of-gamut colours lose chroma, never hue or lightness. */
  function lchToHex(L, C, h) {
    L = clamp(L, 0, 1);
    if (L <= 0) return '#000000';
    if (L >= 1) return '#FFFFFF';
    const hr = (h * Math.PI) / 180;
    const at = (c) => labToLin([L, c * Math.cos(hr), c * Math.sin(hr)]);
    const ok = (t) => t.every((v) => v >= -0.0005 && v <= 1.0005);
    let best = at(C);
    if (!ok(best)) {
      let lo = 0, hi = C;
      best = at(0);
      for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2, t = at(mid);
        if (ok(t)) { lo = mid; best = t; } else hi = mid;
      }
    }
    return toHex(best.map(fromLin));
  }
  const deltaE = (a, b) => {
    const x = hexToLab(a), y = hexToLab(b);
    return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  function mix(a, b, t) {
    const x = hexToLab(a), y = hexToLab(b);
    return toHex(labToLin([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t)).map(fromLin));
  }

  /* Machado et al. 2009, full severity, applied in linear RGB. */
  const CVD = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
  };
  function simulate(hex, type) {
    const lin = parseHex(hex).map(toLin), m = CVD[type];
    return toHex(m.map((row) => fromLin(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])));
  }
  /** Smallest colour difference between two colours across the three CVD types. */
  function cvdDeltaE(a, b) {
    return Math.min(...Object.keys(CVD).map((t) => deltaE(simulate(a, t), simulate(b, t))));
  }

  /* ------------------------------------------------------------------ */
  /* Contrast helpers                                                    */
  /* ------------------------------------------------------------------ */
  /**
   * Move a colour's lightness (hue kept, chroma gamut-mapped) until it reaches
   * `min` contrast against `bg`. Returns the original when already fine.
   */
  function ensureContrast(hex, bg, min, direction) {
    hex = normHex(hex);
    if (contrast(hex, bg) >= min) return { hex, changed: false };
    const dir = direction || (relLum(bg) > 0.4 ? 'darker' : 'lighter');
    const { L, C, h } = hexToLch(hex);
    const end = dir === 'darker' ? 0 : 1;
    if (contrast(lchToHex(end, C, h), bg) < min) {
      const alt = dir === 'darker' ? '#000000' : '#FFFFFF';
      return { hex: alt, changed: true };
    }
    let lo = L, hi = end, out = lchToHex(end, C, h);
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2, cand = lchToHex(mid, C, h);
      if (contrast(cand, bg) >= min) { hi = mid; out = cand; } else lo = mid;
    }
    return { hex: out, changed: true };
  }

  const INK = '#0F1222';
  const WHITE = '#FFFFFF';
  /** Pick readable text for a fill; nudge the fill only if neither white nor ink reaches `min`. */
  function readableOn(fill, min) {
    min = min || 4.5;
    fill = normHex(fill);
    const cw = contrast(fill, WHITE), ci = contrast(fill, INK);
    if (Math.max(cw, ci) >= min) return { fill, on: cw >= ci ? WHITE : INK, changed: false };
    const darker = ensureContrast(fill, WHITE, min, 'darker').hex;
    const lighter = ensureContrast(fill, INK, min, 'lighter').hex;
    const L0 = hexToLch(fill).L;
    const dD = Math.abs(hexToLch(darker).L - L0), dL = Math.abs(hexToLch(lighter).L - L0);
    return dD <= dL ? { fill: darker, on: WHITE, changed: true } : { fill: lighter, on: INK, changed: true };
  }

  /* ------------------------------------------------------------------ */
  /* Chart palette                                                       */
  /* ------------------------------------------------------------------ */
  const DEFAULT_CHART = {
    light: ['#5B3FE6', '#D63A5B', '#0A9A94', '#B06A12'],
    dark: ['#8A74F5', '#E8607E', '#1FA39C', '#C4872A'],
  };
  const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] };
  const POOL_L = { light: [0.46, 0.54, 0.62, 0.7], dark: [0.5, 0.56, 0.62, 0.66] };
  const POOL_C = [0.12, 0.17];
  const REF_SURFACE = { light: '#FFFFFF', dark: '#262B45' }; // charts sit on cards; dark ref is lighter than any real card
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const dist3 = (x, y) => 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  const simLab = (hex) => ({ n: hexToLab(hex), p: hexToLab(simulate(hex, 'protan')), d: hexToLab(simulate(hex, 'deutan')), t: hexToLab(simulate(hex, 'tritan')) });
  const cvdLab = (a, b) => Math.min(dist3(a.p, b.p), dist3(a.d, b.d), dist3(a.t, b.t));

  /* The candidate pool and its pairwise distances do not depend on the brand, so build them once per mode. */
  const poolCache = {};
  function getPool(mode) {
    if (poolCache[mode]) return poolCache[mode];
    const [lo, hi] = BAND[mode];
    const seen = new Set(), colors = [];
    const push = (hex) => {
      const { L, C } = hexToLch(hex);
      if (L < lo || L > hi || C < 0.1 || contrast(hex, REF_SURFACE[mode]) < 3.1 || seen.has(hex)) return;
      seen.add(hex); colors.push(hex);
    };
    DEFAULT_CHART[mode].slice(1).forEach(push);
    for (let h = 0; h < 360; h += 10) for (const L of POOL_L[mode]) for (const C of POOL_C) push(lchToHex(L, C, h));
    const n = colors.length, labs = colors.map(simLab);
    const normal = new Float32Array(n * n), cvd = new Float32Array(n * n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      normal[i * n + j] = normal[j * n + i] = dist3(labs[i].n, labs[j].n);
      cvd[i * n + j] = cvd[j * n + i] = cvdLab(labs[i], labs[j]);
    }
    return (poolCache[mode] = { colors, labs, hues: colors.map((c) => hexToLch(c).h), normal, cvd, n });
  }

  function chartPalette(mode, brandUi, worstSurface) {
    const [bandLo, bandHi] = BAND[mode];
    const flags = { secondaryEncoding: false, brandSlotReplaced: false };
    // Keep the brand hue. Muted brand colours get their saturation lifted just enough to read as a series colour.
    // If the floor is unreachable at the original lightness, step lighter (still inside the band and the contrast limit).
    // Only a colour that is essentially grey, or cannot get there at all, is swapped for the default.
    const lift = () => {
      const { L, C, h } = hexToLch(brandUi);
      if (C < 0.03) return null;
      for (let l = clamp(L, bandLo + 0.004, bandHi - 0.004); l <= bandHi - 0.004; l += 0.01) {
        const cand = lchToHex(l, Math.max(C, 0.125), h);
        if (hexToLch(cand).C >= 0.1 && contrast(cand, worstSurface) >= 3) return cand;
      }
      return null;
    };
    let first = lift();
    if (!first) { first = DEFAULT_CHART[mode][0]; flags.brandSlotReplaced = true; }

    const pool = getPool(mode), n = pool.n;
    const ok = [], d1n = new Float32Array(n), d1c = new Float32Array(n), firstLab = simLab(first);
    for (let i = 0; i < n; i++) {
      d1n[i] = dist3(firstLab.n, pool.labs[i].n);
      d1c[i] = cvdLab(firstLab, pool.labs[i]);
      if (contrast(pool.colors[i], worstSurface) >= 3) ok.push(i);
    }
    const defHues = DEFAULT_CHART[mode].slice(1).map((c) => hexToLch(c).h);
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

    let best = null;
    for (const minNormal of [15, 12]) {
      for (let a = 0; a < ok.length; a++) {
        const i = ok[a]; if (d1n[i] < minNormal) continue;
        for (let b = a + 1; b < ok.length; b++) {
          const j = ok[b]; if (d1n[j] < minNormal || pool.normal[i * n + j] < minNormal) continue;
          for (let c = b + 1; c < ok.length; c++) {
            const k = ok[c]; if (d1n[k] < minNormal || pool.normal[i * n + k] < minNormal || pool.normal[j * n + k] < minNormal) continue;
            const minCvd = Math.min(d1c[i], d1c[j], d1c[k], pool.cvd[i * n + j], pool.cvd[i * n + k], pool.cvd[j * n + k]);
            const minNorm = Math.min(d1n[i], d1n[j], d1n[k], pool.normal[i * n + j], pool.normal[i * n + k], pool.normal[j * n + k]);
            const base = Math.min(minCvd, 12) + (0.4 * Math.min(minNorm, 30)) / 30;
            if (best && base <= best.score) continue; // the hue term can only lower the score, so this trio cannot win
            const trio = [i, j, k];
            let bestPerm = null, bestHue = Infinity;
            for (const perm of perms) {
              const hd = perm.reduce((acc, p, slot) => acc + hueDist(pool.hues[trio[p]], defHues[slot]), 0);
              if (hd < bestHue) { bestHue = hd; bestPerm = perm; }
            }
            // Separation first (capped, so more is not endlessly better), then stay close to the default hues.
            const score = base - 0.004 * bestHue;
            if (!best || score > best.score) best = { score, order: bestPerm.map((p) => trio[p]) };
          }
        }
      }
      if (best) break;
    }
    const colors = best ? [first, ...best.order.map((i) => pool.colors[i])] : [first, ...DEFAULT_CHART[mode].slice(1)];
    if (!best) flags.secondaryEncoding = true;
    let adj = Infinity;
    for (let i = 1; i < colors.length; i++) adj = Math.min(adj, cvdDeltaE(colors[i - 1], colors[i]));
    if (adj < 8) flags.secondaryEncoding = true;
    return { colors, flags };
  }

  function paletteReport(colors) {
    let minNormal = Infinity, minCvd = Infinity, minAdjCvd = Infinity;
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        minNormal = Math.min(minNormal, deltaE(colors[i], colors[j]));
        const c = cvdDeltaE(colors[i], colors[j]);
        minCvd = Math.min(minCvd, c);
        if (j === i + 1) minAdjCvd = Math.min(minAdjCvd, c);
      }
    }
    return { minNormal, minCvd, minAdjCvd };
  }

  /* ------------------------------------------------------------------ */
  /* Fonts (allow-list only: no tenant-supplied font URLs)               */
  /* ------------------------------------------------------------------ */
  const FONTS = {
    inter: { label: 'Inter', stack: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif', google: 'Inter:wght@400;500;600;700' },
    outfit: { label: 'Outfit', stack: '"Outfit", "Inter", system-ui, sans-serif', google: 'Outfit:wght@400;500;600;700' },
    poppins: { label: 'Poppins', stack: '"Poppins", system-ui, sans-serif', google: 'Poppins:wght@400;500;600;700' },
    manrope: { label: 'Manrope', stack: '"Manrope", system-ui, sans-serif', google: 'Manrope:wght@400;500;600;700;800' },
    lora: { label: 'Lora (serif)', stack: '"Lora", Georgia, "Times New Roman", serif', google: 'Lora:wght@400;500;600;700' },
    system: { label: 'System default', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', google: null },
  };
  const fontLinkHref = (key) =>
    FONTS[key] && FONTS[key].google
      ? 'https://fonts.googleapis.com/css2?family=' + FONTS[key].google + '&display=swap'
      : null;

  /* ------------------------------------------------------------------ */
  /* Theme build                                                         */
  /* ------------------------------------------------------------------ */
  const STATUS_BASE = {
    light: { ok: '#1A9E6B', warn: '#C98A12', serious: '#E0502B', critical: '#C9264A' },
    dark: { ok: '#3DBA85', warn: '#E0A93A', serious: '#F0744F', critical: '#F05C7A' },
  };

  function surfaces(mode, h, C) {
    // yellow-green hues turn muddy olive when used to tint dark surfaces, so tint them less
    const c = (0.006 + 0.01 * clamp(C / 0.15, 0, 1)) * (h > 70 && h < 150 ? 0.5 : 1);
    if (mode === 'light') {
      return {
        bg: lchToHex(0.972, c * 0.35, h),
        surface: '#FFFFFF',
        surface2: lchToHex(0.982, c * 0.3, h),
        border: lchToHex(0.915, c * 0.55, h),
        borderStrong: lchToHex(0.85, c * 0.6, h),
        tint: c,
      };
    }
    return {
      bg: lchToHex(0.17, c, h),
      surface: lchToHex(0.215, c, h),
      surface2: lchToHex(0.255, c, h),
      border: lchToHex(0.32, c, h),
      borderStrong: lchToHex(0.4, c, h),
      tint: c,
    };
  }

  function buildMode(mode, brand, accent, logoTone, notes) {
    const lch = hexToLch(brand);
    const s = surfaces(mode, lch.h, lch.C);
    const worst = mode === 'dark' ? s.surface2 : s.bg;
    const c = s.tint;
    const note = (msg) => notes.push(`${mode}: ${msg}`);

    const text = lchToHex(mode === 'dark' ? 0.96 : 0.22, c, lch.h);
    const text2 = ensureContrast(lchToHex(mode === 'dark' ? 0.8 : 0.42, c, lch.h), worst, 7).hex;
    const text3 = ensureContrast(lchToHex(mode === 'dark' ? 0.66 : 0.55, c, lch.h), worst, 4.5).hex;

    const buildAccent = (hex, label) => {
      const r = readableOn(hex, 4.5);
      if (r.changed) note(`${label} colour adjusted slightly so button text is readable (${contrast(r.fill, r.on).toFixed(1)}:1)`);
      const ui = ensureContrast(hex, worst, 3).hex;
      const text4 = ensureContrast(hex, worst, 4.5).hex;
      const edge = contrast(r.fill, worst) >= 3 ? r.fill : ui;
      return { fill: r.fill, on: r.on, ui, text: text4, edge };
    };
    const p = buildAccent(brand, 'primary');
    const cta = accent ? buildAccent(accent, 'accent') : p;

    const soft = mix(s.surface, p.ui, mode === 'dark' ? 0.18 : 0.1);
    const softText = ensureContrast(p.text, soft, 4.5).hex;

    const status = {};
    const statusSoft = {};
    for (const k of Object.keys(STATUS_BASE[mode])) {
      status[k] = ensureContrast(STATUS_BASE[mode][k], worst, 4.5).hex;
      statusSoft[k] = mix(s.surface, status[k], mode === 'dark' ? 0.16 : 0.1);
    }

    const chart = chartPalette(mode, p.ui, s.surface); // charts are drawn on cards

    // Logo chip: give logos that would vanish against the surface a neutral backing.
    let chip = 'transparent', onChip = text;
    if (logoTone && typeof logoTone.lum === 'number') {
      const surfLum = relLum(s.surface), lg = logoTone.lum;
      const ratio = (Math.max(surfLum, lg) + 0.05) / (Math.min(surfLum, lg) + 0.05);
      if (ratio < 3) chip = lg < 0.2 ? '#FFFFFF' : '#12152A';
    }

    const vars = {
      '--bg': s.bg, '--surface': s.surface, '--surface-2': s.surface2,
      '--border': s.border, '--border-strong': s.borderStrong,
      '--text': text, '--text-2': text2, '--text-3': text3,
      '--primary': p.text, '--primary-ui': p.ui, '--primary-fill': p.fill, '--on-primary': p.on, '--primary-edge': p.edge,
      '--primary-soft': soft, '--primary-soft-text': softText,
      '--cta-fill': cta.fill, '--on-cta': cta.on, '--cta-edge': cta.edge,
      '--focus': p.ui,
      '--ok': status.ok, '--warn': status.warn, '--serious': status.serious, '--critical': status.critical,
      '--ok-soft': statusSoft.ok, '--warn-soft': statusSoft.warn, '--serious-soft': statusSoft.serious, '--critical-soft': statusSoft.critical,
      '--chart-1': chart.colors[0], '--chart-2': chart.colors[1], '--chart-3': chart.colors[2], '--chart-4': chart.colors[3],
      '--chart-grid': s.border, '--chart-track': s.surface2,
      '--logo-chip': chip, '--on-logo-chip': onChip,
      '--shadow': mode === 'dark' ? '0 1px 2px rgba(0,0,0,.4)' : '0 1px 2px rgba(15,18,34,.06), 0 8px 24px rgba(15,18,34,.07)',
    };
    return { vars, chart, worst };
  }

  const DEFAULT_BRAND = { primary: '#6B4EFF', accent: '#FF5C7A' };

  /**
   * brand = { primary, accent?, font?, logoLum? }
   * returns { light:{vars}, dark:{vars}, font, notes[], warnings[], checks }
   */
  function buildTheme(brand) {
    brand = brand || {};
    const notes = [], warnings = [];
    let primary = normHex(brand.primary);
    if (!primary) { primary = DEFAULT_BRAND.primary; warnings.push('Primary colour was missing or invalid; using the default.'); }
    const accent = normHex(brand.accent) || null;
    const font = FONTS[brand.font] ? brand.font : 'inter';
    const logoTone = typeof brand.logoLum === 'number' ? { lum: clamp(brand.logoLum, 0, 1) } : null;

    const lchP = hexToLch(primary);
    if (lchP.C < 0.03) warnings.push('Your primary colour is almost grey. The app will look neutral and charts use a default accent.');

    const light = buildMode('light', primary, accent, logoTone, notes);
    const dark = buildMode('dark', primary, accent, logoTone, notes);

    const checks = {};
    for (const [mode, m] of [['light', light], ['dark', dark]]) {
      const v = m.vars;
      checks[mode] = {
        textOnSurface: contrast(v['--text'], v['--surface']),
        text2OnSurface: contrast(v['--text-2'], v['--surface']),
        linkOnSurface: contrast(v['--primary'], m.worst),
        buttonText: contrast(v['--on-primary'], v['--primary-fill']),
        ctaText: contrast(v['--on-cta'], v['--cta-fill']),
        chart: paletteReport([v['--chart-1'], v['--chart-2'], v['--chart-3'], v['--chart-4']]),
        chartOnSurface: Math.min(...[1, 2, 3, 4].map((i) => contrast(v['--chart-' + i], v['--surface']))),
        chartNeedsSecondaryEncoding: m.chart.flags.secondaryEncoding,
        chartBrandSlotReplaced: m.chart.flags.brandSlotReplaced,
      };
    }
    if (checks.light.chartBrandSlotReplaced) warnings.push('Chart series 1 uses the default accent because your primary colour is too neutral to read as a series.');

    return { primary, accent, font, light: { vars: light.vars }, dark: { vars: dark.vars }, notes, warnings, checks };
  }

  /** CSS text for a built theme, scoped to `selector` (':root' for the app, '.preview' for the live preview). */
  function themeToCss(theme, selector) {
    selector = selector || ':root';
    const body = (vars) => Object.keys(vars).map((k) => `${k}:${vars[k]}`).join(';');
    const f = FONTS[theme.font] || FONTS.inter;
    return (
      `${selector}{--font:${f.stack};--r-sm:8px;--r-md:12px;--r-lg:18px;--r-pill:999px}` +
      `${selector}[data-theme="light"]{color-scheme:light;${body(theme.light.vars)}}` +
      `${selector}[data-theme="dark"]{color-scheme:dark;${body(theme.dark.vars)}}`
    );
  }

  return {
    buildTheme, themeToCss, fontLinkHref, FONTS, DEFAULT_BRAND,
    // exposed for tests and the signup preview
    util: { parseHex, normHex, toHex, contrast, relLum, deltaE, cvdDeltaE, simulate, hexToLch, lchToHex, ensureContrast, readableOn, mix, chartPalette, paletteReport },
  };
});
