'use strict';
/*
 * Database backups. VACUUM INTO writes a consistent, compacted copy of the live database without stopping it.
 * These copies sit on the same disk, so they protect against mistakes and corruption, not against losing the
 * disk. Pair them with the host's disk snapshots and an occasional copy kept somewhere else (see DEPLOY.md).
 */
const fs = require('node:fs');
const path = require('node:path');

const NAME = /^app-\d{8}T\d{4}\.db$/;

function listBackups(dir) {
  try { return fs.readdirSync(dir).filter((f) => NAME.test(f)).sort(); } catch (e) { return []; }
}
function prune(dir, keep) {
  const all = listBackups(dir);
  for (const f of all.slice(0, Math.max(0, all.length - keep))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* already gone */ } }
}
function runBackup(db, dir, opts) {
  const o = Object.assign({ keep: 28, now: new Date() }, opts);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const t = o.now.toISOString(); // 2026-11-07T04:05:06.000Z
  const file = path.join(dir, `app-${t.slice(0, 4)}${t.slice(5, 7)}${t.slice(8, 10)}T${t.slice(11, 13)}${t.slice(14, 16)}.db`);
  if (!fs.existsSync(file)) {
    db.prepare('VACUUM INTO ?').run(file);
    try { fs.chmodSync(file, 0o600); } catch (e) { /* not supported on this filesystem */ }
  }
  prune(dir, o.keep);
  return file;
}
function startBackups(db, dir, opts) {
  const o = Object.assign({ everyHours: 6, keep: 28, log: (m) => console.log(m) }, opts);
  const run = () => { try { o.log('database backup written: ' + runBackup(db, dir, { keep: o.keep })); } catch (e) { console.error('database backup FAILED:', e.message); } };
  const newest = listBackups(dir).pop();
  const age = newest ? Date.now() - fs.statSync(path.join(dir, newest)).mtimeMs : Infinity;
  if (age > o.everyHours * 3600000 * 0.9) run();
  const timer = setInterval(run, o.everyHours * 3600000);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { runBackup, startBackups, listBackups, prune };

/* node server/lib/backup.js [folder]: write one backup now (for a cron job or a manual copy). */
if (require.main === module) {
  const { openDb } = require('./db');
  const file = process.env.DB_FILE || path.join(__dirname, '..', '..', 'data', 'app.db');
  const dir = process.argv[2] || process.env.BACKUP_DIR || path.join(path.dirname(file), 'backups');
  const db = openDb(file);
  console.log('wrote ' + runBackup(db, dir, { keep: Number(process.env.BACKUP_KEEP) || 28 }));
  db.close();
}
