'use strict';
/*
 * Brand discovery. Given a website address, read what the site itself publishes
 * about its identity: name, theme colour, web manifest, icons, a logo in the page
 * header, and brand-named CSS variables. Everything is returned as a *suggestion*
 * with its source; the customer confirms it in the signup form. Nothing here
 * scrapes personal data or follows links beyond the home page and its own
 * stylesheet / manifest.
 */
const { safeFetch, FetchError } = require('./safe-fetch');
const Theme = require('../../site/js/theme.js');

const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function parseAttrs(tag) {
  const out = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m; const body = tag.replace(/^<\w+/, '');
  while ((m = re.exec(body))) out[m[1].toLowerCase()] = decode(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] || '');
  return out;
}
const tagsOf = (html, name) => html.match(new RegExp('<' + name + '\\b[^>]*>', 'gi')) || [];

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return Theme.util.toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
function parseColor(v) {
  if (!v) return null;
  v = String(v).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(v);
  if (hex) return Theme.util.normHex('#' + hex[1]);
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)/i.exec(v);
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    if (a < 0.9 || [rgb[1], rgb[2], rgb[3]].some((n) => Number(n) > 255)) return null;
    return Theme.util.toHex([+rgb[1], +rgb[2], +rgb[3]]);
  }
  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(v);
  if (hsl) return hslToHex(parseFloat(hsl[1]) % 360, Math.min(100, +hsl[2]), Math.min(100, +hsl[3]));
  return null;
}

function addColor(list, hex, source, weight) {
  if (!hex) return;
  const lch = Theme.util.hexToLch(hex);
  const existing = list.find((c) => Theme.util.deltaE(c.hex, hex) < 4);
  if (existing) { existing.weight += weight * 0.3; return; }
  list.push({ hex, source, weight, neutral: lch.C < 0.03 || lch.L > 0.97 || lch.L < 0.12 });
}

function colorsFromCss(css, list, source) {
  const re = /(--[\w-]*(?:brand|primary|accent|main)[\w-]*)\s*:\s*([^;}\n]+)/gi;
  let m, n = 0;
  while ((m = re.exec(css)) && n < 60) {
    n++;
    const name = m[1].toLowerCase();
    if (/(text|bg|background|border|foreground|shadow|contrast|on-|hover|focus|disabled|gradient)/.test(name)) continue;
    const hex = parseColor(m[2].trim());
    if (hex) addColor(list, hex, `${source} (${m[1]})`, /primary|brand/.test(name) ? 6 : 3);
  }
}

