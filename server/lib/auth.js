'use strict';
/*
 * Accounts: password hashing (scrypt), sessions (random token, only its hash is stored), one-time recovery codes.
 * There is no email delivery yet, so a recovery code shown once at sign-up is the only way back in after a
 * forgotten password. Replace with emailed reset links once an email provider is connected.
 */
const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const SESSION_DAYS = 30;
const LOCK_AFTER = 5, LOCK_MS = 15 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

const scrypt = (secret, salt, p) => new Promise((res, rej) => crypto.scrypt(secret, salt, p.keylen, { N: p.N, r: p.r, p: p.p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

async function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(secret, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}
async function verifySecret(secret, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const p = { N: +parts[1], r: +parts[2], p: +parts[3], keylen: Buffer.from(parts[5], 'base64').length };
  const key = await scrypt(secret, Buffer.from(parts[4], 'base64'), p);
  const want = Buffer.from(parts[5], 'base64');
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}
// Used when the email is unknown, so "no such account" costs the same time as "wrong password".
let DUMMY;
const dummyHash = async () => (DUMMY = DUMMY || (await hashSecret('not-a-real-password')));

function normaliseEmail(e) {
  if (typeof e !== 'string') return null;
  const v = e.trim().toLowerCase();
  return v.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/.test(v) ? v : null;
}
function passwordProblem(pw, email) {
  if (typeof pw !== 'string') return 'Enter a password.';
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (/^(.)\1+$/.test(pw)) return 'Choose a less repetitive password.';
  if (email && pw.toLowerCase() === email) return 'The password cannot be your email address.';
  if (['password12', 'password123', '1234567890', 'qwertyuiop', 'letmein123', 'iloveyou12'].includes(pw.toLowerCase())) return 'That password is too common.';
  return null;
}

function newRecoveryCode() {
  const bytes = crypto.randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out.match(/.{4}/g).join('-');
}
const normaliseRecovery = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const recoveryDigest = (code) => normaliseRecovery(code); // scrypt-hashed below; digest is just the canonical form

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const newId = (n) => crypto.randomBytes(n || 12).toString('base64url');

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen) VALUES (?,?,?,?,?)').run(sha(token), userId, now, now + SESSION_DAYS * 86400000, now);
  return { token, maxAge: SESSION_DAYS * 86400 };
}
function sessionUser(db, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const now = Date.now();
  const row = db.prepare('SELECT s.token_hash, s.expires_at, s.last_seen, u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(sha(token));
  if (!row || row.expires_at < now) { if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash); return null; }
  if (now - row.last_seen > 3600000) db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').run(now, now + SESSION_DAYS * 86400000, row.token_hash);
  return { id: row.id, email: row.email };
}
const endSession = (db, token) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token || ''));
const endAllSessions = (db, userId, exceptToken) => db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha(exceptToken || ''));

module.exports = {
  hashSecret, verifySecret, dummyHash, normaliseEmail, passwordProblem, newRecoveryCode, recoveryDigest,
  createSession, sessionUser, endSession, endAllSessions, newId, LOCK_AFTER, LOCK_MS, SESSION_DAYS,
};
