const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const dns = require('node:dns');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { safeFetch, isBlockedAddress, validateUrl } = require('../server/lib/safe-fetch');
const { extractBrand } = require('../server/lib/brand');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const close = (srv) => new Promise((r) => srv.close(r));

/* A fake customer website that publishes brand hints. */
function fixtureSite() {
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    const send = (code, type, body, h) => { res.writeHead(code, { 'content-type': type, ...h }); res.end(body); };
    if (u === '/') return send(200, 'text/html', `<!doctype html><html><head>
      <title>Home | Acme Roasters</title>
      <meta name="theme-color" content="#C2410C">
      <meta property="og:image" content="/social.png">
      <link rel="manifest" href="/manifest.json">
      <link rel="stylesheet" href="/site.css">
      <link rel="icon" href="/favicon.svg" sizes="any">
      <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme Roasters","logo":"/logo.png"}</script>
      <style>:root{--brand-primary:#C2410C;--color-bg:#ffffff;--accent:rgb(15,118,110)}</style>
      </head><body><header><a href="/"><img class="site-logo" src="/header-logo.png" alt="Acme"></a></header><!-- <img src="/commented-out-logo.png"> --></body></html>`);
    if (u === '/manifest.json') return send(200, 'application/json', JSON.stringify({ name: 'Acme', theme_color: '#0F766E', background_color: '#FFFFFF', icons: [{ src: '/icon-512.png', sizes: '512x512' }] }));
    if (u === '/site.css') return send(200, 'text/css', ':root{--primary-color:#1D4ED8;--text-primary:#111111;--border-brand:#ff0000}');
    if (u === '/logo.png' || u === '/header-logo.png' || u === '/touch.png') return send(200, 'image/png', PNG);
    if (u === '/favicon.svg') return send(200, 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    if (u === '/notimage.png') return send(200, 'text/html', '<script>alert(1)</script>');
    if (u === '/redirect') return send(302, 'text/plain', '', { location: '/' });
    if (u.startsWith('/loop')) return send(302, 'text/plain', '', { location: '/loop' + Math.random() });
    if (u === '/big') return send(200, 'application/octet-stream', Buffer.alloc(3 * 1024 * 1024, 65));
    if (u === '/bomb') return send(200, 'application/octet-stream', zlib.gzipSync(Buffer.alloc(60 * 1024 * 1024)), { 'content-encoding': 'gzip' });
    if (u === '/slow') return; // never answers
    if (u === '/plain') return send(200, 'application/json', '{}');
    send(404, 'text/plain', 'nope');
  });
  return srv;
}

/* ---------------------------------------------------------------- */
test('blocked address ranges', () => {
  for (const ip of ['127.0.0.1', '127.255.255.254', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0',
    '100.64.0.1', '224.0.0.1', '255.255.255.255', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    '64:ff9b::7f00:1', '2002:7f00:1::1', 'not-an-ip']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '2a00:1450:4009:81f::200e']) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});

test('URL validation rejects dangerous forms', () => {
  const bad = ['file:///etc/passwd', 'ftp://example.com/', 'javascript:alert(1)', 'gopher://x', 'http://user:pw@example.com/', 'http://example.com:6379/',
    'http://127.0.0.1/', 'http://[::1]/', 'http://2130706433/', 'http://0x7f.1/', 'http://017700000001/', 'http://localhost/', 'http://app.localhost/',
    'http://169.254.169.254/latest/meta-data/', 'http://[::ffff:127.0.0.1]/', 'http://metadata.google.internal/', 'http://printer.local/', 'not a url', ''];
  for (const u of bad) assert.throws(() => validateUrl(u, false), (e) => ['bad_url', 'bad_scheme', 'bad_port', 'blocked_address'].includes(e.code), u);
  assert.doesNotThrow(() => validateUrl('https://example.com/path?q=1', false));
  assert.doesNotThrow(() => validateUrl('http://example.com:80/', false));
});

