const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createServer } = require('../server/server');
const { makePng, brandSite, listen } = require('./helpers');
const Csv = require('../site/js/csv.js');

const close = (srv) => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); });
async function boot(extra) {
  const dbFile = (extra && extra.dbFile) || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-api-')), 'app.db');
  const app = createServer({ dbFile, allowPrivateFetch: true, ...extra });
  const port = await listen(app);
  return { app, port, dbFile, url: `http://127.0.0.1:${port}`, stop: () => close(app) };
}
/** A browser-like client with its own cookie jar. */
function client(base) {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async call(method, p, body, headers) {
      const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) { const [pair] = c.split(';'); const i = pair.indexOf('='); cookie = pair.slice(i + 1) === '' ? '' : pair; }
      return r;
    },
    get: (p, h) => (cookie, fetch(base + p, { headers: { ...(cookie ? { cookie } : {}), ...h } })),
  };
}
const PW = 'correct horse battery';
async function signup(c, email, pw) { const r = await c.call('POST', '/api/auth/signup', { email: email || 'owner@example.com', password: pw || PW }); return { r, j: await r.json() }; }
const profile = (over) => ({
  company: { name: 'Acme Roasters', website: 'acme.example', industry: 'hospitality', currency: 'USD', timezone: 'America/New_York' },
  locations: ['Downtown', 'Harbour'], targets: { efficiency: 27, dailyRevenue: 8000 },
  brand: { primary: '#C2410C', font: 'inter', mode: 'auto', appName: 'Acme Numbers' }, consent: { brandAuthority: true }, ...over,
});
async function withWorkspace(s, email) { const c = client(s.url); await signup(c, email); const r = await c.call('POST', '/api/tenant', profile()); assert.equal(r.status, 201); return { c, t: await r.json() }; }
const csvFor = (days, locs, extra) => { const L = ['date,location,revenue,orders,labour_cost']; for (let i = 0; i < days; i++) { const d = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10); for (const l of locs) L.push(`${d},${l},${3000 + i * 10},${110 + i},${800 + i}`); } return L.join('\n') + (extra || '') + '\n'; };

