/* Number, money and date formatting for a tenant's currency, locale and time zone. */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  DB.makeFormat = function (profile) {
    const c = profile.company;
    const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
    const money0 = safe(() => new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.currency, maximumFractionDigits: 0 }), new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
    const money2 = safe(() => new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }), money0);
    const compact = safe(() => new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.currency, notation: 'compact', maximumFractionDigits: 1 }), money0);
    const int = safe(() => new Intl.NumberFormat(c.locale), new Intl.NumberFormat('en-US'));
    const dayFmt = safe(() => new Intl.DateTimeFormat(c.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }), null);
    const wdFmt = safe(() => new Intl.DateTimeFormat(c.locale, { weekday: 'long', timeZone: 'UTC' }), null);
    const wdShort = safe(() => new Intl.DateTimeFormat(c.locale, { weekday: 'short', timeZone: 'UTC' }), null);
    const monthDay = safe(() => new Intl.DateTimeFormat(c.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }), null);
    const utc = (iso) => new Date(iso + 'T12:00:00Z');
    return {
      money: (n) => money0.format(n),
      money2: (n) => money2.format(n),
      compact: (n) => compact.format(n),
      int: (n) => int.format(Math.round(n)),
      pct: (n, d) => (Math.round(n * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d)).toFixed(d == null ? 1 : d) + '%',
      signedPct: (n) => (Math.round(n) === 0 ? '0%' : (n > 0 ? '+' : '−') + Math.abs(n).toFixed(0) + '%'),
      signedPts: (n) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + ' pts',
      day: (iso) => (dayFmt ? dayFmt.format(utc(iso)) : iso),
      weekday: (iso) => (wdFmt ? wdFmt.format(utc(iso)) : iso),
      weekdayShort: (iso) => (wdShort ? wdShort.format(utc(iso)) : iso),
      monthDay: (iso) => (monthDay ? monthDay.format(utc(iso)) : iso),
      time: (h, m) => safe(() => new Intl.DateTimeFormat(c.locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2020, 0, 1, h, m || 0))), h + ':' + String(m || 0).padStart(2, '0')),
      hour: (h) => { const d = new Date(Date.UTC(2020, 0, 1, h)); return safe(() => new Intl.DateTimeFormat(c.locale, { hour: 'numeric', timeZone: 'UTC' }).format(d), h + ':00'); },
    };
  };
})();
