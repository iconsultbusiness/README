const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('../server/lib/db');
const { runBackup, listBackups } = require('../server/lib/backup');
const { createServer } = require('../server/server');
const { listen } = require('./helpers');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'db-ops-'));
const close = (srv) => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); });
const seed = (db) => {
  db.prepare("INSERT INTO users (id,email,pw_hash,recovery_hash,created_at) VALUES ('u1','a@b.co','x','y','now')").run();
  db.prepare("INSERT INTO tenants (id,owner_id,profile,created_at,updated_at) VALUES ('t1','u1','{}','now','now')").run();
  db.prepare("INSERT INTO sales (tenant_id,date,location,revenue) VALUES ('t1','2026-10-01','A',100)").run();
};

test('a backup is a complete, readable copy of the live database', () => {
  const dir = tmp(), db = openDb(path.join(dir, 'app.db')); seed(db);
  const file = runBackup(db, path.join(dir, 'backups'), { now: new Date('2026-11-07T04:05:06Z') });
  assert.match(path.basename(file), /^app-20261107T0405\.db$/);
  assert.equal(fs.statSync(file).mode & 0o077, 0, 'backups are private');
  const copy = new DatabaseSync(file, { readOnly: true });
  assert.equal(copy.prepare('SELECT COUNT(*) n FROM sales').get().n, 1);
  assert.equal(copy.prepare('SELECT email FROM users').get().email, 'a@b.co');
  copy.close();
  assert.equal(runBackup(db, path.join(dir, 'backups'), { now: new Date('2026-11-07T04:05:59Z') }), file, 'same minute reuses the file');
  db.close();
});

test('old backups are pruned, and unrelated files are never touched', () => {
  const dir = tmp(), db = openDb(path.join(dir, 'app.db')); seed(db);
  const b = path.join(dir, 'backups'); fs.mkdirSync(b); fs.writeFileSync(path.join(b, 'notes.txt'), 'keep me');
  for (let h = 0; h < 6; h++) runBackup(db, b, { keep: 3, now: new Date(Date.UTC(2026, 10, 7, h, 0)) });
  assert.deepEqual(listBackups(b), ['app-20261107T0300.db', 'app-20261107T0400.db', 'app-20261107T0500.db']);
  assert.ok(fs.existsSync(path.join(b, 'notes.txt')));
  db.close();
});

test('a damaged database file is refused instead of served', () => {
  const dir = tmp(), file = path.join(dir, 'app.db'); fs.writeFileSync(file, Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(4096, 7)]));
  assert.throws(() => openDb(file));
});

test('behind an HTTPS proxy: plain HTTP is redirected, HTTPS gets HSTS, health is always reachable', async () => {
  const app = createServer({ dbFile: path.join(tmp(), 'app.db'), httpsOnlyCookies: true, trustProxy: true });
  const port = await listen(app), url = `http://127.0.0.1:${port}`;
  try {
    const plain = await fetch(url + '/login.html?next=app.html', { redirect: 'manual', headers: { 'x-forwarded-proto': 'http' } });
    assert.equal(plain.status, 301); assert.equal(plain.headers.get('location'), `https://127.0.0.1:${port}/login.html?next=app.html`);
    const secure = await fetch(url + '/login.html', { headers: { 'x-forwarded-proto': 'https' } });
    assert.equal(secure.status, 200); assert.equal(secure.headers.get('strict-transport-security'), 'max-age=31536000');
    assert.ok(!/includeSubDomains|preload/.test(secure.headers.get('strict-transport-security')), 'HSTS stays scoped to this host');
    const health = await fetch(url + '/api/health', { redirect: 'manual', headers: { 'x-forwarded-proto': 'http' } });
    assert.equal(health.status, 200, 'health checks arrive over plain HTTP and must not be redirected');
    const evil = await new Promise((resolve) => { const req = http.request({ host: '127.0.0.1', port, path: '/', headers: { host: 'evil.example/phish?x=1', 'x-forwarded-proto': 'http' } }, (res) => resolve(res.statusCode)); req.on('error', () => resolve('rejected')); req.end(); });
    assert.ok([400, 'rejected'].includes(evil), 'a hostile Host header is never echoed into a redirect, got ' + evil);
  } finally { await close(app); }
});

test('without a proxy there is no redirect and no HSTS (local development keeps working)', async () => {
  const app = createServer({ dbFile: path.join(tmp(), 'app.db') }); const port = await listen(app);
  try { const r = await fetch(`http://127.0.0.1:${port}/login.html`, { redirect: 'manual', headers: { 'x-forwarded-proto': 'http' } }); assert.equal(r.status, 200); assert.equal(r.headers.get('strict-transport-security'), null); } finally { await close(app); }
});

test('the health check reports a broken database as unavailable', async () => {
  const app = createServer({ dbFile: path.join(tmp(), 'app.db') }); const port = await listen(app);
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
    app.db.close();
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 503);
  } finally { app.closeAllConnections?.(); await new Promise((r) => app.close(r)); }
});

test('the real server process writes a startup backup and shuts down cleanly on SIGTERM', async () => {
  const dir = tmp();
  const free = await new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], { env: { ...process.env, PORT: String(free), HOST: '127.0.0.1', DB_FILE: path.join(dir, 'data', 'app.db') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', () => {});
  const started = Date.now();
  while (!/listening/.test(out) && Date.now() - started < 8000) await new Promise((r) => setTimeout(r, 50));
  assert.match(out, /listening/);
  assert.equal((await fetch(`http://127.0.0.1:${free}/api/health`)).status, 200);
  assert.equal(listBackups(path.join(dir, 'data', 'backups')).length, 1, 'a backup is taken at start-up');
  const exit = new Promise((res) => child.on('exit', (code, sig) => res({ code, sig })));
  child.kill('SIGTERM');
  const r = await Promise.race([exit, new Promise((res) => setTimeout(() => res('timeout'), 6000))]);
  assert.notEqual(r, 'timeout', 'must exit promptly'); assert.equal(r.code, 0); assert.match(out, /shutting down/); assert.match(out, /closed cleanly/);
  const db = new DatabaseSync(path.join(dir, 'data', 'app.db'), { readOnly: true }); assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok'); db.close();
});

test('render.yaml agrees with the server: health route, start command, disk path, secure settings', () => {
  const y = fs.readFileSync(path.join(__dirname, '..', 'render.yaml'), 'utf8');
  const val = (k) => (new RegExp(`key: ${k}\\n\\s+value: "?([^"\\n]+)"?`).exec(y) || [])[1];
  assert.match(y, /startCommand: node server\/server\.js/);
  assert.match(y, /healthCheckPath: \/api\/health/);
  assert.match(y, /autoDeploy: false/);
  assert.equal(val('COOKIE_SECURE'), '1'); assert.equal(val('TRUST_PROXY'), '1'); assert.equal(val('HOST'), '0.0.0.0');
  const mount = /mountPath: (\S+)/.exec(y)[1];
  assert.equal(path.dirname(val('DB_FILE')), mount, 'the database must live on the mounted disk');
  const node = fs.readFileSync(path.join(__dirname, '..', '.node-version'), 'utf8').trim();
  assert.ok(Number(node.split('.')[0]) >= 22, 'node-version must be 22 or newer (built-in SQLite)');
  assert.equal(val('NODE_VERSION'), node.split('.')[0]);
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'docker-entrypoint.sh'), 'utf8').includes('su-exec node'));
});
