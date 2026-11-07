/* Tiny DOM helpers. Text always goes through textContent, never innerHTML, because tenant-supplied text is untrusted. */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function apply(el, attrs) {
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  function append(el, kids) {
    for (const c of kids) {
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) append(el, c);
      else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }
  DB.h = function (tag, attrs) { const el = document.createElement(tag); apply(el, attrs); append(el, Array.prototype.slice.call(arguments, 2)); return el; };
  DB.s = function (tag, attrs) { const el = document.createElementNS(SVG_NS, tag); apply(el, attrs); append(el, Array.prototype.slice.call(arguments, 2)); return el; };
  /** Append children, skipping null, undefined and false (the native append() would print the word "null"). */
  DB.add = function (el) { append(el, Array.prototype.slice.call(arguments, 1)); return el; };
  DB.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /** Inline icons (stroke style). Fixed set, so no external requests. */
  const ICONS = {
    home: 'M3 12l9-8 9 8M5 10v10h14V10',
    bars: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0',
    spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'M6 6l12 12M18 6L6 18',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    plus: 'M12 5v14M5 12h14',
    send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    up: 'M12 19V5M5 12l7-7 7 7',
    down: 'M12 5v14M5 12l7 7 7-7',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  };
  DB.icon = function (name, size) {
    const svg = DB.s('svg', { viewBox: '0 0 24 24', width: size || 18, height: size || 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
    svg.appendChild(DB.s('path', { d: ICONS[name] || ICONS.grid }));
    return svg;
  };

  DB.toast = function (msg, kind) {
    let host = document.getElementById('toasts');
    if (!host) { host = DB.h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(host); }
    const t = DB.h('div', { class: 'toast ' + (kind || '') , role: 'status' }, msg);
    host.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  };
})();
