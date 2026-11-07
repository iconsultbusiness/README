'use strict';
/*
 * SQLite storage (node:sqlite, built into Node 22.13+; no dependencies).
 * One file, WAL mode, foreign keys on. Safe for one server instance. To run several instances,
 * move to a networked database; every query lives in server/lib/*.js so that swap is contained.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pw_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
     created_at TEXT NOT NULL, failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS tenants (
     id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
     profile TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sales (
     tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, date TEXT NOT NULL, location TEXT NOT NULL,
     revenue REAL NOT NULL, volume REAL, eff REAL, PRIMARY KEY (tenant_id, date, location)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS imports (
     id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     filename TEXT, mode TEXT, rows INTEGER, from_date TEXT, to_date TEXT, created_at TEXT NOT NULL)`,
];

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') { try { fs.chmodSync(file, 0o600); } catch (e) { /* not supported on this filesystem */ } }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  for (const sql of SCHEMA) db.exec(sql);
  db.prepare(`INSERT OR IGNORE INTO meta (k, v) VALUES ('schema', '1')`).run();
  return db;
}

/** Run fn inside a transaction; roll back if it throws. */
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* already rolled back */ } throw e; }
}

module.exports = { openDb, tx };
