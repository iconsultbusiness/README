/*
 * Sales CSV parser, shared by the browser (for the preview) and the server (which re-checks everything).
 *
 * One row per day per location. Needed: a date and revenue. Optional: location, orders/jobs, and
 *   hospitality and retail: labour cost (money) or labour %    services: utilisation %
 * Rows for the same day and location are combined. Anything unclear is reported with its line number
 * instead of guessed at, because a wrong guess would put wrong numbers in front of an owner.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DBCsv = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LIMITS = { lines: 50000, locations: 12, keepDays: 400, maxErrorsShown: 15 };

  const HEADERS = {
    date: ['date', 'day', 'tradingdate', 'businessdate', 'saledate'],
    location: ['location', 'site', 'store', 'branch', 'venue', 'outlet', 'shop', 'restaurant', 'clinic'],
    revenue: ['revenue', 'sales', 'netsales', 'totalsales', 'turnover', 'takings', 'grosssales', 'income', 'amount'],
    volume: ['orders', 'transactions', 'jobs', 'volume', 'tickets', 'covers', 'bookings', 'ordercount', 'transactioncount', 'jobcount', 'appointments'],
    labourCost: ['labour', 'labor', 'labourcost', 'laborcost', 'wages', 'labourspend', 'laborspend', 'staffcost', 'payroll'],
    labourPct: ['labourpct', 'laborpct', 'labourcostpct', 'laborcostpct', 'labourpercent', 'laborpercent', 'wagepct'],
    utilisation: ['utilisation', 'utilization', 'utilisationpct', 'utilizationpct', 'utilisationpercent', 'utilizationpercent'],
  };

  function splitRows(text, delim) {
    const rows = []; let row = [], cell = '', q = false, line = 1, rowLine = 1;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else { if (c === '\n') line++; cell += c; }
      } else if (c === '"' && cell === '') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push({ line: rowLine, cells: row }); row = []; cell = ''; line++; rowLine = line;
      } else cell += c;
    }
    if (q) return { error: 'A quoted value is never closed.' };
    if (cell !== '' || row.length) { row.push(cell); rows.push({ line: rowLine, cells: row }); }
    return { rows };
  }

  const norm = (h) => String(h).toLowerCase().replace(/%/g, 'pct').replace(/[^a-z0-9]/g, '');
  function findColumns(headerCells) {
    const idx = {}, norms = headerCells.map(norm);
    for (const key of Object.keys(HEADERS)) {
      const i = norms.findIndex((n) => HEADERS[key].includes(n));
      if (i >= 0) idx[key] = i;
    }
    return idx;
  }

  function parseNumber(raw) {
    let s = String(raw).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[\s '’]/g, '').replace(/[^\d.,\-+%]/g, '').replace(/%$/, '');
    if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      const dec = lastDot > lastComma ? '.' : ',', thou = dec === '.' ? ',' : '.';
      s = s.split(thou).join('').replace(dec, '.');
    } else if (lastComma >= 0) {
      s = /,\d{1,2}$/.test(s) && s.indexOf(',') === lastComma ? s.replace(',', '.') : s.split(',').join('');
    } else if ((s.match(/\./g) || []).length > 1) s = s.split('.').join('');
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -n : n) : NaN;
  }

  const pad = (n) => String(n).padStart(2, '0');
  function validIso(y, m, d) {
    if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  /** Returns iso date, or 'AMBIG:a:b:y' for d/m vs m/d, or null. */
  function parseDate(raw, order) {
    const s = String(raw).trim().replace(/T.*$/, '').replace(/\s+\d{1,2}:\d{2}.*$/, '');
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (m) return validIso(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
    if (!m) return null;
    const a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (order === 'dmy') return validIso(y, b, a);
    if (order === 'mdy') return validIso(y, a, b);
    if (a > 12 && b <= 12) return validIso(y, b, a);
    if (b > 12 && a <= 12) return validIso(y, a, b);
    if (a === b) return validIso(y, a, b);
    return `AMBIG:${a}:${b}:${y}`;
  }

  const cleanName = (v) => String(v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

  /**
   * opts: { industry, dateOrder?: 'dmy'|'mdy', today?: 'YYYY-MM-DD' }
   * -> { ok, rows:[{date,location,revenue,volume,eff}], errors:[{line,message}], warnings:[], summary }
   */
  function parseSales(input, opts) {
    opts = opts || {};
    const errors = [], warnings = [];
    const fail = (message) => ({ ok: false, rows: [], errors: [{ line: 0, message }], warnings, summary: null });
    if (typeof input !== 'string' || !input.trim()) return fail('The file is empty.');
    let text = input.replace(/^﻿/, '');
    if (/\u0000/.test(text)) return fail('That does not look like a text CSV file.');
    const first = text.split(/\r?\n/, 1)[0];
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false; for (const ch of first) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    if (!counts[delim]) return fail('Could not find columns. Save the file as CSV with a header row.');
    const split = splitRows(text, delim);
    if (split.error) return fail(split.error);
    const all = split.rows;
    if (all.length > LIMITS.lines) return fail(`The file has more than ${LIMITS.lines.toLocaleString('en-US')} rows. Export a shorter period.`);
    const col = findColumns(all[0].cells);
    if (col.date === undefined) return fail('No date column found. Name it "date".');
    if (col.revenue === undefined) return fail('No revenue column found. Name it "revenue" or "sales".');
    const services = opts.industry === 'services';
    const ignored = [];
    if (services) { if (col.labourCost !== undefined) ignored.push('labour cost'); if (col.labourPct !== undefined) ignored.push('labour %'); delete col.labourCost; delete col.labourPct; }
    else if (col.utilisation !== undefined) { ignored.push('utilisation'); delete col.utilisation; }
    if (ignored.length) warnings.push(`Ignored the ${ignored.join(' and ')} column, which does not apply to this industry.`);

    // Decide d/m vs m/d once for the whole file, not per row.
    let order = opts.dateOrder || null;
    if (!order) {
      let dmy = false, mdy = false;
      for (let i = 1; i < all.length; i++) {
        const raw = all[i].cells[col.date];
        const m = raw && /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(String(raw).trim());
        if (m) { if (+m[1] > 12) dmy = true; if (+m[2] > 12) mdy = true; }
      }
      if (dmy && mdy) return fail('Dates mix day-first and month-first. Use YYYY-MM-DD.');
      order = dmy ? 'dmy' : mdy ? 'mdy' : null;
    }

    const today = opts.today || new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.parse(today + 'T00:00:00Z') + 2 * 86400000).toISOString().slice(0, 10);
    const cells = new Map(); // key -> accumulator
    const locNames = new Map(); // lowercase -> first spelling
    let blank = 0, combined = 0, pctRatioRows = 0, pctFraction = 0;
    const err = (line, message) => { if (errors.length < 200) errors.push({ line, message }); else errors.overflow = (errors.overflow || 0) + 1; };

    for (let r = 1; r < all.length; r++) {
      const { line, cells: c } = all[r];
      if (c.every((v) => !String(v).trim())) { blank++; continue; }
      const dateRaw = c[col.date], date = dateRaw === undefined ? null : parseDate(dateRaw, order);
      if (!date) { err(line, `"${String(dateRaw === undefined ? '' : dateRaw).slice(0, 20)}" is not a date. Use YYYY-MM-DD.`); continue; }
      if (date.startsWith('AMBIG:')) { return { ok: false, rows: [], errors: [{ line, message: `The date "${String(dateRaw).trim()}" could be day-first or month-first. Pick one, or use YYYY-MM-DD.` }], warnings, summary: null, ambiguousDates: true }; }
      if (date > horizon) { err(line, `${date} is in the future.`); continue; }
      const rev = parseNumber(c[col.revenue]);
      if (rev === null || Number.isNaN(rev)) { err(line, `Revenue "${String(c[col.revenue] === undefined ? '' : c[col.revenue]).slice(0, 20)}" is not a number.`); continue; }
      if (rev < 0 || rev > 1e9) { err(line, `Revenue ${rev} is outside the allowed range (0 to 1,000,000,000).`); continue; }
      let loc = 'Main';
      if (col.location !== undefined) {
        loc = cleanName(c[col.location] === undefined ? '' : c[col.location]);
        if (!loc) { err(line, 'Location is blank.'); continue; }
      }
      const lk = loc.toLowerCase();
      if (!locNames.has(lk)) locNames.set(lk, loc);
      loc = locNames.get(lk);

      let vol = null;
      if (col.volume !== undefined && String(c[col.volume] === undefined ? '' : c[col.volume]).trim() !== '') {
        vol = parseNumber(c[col.volume]);
        if (Number.isNaN(vol) || vol < 0 || vol > 1e8) { err(line, `${DB_VOL(opts)} "${String(c[col.volume]).slice(0, 20)}" is not a valid count.`); continue; }
      }
      let labourCost = null, pct = null;
      if (col.labourCost !== undefined && String(c[col.labourCost] === undefined ? '' : c[col.labourCost]).trim() !== '') {
        labourCost = parseNumber(c[col.labourCost]);
        if (Number.isNaN(labourCost) || labourCost < 0 || labourCost > 1e9) { err(line, `Labour cost "${String(c[col.labourCost]).slice(0, 20)}" is not a valid amount.`); continue; }
      }
      const pctCol = services ? col.utilisation : col.labourPct;
      if (pctCol !== undefined && String(c[pctCol] === undefined ? '' : c[pctCol]).trim() !== '') {
        pct = parseNumber(c[pctCol]);
        if (Number.isNaN(pct) || pct < 0 || pct > 300) { err(line, `Percentage "${String(c[pctCol]).slice(0, 20)}" is not valid (0 to 100).`); continue; }
        pctRatioRows++; if (pct <= 1) pctFraction++;
      }

      const key = date + '\u0001' + loc;
      let a = cells.get(key);
      if (!a) { a = { date, location: loc, revenue: 0, volume: null, labour: null, pctW: 0, pctRev: 0 }; cells.set(key, a); } else combined++;
      a.revenue += rev;
      if (vol !== null) a.volume = (a.volume || 0) + vol;
      if (labourCost !== null) a.labour = (a.labour || 0) + labourCost;
      if (pct !== null) { a.pctW += pct * Math.max(rev, 1e-9); a.pctRev += Math.max(rev, 1e-9); }
    }

    if (errors.length) {
      const more = errors.overflow || 0;
      return { ok: false, rows: [], errors: errors.slice(0, LIMITS.maxErrorsShown).concat(errors.length > LIMITS.maxErrorsShown || more ? [{ line: 0, message: `…and ${errors.length - LIMITS.maxErrorsShown + more} more problems.` }] : []), warnings, summary: null };
    }
    if (!cells.size) return fail('No data rows found under the header.');

    const fractions = pctRatioRows > 0 && pctFraction === pctRatioRows;
    if (fractions) warnings.push('Percentages looked like fractions (0.28), so they were read as 28%.');
    let rows = [...cells.values()].map((a) => {
      let eff = null;
      if (a.labour !== null) eff = a.revenue > 0 ? (a.labour / a.revenue) * 100 : null;
      else if (a.pctRev > 0) eff = (a.pctW / a.pctRev) * (fractions ? 100 : 1);
      return { date: a.date, location: a.location, revenue: Math.round(a.revenue * 100) / 100, volume: a.volume === null ? null : Math.round(a.volume * 100) / 100, eff: eff === null ? null : Math.round(Math.min(eff, 999) * 100) / 100 };
    });
    rows.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.location < y.location ? -1 : 1));

    const maxDate = rows[rows.length - 1].date;
    const cutoff = new Date(Date.parse(maxDate + 'T00:00:00Z') - (LIMITS.keepDays - 1) * 86400000).toISOString().slice(0, 10);
    const before = rows.length; rows = rows.filter((x) => x.date >= cutoff);
    if (rows.length < before) warnings.push(`Kept the most recent ${LIMITS.keepDays} days. ${before - rows.length} older rows were left out.`);

    const locations = [...new Set(rows.map((x) => x.location))];
    if (locations.length > LIMITS.locations) return fail(`The file has ${locations.length} locations. This plan supports up to ${LIMITS.locations}.`);
    if (combined) warnings.push(`${combined} rows shared a day and location with another row, so they were added together.`);
    if (blank) warnings.push(`${blank} blank lines were skipped.`);
    const hasVolume = rows.some((x) => x.volume !== null), hasEff = rows.some((x) => x.eff !== null);
    if (!hasVolume) warnings.push(`No ${DB_VOL(opts).toLowerCase()} column, so counts and average value are not shown.`);
    if (!hasEff) warnings.push(`No ${services ? 'utilisation' : 'labour'} column, so efficiency alerts and goals are not shown.`);
    const gaps = locations.some((l) => { const ds = rows.filter((x) => x.location === l).length; return ds < rows.length / locations.length * 0.5; });
    if (gaps) warnings.push('Some locations have far fewer days than others. Missing days count as not trading.');

    return { ok: true, rows, errors: [], warnings, summary: { rows: rows.length, from: rows[0].date, to: maxDate, locations, hasVolume, hasEff, days: new Set(rows.map((x) => x.date)).size } };
  }
  function DB_VOL(opts) { return opts && opts.industry === 'services' ? 'Jobs' : opts && opts.industry === 'retail' ? 'Transactions' : 'Orders'; }

  function template(industry) {
    const s = industry === 'services';
    const head = s ? 'date,location,revenue,jobs,utilisation_pct' : 'date,location,revenue,orders,labour_cost';
    const base = new Date(Date.UTC(2026, 0, 5));
    const lines = [head];
    for (let i = 0; i < 3; i++) {
      const d = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
      for (const loc of ['Downtown', 'Harbour']) lines.push(s ? `${d},${loc},${4200 + i * 150},${9 + i},${70 + i}` : `${d},${loc},${3100 + i * 120},${118 + i * 4},${860 + i * 25}`);
    }
    return lines.join('\n') + '\n';
  }

  return { parseSales, parseNumber, parseDate, template, LIMITS };
});
