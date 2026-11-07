'use strict';
/*
 * dashboards.business server: static site + JSON API. No dependencies. Node 22.13+ (uses built-in SQLite).
 *
 *   Accounts   POST /api/auth/signup | login | logout | recover | password | recovery-code, GET /api/auth/me, DELETE /api/account
 *   Workspace  POST/GET/PUT /api/tenant
 *   Data       GET /api/data/summary | rows | export.csv, POST /api/data/import, DELETE /api/data
 *   Brand      POST /api/brand/extract, GET /api/brand/image?url=
 *   App        GET /api/public/manifest/:id, GET /api/public/icon/:id/:size.png  (installable, per customer)
 *
 * NOT built: email (so no emailed password resets), billing, per-customer domains, team members.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { openDb, tx } = require('./lib/db');
const A = require('./lib/auth');
const { safeFetch, FetchError } = require('./lib/safe-fetch');
const { extractBrand } = require('./lib/brand');
const { sanitizeProfile } = require('../site/js/profile.js');
const Csv = require('../site/js/csv.js');
const Theme = require('../site/js/theme.js');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};
const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon|avif)$/i;
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'", "manifest-src 'self'", "worker-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
const SECURITY = {
  'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
const HttpError = (status, code, message, extra) => Object.assign(new Error(message), { status, code, extra });

function createServer(options) {
  const o = Object.assign({
    dbFile: path.join(__dirname, '..', 'data', 'app.db'), siteDir: path.join(__dirname, '..', 'site'),
    allowPrivateFetch: false, trustProxy: false, ratePerMinute: 20, httpsOnlyCookies: false,
  }, options);
  const db = openDb(o.dbFile);
  const siteRoot = path.resolve(o.siteDir);
  const hits = new Map();

  /* ---------- plumbing ---------- */
  const clientIp = (req) => (o.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress);
  const secure = (req) => o.httpsOnlyCookies || !!req.socket.encrypted || (o.trustProxy && req.headers['x-forwarded-proto'] === 'https');
  const cookieName = (req) => (secure(req) ? '__Host-db_session' : 'db_session');
  function limited(req, bucket, max) {
    const key = bucket + ':' + clientIp(req), now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + 60000 }; hits.set(key, h); }
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return ++h.n > max;
  }
  const tooMany = () => HttpError(429, 'rate_limited', 'Too many attempts. Try again in a minute.');

  function send(res, status, body, headers) {
    const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
    res.writeHead(status, { ...SECURITY, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(isObj ? JSON.stringify(body) : body);
  }
  function readJson(req, max) {
    return new Promise((resolve, reject) => {
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return reject(HttpError(415, 'unsupported_media_type', 'Send JSON.'));
      let size = 0, over = false; const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > max * 4) return req.destroy();
        if (size > max) { if (!over) { over = true; reject(HttpError(413, 'too_large', 'That is too large to upload.')); } return; }
        chunks.push(c);
      });
      req.on('end', () => { if (over) return; try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); resolve(j && typeof j === 'object' ? j : {}); } catch (e) { reject(HttpError(400, 'bad_json', 'That is not valid JSON.')); } });
      req.on('error', reject);
    });
  }
  const cookieToken = (req) => {
    const want = cookieName(req);
    for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === want) { try { return decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { return null; } } }
    return null;
  };
  const setCookie = (req, token, maxAge) => `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;
  const sessionUser = (req) => A.sessionUser(db, cookieToken(req));
  const requireUser = (req) => { const u = sessionUser(req); if (!u) throw HttpError(401, 'unauthenticated', 'Please log in.'); return u; };
  const tenantOf = (userId) => { const t = db.prepare('SELECT id, profile, created_at, updated_at FROM tenants WHERE owner_id = ?').get(userId); return t ? { id: t.id, profile: JSON.parse(t.profile), updatedAt: t.updated_at } : null; };
  const requireTenant = (req) => { const u = requireUser(req); const t = tenantOf(u.id); if (!t) throw HttpError(404, 'no_workspace', 'Create your workspace first.'); return { user: u, tenant: t }; };

  function dataSummary(tenantId) {
    const s = db.prepare('SELECT COUNT(*) AS n, MIN(date) AS a, MAX(date) AS b FROM sales WHERE tenant_id = ?').get(tenantId);
    if (!s.n) return null;
    const locations = db.prepare('SELECT DISTINCT location FROM sales WHERE tenant_id = ? ORDER BY location').all(tenantId).map((r) => r.location);
    const last = db.prepare('SELECT filename, created_at FROM imports WHERE tenant_id = ? ORDER BY id DESC LIMIT 1').get(tenantId);
    const flags = db.prepare('SELECT SUM(volume IS NOT NULL) AS v, SUM(eff IS NOT NULL) AS e FROM sales WHERE tenant_id = ?').get(tenantId);
    return { rows: s.n, from: s.a, to: s.b, locations, hasVolume: flags.v > 0, hasEff: flags.e > 0, lastImport: last ? { filename: last.filename, at: last.created_at } : null };
  }

  /* ---------- accounts ---------- */
  async function lockCheck(user) { if (user && user.locked_until > Date.now()) throw HttpError(429, 'locked', 'Too many wrong attempts. Try again in a few minutes.'); }
  function noteFailure(user) {
    if (!user) return;
    const failed = user.failed + 1;
    if (failed >= A.LOCK_AFTER) db.prepare('UPDATE users SET failed = 0, locked_until = ? WHERE id = ?').run(Date.now() + A.LOCK_MS, user.id);
    else db.prepare('UPDATE users SET failed = ? WHERE id = ?').run(failed, user.id);
  }

  async function auth(req, res, p) {
    if (p === '/api/auth/me' && req.method === 'GET') {
      const u = sessionUser(req);
      if (!u) return send(res, 200, { user: null, tenant: null });
      const t = tenantOf(u.id);
      return send(res, 200, { user: { email: u.email }, tenant: t ? { id: t.id, profile: t.profile, data: dataSummary(t.id) } : null });
    }
    if (p === '/api/auth/me') throw HttpError(405, 'method_not_allowed', 'Method not allowed.');
    const SENSITIVE = { '/api/auth/password': 'POST', '/api/auth/recovery-code': 'POST', '/api/account': 'DELETE' };
    const PUBLIC_POSTS = ['/api/auth/signup', '/api/auth/login', '/api/auth/logout', '/api/auth/recover'];
    if (!(p in SENSITIVE) && !PUBLIC_POSTS.includes(p)) throw HttpError(404, 'not_found', 'No such endpoint.');
    if (req.method !== (SENSITIVE[p] || 'POST')) throw HttpError(405, 'method_not_allowed', 'Method not allowed.');

    if (p === '/api/auth/signup') {
      if (limited(req, 'signup', 8)) throw tooMany();
      const b = await readJson(req, 4096);
      const email = A.normaliseEmail(b.email);
      if (!email) throw HttpError(422, 'invalid', 'Enter a valid email address.', { field: 'email' });
      const problem = A.passwordProblem(b.password, email);
      if (problem) throw HttpError(422, 'invalid', problem, { field: 'password' });
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw HttpError(409, 'email_taken', 'An account with that email already exists. Log in instead.', { field: 'email' });
      const code = A.newRecoveryCode();
      const [pw, rec] = await Promise.all([A.hashSecret(b.password), A.hashSecret(A.recoveryDigest(code))]);
      const id = A.newId();
      try { db.prepare('INSERT INTO users (id, email, pw_hash, recovery_hash, created_at) VALUES (?,?,?,?,?)').run(id, email, pw, rec, new Date().toISOString()); }
      catch (e) { throw HttpError(409, 'email_taken', 'An account with that email already exists. Log in instead.', { field: 'email' }); }
      const s = A.createSession(db, id);
      return send(res, 201, { user: { email }, recoveryCode: code }, { 'set-cookie': setCookie(req, s.token, s.maxAge) });
    }

    if (p === '/api/auth/login') {
      if (limited(req, 'login', 12)) throw tooMany();
      const b = await readJson(req, 4096);
      const email = A.normaliseEmail(b.email);
      const user = email ? db.prepare('SELECT * FROM users WHERE email = ?').get(email) : null;
      await lockCheck(user);
      const ok = await A.verifySecret(String(b.password || '').slice(0, 200), user ? user.pw_hash : await A.dummyHash());
      if (!user || !ok) { noteFailure(user); throw HttpError(401, 'bad_credentials', 'That email and password do not match.'); }
      db.prepare('UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?').run(user.id);
      const old = cookieToken(req); if (old) A.endSession(db, old);
      const s = A.createSession(db, user.id);
      return send(res, 200, { user: { email: user.email } }, { 'set-cookie': setCookie(req, s.token, s.maxAge) });
    }

    if (p === '/api/auth/logout') {
      const t = cookieToken(req); if (t) A.endSession(db, t);
      return send(res, 200, { ok: true }, { 'set-cookie': setCookie(req, '', 0) });
    }

    if (p === '/api/auth/recover') {
      if (limited(req, 'recover', 6)) throw tooMany();
      const b = await readJson(req, 4096);
      const email = A.normaliseEmail(b.email);
      const user = email ? db.prepare('SELECT * FROM users WHERE email = ?').get(email) : null;
      await lockCheck(user);
      const ok = await A.verifySecret(A.recoveryDigest(b.recoveryCode).slice(0, 64), user ? user.recovery_hash : await A.dummyHash());
      if (!user || !ok) { noteFailure(user); throw HttpError(401, 'bad_recovery', 'That email and recovery code do not match.'); }
      const problem = A.passwordProblem(b.newPassword, email);
      if (problem) throw HttpError(422, 'invalid', problem, { field: 'newPassword' });
      const code = A.newRecoveryCode();
      const [pw, rec] = await Promise.all([A.hashSecret(b.newPassword), A.hashSecret(A.recoveryDigest(code))]);
      db.prepare('UPDATE users SET pw_hash = ?, recovery_hash = ?, failed = 0, locked_until = 0 WHERE id = ?').run(pw, rec, user.id);
      A.endAllSessions(db, user.id, null);
      const s = A.createSession(db, user.id);
      return send(res, 200, { recoveryCode: code }, { 'set-cookie': setCookie(req, s.token, s.maxAge) });
    }

    // everything below needs a session and the current password
    const u = requireUser(req);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
    if (limited(req, 'sensitive', 10)) throw tooMany();
    const b = await readJson(req, 4096);
    await lockCheck(row);
    const pwOk = await A.verifySecret(String(b.password || b.current || '').slice(0, 200), row.pw_hash);
    if (!pwOk) { noteFailure(row); throw HttpError(403, 'bad_password', 'That password is not right.', { field: 'password' }); }

    if (p === '/api/auth/password') {
      const problem = A.passwordProblem(b.next, row.email);
      if (problem) throw HttpError(422, 'invalid', problem, { field: 'next' });
      db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(await A.hashSecret(b.next), u.id);
      A.endAllSessions(db, u.id, cookieToken(req));
      return send(res, 200, { ok: true });
    }
    if (p === '/api/auth/recovery-code') {
      const code = A.newRecoveryCode();
      db.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').run(await A.hashSecret(A.recoveryDigest(code)), u.id);
      return send(res, 200, { recoveryCode: code });
    }
    if (p === '/api/account') {
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id); // cascades to workspace, data and sessions
      return send(res, 200, { ok: true }, { 'set-cookie': setCookie(req, '', 0) });
    }
    throw HttpError(404, 'not_found', 'No such endpoint.');
  }

  /* ---------- workspace + data ---------- */
  async function workspace(req, res, p) {
    if (req.method === 'POST') {
      const u = requireUser(req);
      if (limited(req, 'create', 10)) throw tooMany();
      if (tenantOf(u.id)) throw HttpError(409, 'exists', 'You already have a workspace.');
      const r = sanitizeProfile(await readJson(req, 700 * 1024), { requireConsent: true });
      if (!r.ok) throw HttpError(422, 'invalid_profile', 'Some details need fixing.', { fields: r.errors });
      r.profile.consent = { brandAuthority: true, at: new Date().toISOString() };
      const id = A.newId(), now = new Date().toISOString();
      db.prepare('INSERT INTO tenants (id, owner_id, profile, created_at, updated_at) VALUES (?,?,?,?,?)').run(id, u.id, JSON.stringify(r.profile), now, now);
      return send(res, 201, { id, profile: r.profile });
    }
    const { tenant } = requireTenant(req);
    if (req.method === 'GET') return send(res, 200, { id: tenant.id, profile: tenant.profile, data: dataSummary(tenant.id) });
    if (req.method === 'PUT') {
      const r = sanitizeProfile(await readJson(req, 700 * 1024), {});
      if (!r.ok) throw HttpError(422, 'invalid_profile', 'Some details need fixing.', { fields: r.errors });
      r.profile.consent = tenant.profile.consent;
      const now = new Date().toISOString();
      db.prepare('UPDATE tenants SET profile = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(r.profile), now, tenant.id);
      return send(res, 200, { id: tenant.id, profile: r.profile, data: dataSummary(tenant.id) });
    }
    throw HttpError(405, 'method_not_allowed', 'Method not allowed.');
  }

  async function data(req, res, p, url, acceptsGzip) {
    const { tenant } = requireTenant(req);
    if (p === '/api/data/summary' && req.method === 'GET') return send(res, 200, { data: dataSummary(tenant.id) });
    if (p === '/api/data/rows' && req.method === 'GET') {
      const rows = db.prepare('SELECT date, location, revenue, volume, eff FROM sales WHERE tenant_id = ? ORDER BY date, location').all(tenant.id).map((r) => [r.date, r.location, r.revenue, r.volume, r.eff]);
      const body = Buffer.from(JSON.stringify({ rows }));
      return acceptsGzip ? send(res, 200, zlib.gzipSync(body), { 'content-encoding': 'gzip', vary: 'accept-encoding' }) : send(res, 200, body);
    }
    if (p === '/api/data/export.csv' && req.method === 'GET') {
      // Spreadsheets run cells that start with = + - @ as formulas, so prefix those with an apostrophe.
      const q = (v) => { if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const lines = ['date,location,revenue,volume,efficiency_pct'];
      for (const r of db.prepare('SELECT date, location, revenue, volume, eff FROM sales WHERE tenant_id = ? ORDER BY date, location').iterate(tenant.id)) lines.push([r.date, q(r.location), r.revenue, r.volume === null ? '' : r.volume, r.eff === null ? '' : r.eff].join(','));
      return send(res, 200, lines.join('\n') + '\n', { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="sales-export.csv"' });
    }
    if (p === '/api/data/import' && req.method === 'POST') {
      if (limited(req, 'import', 12)) throw tooMany();
      const b = await readJson(req, 6 * 1024 * 1024);
      const mode = b.mode === 'merge' ? 'merge' : 'replace';
      const parsed = Csv.parseSales(String(b.csv || ''), { industry: tenant.profile.company.industry, dateOrder: b.dateOrder === 'dmy' || b.dateOrder === 'mdy' ? b.dateOrder : undefined });
      if (!parsed.ok) throw HttpError(422, 'invalid_csv', 'The file has problems.', { errors: parsed.errors, ambiguousDates: !!parsed.ambiguousDates });
      const existing = new Set([...tenant.profile.locations, ...db.prepare('SELECT DISTINCT location FROM sales WHERE tenant_id = ?').all(tenant.id).map((r) => r.location)].map((l) => l.toLowerCase()));
      const locs = mode === 'replace' ? parsed.summary.locations : [...new Set([...db.prepare('SELECT DISTINCT location FROM sales WHERE tenant_id = ? ORDER BY location').all(tenant.id).map((r) => r.location), ...parsed.summary.locations])];
      if (locs.length > 12) throw HttpError(422, 'too_many_locations', 'That would make more than 12 locations.');
      tx(db, () => {
        if (mode === 'replace') db.prepare('DELETE FROM sales WHERE tenant_id = ?').run(tenant.id);
        const ins = db.prepare('INSERT OR REPLACE INTO sales (tenant_id, date, location, revenue, volume, eff) VALUES (?,?,?,?,?,?)');
        for (const r of parsed.rows) ins.run(tenant.id, r.date, r.location, r.revenue, r.volume, r.eff);
        const max = db.prepare('SELECT MAX(date) AS d FROM sales WHERE tenant_id = ?').get(tenant.id).d;
        db.prepare(`DELETE FROM sales WHERE tenant_id = ? AND date < date(?, '-${Csv.LIMITS.keepDays - 1} days')`).run(tenant.id, max);
        db.prepare('INSERT INTO imports (tenant_id, filename, mode, rows, from_date, to_date, created_at) VALUES (?,?,?,?,?,?,?)').run(tenant.id, String(b.filename || 'upload.csv').slice(0, 120), mode, parsed.rows.length, parsed.summary.from, parsed.summary.to, new Date().toISOString());
        const prof = JSON.parse(db.prepare('SELECT profile FROM tenants WHERE id = ?').get(tenant.id).profile);
        prof.locations = locs;
        db.prepare('UPDATE tenants SET profile = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(prof), new Date().toISOString(), tenant.id);
      });
      return send(res, 200, { data: dataSummary(tenant.id), warnings: parsed.warnings, newLocations: parsed.summary.locations.filter((l) => !existing.has(l.toLowerCase())) });
    }
    if (p === '/api/data' && req.method === 'DELETE') {
      db.prepare('DELETE FROM sales WHERE tenant_id = ?').run(tenant.id);
      return send(res, 200, { data: null });
    }
    throw HttpError(404, 'not_found', 'No such endpoint.');
  }

  /* ---------- per-customer installable app (public by unguessable id: it is only their brand) ---------- */
  function publicApp(req, res, p) {
    let m = /^\/api\/public\/manifest\/([A-Za-z0-9_-]{8,64})$/.exec(p);
    if (m) {
      const row = db.prepare('SELECT profile FROM tenants WHERE id = ?').get(m[1]);
      if (!row) throw HttpError(404, 'not_found', 'Not found.');
      const prof = JSON.parse(row.profile), b = prof.brand;
      const theme = Theme.buildTheme({ primary: b.primary, accent: b.accent, font: b.font });
      const name = (b.appName || prof.company.name).slice(0, 45);
      const icons = b.icon512 ? [{ src: `/api/public/icon/${m[1]}/192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: `/api/public/icon/${m[1]}/512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }]
        : [{ src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png' }];
      return send(res, 200, JSON.stringify({ name, short_name: name.slice(0, 12), description: `${name}: your numbers, every day.`, start_url: '/app.html', scope: '/', display: 'standalone', orientation: 'any', theme_color: theme.light.vars['--primary-fill'], background_color: theme.light.vars['--bg'], icons }), { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=300' });
    }
    m = /^\/api\/public\/icon\/([A-Za-z0-9_-]{8,64})\/(192|512)\.png$/.exec(p);
    if (m) {
      const row = db.prepare('SELECT profile FROM tenants WHERE id = ?').get(m[1]);
      const url = row && JSON.parse(row.profile).brand['icon' + m[2]];
      if (!url) throw HttpError(404, 'not_found', 'Not found.');
      return send(res, 200, Buffer.from(url.split(',')[1], 'base64'), { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
    }
    throw HttpError(404, 'not_found', 'No such endpoint.');
  }

  /* ---------- brand discovery (public: used before an account exists) ---------- */
  async function brand(req, res, p, url) {
    if (p === '/api/brand/extract' && req.method === 'POST') {
      if (limited(req, 'brand', o.ratePerMinute)) throw tooMany();
      const body = await readJson(req, 4 * 1024);
      const result = await extractBrand(String(body.url || ''), { fetchOpts: { allowPrivate: o.allowPrivateFetch } });
      result.logos = result.logos.map((l) => ({ ...l, proxy: '/api/brand/image?url=' + encodeURIComponent(l.url) }));
      return send(res, 200, result);
    }
    if (p === '/api/brand/image' && req.method === 'GET') {
      if (limited(req, 'brand', o.ratePerMinute * 3)) throw tooMany();
      const r = await safeFetch(url.searchParams.get('url') || '', { allowPrivate: o.allowPrivateFetch, accept: 'image/*', maxBytes: 1.5 * 1024 * 1024, timeoutMs: 6000, maxRedirects: 2 });
      const type = String(r.headers['content-type'] || '').split(';')[0].trim();
      if (r.status >= 400) throw HttpError(502, 'upstream_error', 'The image could not be loaded.');
      if (!IMAGE_TYPES.test(type)) throw HttpError(415, 'not_an_image', 'That address is not an image.');
      return send(res, 200, r.body, { 'content-type': type, 'cache-control': 'private, max-age=3600', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
    }
    throw HttpError(404, 'not_found', 'No such endpoint.');
  }

  /* ---------- static ---------- */
  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw HttpError(405, 'method_not_allowed', 'Method not allowed.');
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch (e) { throw HttpError(400, 'bad_request', 'Bad path.'); }
    if (rel.includes('\0')) throw HttpError(400, 'bad_request', 'Bad path.');
    let file = path.resolve(siteRoot, '.' + path.posix.normalize('/' + rel));
    if (file !== siteRoot && !file.startsWith(siteRoot + path.sep)) throw HttpError(403, 'forbidden', 'Forbidden.');
    if (path.relative(siteRoot, file).split(path.sep).some((s) => s.startsWith('.'))) throw HttpError(404, 'not_found', 'Not found.');
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, 'index.html');
      fs.readFile(file, (e2, buf) => {
        if (e2) return send(res, 404, '<!doctype html><meta charset="utf-8"><title>Not found</title><h1>Not found</h1>', { 'content-type': 'text/html; charset=utf-8' });
        const ext = path.extname(file).toLowerCase();
        send(res, 200, req.method === 'HEAD' ? '' : buf, {
          'content-type': MIME[ext] || 'application/octet-stream',
          'cache-control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
        });
      });
    });
  }

  /* ---------- router ---------- */
  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { return send(res, 400, { error: { code: 'bad_request', message: 'Bad request.' } }); }
    const p = url.pathname;
    try {
      if (p.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) { // CSRF: a browser always sends Origin on cross-site writes
          let host = ''; try { host = new URL(req.headers.origin).host; } catch (e) { /* malformed */ }
          if (host !== req.headers.host) throw HttpError(403, 'bad_origin', 'Cross-site requests are not allowed.');
        }
        if (p === '/api/health') return send(res, 200, { ok: true });
        if (p.startsWith('/api/auth/') || p === '/api/account') return await auth(req, res, p);
        if (p === '/api/tenant') return await workspace(req, res, p);
        if (p.startsWith('/api/data')) return await data(req, res, p, url, /\bgzip\b/.test(req.headers['accept-encoding'] || ''));
        if (p.startsWith('/api/brand/')) return await brand(req, res, p, url);
        if (p.startsWith('/api/public/')) return publicApp(req, res, p);
        throw HttpError(404, 'not_found', 'No such endpoint.');
      }
      return serveStatic(req, res, url);
    } catch (e) {
      if (e.status) return send(res, e.status, { error: { code: e.code, message: e.message, ...e.extra } });
      if (e instanceof FetchError) {
        const status = { timeout: 504, network: 502 }[e.code] || 422;
        return send(res, status, { error: { code: e.code, message: e.message } });
      }
      console.error('Unhandled error:', e);
      return send(res, 500, { error: { code: 'server_error', message: 'Something went wrong on our side.' } });
    }
  });
  server.on('close', () => { try { db.close(); } catch (e) { /* already closed */ } });
  server.db = db;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080, host = process.env.HOST || '127.0.0.1';
  createServer({ dbFile: process.env.DB_FILE || process.env.DATA_FILE || undefined, trustProxy: process.env.TRUST_PROXY === '1', httpsOnlyCookies: process.env.COOKIE_SECURE === '1' })
    .listen(port, host, () => console.log(`dashboards.business listening on http://${host}:${port}`));
}
module.exports = { createServer };
