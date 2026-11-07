/*
 * Logo handling in the browser. Whatever the customer uploads or we fetch is drawn onto a canvas and
 * re-encoded as a small PNG, which (a) strips anything executable from SVGs, (b) gives every tenant a
 * predictable file, and (c) lets us read the logo's dominant colour and whether it needs a backing chip.
 */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  const U = () => window.DBTheme.util;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be read as an image.'));
      img.decoding = 'async';
      img.src = src;
    });
  }

  /** Draw to a canvas at up to maxW x maxH (kept in proportion, small icons scaled up at most 4x). */
  function toCanvas(img, maxW, maxH) {
    const nw = img.naturalWidth || img.width || 256, nh = img.naturalHeight || img.height || 256;
    const k = Math.min(maxW / nw, maxH / nh, 4);
    const w = Math.max(1, Math.round(nw * k)), hgt = Math.max(1, Math.round(nh * k));
    const c = document.createElement('canvas'); c.width = w; c.height = hgt;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, hgt);
    return c;
  }

  /** Most prominent saturated colour, plus how the logo sits on a surface. */
  function analyse(canvas) {
    const s = Math.min(1, 96 / Math.max(canvas.width, canvas.height));
    const w = Math.max(1, Math.round(canvas.width * s)), hgt = Math.max(1, Math.round(canvas.height * s));
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = hgt;
    const ctx = tmp.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, w, hgt);
    const d = ctx.getImageData(0, 0, w, hgt).data;
    const buckets = new Map();
    let opaque = 0, lumSum = 0;
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      opaque++;
      lumSum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; buckets.set(key, b);
    }
    const total = w * hgt;
    let best = null, bestScore = 0;
    buckets.forEach((b) => {
      const hex = U().toHex([b.r / b.n, b.g / b.n, b.b / b.n]);
      const { L, C } = U().hexToLch(hex);
      if (C < 0.05 || L > 0.95 || L < 0.12) return; // ignore white, black and grey
      const score = b.n * (0.3 + C / 0.2);
      if (score > bestScore) { bestScore = score; best = hex; }
    });
    const opaqueFraction = opaque / total;
    return {
      dominant: best,
      // A logo that brings its own background (a filled rectangle) needs no chip; a transparent one might vanish.
      lum: opaque && opaqueFraction < 0.92 ? Math.round((lumSum / opaque) * 1000) / 1000 : null,
      opaqueFraction,
    };
  }

  /** PNG data URL, shrunk until it fits the 250 KB limit. */
  function encode(img) {
    let maxW = 512, maxH = 256;
    for (let i = 0; i < 5; i++) {
      const c = toCanvas(img, maxW, maxH), url = c.toDataURL('image/png');
      if (url.length * 0.75 <= 240 * 1024) return { url, canvas: c };
      maxW = Math.round(maxW * 0.7); maxH = Math.round(maxH * 0.7);
    }
    throw new Error('That logo is too detailed to store. Try a simpler file.');
  }

  /**
   * Square 192 and 512 px icons for "install as an app". A logo sits centred on white (safe for any logo colour);
   * with no logo, the initials sit on the brand colour. Returns null if the result would be too big to store.
   */
  async function makeIcons(logoDataUrl, name, fillHex, onHex) {
    const out = {};
    const img = logoDataUrl ? await loadImage(logoDataUrl) : null;
    for (const size of [192, 512]) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const ctx = c.getContext('2d');
      if (img) {
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size);
        const box = size * 0.68, k = Math.min(box / (img.naturalWidth || 256), box / (img.naturalHeight || 256));
        const w = (img.naturalWidth || 256) * k, hgt = (img.naturalHeight || 256) * k;
        ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, (size - w) / 2, (size - hgt) / 2, w, hgt);
      } else {
        ctx.fillStyle = fillHex; ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = onHex; ctx.font = `700 ${Math.round(size * 0.42)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'), size / 2, size / 2 + size * 0.03);
      }
      const url = c.toDataURL('image/png');
      if (url.length * 0.75 > 110 * 1024) return null;
      out[size] = url;
    }
    return { icon192: out[192], icon512: out[512] };
  }

  DB.img = { loadImage, toCanvas, analyse, encode, makeIcons };
})();
