'use strict';
/*
 * Tenant storage: a JSON file with atomic writes. Good enough for a prototype and
 * a single instance; swap for a real database before running more than one server.
 * Edit tokens are stored as SHA-256 hashes and compared in constant time.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const hash = (t) => crypto.createHash('sha256').update(t).digest();

class Store {
  constructor(file) { this.file = file; this.data = { tenants: {} }; this.queue = Promise.resolve(); this.loaded = false; }
  load() {
    if (this.loaded) return;
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!this.data.tenants) this.data.tenants = {};
    this.loaded = true;
  }
  _save() {
    this.queue = this.queue.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.' + process.pid + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(this.data), { mode: 0o600 });
      await fs.promises.rename(tmp, this.file);
    });
    return this.queue;
  }
  get(id) { this.load(); const t = this.data.tenants[id]; return t ? { id, profile: t.profile, createdAt: t.createdAt, updatedAt: t.updatedAt } : null; }
  async create(profile) {
    this.load();
    const id = crypto.randomBytes(12).toString('base64url');
    const token = crypto.randomBytes(24).toString('base64url');
    const now = new Date().toISOString();
    this.data.tenants[id] = { profile, tokenHash: hash(token).toString('hex'), createdAt: now, updatedAt: now };
    await this._save();
    return { id, token, createdAt: now };
  }
  checkToken(id, token) {
    this.load();
    const t = this.data.tenants[id];
    if (!t || typeof token !== 'string') return false;
    return crypto.timingSafeEqual(hash(token), Buffer.from(t.tokenHash, 'hex'));
  }
  async update(id, profile) {
    this.load();
    const t = this.data.tenants[id];
    if (!t) return null;
    t.profile = profile; t.updatedAt = new Date().toISOString();
    await this._save();
    return this.get(id);
  }
}
module.exports = { Store };
