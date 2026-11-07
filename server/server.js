'use strict';
/*
 * dashboards.business server: static site + a small JSON API.
 * No dependencies. Node 20+.
 *
 *   POST /api/tenants            create a customer profile -> { id, token }
 *   GET  /api/tenants/:id        read branding + business specs
 *   PUT  /api/tenants/:id        update (Bearer token from creation)
 *   POST /api/brand/extract      suggest brand colours/logos from a website
 *   GET  /api/brand/image?url=   fetch a logo through the guarded fetcher
 *
 * NOT built: real accounts/login, email verification, billing, per-tenant custom domains.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('./lib/store');
const { safeFetch, FetchError } = require('./lib/safe-fetch');
const { extractBrand } = require('./lib/brand');
const { sanitizeProfile } = require('../site/js/profile.js');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon|avif)$/i;
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
const SECURITY = {
  'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

function createServer(options) {
  const o = Object.assign({
    dataFile: path.join(__dirname, '..', 'data', 'tenants.json'),
    siteDir: path.join(__dirname, '..', 'site'),
    allowPrivateFetch: false, trustProxy: false, ratePerMinute: 20,
  }, options);
  const store = new Store(o.dataFile);
  const siteRoot = path.resolve(o.siteDir);
  const hits = new Map();

  const clientIp = (req) => (o.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress);
  function limited(req, bucket, max) {
    const key = bucket + ':' + clientIp(req), now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + 60000 }; hits.set(key, h); }
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return ++h.n > max;
  }

  const send = (res, status, body, headers) => {
    const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
    res.writeHead(status, { ...SECURITY, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(isObj ? JSON.stringify(body) : body);
  };
  const fail = (res, status, code, message, extra) => send(res, status, { error: { code, message, ...extra } });

  function readJson(req, max) {
    return new Promise((resolve, reject) => {
      const type = String(req.headers['content-type'] || '');
      if (!/^application\/json\b/i.test(type)) return reject(new FetchError('unsupported_media_type', 'Send JSON.'));
      let size = 0, over = false; const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > max * 4) return req.destroy(); // someone is streaming far past the limit
        if (size > max) { if (!over) { over = true; reject(new FetchError('too_large', 'Request is too large.')); } return; }
        chunks.push(c);
      });
      req.on('end', () => { if (over) return; try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new FetchError('bad_json', 'That is not valid JSON.')); } });
      req.on('error', reject);
    });
  }
  const bearer = (req) => { const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || ''); return m ? m[1] : null; };

  async function api(req, res, url) {
    const p = url.pathname;
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true });

    if (p === '/api/tenants' && req.method === 'POST') {
      if (limited(req, 'create', 10)) return fail(res, 429, 'rate_limited', 'Too many sign-ups from this address. Try again in a minute.');
      const raw = await readJson(req, 400 * 1024);
      const r = sanitizeProfile(raw, { requireConsent: true });
      if (!r.ok) return fail(res, 422, 'invalid_profile', 'Some details need fixing.', { fields: r.errors });
      r.profile.consent = { brandAuthority: true, at: new Date().toISOString() };
      const t = await store.create(r.profile);
      return send(res, 201, { id: t.id, token: t.token, profile: r.profile });
    }

    const m = /^\/api\/tenants\/([A-Za-z0-9_-]{8,64})$/.exec(p);
    if (m) {
      const t = store.get(m[1]);
      if (!t) return fail(res, 404, 'not_found', 'We could not find that workspace.');
      if (req.method === 'GET') return send(res, 200, { id: t.id, profile: t.profile, updatedAt: t.updatedAt });
      if (req.method === 'PUT') {
        if (!store.checkToken(m[1], bearer(req))) return fail(res, 403, 'forbidden', 'You need the workspace edit key to change this.');
        const raw = await readJson(req, 400 * 1024);
        const r = sanitizeProfile(raw, {});
        if (!r.ok) return fail(res, 422, 'invalid_profile', 'Some details need fixing.', { fields: r.errors });
        r.profile.consent = t.profile.consent;
        const u = await store.update(m[1], r.profile);
        return send(res, 200, { id: u.id, profile: u.profile, updatedAt: u.updatedAt });
      }
      return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
    }

    if (p === '/api/brand/extract' && req.method === 'POST') {
      if (limited(req, 'brand', o.ratePerMinute)) return fail(res, 429, 'rate_limited', 'Slow down a little and try again in a minute.');
      const body = await readJson(req, 4 * 1024);
      const result = await extractBrand(String(body.url || ''), { fetchOpts: { allowPrivate: o.allowPrivateFetch } });
      result.logos = result.logos.map((l) => ({ ...l, proxy: '/api/brand/image?url=' + encodeURIComponent(l.url) }));
      return send(res, 200, result);
    }

    if (p === '/api/brand/image' && req.method === 'GET') {
      if (limited(req, 'brand', o.ratePerMinute * 3)) return fail(res, 429, 'rate_limited', 'Slow down a little and try again in a minute.');
      const target = url.searchParams.get('url') || '';
      const r = await safeFetch(target, { allowPrivate: o.allowPrivateFetch, accept: 'image/*', maxBytes: 1.5 * 1024 * 1024, timeoutMs: 6000, maxRedirects: 2 });
      const type = String(r.headers['content-type'] || '').split(';')[0].trim();
      if (r.status >= 400) return fail(res, 502, 'upstream_error', 'The image could not be loaded.');
      if (!IMAGE_TYPES.test(type)) return fail(res, 415, 'not_an_image', 'That address is not an image.');
      return send(res, 200, r.body, {
        'content-type': type, 'cache-control': 'private, max-age=3600',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
    }
    return fail(res, 404, 'not_found', 'No such endpoint.');
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch (e) { return fail(res, 400, 'bad_request', 'Bad path.'); }
    if (rel.includes('\0')) return fail(res, 400, 'bad_request', 'Bad path.');
    let file = path.resolve(siteRoot, '.' + path.posix.normalize('/' + rel));
    if (file !== siteRoot && !file.startsWith(siteRoot + path.sep)) return fail(res, 403, 'forbidden', 'Forbidden.');
    if (path.relative(siteRoot, file).split(path.sep).some((s) => s.startsWith('.'))) return fail(res, 404, 'not_found', 'Not found.');
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, 'index.html');
      fs.readFile(file, (e2, buf) => {
        if (e2) return send(res, 404, '<!doctype html><title>Not found</title><h1>Not found</h1>', { 'content-type': 'text/html; charset=utf-8' });
        const ext = path.extname(file).toLowerCase();
        send(res, 200, req.method === 'HEAD' ? '' : buf, {
          'content-type': MIME[ext] || 'application/octet-stream',
          'cache-control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=3600',
        });
      });
    });
  }

  return http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { return fail(res, 400, 'bad_request', 'Bad request.'); }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      return serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof FetchError) {
        const status = { unsupported_media_type: 415, too_large: 413, bad_json: 400, timeout: 504, network: 502 }[e.code] || 422;
        return fail(res, status, e.code, e.message);
      }
      console.error('Unhandled error:', e);
      return fail(res, 500, 'server_error', 'Something went wrong on our side.');
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080, host = process.env.HOST || '127.0.0.1';
  createServer({ dataFile: process.env.DATA_FILE || undefined, trustProxy: process.env.TRUST_PROXY === '1' })
    .listen(port, host, () => console.log(`dashboards.business listening on http://${host}:${port}`));
}
module.exports = { createServer };
