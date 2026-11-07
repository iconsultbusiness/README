const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SITE = path.join(__dirname, '..', 'site');
const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test('every page loads only scripts and styles that exist', () => {
  assert.ok(pages.length >= 9, 'expected the full set of pages');
  for (const f of pages) {
    const html = fs.readFileSync(path.join(SITE, f), 'utf8');
    for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*?(?:src|href)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^(https?:|data:|#|mailto:)/.test(ref) || ref.startsWith('index.html')) continue;
      const clean = ref.split(/[?#]/)[0];
      if (clean.endsWith('.html')) { assert.ok(fs.existsSync(path.join(SITE, clean)), `${f} links to missing page ${ref}`); continue; }
      assert.ok(fs.existsSync(path.join(SITE, clean)), `${f} references missing file ${ref}`);
    }
  }
});

test('no inline scripts or inline event handlers (the Content Security Policy forbids them)', () => {
  for (const f of pages) {
    const html = fs.readFileSync(path.join(SITE, f), 'utf8');
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) assert.match(m[1], /\bsrc=/, `${f} has an inline <script>`);
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html), `${f} has an inline event handler`);
  }
});

test('page scripts never write tenant text as HTML', () => {
  for (const file of walk(path.join(SITE, 'js'))) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\(/.test(src), `${path.relative(SITE, file)} writes HTML`);
    assert.ok(!/\beval\(|new Function\(/.test(src), `${path.relative(SITE, file)} uses eval`);
  }
});

test('each app page declares a registered page script', () => {
  for (const f of pages) {
    const html = fs.readFileSync(path.join(SITE, f), 'utf8');
    const m = /<body data-page="([a-z]+)"/.exec(html);
    if (!m) continue;
    assert.ok(fs.existsSync(path.join(SITE, 'js', 'pages', m[1] + '.js')), `${f}: missing js/pages/${m[1]}.js`);
    assert.ok(html.includes(`js/pages/${m[1]}.js`), `${f} does not load its page script`);
  }
});

test('the landing page makes no claims the product cannot back up', () => {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').toLowerCase();
  for (const banned of ['2,400', '4.9', 'rated the top', 'testimonial', 'soc 2', 'iso 27001', '60+ integrations', 'free for 14 days', '$49', '$99']) {
    assert.ok(!html.includes(banned), `index.html still contains "${banned}"`);
  }
});
