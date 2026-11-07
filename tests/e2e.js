/*
 * End-to-end check of the whole product in a real browser (Playwright + Chromium).
 *   node tests/e2e.js [screenshot-dir]
 * Real server, real SQLite database in a temp folder, and a fake customer website to pull branding from.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../server/server');
const { brandSite, listen } = require('./helpers');
const T = require('../site/js/theme.js');

const shots = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'db-shots-'));
const ok = (m) => console.log('  ✓ ' + m);
const PW = 'correct horse battery';

function salesCsv(days, locs) {
  const end = new Date(Date.now() - 86400000), L = ['date,location,revenue,orders,labour_cost'];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10), n = days - 1 - i;
    locs.forEach((l, li) => L.push(`${d},${l},${2500 + n * 15 + li * 300},${90 + n},${700 + n * 3}`));
  }
  return { text: L.join('\n') + '\n', latestTotal: locs.reduce((a, _, li) => a + 2500 + (days - 1) * 15 + li * 300, 0) };
}

async function noRawValues(page, label) {
  const txt = await page.evaluate(() => document.body.innerText);
  const m = /\b(null|undefined|NaN|Infinity)\b/.exec(txt);
  assert.ok(!m, `${label} shows a raw value: "${m && m[0]}" near "${m && txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}"`);
}

async function newUser(browser, base, scheme) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: scheme || 'light', acceptDownloads: true });
  const page = await ctx.newPage(); const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*(401|404|ERR_INTERNET_DISCONNECTED)/.test(m.text())) problems.push('console: ' + m.text()); });
  return { ctx, page, problems };
}

async function signup(page, base, site, spec) {
  await page.goto(base + '/signup.html');
  await page.fill('#f-email', spec.email); await page.fill('#f-pw1', spec.password || PW);
  await page.fill('#f-name', spec.name);
  if (site) { await page.fill('#f-site', site); await page.click('text=Pull my branding'); await page.waitForSelector('.found .logos button'); await page.click('.found .logos button'); await page.waitForFunction(() => document.querySelector('.logo-frame img')); }
  await page.selectOption('#f-ind', spec.industry || 'hospitality'); await page.selectOption('#f-cur', spec.currency || 'USD');
  for (const l of spec.locations) { await page.fill('#f-loc', l); await page.press('#f-loc', 'Enter'); }
  await page.click('.chip-list li:first-child button'); // remove the seeded "Main"
  if (spec.font) await page.selectOption('#f-font', spec.font);
  if (spec.appName) await page.fill('#f-app', spec.appName);
  await page.waitForTimeout(250);
  if (spec.key) await page.screenshot({ path: path.join(shots, spec.key + '-signup.png'), fullPage: true });
  await page.click('button[type=submit]');
  await page.waitForSelector('.errors');
  assert.match(await page.textContent('.errors'), /allowed to use/i);
  await page.check('#f-consent');
  await page.click('button[type=submit]');
  await page.waitForSelector('.rc-code');
  const code = (await page.textContent('.rc-code')).trim();
  assert.match(code, /^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);
  assert.equal(await page.locator('dialog button:has-text("Continue")').isDisabled(), true);
  await page.check('#rc-saved'); await page.click('dialog button:has-text("Continue")');
  await page.waitForURL(/app\.html/); await page.waitForSelector('.kpis'); await page.waitForTimeout(500);
  return code;
}

(async () => {
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-e2e-')), 'app.db');
  const app = createServer({ dbFile, allowPrivateFetch: true });
  const port = await listen(app), base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch(); const sites = [];
  try {
    /* ---------- 1. a café signs up: account, branding, recovery code ---------- */
    const cafe = brandSite({ name: 'Acme Roasters', color: '#C2410C' }); const cp = await listen(cafe); sites.push(cafe);
    let { ctx, page, problems } = await newUser(browser, base);
    const code = await signup(page, base, `http://127.0.0.1:${cp}/`, { key: 'cafe', email: 'owner@acme.example', name: 'Acme Roasters', locations: ['Old Town', 'Riverside', 'Airport'], font: 'lora', appName: 'Acme Numbers', currency: 'GBP' });
    ok('cafe: account created, consent enforced, recovery code shown once and gated');
    const css = (v) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);
    const mode = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const expect = T.buildTheme({ primary: '#C2410C', font: 'lora' });
    assert.equal((await css('--primary-fill')).toUpperCase(), expect[mode].vars['--primary-fill']); ok('cafe: brand colour applied (' + mode + ')');
    assert.match(await css('--font'), /Lora/); ok('cafe: brand font applied');
    assert.ok(await page.locator('.side .logo-chip img').count()); ok('cafe: logo pulled from their site is in the sidebar');
    assert.equal(await page.title(), 'Today — Acme Numbers'); ok('cafe: white-label app name in the title');
    assert.match(await page.textContent('.side'), /Sample data/); ok('cafe: honest "sample data" label before any import');
    assert.match(await page.textContent('.side'), /owner@acme\.example/); ok('cafe: signed-in email and sign-out shown');
    await page.screenshot({ path: path.join(shots, 'cafe-app-' + mode + '.png') });
    for (const pg of ['app.html', 'dashboards.html#locations', 'dashboards.html#weekly', 'alerts.html', 'analyst.html', 'sources.html', 'goals.html', 'settings.html']) {
      await page.goto(base + '/' + pg); await page.waitForSelector('#content > *, .setup'); await page.waitForTimeout(200); await noRawValues(page, 'sample ' + pg);
    }
    ok('sample data: no screen shows a raw null, undefined or NaN');

    /* ---------- 2. real data: CSV preview, errors, import ---------- */
    await page.goto(base + '/sources.html'); await page.waitForSelector('#csv-file', { state: 'attached' });
    const bad = 'date,location,revenue,orders\n2026-10-01,Old Town,1200,40\nyesterday,Old Town,1300,41\n2026-10-03,Riverside,abc,42\n';
    await page.setInputFiles('#csv-file', { name: 'broken.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) });
    await page.waitForSelector('.errors li');
    const errText = await page.textContent('.errors'); assert.match(errText, /Line 3/); assert.match(errText, /Line 4/);
    assert.equal(await page.locator('button:has-text("Import")').count(), 0); ok('data: a broken file shows line-numbered problems and cannot be imported');
    const amb = 'date,location,revenue\n03/04/2026,Old Town,100\n';
    await page.setInputFiles('#csv-file', { name: 'amb.csv', mimeType: 'text/csv', buffer: Buffer.from(amb) });
    await page.waitForSelector('text=Day first'); ok('data: ambiguous dates ask which order instead of guessing');
    const good = salesCsv(40, ['Old Town', 'Riverside', 'Airport']);
    await page.setInputFiles('#csv-file', { name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(good.text) });
    await page.waitForSelector('text=120 rows'); await noRawValues(page, 'import preview');
    await page.screenshot({ path: path.join(shots, 'cafe-import-preview.png'), fullPage: true });
    await page.click('button:has-text("Import and use my data")');
    await page.waitForSelector('.status.live', { timeout: 8000 }); await page.waitForTimeout(400);
    ok('data: 120 rows imported and the app switched to live data');
    await page.goto(base + '/app.html'); await page.waitForSelector('.kpis');
    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(good.latestTotal);
    assert.ok((await page.textContent('.kpis')).includes(money), 'revenue KPI must equal the CSV total ' + money); ok('data: the Today revenue ' + money + ' equals the sum of the latest CSV day');
    assert.match(await page.textContent('.topbar'), /Latest data/); assert.ok(!(await page.textContent('.side')).includes('Sample data'));
    const locs = await page.textContent('main'); for (const l of ['Old Town', 'Riverside', 'Airport']) assert.ok(locs.includes(l), l);
    await page.screenshot({ path: path.join(shots, 'cafe-live-today.png') }); ok('data: locations and figures now come from the imported file');
    for (const pg of ['dashboards.html#locations', 'dashboards.html#weekly', 'alerts.html', 'analyst.html', 'goals.html', 'settings.html', 'sources.html']) {
      await page.goto(base + '/' + pg); await page.waitForSelector('#content > *, .setup'); await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(shots, 'live-' + pg.replace('.html', '').replace('#', '-') + '.png') });
      await noRawValues(page, 'live ' + pg);
    }
    ok('data: every other screen renders on real data');
    await page.goto(base + '/analyst.html'); await page.waitForSelector('.chips .chip'); await page.click('.chips .chip:nth-child(1)');
    await page.waitForSelector('.msg.user'); const ans = await page.textContent('.panel'); assert.match(ans, /Old Town|Riverside|Airport/); ok('analyst: answers from the imported data');
    await page.goto(base + '/sources.html');
    const dl = await Promise.all([page.waitForEvent('download'), page.click('text=Export CSV')]); const exported = fs.readFileSync(await dl[0].path(), 'utf8');
    assert.equal(exported.trim().split('\n').length, 121); ok('data: export gives back all 120 rows');

    /* ---------- 3. goals edit persists in the database ---------- */
    await page.goto(base + '/goals.html'); await page.waitForSelector('#g-rev'); await page.fill('#g-rev', '12345'); await page.click('text=Save targets');
    await page.waitForSelector('.toast'); await page.reload(); await page.waitForSelector('#g-rev'); assert.equal(await page.inputValue('#g-rev'), '12345'); ok('goals: edited target saved to the database and survives reload');

    /* ---------- 4. installable app: manifest, icons, offline ---------- */
    await page.goto(base + '/app.html'); await page.waitForSelector('.kpis');
    const href = await page.getAttribute('#tenant-manifest', 'href'); assert.match(href, /^\/api\/public\/manifest\//);
    const man = await (await page.request.get(base + href)).json();
    assert.equal(man.name, 'Acme Numbers'); assert.equal(man.display, 'standalone');
    ok('app: this customer’s own manifest (name "' + man.name + '", colour ' + man.theme_color + ')');
    await page.waitForTimeout(300);
    const icon = await page.request.get(base + man.icons[0].src); assert.equal(icon.status(), 200); assert.equal(icon.headers()['content-type'], 'image/png'); ok('app: customer-specific home-screen icon is served');
    await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('.kpis'); await page.waitForTimeout(500);
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.kpis', { timeout: 10000 });
    assert.match(await page.textContent('main'), /offline/i); assert.ok((await page.textContent('.kpis')).includes(money)); ok('app: opens offline from the installed shell, with the last saved numbers and an offline notice');
    await ctx.setOffline(false);

    /* ---------- 5. settings: change colour, manifest follows; password change ---------- */
    await page.goto(base + '/settings.html'); await page.waitForSelector('#f-ph');
    assert.equal(await page.locator('#f-loc').isDisabled(), true); ok('settings: locations are locked to the imported data');
    await page.fill('#f-ph', '#0F766E'); await page.waitForTimeout(300);
    await page.click('button:has-text("Save changes")'); await page.waitForURL(/settings\.html/); await page.waitForSelector('#f-ph'); await page.waitForTimeout(800);
    const man2 = await (await page.request.get(base + (await page.getAttribute('#tenant-manifest', 'href')))).json();
    assert.notEqual(man2.theme_color, man.theme_color); ok('settings: a new brand colour reaches the app manifest too');
    await page.fill('#ac-cur', PW); await page.fill('#ac-new', 'another long passphrase'); await page.click('button:has-text("Change password")');
    await page.waitForSelector('text=Password changed'); ok('settings: password changed');

    /* ---------- 6. sign out, log in, wrong password, protected pages ---------- */
    await page.click('.acct .linkish'); await page.waitForURL(/login\.html/);
    await page.goto(base + '/app.html'); await page.waitForURL(/login\.html\?next=app\.html/); ok('auth: after sign-out the app sends you to log in');
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('db.'))), []); ok('auth: sign-out clears the cached workspace and data from the browser');
    await page.fill('#l-email', 'owner@acme.example'); await page.fill('#l-pw', PW); await page.click('button[type=submit]');
    await page.waitForSelector('.errors, .hint.bad:not(:empty)'); assert.match(await page.textContent('.auth-card'), /do not match/); ok('auth: the old password no longer works');
    await page.fill('#l-pw', 'another long passphrase'); await page.click('button[type=submit]');
    await page.waitForURL(/app\.html/); await page.waitForSelector('.kpis'); ok('auth: log in with the new password lands back on the branded app');

    /* ---------- 7. a second customer cannot see the first one's world ---------- */
    const yellow = brandSite({ name: 'Sunny Plumbing', color: '#FFE600', logoColor: '#101010' }); const yp = await listen(yellow); sites.push(yellow);
    const u2 = await newUser(browser, base, 'dark');
    await signup(u2.page, base, `http://127.0.0.1:${yp}/`, { key: 'yellow', email: 'boss@sunny.example', name: 'Sunny Plumbing', industry: 'services', currency: 'AUD', locations: ['North', 'South'] });
    const t2 = await u2.page.textContent('main'); assert.ok(!/Old Town|Riverside|Airport/.test(t2)); assert.match(t2, /Utilisation/); assert.match(await u2.page.textContent('.side'), /Sample data/);
    ok('isolation: the second customer sees only their own locations and sample data');
    const y = T.buildTheme({ primary: '#FFE600' }); const ym = await u2.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.equal((await u2.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--on-primary').trim())).toUpperCase(), y[ym].vars['--on-primary']); ok('yellow: button text flips to dark, brand yellow kept');
    await u2.page.screenshot({ path: path.join(shots, 'yellow-app.png') });
    const stolen = await u2.page.evaluate(async () => (await fetch('/api/data/rows')).json()); assert.deepEqual(stolen.rows, []); ok('isolation: the second account’s data API returns none of the first customer’s rows');
    assert.deepEqual(u2.problems, [], u2.problems.join(' | ')); await u2.ctx.close();

    /* ---------- 8. forgotten password: recovery code ---------- */
    const u3 = await newUser(browser, base);
    await u3.page.goto(base + '/login.html'); await u3.page.click('text=Forgot your password?');
    await u3.page.fill('#r-email', 'owner@acme.example'); await u3.page.fill('#r-code', code); await u3.page.fill('#r-pw', 'brand new passphrase!');
    await u3.page.click('button:has-text("Reset password")'); await u3.page.waitForSelector('.rc-code');
    const code2 = (await u3.page.textContent('.rc-code')).trim(); assert.notEqual(code2, code);
    await u3.page.check('#rc-saved'); await u3.page.click('dialog button:has-text("Continue")'); await u3.page.waitForURL(/app\.html/); await u3.page.waitForSelector('.kpis');
    ok('recovery: the saved code reset the password, issued a new code and signed in');
    const reuse = await u3.page.evaluate(async (c) => (await fetch('/api/auth/recover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@acme.example', recoveryCode: c, newPassword: 'x'.repeat(12) }) })).status, code);
    assert.equal(reuse, 401); ok('recovery: the old code is dead'); await u3.ctx.close();

    /* ---------- 9. delete account ---------- */
    await page.goto(base + '/settings.html'); await page.waitForSelector('text=Delete my account').catch(() => {});
    const gone = await newUser(browser, base); await gone.page.goto(base + '/login.html');
    await gone.page.fill('#l-email', 'owner@acme.example'); await gone.page.fill('#l-pw', 'brand new passphrase!'); await gone.page.click('button[type=submit]'); await gone.page.waitForURL(/app\.html/); await gone.page.waitForSelector('.kpis');
    await gone.page.goto(base + '/settings.html'); await gone.page.waitForSelector('.setup'); await gone.page.click('button:has-text("Delete my account")');
    await gone.page.fill('#ac-dp', 'brand new passphrase!'); await gone.page.click('button:has-text("Delete everything")'); await gone.page.waitForURL(/index\.html|\/$/);
    const rows = app.db.prepare('SELECT COUNT(*) n FROM users WHERE email = ?').get('owner@acme.example').n; assert.equal(rows, 0);
    assert.equal(app.db.prepare("SELECT COUNT(*) n FROM sales WHERE tenant_id NOT IN (SELECT id FROM tenants)").get().n, 0);
    ok('account: deleting the account removed the user, workspace and every data row'); await gone.ctx.close();

    assert.deepEqual(problems, [], 'no console errors: ' + problems.join(' | ')); ok('no console or page errors on the main browser session');
    await ctx.close();

    /* ---------- 10. production mode refuses internal addresses ---------- */
    const prod = createServer({ dbFile: path.join(path.dirname(dbFile), 'prod.db'), allowPrivateFetch: false }); const pp = await listen(prod);
    const r = await fetch(`http://127.0.0.1:${pp}/api/brand/extract`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' }) });
    assert.equal(r.status, 422); ok('production mode: cloud-metadata address refused'); prod.close();
    console.log('\nE2E passed. Screenshots in ' + shots);
  } catch (e) {
    console.error('\nE2E FAILED:', e.stack || e.message); process.exitCode = 1;
  } finally {
    await browser.close(); sites.forEach((s) => s.close()); app.closeAllConnections?.(); app.close();
  }
})();
