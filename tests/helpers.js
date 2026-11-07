/* Test helpers: a tiny PNG encoder and a fake customer website that publishes brand hints. */
const http = require('node:http');
const zlib = require('node:zlib');

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** pixel(x, y) -> [r, g, b, a] */
function makePng(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const p = pixel(x, y), o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2]; raw[o + 3] = p[3]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** A round mark on a transparent background, with a bar through it so it is not just a blob. */
function roundLogo(hex) {
  const [r, g, b] = hexToRgb(hex), S = 160;
  return makePng(S * 2, S, (x, y) => {
    const dx = x - S, dy = y - S / 2, inCircle = dx * dx + dy * dy < (S / 2 - 8) ** 2, bar = Math.abs(dy) < 8 && Math.abs(dx) < S / 2 + 40;
    return inCircle || bar ? [r, g, b, 255] : [0, 0, 0, 0];
  });
}

/** A fake website. `brand` = { name, color, logoColor } */
function brandSite(brand) {
  return http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
    if (u === '/') return send(200, 'text/html', `<!doctype html><html><head><title>${brand.name}</title>
      <meta name="theme-color" content="${brand.color}"><meta property="og:site_name" content="${brand.name}">
      <link rel="icon" href="/logo.png" sizes="64x64"></head><body><header><img class="logo" src="/logo.png" alt="${brand.name}"></header></body></html>`);
    if (u === '/logo.png') return send(200, 'image/png', roundLogo(brand.logoColor || brand.color));
    send(404, 'text/plain', 'nope');
  });
}
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
module.exports = { makePng, roundLogo, brandSite, listen };
