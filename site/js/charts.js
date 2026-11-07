/*
 * Small SVG chart kit. Rules it follows (from the colour-vision-checked palette work):
 *  - one measure per axis, never dual-axis; colour follows the entity, not its rank
 *  - thin marks, rounded data ends, 2px surface gap between filled segments
 *  - a legend for 2+ series, direct labels where there is room, tooltips on every mark
 *  - every chart redraws on resize and when the theme (light/dark/brand) changes
 */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  const { s, h } = DB;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const registry = new Set();
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  let tip;
  function showTip(clientX, clientY, lines) {
    if (!tip) { tip = h('div', { class: 'tip', role: 'tooltip' }); document.body.appendChild(tip); }
    DB.clear(tip);
    lines.forEach((l) => tip.appendChild(typeof l === 'string' ? h('div', { text: l }) : l));
    tip.classList.add('show');
    const r = tip.getBoundingClientRect();
    tip.style.left = clamp(clientX - r.width / 2, 8, window.innerWidth - r.width - 8) + 'px';
    tip.style.top = Math.max(8, clientY - r.height - 12) + 'px';
  }
  function hideTip() { if (tip) tip.classList.remove('show'); }
  const tipRow = (swatch, label, value) => h('div', { class: 'tip-row' }, swatch ? h('i', { style: { background: swatch } }) : null, h('span', { text: label }), h('b', { text: value }));

  /** Nice axis ticks. */
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  /** Attach a draw function to an <svg>; redraws on resize and theme change. */
  function mount(svg, draw) {
    const run = () => { const w = Math.floor(svg.getBoundingClientRect().width || svg.parentNode.clientWidth || 320); if (w > 0) { DB.clear(svg); draw(svg, w); } };
    const entry = { svg, run };
    registry.add(entry);
    if (window.ResizeObserver) { let last = 0; new ResizeObserver(() => { const w = svg.getBoundingClientRect().width; if (Math.abs(w - last) > 1) { last = w; run(); } }).observe(svg); }
    run();
    return entry;
  }
  window.addEventListener('db:themechange', () => requestAnimationFrame(() => registry.forEach((e) => { if (e.svg.isConnected) e.run(); else registry.delete(e); })));

  function axisText(x, y, txt, anchor) { const t = s('text', { x, y, class: 'ax', 'text-anchor': anchor || 'middle' }); t.textContent = txt; return t; }

  /**
   * Line / area chart. series: [{ name, color (css var), values[], dashed?, area?, labelLast? }]
   * opts: { xLabels[], xEvery, yFmt, height, tipTitle(i), tipValue(series,i), marker: index of "now" }
   */
  DB.charts = DB.charts || {};
  DB.charts.line = function (svg, opts) {
    return mount(svg, (el, W) => {
      const H = opts.height || 220, L = opts.yWidth || 46, R = 14, T = 14, B = 28;
      el.setAttribute('viewBox', `0 0 ${W} ${H}`); el.setAttribute('height', H);
      const all = opts.series.flatMap((x) => x.values.filter((v) => v !== null && v !== undefined));
      const max = opts.yMax || niceMax(Math.max(...all, 1) * 1.05);
      const n = opts.xLabels.length;
      const X = (i) => L + (i * (W - L - R)) / Math.max(n - 1, 1), Y = (v) => T + (H - T - B) * (1 - v / max);
      const grid = s('g', { class: 'grid' });
      for (let k = 0; k <= 4; k++) { const v = (max * k) / 4; grid.appendChild(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v) })); el.appendChild(axisText(L - 8, Y(v) + 4, opts.yFmt(v), 'end')); }
      el.insertBefore(grid, el.firstChild);
      const every = opts.xEvery || (W < 480 ? Math.ceil(n / 4) : Math.ceil(n / 8));
      opts.xLabels.forEach((t, i) => { if (i % every === 0) el.appendChild(axisText(X(i), H - 8, t)); });
      const path = (vals) => { let d = '', pen = false; vals.forEach((v, i) => { if (v === null || v === undefined) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return d; };
      const gid = 'fade' + Math.random().toString(36).slice(2, 7);
      opts.series.forEach((ser) => {
        const col = css(ser.color);
        if (ser.area) {
          const last = ser.values.reduce((a, v, i) => (v !== null && v !== undefined ? i : a), 0);
          const defs = s('defs', {}, s('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, s('stop', { offset: 0, 'stop-color': col, 'stop-opacity': 0.26 }), s('stop', { offset: 1, 'stop-color': col, 'stop-opacity': 0 })));
          el.appendChild(defs);
          el.appendChild(s('path', { d: path(ser.values.slice(0, last + 1)) + `L${X(last)} ${Y(0)}L${X(0)} ${Y(0)}Z`, fill: `url(#${gid})` }));
        }
        el.appendChild(s('path', { d: path(ser.values), fill: 'none', stroke: col, 'stroke-width': ser.dashed ? 1.75 : 2.25, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': ser.dashed ? '4 5' : null }));
        if (ser.labelLast) {
          const li = ser.values.reduce((a, v, i) => (v !== null && v !== undefined ? i : a), 0);
          el.appendChild(s('circle', { cx: X(li), cy: Y(ser.values[li]), r: 5, fill: col, stroke: css('--surface'), 'stroke-width': 2 }));
          const lab = s('text', { x: clamp(X(li), 60, W - 60), y: Y(ser.values[li]) - 11, class: 'lbl', 'text-anchor': 'middle' }); lab.textContent = ser.labelLast; el.appendChild(lab);
        }
      });
      const cross = s('line', { y1: T, y2: H - B, class: 'cross', opacity: 0 });
      el.appendChild(cross);
      const hit = s('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent', tabindex: 0, role: 'img', 'aria-label': opts.label || 'Line chart' });
      const move = (cx, cy) => {
        const r = el.getBoundingClientRect(); const px = ((cx - r.left) * W) / r.width;
        const i = clamp(Math.round(((px - L) / (W - L - R)) * (n - 1)), 0, n - 1);
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
        const rows = [h('div', { class: 'tip-title', text: opts.tipTitle ? opts.tipTitle(i) : opts.xLabels[i] })];
        opts.series.forEach((ser) => rows.push(tipRow(css(ser.color), ser.name, ser.values[i] === null || ser.values[i] === undefined ? '—' : (opts.tipValue || opts.yFmt)(ser.values[i], ser))));
        const top = Math.min(...opts.series.map((x) => (x.values[i] == null ? Infinity : Y(x.values[i]))));
        showTip(r.left + (X(i) * r.width) / W, r.top + (Math.min(top, H) * r.height) / H, rows);
      };
      hit.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
      hit.addEventListener('touchmove', (e) => { const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
      hit.addEventListener('mouseleave', () => { cross.setAttribute('opacity', 0); hideTip(); });
      hit.addEventListener('touchend', () => { cross.setAttribute('opacity', 0); hideTip(); });
      el.appendChild(hit);
    });
  };

  /** Horizontal bars, single measure. rows: [{ label, value, color?, note? }] */
  DB.charts.hbar = function (svg, opts) {
    return mount(svg, (el, W) => {
      const rowH = 38, T = 6, H = T + opts.rows.length * rowH + 4;
      el.setAttribute('viewBox', `0 0 ${W} ${H}`); el.setAttribute('height', H);
      const labW = clamp(Math.max(...opts.rows.map((r) => r.label.length)) * 7.2 + 12, 60, W * 0.38), valW = 76;
      const max = opts.max || Math.max(...opts.rows.map((r) => r.value)) * 1.02;
      opts.rows.forEach((r, i) => {
        const y = T + i * rowH + 5, bw = W - labW - valW, w = Math.max(2, (bw * r.value) / max);
        const lab = s('text', { x: labW - 10, y: y + 17, class: 'ax', 'text-anchor': 'end' }); lab.textContent = r.label; lab.style.fill = css('--text-2'); el.appendChild(lab);
        el.appendChild(s('rect', { x: labW, y, width: bw, height: 24, rx: 4, fill: css('--chart-track') }));
        const bar = s('rect', { x: labW, y, width: w, height: 24, rx: 4, fill: css(r.color || '--chart-1'), class: 'mark' });
        bar.addEventListener('mousemove', (e) => showTip(e.clientX, e.clientY, [tipRow(css(r.color || '--chart-1'), r.label, opts.fmt(r.value))].concat(r.note ? [h('div', { class: 'tip-note', text: r.note })] : [])));
        bar.addEventListener('mouseleave', hideTip);
        el.appendChild(bar);
        const v = s('text', { x: W - valW + 10, y: y + 17, class: 'lbl' }); v.textContent = opts.fmt(r.value); el.appendChild(v);
        if (opts.marker != null) { const mx = labW + (bw * opts.marker) / max; if (i === 0) el.appendChild(s('line', { x1: mx, x2: mx, y1: T, y2: H - 4, class: 'target-line' })); }
      });
    });
  };

  /** Vertical bars, one or two series. groups: [{label, values:[a,b]}], series:[{name,color}] */
  DB.charts.vbar = function (svg, opts) {
    return mount(svg, (el, W) => {
      const H = opts.height || 200, L = opts.yWidth || 46, R = 8, T = 12, B = 28;
      el.setAttribute('viewBox', `0 0 ${W} ${H}`); el.setAttribute('height', H);
      const max = niceMax(Math.max(...opts.groups.flatMap((g) => g.values)) * 1.05);
      const Y = (v) => T + (H - T - B) * (1 - v / max);
      const grid = s('g', { class: 'grid' });
      for (let k = 0; k <= 4; k++) { const v = (max * k) / 4; grid.appendChild(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v) })); el.appendChild(axisText(L - 8, Y(v) + 4, opts.yFmt(v), 'end')); }
      el.insertBefore(grid, el.firstChild);
      const gw = (W - L - R) / opts.groups.length, k = opts.series.length, bw = Math.min(26, (gw * 0.7 - (k - 1) * 2) / k);
      opts.groups.forEach((g, gi) => {
        const x0 = L + gi * gw + (gw - (bw * k + (k - 1) * 2)) / 2;
        g.values.forEach((v, si) => {
          const x = x0 + si * (bw + 2), y = Y(v), col = css(opts.series[si].color);
          const bar = s('path', { d: `M${x} ${H - B}V${y + 4}Q${x} ${y} ${x + 4} ${y}H${x + bw - 4}Q${x + bw} ${y} ${x + bw} ${y + 4}V${H - B}Z`, fill: col, class: 'mark' });
          bar.addEventListener('mousemove', (e) => showTip(e.clientX, e.clientY, [h('div', { class: 'tip-title', text: g.title || g.label })].concat(opts.series.map((ss, j) => tipRow(css(ss.color), ss.name, opts.yFmt(g.values[j]))))));
          bar.addEventListener('mouseleave', hideTip);
          el.appendChild(bar);
        });
        el.appendChild(axisText(L + gi * gw + gw / 2, H - 8, g.label));
      });
    });
  };

  /** One stacked bar split into segments with a 2px gap. segs: [{label, value, color}] */
  DB.charts.stack = function (svg, opts) {
    return mount(svg, (el, W) => {
      const H = 52, total = opts.segs.reduce((a, x) => a + x.value, 0); let x = 0;
      el.setAttribute('viewBox', `0 0 ${W} ${H}`); el.setAttribute('height', H);
      opts.segs.forEach((sg) => {
        const w = Math.max(3, (W * sg.value) / total - 2), col = css(sg.color);
        const r = s('rect', { x, y: 8, width: w, height: 34, rx: 5, fill: col, class: 'mark' });
        r.addEventListener('mousemove', (e) => showTip(e.clientX, e.clientY, [tipRow(col, sg.label, opts.fmt(sg.value) + ' · ' + Math.round((sg.value / total) * 100) + '%')]));
        r.addEventListener('mouseleave', hideTip);
        el.appendChild(r);
        if (w > 44) { const t = s('text', { x: x + w / 2, y: 30, 'text-anchor': 'middle', class: 'seg-label' }); t.textContent = Math.round((sg.value / total) * 100) + '%'; t.style.fill = DBTheme.util.contrast('#FFFFFF', col) >= DBTheme.util.contrast('#0F1222', col) ? '#FFFFFF' : '#0F1222'; el.appendChild(t); }
        x += w + 2;
      });
    });
  };

  /** Tiny trend line with no axes; for KPI tiles and small multiples. */
  DB.charts.spark = function (svg, opts) {
    return mount(svg, (el, W) => {
      const H = opts.height || 36, pad = 3, v = opts.values, min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
      el.setAttribute('viewBox', `0 0 ${W} ${H}`); el.setAttribute('height', H);
      const X = (i) => pad + (i * (W - pad * 2)) / (v.length - 1), Y = (x) => H - pad - ((x - min) / span) * (H - pad * 2);
      const col = css(opts.color || '--chart-1');
      el.appendChild(s('path', { d: v.map((x, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1)).join(''), fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      el.appendChild(s('circle', { cx: X(v.length - 1), cy: Y(v[v.length - 1]), r: 3, fill: col }));
    });
  };

  DB.charts.hideTip = hideTip;
})();