function absolute(href, base) {
  try { const u = new URL(href, base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; }
}
function largest(sizes) {
  const m = String(sizes || '').match(/(\d+)x(\d+)/gi);
  return m ? Math.max(...m.map((s) => parseInt(s, 10))) : 0;
}
function hostName(u) {
  const h = new URL(u).hostname.replace(/^www\./, '').split('.');
  const base = h.length > 2 && h[h.length - 2].length <= 3 ? h[h.length - 3] : h[Math.max(0, h.length - 2)];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

async function extractBrand(inputUrl, opts) {
  opts = opts || {};
  const fo = Object.assign({ allowPrivate: false }, opts.fetchOpts);
  let raw = String(inputUrl || '').trim();
  if (!raw) throw new FetchError('bad_url', 'Enter a website address.');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;

  const page = await safeFetch(raw, { ...fo, accept: 'text/html,application/xhtml+xml', maxBytes: 700 * 1024, truncate: true });
  if (page.status >= 400) throw new FetchError('http_' + page.status, `The site answered with an error (${page.status}).`);
  const type = String(page.headers['content-type'] || '');
  if (type && !/html|xml/i.test(type)) throw new FetchError('not_html', 'That address is not a web page.');
  const base = page.url;
  const html = page.body.toString('utf8').replace(/<!--[\s\S]*?-->/g, '');

  const notes = [];
  const colors = [];
  const logos = [];
  const addLogo = (href, source, rank, extra) => {
    const url = absolute(href, base);
    if (!url || logos.some((l) => l.url === url)) return;
    logos.push({ url, source, rank, ...extra });
  };

  // ---- name ----
  let name = '';
  const metas = tagsOf(html, 'meta').map(parseAttrs);
  const meta = (k) => { const m = metas.find((a) => (a.property || a.name || '').toLowerCase() === k); return m ? m.content : ''; };
  const ld = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); (Array.isArray(j) ? j : j['@graph'] || [j]).forEach((x) => ld.push(x)); } catch (e) { /* ignore bad JSON-LD */ }
  }
  const org = ld.find((x) => x && /Organization|LocalBusiness|Corporation|Store|Restaurant/i.test([].concat(x['@type'] || []).join(',')));
  if (org && org.name) name = String(org.name);
  if (!name) name = meta('og:site_name') || meta('application-name') || '';
  if (!name) name = hostName(base);
  name = name.replace(/\s+/g, ' ').trim().slice(0, 60);

  // ---- colours ----
  for (const a of metas) {
    if ((a.name || '').toLowerCase() === 'theme-color') addColor(colors, parseColor(a.content), 'Site theme colour', 10);
    if ((a.name || '').toLowerCase() === 'msapplication-tilecolor') addColor(colors, parseColor(a.content), 'Windows tile colour', 5);
  }
  for (const st of html.matchAll(/<style\b[^>]*>([\s\S]{0,200000}?)<\/style>/gi)) colorsFromCss(st[1], colors, 'Page styles');

  // ---- logos ----
  if (org && org.logo) addLogo(typeof org.logo === 'string' ? org.logo : org.logo.url || org.logo.contentUrl, 'Structured data logo', 100);
  const headerHtml = [].concat(html.match(/<header\b[\s\S]*?<\/header>/i) || [], html.match(/<nav\b[\s\S]*?<\/nav>/i) || []).join('\n');
  tagsOf(headerHtml, 'img').map(parseAttrs).forEach((a, i) => {
    const src = a.src || a['data-src'];
    if (!src || /^data:/i.test(src)) return;
    const looksLikeLogo = /logo|brand|wordmark/i.test([a.class, a.id, a.alt, src].join(' '));
    addLogo(src, looksLikeLogo ? 'Logo in page header' : 'Image in page header', looksLikeLogo ? 90 : 40 - i);
  });
  tagsOf(html, 'img').map(parseAttrs).slice(0, 80).forEach((a) => {
    const src = a.src || a['data-src'];
    if (src && !/^data:/i.test(src) && /logo|wordmark/i.test([a.class, a.id, a.alt, src].join(' '))) addLogo(src, 'Image named “logo”', 70);
  });
  const links = tagsOf(html, 'link').map(parseAttrs);
  links.forEach((a) => {
    const rel = (a.rel || '').toLowerCase();
    if (!a.href) return;
    if (rel.includes('apple-touch-icon')) addLogo(a.href, 'Home-screen icon', 60 + Math.min(largest(a.sizes) / 10, 15));
    else if (rel.includes('mask-icon')) { addLogo(a.href, 'Pinned-tab icon', 20); if (a.color) addColor(colors, parseColor(a.color), 'Pinned-tab icon colour', 6); }
    else if (/(^|\s)icon($|\s)/.test(rel)) addLogo(a.href, 'Favicon', 40 + Math.min(largest(a.sizes) / 10, 15) + (/\.svg(\?|$)/i.test(a.href) ? 5 : 0));
  });
  if (meta('og:image')) addLogo(meta('og:image'), 'Social sharing image', 10);

  // ---- manifest + first stylesheets (same guarded fetch, small caps) ----
  const fetchSide = (url, accept, max) => safeFetch(url, { ...fo, accept, maxBytes: max, truncate: true, timeoutMs: 5000, maxRedirects: 2 }).catch(() => null);
  const manifestHref = (links.find((a) => (a.rel || '').toLowerCase() === 'manifest') || {}).href;
  const sheetHrefs = links.filter((a) => /stylesheet/i.test(a.rel || '') && a.href && !/fonts\.googleapis/i.test(a.href)).slice(0, 3).map((a) => absolute(a.href, base)).filter(Boolean);
  const [mf, ...sheets] = await Promise.all([
    manifestHref && absolute(manifestHref, base) ? fetchSide(absolute(manifestHref, base), 'application/manifest+json,application/json', 100 * 1024) : null,
    ...sheetHrefs.map((u) => fetchSide(u, 'text/css', 400 * 1024)),
  ]);
  if (mf && mf.status < 400) {
    try {
      const j = JSON.parse(mf.body.toString('utf8'));
      addColor(colors, parseColor(j.theme_color), 'Web app theme colour', 8);
      addColor(colors, parseColor(j.background_color), 'Web app background colour', 2);
      if (!org && !meta('og:site_name') && (j.name || j.short_name)) name = String(j.name || j.short_name).slice(0, 60);
      (j.icons || []).forEach((ic) => ic && ic.src && addLogo(new URL(ic.src, mf.url).href, 'Web app icon', 55 + Math.min(largest(ic.sizes) / 10, 15)));
    } catch (e) { notes.push('The site manifest could not be read.'); }
  }
  sheets.forEach((r, i) => { if (r && r.status < 400) colorsFromCss(r.body.toString('utf8'), colors, 'Site stylesheet'); });

  colors.sort((a, b) => (a.neutral - b.neutral) || (b.weight - a.weight));
  logos.sort((a, b) => b.rank - a.rank);
  if (!colors.some((c) => !c.neutral)) notes.push('The site does not publish a brand colour. Upload your logo and we will pick one from it, or choose a colour yourself.');
  if (!logos.length) notes.push('No logo found on the home page. You can upload one.');
  if (page.truncated) notes.push('The page was large, so only the top of it was read.');

  return {
    url: base, name,
    colors: colors.slice(0, 8).map(({ hex, source, neutral }) => ({ hex, source, neutral })),
    logos: logos.slice(0, 6).map(({ url, source }) => ({ url, source })),
    notes,
  };
}

module.exports = { extractBrand, parseColor, parseAttrs };
