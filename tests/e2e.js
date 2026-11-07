/*
 * End-to-end check of the white-label flow in a real browser (Playwright + Chromium).
 *   node tests/e2e.js [screenshot-dir]
 * Starts the real server with private-address fetching enabled (tests only) and a fake customer website.
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

async function signup(browser, base, site, spec) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: spec.scheme || 'light' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(base + '/signup.html');
  await page.fill('#f-name', spec.name);
  await page.fill('#f-site', site);
  await page.click('text=Pull my branding');
  await page.waitForSelector('.found .logos button');
  const swatches = await page.locator('.swatch').count();
  assert.ok(swatches >= 1, 'brand colour suggestion appears');
  await page.click('.found .logos button');
  await page.waitForFunction(() => document.querySelector('.logo-frame img'));
  if (spec.setPrimary) { await page.fill('#f-ph', spec.setPrimary); }
  await page.selectOption('#f-ind', spec.industry || 'hospitality');
  await page.selectOption('#f-cur', spec.currency || 'USD');
  for (const l of spec.locations) { await page.fill('#f-loc', l); await page.press('#f-loc', 'Enter'); }
  await page.click('.chip-list li:first-child button'); // remove the seeded "Main"
  if (spec.font) await page.selectOption('#f-font', spec.font);
  if (spec.appName) await page.fill('#f-app', spec.appName);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(shots, spec.key + '-signup.png'), fullPage: true });
  // consent is required
  await page.click('button[type=submit]');
  await page.waitForSelector('.errors');
  assert.match(await page.textContent('.errors'), /allowed to use/i); ok(spec.key + ': consent is enforced');
  await page.check('#f-consent');
  await Promise.all([page.waitForURL(/app\.html\?t=/), page.click('button[type=submit]')]);
  await page.waitForSelector('.kpis');
  await page.waitForTimeout(600);
  return { ctx, page, problems };
}

(async () => {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-e2e-')), 'tenants.json');
  const app = createServer({ dataFile, allowPrivateFetch: true });
  const port = await listen(app), base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch();
  const sites = [];
  try {
    /* 1. terracotta café, serif font, custom app name */
    const cafe = brandSite({ name: 'Acme Roasters', color: '#C2410C' }); const cp = await listen(cafe); sites.push(cafe);
    let { ctx, page, problems } = await signup(browser, base, `http://127.0.0.1:${cp}/`, { key: 'cafe', name: 'Acme Roasters', locations: ['Old Town', 'Riverside', 'Airport'], font: 'lora', appName: 'Acme Numbers', currency: 'GBP' });
    const css = (v) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);
    const expect = T.buildTheme({ primary: '#C2410C', font: 'lora', logoLum: null });
    const mode = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.equal((await css('--primary-fill')).toUpperCase(), expect[mode].vars['--primary-fill'], 'tenant primary applied to the app'); ok('cafe: brand colour applied to the app (' + mode + ')');
    assert.match(await css('--font'), /Lora/); ok('cafe: brand font applied');
    assert.ok(await page.locator('.side .logo-chip img').count(), 'logo in sidebar'); ok('cafe: pulled logo shown in the sidebar');
    assert.equal(await page.title(), 'Today — Acme Numbers'); ok('cafe: white-label app name used in the title');
    const body = await page.textContent('main');
    for (const l of ['Old Town', 'Riverside', 'Airport']) assert.ok(body.includes(l), l); ok('cafe: their three locations drive the data');
    assert.ok(/£/.test(body), 'currency'); ok('cafe: currency follows the profile (GBP)');
    assert.ok(!(await page.textContent('.side')).includes('dashboards.business') || /Powered by/.test(await page.textContent('.side'))); 
    await page.screenshot({ path: path.join(shots, 'cafe-app-' + mode + '.png') });
    // dark mode toggle re-themes everything
    for (let i = 0; i < 3 && (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === mode; i++) { await page.click('button[aria-label^="Colour mode"]'); await page.waitForTimeout(200); }
    await page.waitForTimeout(300);
    const m2 = await page.evaluate(() => document.documentElement.getAttribute('data-theme')); assert.notEqual(m2, mode);
    assert.equal((await css('--primary-fill')).toUpperCase(), expect[m2].vars['--primary-fill']);
    await page.screenshot({ path: path.join(shots, 'cafe-app-' + m2 + '.png') }); ok('cafe: colour mode toggle swaps to the matching generated theme');
    // every other page loads without errors under the tenant theme
    for (const pg of ['dashboards.html', 'alerts.html', 'analyst.html', 'sources.html', 'goals.html', 'settings.html']) {
      await page.goto(base + '/' + pg + '?t=' + new URL(page.url()).searchParams.get('t'));
      await page.waitForSelector('#content > *, .setup', { timeout: 8000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(shots, 'cafe-' + pg.replace('.html', '') + '.png') });
    }
    ok('cafe: all six other screens render'); 
    // the analyst answers from the profile's own data
    await page.goto(base + '/analyst.html?t=' + new URL(page.url()).searchParams.get('t'));
    await page.waitForSelector('.chips .chip'); await page.click('.chips .chip:nth-child(2)');
    await page.waitForSelector('.msg.bot:nth-of-type(2), .chat .msg.bot >> nth=1');
    const answer = await page.textContent('.panel');
    assert.ok(/Old Town|Riverside|Airport/.test(answer) && /labour cost/i.test(answer)); ok('cafe: analyst answer names their locations and labour target');
    // goals: editing a target persists through the API with the edit key
    await page.goto(base + '/goals.html?t=' + new URL(page.url()).searchParams.get('t'));
    await page.waitForSelector('#g-rev'); await page.fill('#g-rev', '12345'); await page.click('text=Save targets');
    await page.waitForSelector('.toast'); await page.reload(); await page.waitForSelector('#g-rev');
    assert.equal(await page.inputValue('#g-rev'), '12345'); ok('cafe: edited target saved to the server and survives reload');
    const id = new URL(page.url()).searchParams.get('t');
    const stored = await (await fetch(base + '/api/tenants/' + id)).json();
    assert.equal(stored.profile.targets.dailyRevenue, 12345);
    // a different browser (no edit key) can view but not save
    const other = await browser.newContext(); const op = await other.newPage();
    await op.goto(base + '/goals.html?t=' + id); await op.waitForSelector('#g-rev');
    assert.equal(await op.locator('button:has-text("Save targets")').isDisabled(), true); ok('cafe: another browser cannot edit without the key');
    await other.close();
    assert.deepEqual(problems, [], 'no console errors: ' + problems.join(' | ')); ok('cafe: no console or page errors');
    await ctx.close();

    /* 2. yellow brand + dark logo: the awkward cases */
    const yellow = brandSite({ name: 'Sunny Plumbing', color: '#FFE600', logoColor: '#101010' }); const yp = await listen(yellow); sites.push(yellow);
    ({ ctx, page, problems } = await signup(browser, base, `http://127.0.0.1:${yp}/`, { key: 'yellow', name: 'Sunny Plumbing', industry: 'services', currency: 'AUD', locations: ['North', 'South'], scheme: 'dark' }));
    const y = T.buildTheme({ primary: '#FFE600', logoLum: await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('db.profile.')))).brand.logoLum) });
    const ym = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.equal((await css('--on-primary')).toUpperCase(), y[ym].vars['--on-primary']); ok('yellow: button text flips to dark so it stays readable');
    assert.equal((await css('--primary-fill')).toUpperCase(), '#FFE600'); ok('yellow: the brand yellow itself is preserved');
    const chip = (await css('--logo-chip')).toUpperCase();
    assert.ok(chip === '#FFFFFF', 'dark logo gets a white chip on the dark surface, got ' + chip); ok('yellow: dark logo on dark surface gets a backing chip');
    assert.ok(/Utilisation/.test(await page.textContent('main'))); ok('yellow: services industry uses utilisation, not labour cost');
    await page.screenshot({ path: path.join(shots, 'yellow-app.png') });
    assert.deepEqual(problems, []); await ctx.close();

    /* 3. hostile website address is refused by a production-mode server */
    const prod = createServer({ dataFile, allowPrivateFetch: false }); const pp = await listen(prod);
    const r = await fetch(`http://127.0.0.1:${pp}/api/brand/extract`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' }) });
    assert.equal(r.status, 422); ok('production mode: cloud-metadata address refused'); prod.close();
    console.log('\nE2E passed. Screenshots in ' + shots);
  } catch (e) {
    console.error('\nE2E FAILED:', e.message); process.exitCode = 1;
  } finally {
    await browser.close(); sites.forEach((s) => s.close()); app.closeAllConnections?.(); app.close();
  }
})();
