'use strict';
/*
 * Fetch a URL that a customer typed in, without letting them reach our own
 * network (SSRF). Defences, all applied on every redirect hop:
 *   - http/https only, standard ports only, no credentials in the URL
 *   - the address is checked at connect time (custom DNS lookup), so a hostname
 *     cannot resolve to a private address, and DNS rebinding cannot swap it later
 *   - IP literals (including decimal/hex forms, which URL() normalises) are checked directly
 *   - response size, decompressed size, redirect count and total time are capped
 * `allowPrivate` exists only for tests. The CLI entry point never sets it.
 */
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const zlib = require('node:zlib');

const blocked = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].forEach(([a, p]) => blocked.addSubnet(a, p, 'ipv4'));
[
  // Note: no ::ffff:0:0/96 rule. BlockList compares IPv4 addresses as mapped IPv6, so that rule would block every IPv4 address.
  // Mapped literals such as ::ffff:127.0.0.1 are still caught by the IPv4 rules above.
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32],
  ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
].forEach(([a, p]) => blocked.addSubnet(a, p, 'ipv6'));

class FetchError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

function isBlockedAddress(ip) {
  const fam = net.isIPv6(ip) ? 'ipv6' : net.isIPv4(ip) ? 'ipv4' : null;
  return fam === null ? true : blocked.check(ip, fam);
}

function validateUrl(input, allowPrivate) {
  let url;
  try { url = new URL(input); } catch (e) { throw new FetchError('bad_url', 'That address is not a valid URL.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('bad_scheme', 'Only http and https addresses are allowed.');
  if (url.username || url.password) throw new FetchError('bad_url', 'Addresses with credentials are not allowed.');
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!allowPrivate && port !== 80 && port !== 443) throw new FetchError('bad_port', 'Only standard web ports are allowed.');
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (net.isIP(host) && isBlockedAddress(host)) throw new FetchError('blocked_address', 'That address is not allowed.');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
      throw new FetchError('blocked_address', 'That address is not allowed.');
    }
  }
  return url;
}

function makeLookup(allowPrivate) {
  return (hostname, options, cb) => {
    if (typeof options === 'function') { cb = options; options = {}; }
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const good = allowPrivate ? addrs : addrs.filter((a) => !isBlockedAddress(a.address));
      if (!good.length) return cb(new FetchError('blocked_address', 'That address is not allowed.'));
      if (options && options.all) return cb(null, good);
      cb(null, good[0].address, good[0].family);
    });
  };
}

function once(url, o) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
    const req = lib.request(url, {
      method: 'GET', agent: false, lookup: makeLookup(o.allowPrivate),
      headers: {
        'user-agent': 'dashboards-business-brand-fetch/1.0 (+https://dashboards.business)',
        accept: o.accept, 'accept-encoding': 'gzip, deflate, br', 'accept-language': 'en',
      },
    }, (res) => {
      const status = res.statusCode;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        return finish(resolve, { status, headers: res.headers, redirect: res.headers.location });
      }
      let stream = res;
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      const chunks = []; let size = 0;
      stream.on('data', (c) => {
        size += c.length;
        if (size > o.maxBytes) {
          const keep = c.length - (size - o.maxBytes);
          if (keep > 0) chunks.push(c.subarray(0, keep));
          req.destroy();
          return o.truncate
            ? finish(resolve, { status, headers: res.headers, body: Buffer.concat(chunks), truncated: true })
            : finish(reject, new FetchError('too_large', 'That file is too large.'));
        }
        chunks.push(c);
      });
      stream.on('end', () => finish(resolve, { status, headers: res.headers, body: Buffer.concat(chunks), truncated: false }));
      stream.on('error', (e) => finish(reject, e));
      res.on('error', (e) => finish(reject, e));
    });
    const timer = setTimeout(() => { req.destroy(); finish(reject, new FetchError('timeout', 'The site took too long to respond.')); }, o.timeoutMs);
    req.on('error', (e) => finish(reject, e.code === 'blocked_address' || e instanceof FetchError ? e : new FetchError('network', 'Could not reach that address.')));
    req.end();
  });
}

async function safeFetch(input, opts) {
  const o = Object.assign({ maxBytes: 1.5 * 1024 * 1024, timeoutMs: 8000, maxRedirects: 3, accept: '*/*', allowPrivate: false, truncate: false }, opts);
  let url = validateUrl(input, o.allowPrivate);
  for (let hop = 0; hop <= o.maxRedirects; hop++) {
    const r = await once(url, o);
    if (r.redirect) {
      try { url = validateUrl(new URL(r.redirect, url).href, o.allowPrivate); }
      catch (e) { throw e instanceof FetchError ? e : new FetchError('bad_url', 'Bad redirect.'); }
      continue;
    }
    return { status: r.status, headers: r.headers, body: r.body, truncated: r.truncated, url: url.href };
  }
  throw new FetchError('too_many_redirects', 'That address redirects too many times.');
}

module.exports = { safeFetch, isBlockedAddress, validateUrl, FetchError };
