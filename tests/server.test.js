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
const { createServer } = require('../server/server');

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

/* ---------------------------------------------------------------- */
async function boot(extra) {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-')), 'tenants.json');
  const app = createServer({ dataFile, allowPrivateFetch: true, ...extra });
  const port = await listen(app);
  return { app, port, dataFile, url: `http://127.0.0.1:${port}`, stop: async () => { app.closeAllConnections?.(); await close(app); } };
}
const J = (url, method, body, headers) => fetch(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const goodBody = () => ({
  company: { name: 'Acme Roasters', website: 'acme.example', industry: 'hospitality', currency: 'USD', timezone: 'America/New_York' },
  locations: ['Downtown', 'Harbour'], targets: { efficiency: 27, dailyRevenue: 8000 },
  brand: { primary: '#C2410C', font: 'inter', mode: 'auto', appName: 'Acme Numbers' }, consent: { brandAuthority: true },
});

test('API: create, read, update with edit key', async () => {
  const s = await boot();
  try {
    const c = await J(s.url + '/api/tenants', 'POST', goodBody());
    assert.equal(c.status, 201);
    const created = await c.json();
    assert.ok(created.id && created.token && created.token.length >= 30);
    const g = await (await fetch(s.url + '/api/tenants/' + created.id)).json();
    assert.equal(g.profile.company.name, 'Acme Roasters');
    assert.ok(!JSON.stringify(g).includes(created.token), 'token is never returned on read');
    assert.ok(!fs.readFileSync(s.dataFile, 'utf8').includes(created.token), 'token is stored hashed, never in clear');

    const upd = { ...goodBody(), brand: { primary: '#0F766E', font: 'lora' } };
    assert.equal((await J(s.url + '/api/tenants/' + created.id, 'PUT', upd)).status, 403, 'no key');
    assert.equal((await J(s.url + '/api/tenants/' + created.id, 'PUT', upd, { authorization: 'Bearer wrong' })).status, 403, 'wrong key');
    const ok = await J(s.url + '/api/tenants/' + created.id, 'PUT', upd, { authorization: 'Bearer ' + created.token });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).profile.brand.primary, '#0F766E');
  } finally { await s.stop(); }
});

test('API: tenants survive a restart', async () => {
  const s = await boot();
  const c = await (await J(s.url + '/api/tenants', 'POST', goodBody())).json();
  await s.stop();
  const app2 = createServer({ dataFile: s.dataFile }); const p2 = await listen(app2);
  try {
    const r = await fetch(`http://127.0.0.1:${p2}/api/tenants/${c.id}`);
    assert.equal(r.status, 200);
  } finally { app2.closeAllConnections?.(); await close(app2); }
});

test('API: validation, consent, content type, size', async () => {
  const s = await boot();
  try {
    const noConsent = goodBody(); delete noConsent.consent;
    const r1 = await J(s.url + '/api/tenants', 'POST', noConsent);
    assert.equal(r1.status, 422);
    assert.ok((await r1.json()).error.fields.some((f) => f.field === 'consent.brandAuthority'));
    const bad = goodBody(); bad.brand.primary = 'red;}body{display:none'; bad.company.industry = 'crypto';
    assert.equal((await J(s.url + '/api/tenants', 'POST', bad)).status, 422);
    assert.equal((await fetch(s.url + '/api/tenants', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await fetch(s.url + '/api/tenants', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' })).status, 400);
    const huge = goodBody(); huge.padding = 'x'.repeat(500 * 1024);
    assert.equal((await J(s.url + '/api/tenants', 'POST', huge)).status, 413);
    assert.equal((await fetch(s.url + '/api/tenants/does-not-exist-123')).status, 404);
    assert.equal((await fetch(s.url + '/api/tenants/..%2f..%2fetc')).status, 404);
  } finally { await s.stop(); }
});

test('API: stored text is neutralised before it can reach a page', async () => {
  const s = await boot();
  try {
    const b = goodBody(); b.company.name = '<script>alert(1)</script>Acme'; b.brand.appName = '"><img src=x onerror=alert(1)>';
    const c = await (await J(s.url + '/api/tenants', 'POST', b)).json();
    const stored = JSON.stringify(c.profile);
    assert.ok(!/[<>]/.test(stored.replace(/"logo":null/, '')), stored);
  } finally { await s.stop(); }
});

test('API: brand extraction and guarded image proxy', async () => {
  const site = fixtureSite(); const sp = await listen(site); const base = `http://127.0.0.1:${sp}`;
  const s = await boot();
  try {
    const r = await J(s.url + '/api/brand/extract', 'POST', { url: base + '/' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.name, 'Acme Roasters');
    assert.ok(j.logos[0].proxy.startsWith('/api/brand/image?url='));
    const img = await fetch(s.url + j.logos[0].proxy);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.match(img.headers.get('content-security-policy'), /sandbox/);
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(s.url + '/api/brand/image?url=' + encodeURIComponent(base + '/notimage.png'))).status, 415);
    assert.equal((await fetch(s.url + '/api/brand/image?url=' + encodeURIComponent('file:///etc/passwd'))).status, 422);
  } finally { await s.stop(); site.closeAllConnections?.(); await close(site); }
});

test('API: production mode (no private fetch) refuses internal targets', async () => {
  const site = fixtureSite(); const sp = await listen(site);
  const s = await boot({ allowPrivateFetch: false });
  try {
    for (const target of [`http://127.0.0.1:${sp}/`, 'http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'http://[::1]/', 'http://10.0.0.1/']) {
      const r = await J(s.url + '/api/brand/extract', 'POST', { url: target });
      assert.equal(r.status, 422, target);
      assert.match((await r.json()).error.code, /blocked_address|bad_port/, target);
    }
    assert.equal((await fetch(s.url + '/api/brand/image?url=' + encodeURIComponent('http://169.254.169.254/'))).status, 422);
  } finally { await s.stop(); site.closeAllConnections?.(); await close(site); }
});

test('API: rate limiting on the fetch endpoints', async () => {
  const s = await boot({ ratePerMinute: 3 });
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await J(s.url + '/api/brand/extract', 'POST', { url: 'http://169.254.169.254/' })).status);
    assert.deepEqual(codes, [422, 422, 422, 429, 429]);
  } finally { await s.stop(); }
});

test('static files: served with security headers, no traversal, no dotfiles', async () => {
  const s = await boot();
  try {
    const home = await fetch(s.url + '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal((await fetch(s.url + '/js/theme.js')).status, 200);
    for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/package.json', '/..%5c..%5cpackage.json', '/js/%00.js', '/.git/config', '/%2egit/config', '/js/../../server/server.js']) {
      const r = await fetch(s.url + p);
      assert.ok([400, 403, 404].includes(r.status), `${p} -> ${r.status}`);
      assert.ok(!(await r.text()).includes('createServer'), p);
    }
    const raw = await new Promise((resolve) => { // un-normalised path via raw socket
      const req = http.request({ host: '127.0.0.1', port: s.port, path: '/../package.json', method: 'GET' }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
      req.end();
    });
    assert.ok(!raw.body.includes('dashboards-business'), 'raw ../ path must not escape the site folder');
  } finally { await s.stop(); }
});