test('connect-time lookup blocks hostnames that resolve to private addresses', async (t) => {
  let resolves = false;
  try { await dns.promises.lookup(os.hostname()); resolves = true; } catch (e) { /* no local name */ }
  if (!resolves) return t.skip('container hostname does not resolve');
  await assert.rejects(() => safeFetch('http://' + os.hostname() + '/'), (e) => ['blocked_address', 'network', 'bad_url'].includes(e.code));
});

test('safeFetch limits: redirects, size, decompression bombs, timeouts', async () => {
  const srv = fixtureSite(); const port = await listen(srv); const base = `http://127.0.0.1:${port}`;
  try {
    const ok = await safeFetch(base + '/redirect', { allowPrivate: true });
    assert.equal(ok.status, 200); assert.match(ok.url, /\/$/);
    await assert.rejects(() => safeFetch(base + '/loop', { allowPrivate: true }), { code: 'too_many_redirects' });
    await assert.rejects(() => safeFetch(base + '/big', { allowPrivate: true, maxBytes: 1024 * 1024 }), { code: 'too_large' });
    const t = await safeFetch(base + '/big', { allowPrivate: true, maxBytes: 1000, truncate: true });
    assert.equal(t.body.length, 1000); assert.equal(t.truncated, true);
    await assert.rejects(() => safeFetch(base + '/bomb', { allowPrivate: true, maxBytes: 1024 * 1024 }), { code: 'too_large' });
    await assert.rejects(() => safeFetch(base + '/slow', { allowPrivate: true, timeoutMs: 300 }), { code: 'timeout' });
    await assert.rejects(() => safeFetch(base + '/', { allowPrivate: false }), (e) => ['bad_port', 'blocked_address'].includes(e.code));
  } finally { srv.closeAllConnections?.(); await close(srv); }
});

test('brand extraction reads name, colours and logos from a site', async () => {
  const srv = fixtureSite(); const port = await listen(srv); const base = `http://127.0.0.1:${port}`;
  try {
    const r = await extractBrand(base + '/', { fetchOpts: { allowPrivate: true } });
    assert.equal(r.name, 'Acme Roasters');
    const hexes = r.colors.map((c) => c.hex);
    assert.equal(hexes[0], '#C2410C', 'theme-color ranks first');
    assert.ok(hexes.includes('#0F766E'), 'manifest theme colour');
    assert.ok(hexes.includes('#1D4ED8'), 'stylesheet brand variable');
    assert.ok(!hexes.includes('#FF0000'), 'border/text variables are ignored');
    const white = r.colors.find((c) => c.hex === '#FFFFFF');
    assert.ok(!white || white.neutral, 'white is flagged neutral');
    assert.equal(r.logos[0].url, base + '/logo.png', 'structured-data logo ranks first');
    assert.ok(r.logos.some((l) => l.url === base + '/header-logo.png'));
    assert.ok(!r.logos.some((l) => /commented-out/.test(l.url)), 'commented-out markup is ignored');
    assert.ok(r.logos.every((l) => /^https?:/.test(l.url)));
  } finally { srv.closeAllConnections?.(); await close(srv); }
});

test('brand extraction refuses non-HTML and private targets', async () => {
  const srv = fixtureSite(); const port = await listen(srv); const base = `http://127.0.0.1:${port}`;
  try {
    await assert.rejects(() => extractBrand(base + '/plain', { fetchOpts: { allowPrivate: true } }), { code: 'not_html' });
    await assert.rejects(() => extractBrand(base + '/', {}), (e) => ['bad_port', 'blocked_address'].includes(e.code));
    await assert.rejects(() => extractBrand('http://169.254.169.254/', {}), { code: 'blocked_address' });
    await assert.rejects(() => extractBrand('', {}), { code: 'bad_url' });
  } finally { srv.closeAllConnections?.(); await close(srv); }
});