/* ------------------------------------------------------------------ accounts */
test('sign up: creates an account, sets a hardened session cookie, returns a one-time recovery code', async () => {
  const s = await boot();
  try {
    const c = client(s.url); const { r, j } = await signup(c);
    assert.equal(r.status, 201);
    assert.match(j.recoveryCode, /^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);
    const cookie = r.headers.getSetCookie()[0];
    assert.match(cookie, /^db_session=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//); assert.ok(!/Secure/.test(cookie));
    const me = await (await c.get('/api/auth/me')).json();
    assert.equal(me.user.email, 'owner@example.com'); assert.equal(me.tenant, null);
    assert.equal((await c.call('POST', '/api/auth/logout', {})).status, 200);
    assert.equal((await (await c.get('/api/auth/me')).json()).user, null);
  } finally { await s.stop(); }
});

test('sign up over HTTPS marks the cookie Secure and host-bound', async () => {
  const s = await boot({ httpsOnlyCookies: true });
  try { const c = client(s.url); const { r } = await signup(c); const ck = r.headers.getSetCookie()[0]; assert.match(ck, /^__Host-db_session=/); assert.match(ck, /; Secure/); } finally { await s.stop(); }
});

test('sign up: validates email and password, and refuses duplicates (case-insensitive)', async () => {
  const s = await boot();
  try {
    const c = client(s.url);
    for (const [email, pw, field] of [['nope', PW, 'email'], ['a@b', PW, 'email'], ['a@example.com', 'short', 'password'], ['a@example.com', 'aaaaaaaaaaaa', 'password'], ['a@example.com', 'password123', 'password'], ['a@example.com', 'x'.repeat(201), 'password']]) {
      const r = await c.call('POST', '/api/auth/signup', { email, password: pw }); assert.equal(r.status, 422, email + pw.slice(0, 5)); assert.equal((await r.json()).error.field, field);
    }
    assert.equal((await signup(client(s.url), 'Owner@Example.com')).r.status, 201);
    assert.equal((await signup(client(s.url), 'owner@example.COM')).r.status, 409);
  } finally { await s.stop(); }
});

test('passwords and session tokens are never stored in the clear', async () => {
  const s = await boot();
  try {
    const c = client(s.url); await signup(c);
    const row = s.app.db.prepare('SELECT * FROM users').get();
    assert.ok(row.pw_hash.startsWith('scrypt$') && !row.pw_hash.includes(PW)); assert.ok(row.recovery_hash.startsWith('scrypt$'));
    const token = c.cookie.split('=')[1];
    assert.ok(!JSON.stringify(s.app.db.prepare('SELECT * FROM sessions').all()).includes(token), 'only a hash of the session token is stored');
  } finally { await s.stop(); }
});

test('login: wrong password and unknown email look the same; lock-out after repeated failures', async () => {
  const s = await boot({ ratePerMinute: 100 });
  try {
    await signup(client(s.url));
    const c = client(s.url);
    const bad = await c.call('POST', '/api/auth/login', { email: 'owner@example.com', password: 'wrong wrong wrong' });
    const ghost = await c.call('POST', '/api/auth/login', { email: 'ghost@example.com', password: 'wrong wrong wrong' });
    assert.equal(bad.status, 401); assert.equal(ghost.status, 401);
    assert.deepEqual(await bad.json(), await ghost.json());
    for (let i = 0; i < 4; i++) await c.call('POST', '/api/auth/login', { email: 'owner@example.com', password: 'wrong wrong wrong' });
    const locked = await c.call('POST', '/api/auth/login', { email: 'owner@example.com', password: PW });
    assert.equal(locked.status, 429, 'even the right password is refused while locked');
  } finally { await s.stop(); }
});

test('login works with the right password and replaces the old session', async () => {
  const s = await boot();
  try {
    const a = client(s.url); await signup(a); await a.call('POST', '/api/auth/logout', {});
    const c = client(s.url); const r = await c.call('POST', '/api/auth/login', { email: ' OWNER@example.com ', password: PW });
    assert.equal(r.status, 200); assert.equal((await (await c.get('/api/auth/me')).json()).user.email, 'owner@example.com');
  } finally { await s.stop(); }
});

test('recovery code resets the password once, ends old sessions and issues a new code', async () => {
  const s = await boot();
  try {
    const c = client(s.url); const { j } = await signup(c);
    const other = client(s.url); await other.call('POST', '/api/auth/login', { email: 'owner@example.com', password: PW });
    const fresh = client(s.url);
    assert.equal((await fresh.call('POST', '/api/auth/recover', { email: 'owner@example.com', recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA', newPassword: 'a brand new password' })).status, 401);
    const r = await fresh.call('POST', '/api/auth/recover', { email: 'owner@example.com', recoveryCode: j.recoveryCode.toLowerCase().replace(/-/g, ' '), newPassword: 'a brand new password' });
    assert.equal(r.status, 200); const j2 = await r.json(); assert.notEqual(j2.recoveryCode, j.recoveryCode);
    assert.equal((await (await other.get('/api/auth/me')).json()).user, null, 'old sessions are signed out');
    assert.equal((await client(s.url).call('POST', '/api/auth/login', { email: 'owner@example.com', password: PW })).status, 401);
    assert.equal((await client(s.url).call('POST', '/api/auth/login', { email: 'owner@example.com', password: 'a brand new password' })).status, 200);
    assert.equal((await client(s.url).call('POST', '/api/auth/recover', { email: 'owner@example.com', recoveryCode: j.recoveryCode, newPassword: 'another new password' })).status, 401, 'a recovery code works once');
  } finally { await s.stop(); }
});

test('change password and new recovery code need the current password', async () => {
  const s = await boot();
  try {
    const c = client(s.url); await signup(c); const other = client(s.url); await other.call('POST', '/api/auth/login', { email: 'owner@example.com', password: PW });
    assert.equal((await c.call('POST', '/api/auth/password', { current: 'nope nope nope', next: 'new password here' })).status, 403);
    assert.equal((await c.call('POST', '/api/auth/password', { current: PW, next: 'short' })).status, 422);
    assert.equal((await c.call('POST', '/api/auth/password', { current: PW, next: 'new password here' })).status, 200);
    assert.equal((await (await other.get('/api/auth/me')).json()).user, null, 'other devices are signed out');
    assert.equal((await (await c.get('/api/auth/me')).json()).user.email, 'owner@example.com', 'this device stays signed in');
    assert.equal((await c.call('POST', '/api/auth/recovery-code', { password: PW })).status, 403);
    assert.match((await (await c.call('POST', '/api/auth/recovery-code', { password: 'new password here' })).json()).recoveryCode, /^[A-Z2-9-]{24}$/);
  } finally { await s.stop(); }
});

test('deleting an account removes the workspace, data and sessions', async () => {
  const s = await boot();
  try {
    const { c } = await withWorkspace(s);
    await c.call('POST', '/api/data/import', { csv: csvFor(5, ['Downtown']), filename: 'a.csv' });
    assert.equal((await c.call('DELETE', '/api/account', { password: 'wrong wrong wrong' })).status, 403);
    assert.equal((await c.call('DELETE', '/api/account', { password: PW })).status, 200);
    for (const t of ['users', 'tenants', 'sales', 'sessions', 'imports']) assert.equal(s.app.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, t);
    assert.equal((await client(s.url).call('POST', '/api/auth/login', { email: 'owner@example.com', password: PW })).status, 401);
  } finally { await s.stop(); }
});

/* ------------------------------------------------------------------ workspace */
test('workspace: needs a session and consent, one per account, editable by its owner', async () => {
  const s = await boot();
  try {
    assert.equal((await client(s.url).call('POST', '/api/tenant', profile())).status, 401);
    assert.equal((await client(s.url).call('GET', '/api/tenant')).status, 401);
    const c = client(s.url); await signup(c);
    const noConsent = profile(); delete noConsent.consent;
    const r1 = await c.call('POST', '/api/tenant', noConsent); assert.equal(r1.status, 422);
    assert.ok((await r1.json()).error.fields.some((f) => f.field === 'consent.brandAuthority'));
    assert.equal((await c.call('POST', '/api/tenant', profile())).status, 201);
    assert.equal((await c.call('POST', '/api/tenant', profile())).status, 409);
    const put = profile({ brand: { primary: '#0F766E', font: 'lora' } });
    const r = await c.call('PUT', '/api/tenant', put); assert.equal(r.status, 200);
    assert.equal((await r.json()).profile.brand.primary, '#0F766E');
    const bad = profile(); bad.brand.primary = 'red;}body{display:none'; assert.equal((await c.call('PUT', '/api/tenant', bad)).status, 422);
  } finally { await s.stop(); }
});

test('tenant isolation: one account can never read or change another account’s workspace or data', async () => {
  const s = await boot();
  try {
    const a = await withWorkspace(s, 'a@example.com'); const b = await withWorkspace(s, 'b@example.com');
    await a.c.call('POST', '/api/data/import', { csv: csvFor(6, ['Downtown', 'Harbour']), filename: 'a.csv' });
    const bData = await (await b.c.get('/api/data/rows')).json(); assert.deepEqual(bData.rows, []);
    assert.equal((await (await b.c.get('/api/data/summary')).json()).data, null);
    assert.equal((await (await a.c.get('/api/data/rows')).json()).rows.length, 12);
    await b.c.call('PUT', '/api/tenant', profile({ company: { name: 'B Company', industry: 'retail', currency: 'EUR', timezone: 'UTC' } }));
    assert.equal((await (await a.c.get('/api/tenant')).json()).profile.company.name, 'Acme Roasters');
    assert.notEqual(a.t.id, b.t.id);
    // the workspace id in a request is never trusted: there is no endpoint that takes one for reading private data
    assert.equal((await b.c.get('/api/tenant/' + a.t.id)).status, 404);
    assert.equal((await b.c.call('DELETE', '/api/data')).status, 200);
    assert.equal((await (await a.c.get('/api/data/rows')).json()).rows.length, 12, 'B deleting its data leaves A untouched');
  } finally { await s.stop(); }
});

/* ------------------------------------------------------------------ data */
test('data import: stores rows, sets locations, exports, and replaces or merges', async () => {
  const s = await boot();
  try {
    const { c } = await withWorkspace(s);
    const r = await c.call('POST', '/api/data/import', { csv: csvFor(10, ['Downtown', 'Harbour', 'Airport']), filename: 'oct.csv' });
    assert.equal(r.status, 200); const j = await r.json();
    assert.equal(j.data.rows, 30); assert.equal(j.data.from, '2026-10-01'); assert.equal(j.data.to, '2026-10-10');
    assert.deepEqual(j.data.locations, ['Airport', 'Downtown', 'Harbour']); assert.equal(j.data.hasVolume, true); assert.equal(j.data.hasEff, true);
    assert.deepEqual(j.newLocations.sort(), ['Airport']);
    const me = await (await c.get('/api/auth/me')).json();
    assert.deepEqual(me.tenant.profile.locations, ['Airport', 'Downtown', 'Harbour'], 'locations now follow the data');
    const rows = await (await c.get('/api/data/rows', { 'accept-encoding': 'gzip' })).json(); assert.equal(rows.rows.length, 30); assert.equal(rows.rows[0].length, 5);
    const exp = await (await c.get('/api/data/export.csv')).text(); assert.match(exp, /^date,location,revenue,volume,efficiency_pct\n2026-10-01,Airport,3000,110,/); assert.equal(exp.trim().split('\n').length, 31);
    // merge keeps old rows and adds new ones
    const m = await (await c.call('POST', '/api/data/import', { csv: 'date,location,revenue\n2026-10-11,Downtown,4000\n2026-10-10,Downtown,9999\n', mode: 'merge' })).json();
    assert.equal(m.data.rows, 31); assert.equal(m.data.to, '2026-10-11');
    const after = (await (await c.get('/api/data/rows')).json()).rows.find((x) => x[0] === '2026-10-10' && x[1] === 'Downtown'); assert.equal(after[2], 9999, 'merge overwrites the same day and location');
    // replace discards everything else
    const rep = await (await c.call('POST', '/api/data/import', { csv: csvFor(3, ['Only']), mode: 'replace' })).json(); assert.equal(rep.data.rows, 3); assert.deepEqual(rep.data.locations, ['Only']);
    assert.equal((await c.call('DELETE', '/api/data')).status, 200);
    assert.equal((await (await c.get('/api/data/summary')).json()).data, null);
  } finally { await s.stop(); }
});

test('data import: bad files are rejected with line numbers and change nothing', async () => {
  const s = await boot();
  try {
    const { c } = await withWorkspace(s);
    await c.call('POST', '/api/data/import', { csv: csvFor(4, ['Downtown']) });
    const r = await c.call('POST', '/api/data/import', { csv: 'date,revenue\n2026-10-01,100\nyesterday,200\n2026-10-03,abc\n', mode: 'replace' });
    assert.equal(r.status, 422); const e = (await r.json()).error;
    assert.deepEqual(e.errors.map((x) => x.line), [3, 4]);
    assert.equal((await (await c.get('/api/data/summary')).json()).data.rows, 4, 'the earlier data is untouched');
    const amb = await c.call('POST', '/api/data/import', { csv: 'date,revenue\n03/04/2026,100\n', mode: 'replace' });
    assert.equal(amb.status, 422); assert.equal((await amb.json()).error.ambiguousDates, true);
    const ok = await c.call('POST', '/api/data/import', { csv: 'date,revenue\n03/04/2026,100\n', mode: 'replace', dateOrder: 'dmy' }); assert.equal(ok.status, 200);
    assert.equal((await (await c.get('/api/data/rows')).json()).rows[0][0], '2026-04-03');
    const many = Array.from({ length: 13 }, (_, i) => `2026-10-01,L${i},10`).join('\n');
    assert.equal((await c.call('POST', '/api/data/import', { csv: 'date,location,revenue\n' + many + '\n', mode: 'replace' })).status, 422, 'more than 12 locations');
    assert.equal((await c.call('POST', '/api/data/import', { csv: 'x'.repeat(7 * 1024 * 1024) })).status, 413);
    assert.equal((await client(s.url).call('POST', '/api/data/import', { csv: csvFor(2, ['A']) })).status, 401);
  } finally { await s.stop(); }
});

test('data import: services workspaces read utilisation, not labour', async () => {
  const s = await boot();
  try {
    const c = client(s.url); await signup(c);
    await c.call('POST', '/api/tenant', profile({ company: { name: 'Fix It', industry: 'services', currency: 'AUD', timezone: 'Australia/Sydney' }, targets: { efficiency: 72, dailyRevenue: 6000 } }));
    const r = await c.call('POST', '/api/data/import', { csv: 'date,site,revenue,jobs,utilisation %\n2026-10-01,North,4200,9,71.5\n2026-10-01,North,300,1,70\n' });
    assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.data.rows, 1, 'same day and site are combined');
    const row = (await (await c.get('/api/data/rows')).json()).rows[0]; assert.deepEqual([row[2], row[3]], [4500, 10]); assert.ok(Math.abs(row[4] - 71.4) < 0.1, 'utilisation is revenue-weighted: ' + row[4]);
  } finally { await s.stop(); }
});

/* ------------------------------------------------------------------ CSRF and robustness */
test('cross-site writes are refused; same-origin and non-browser writes work', async () => {
  const s = await boot();
  try {
    const c = client(s.url); await signup(c);
    assert.equal((await c.call('POST', '/api/tenant', profile(), { origin: 'https://evil.example' })).status, 403);
    assert.equal((await c.call('POST', '/api/tenant', profile(), { origin: 'null' })).status, 403);
    assert.equal((await c.call('POST', '/api/tenant', profile(), { origin: s.url })).status, 201);
    assert.equal((await c.call('DELETE', '/api/data', undefined, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await fetch(s.url + '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'text/plain', cookie: c.cookie }, body: '{}' })).status, 200, 'logout is harmless and needs no body type');
    assert.equal((await fetch(s.url + '/api/tenant', { method: 'PUT', headers: { 'content-type': 'text/plain', cookie: c.cookie }, body: '{}' })).status, 401, 'after logout the cookie is dead');
  } finally { await s.stop(); }
});

test('malformed requests get clean errors', async () => {
  const s = await boot();
  try {
    const c = client(s.url);
    assert.equal((await fetch(s.url + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await fetch(s.url + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' })).status, 400);
    assert.equal((await fetch(s.url + '/api/nope')).status, 404);
    assert.equal((await fetch(s.url + '/api/auth/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 405);
    assert.equal((await c.get('/api/data/rows', { cookie: 'db_session=' + 'x'.repeat(500) })).status, 401);
  } finally { await s.stop(); }
});

test('everything survives a restart', async () => {
  const s = await boot(); let c;
  try { ({ c } = await withWorkspace(s)); await c.call('POST', '/api/data/import', { csv: csvFor(5, ['Downtown']) }); } finally { await s.stop(); }
  const s2 = await boot({ dbFile: s.dbFile });
  try {
    const r = await fetch(s2.url + '/api/auth/me', { headers: { cookie: c.cookie } }); const j = await r.json();
    assert.equal(j.user.email, 'owner@example.com', 'the session cookie still works'); assert.equal(j.tenant.data.rows, 5);
    assert.equal((await client(s2.url).call('POST', '/api/auth/login', { email: 'owner@example.com', password: PW })).status, 200);
  } finally { await s2.stop(); }
});

/* ------------------------------------------------------------------ installable app */
test('installable app: per-customer manifest and icons, public by unguessable id', async () => {
  const s = await boot();
  try {
    const { c, t } = await withWorkspace(s);
    const m = await (await fetch(s.url + '/api/public/manifest/' + t.id)).json();
    assert.equal(m.name, 'Acme Numbers'); assert.equal(m.display, 'standalone'); assert.equal(m.start_url, '/app.html'); assert.match(m.theme_color, /^#[0-9A-F]{6}$/);
    assert.match(m.icons[0].src, /\/assets\/icon-192\.png$/, 'falls back to the platform icon until the customer has one');
    assert.equal((await fetch(s.url + '/api/public/icon/' + t.id + '/192.png')).status, 404);
    const png = (n) => 'data:image/png;base64,' + makePng(n, n, () => [194, 65, 12, 255]).toString('base64');
    const p = profile(); p.brand.icon192 = png(192); p.brand.icon512 = png(512);
    assert.equal((await c.call('PUT', '/api/tenant', p)).status, 200);
    const m2 = await (await fetch(s.url + '/api/public/manifest/' + t.id)).json();
    assert.equal(m2.icons[1].src, `/api/public/icon/${t.id}/512.png`);
    const icon = await fetch(s.url + m2.icons[0].src); assert.equal(icon.status, 200); assert.equal(icon.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await icon.arrayBuffer()); assert.equal(bytes.readUInt32BE(16), 192);
    const wrong = profile(); wrong.brand.icon192 = png(512); wrong.brand.icon512 = png(512);
    assert.equal((await c.call('PUT', '/api/tenant', wrong)).status, 422, 'icons must be the stated size');
    assert.equal((await fetch(s.url + '/api/public/manifest/not-a-real-id-xxxx')).status, 404);
  } finally { await s.stop(); }
});

/* ------------------------------------------------------------------ brand discovery + static (unchanged behaviour) */
test('brand discovery works before an account exists and respects production-mode limits', async () => {
  const site = brandSite({ name: 'Acme Roasters', color: '#C2410C' }); const sp = await listen(site);
  const s = await boot();
  try {
    const r = await new Promise((resolve) => { const req = http.request({ host: '127.0.0.1', port: s.port, path: '/api/brand/extract', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(b) })); }); req.end(JSON.stringify({ url: `http://127.0.0.1:${sp}/` })); });
    assert.equal(r.status, 200); assert.equal(r.json.name, 'Acme Roasters'); assert.equal(r.json.colors[0].hex, '#C2410C');
    const img = await fetch(s.url + r.json.logos[0].proxy); assert.equal(img.status, 200); assert.match(img.headers.get('content-security-policy'), /sandbox/);
  } finally { await s.stop(); site.closeAllConnections?.(); await close(site); }
  const prod = await boot({ allowPrivateFetch: false });
  try {
    for (const target of [`http://127.0.0.1:${sp}/`, 'http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'http://[::1]/', 'http://10.0.0.1/']) {
      const r = await fetch(prod.url + '/api/brand/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: target }) });
      assert.equal(r.status, 422, target); assert.match((await r.json()).error.code, /blocked_address|bad_port/, target);
    }
  } finally { await prod.stop(); }
});

test('rate limiting on the brand endpoints', async () => {
  const s = await boot({ ratePerMinute: 3 });
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await fetch(s.url + '/api/brand/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://169.254.169.254/' }) })).status);
    assert.deepEqual(codes, [422, 422, 422, 429, 429]);
  } finally { await s.stop(); }
});

test('static files: security headers, no traversal, no dotfiles, service worker served from the root', async () => {
  const s = await boot();
  try {
    const home = await fetch(s.url + '/');
    assert.equal(home.status, 200); assert.match(home.headers.get('content-security-policy'), /default-src 'self'/); assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal((await fetch(s.url + '/js/theme.js')).status, 200);
    const sw = await fetch(s.url + '/sw.js'); assert.equal(sw.status, 200); assert.match(sw.headers.get('content-type'), /javascript/); assert.equal(sw.headers.get('cache-control'), 'no-cache');
    for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/package.json', '/..%5c..%5cpackage.json', '/js/%00.js', '/.git/config', '/%2egit/config', '/js/../../server/server.js']) {
      const r = await fetch(s.url + p); assert.ok([400, 403, 404].includes(r.status), `${p} -> ${r.status}`); assert.ok(!(await r.text()).includes('createServer'), p);
    }
    const raw = await new Promise((resolve) => { const req = http.request({ host: '127.0.0.1', port: s.port, path: '/../package.json', method: 'GET' }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(b)); }); req.end(); });
    assert.ok(!raw.includes('dashboards-business'));
  } finally { await s.stop(); }
});

test('csv parser: formats, ambiguity and combining', () => {
  const ok = (csv, o) => Csv.parseSales(csv, { industry: 'hospitality', today: '2026-12-01', ...o });
  const eu = ok('Date;Site;Net Sales;Transactions;Labour %\n07/11/2026;A;1.234,50;40;28,5\n08/11/2026;A;900,00;30;31\n', { dateOrder: 'dmy' });
  assert.ok(eu.ok, JSON.stringify(eu.errors)); assert.equal(eu.rows[0].revenue, 1234.5); assert.equal(eu.rows[0].eff, 28.5); assert.equal(eu.rows[0].date, '2026-11-07');
  assert.equal(ok('date,revenue\n13/01/2026,5\n02/01/2026,6\n').rows[0].date, '2026-01-02', 'a day above 12 settles the order for the whole file');
  assert.ok(!ok('date,revenue\n13/01/2026,5\n01/13/2026,6\n').ok, 'mixed orders are refused');
  assert.ok(!ok('date,revenue\n2027-06-01,5\n').ok, 'future dates are refused');
  assert.ok(!ok('').ok && !ok('a,b\n1,2\n').ok && !ok('date,revenue\n').ok);
  const fr = ok('date,revenue,labour_pct\n2026-11-01,100,0.28\n'); assert.equal(fr.rows[0].eff, 28); assert.ok(fr.warnings.some((w) => /fractions/.test(w)));
  const dup = ok('date,location,revenue,labour_cost\n2026-11-01,A,100,30\n2026-11-01,a,100,20\n'); assert.equal(dup.rows.length, 1); assert.equal(dup.rows[0].eff, 25);
  assert.ok(Csv.parseSales(Csv.template('services'), { industry: 'services', today: '2026-02-01' }).ok);
  assert.ok(!ok('date,revenue\n2026-11-01,"unclosed\n').ok);
  assert.ok(ok('﻿date,revenue\r\n2026-11-01,5\r\n').ok, 'BOM and Windows line endings');
});

test('export never hands back a spreadsheet formula', async () => {
  const s = await boot();
  try {
    const { c } = await withWorkspace(s);
    const r = await c.call('POST', '/api/data/import', { csv: 'date,location,revenue\n2026-10-01,=HYPERLINK("http://evil.example"),100\n2026-10-01,@SUM(1+1),50\n2026-10-01,+cmd,25\n', mode: 'replace' });
    assert.equal(r.status, 200);
    const exp = await (await c.get('/api/data/export.csv')).text();
    for (const line of exp.trim().split('\n').slice(1)) assert.ok(!/^[^,]*,["]?[=+@-]/.test(line), 'location cell must not start with a formula character: ' + line);
    assert.match(exp, /'=HYPERLINK/);
  } finally { await s.stop(); }
});

test('the database file is private to the server user', async () => {
  const s = await boot();
  try { const mode = fs.statSync(s.dbFile).mode & 0o777; assert.equal(mode & 0o077, 0, 'group and others get no access, got ' + mode.toString(8)); } finally { await s.stop(); }
});
