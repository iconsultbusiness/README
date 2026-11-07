/*
 * Sample-data engine. THERE ARE NO LIVE CONNECTORS YET: every number in the app
 * is generated here, deterministically, from the customer's own profile (their
 * locations, industry, currency, time zone and targets). That is what makes the
 * preview feel like their business, and it is also exactly the layer a real
 * connector would replace.
 */
(function () {
  'use strict';
  const DB = (window.DB = window.DB || {});
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const CURRENCY_SCALE = { USD: 1, EUR: 0.92, GBP: 0.8, AUD: 1.5, CAD: 1.35, NZD: 1.65, CHF: 0.9, SEK: 10.5, NOK: 10.8, DKK: 6.9, BRL: 5, MXN: 17, ZAR: 18, INR: 83, SGD: 1.35, AED: 3.67, JPY: 150 };
  const AVG_VALUE = { hospitality: 26, retail: 58, services: 380 };
  const DOW = [0.82, 0.78, 0.9, 0.95, 1.03, 1.28, 1.24]; // Sun..Sat, mean 1.0
  const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const CURVE = {
    hospitality: [0.09, 0.12, 0.09, 0.07, 0.11, 0.17, 0.11, 0.06, 0.05, 0.05, 0.05, 0.03],
    retail: [0.02, 0.04, 0.07, 0.1, 0.11, 0.12, 0.12, 0.11, 0.1, 0.09, 0.08, 0.04],
    services: [0.05, 0.1, 0.13, 0.12, 0.07, 0.08, 0.12, 0.13, 0.1, 0.06, 0.03, 0.01],
  };
  const N_DAYS = 42;

  function zonedNow(tz) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const g = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: g('year'), m: g('month'), d: g('day'), hour: g('hour'), minute: g('minute') };
  }
  const iso = (dt) => dt.toISOString().slice(0, 10);

  function build(profile, seedKey) {
    const ind = DBProfile.INDUSTRIES[profile.company.industry];
    const locs = profile.locations;
    const L = locs.length;
    const rand = rng(hashStr([seedKey || '', profile.company.industry, locs.join('|')].join('::')));
    const scale = CURRENCY_SCALE[profile.company.currency] || 1;
    const avgBase = AVG_VALUE[profile.company.industry] * scale;
    const target = profile.targets;
    const dir = ind.efficiencyDir;
    const higherIsBetter = dir === 'higher';

    const now = zonedNow(profile.company.timezone);
    const inWindow = now.hour >= 11 && now.hour <= 17;
    const nowHour = inWindow ? now.hour : 14; // outside 11:00-17:59 the demo clock sits at 2pm so "today" is always mid-day
    const minute = inWindow ? now.minute : 0;
    const frac = minute / 60;
    const demoClock = !inWindow;

    const todayUtc = Date.UTC(now.y, now.m - 1, now.d, 12);
    const days = [];
    for (let i = N_DAYS - 1; i >= 0; i--) {
      const dt = new Date(todayUtc - i * 86400000);
      days.push({ date: iso(dt), dow: dt.getUTCDay(), isToday: i === 0 });
    }

    // location weights: roughly one big, one small, never wildly different
    const w = locs.map(() => 0.75 + rand() * 0.5);
    const wSum = w.reduce((a, b) => a + b, 0);
    const locBase = w.map((x) => (target.dailyRevenue * x) / wSum);
    // one location runs the efficiency target badly so alerts have something real to say
    const worst = Math.floor(rand() * L);
    const lf = locs.map((_, i) => (i === worst ? (higherIsBetter ? 0.92 : 1.07) : higherIsBetter ? 0.97 + rand() * 0.1 : 0.88 + rand() * 0.1));
    const avgLoc = locs.map(() => avgBase * (0.9 + rand() * 0.2));

    const series = locs.map((name, li) => {
      const out = days.map((d, di) => {
        const trend = 1 + 0.0018 * di;
        const noise = 0.92 + rand() * 0.16;
        const rev = locBase[li] * DOW[d.dow] * trend * noise * (0.93 + 0.1 * (li % 2));
        const avg = avgLoc[li] * (0.95 + rand() * 0.1);
        const vol = rev / avg;
        const eff = higherIsBetter
          ? clamp(target.efficiency * lf[li] * (0.94 + rand() * 0.1) * (0.9 + 0.1 * DOW[d.dow]), 20, 98)
          : clamp(target.efficiency * lf[li] * (0.94 + rand() * 0.12) * Math.pow(1 / DOW[d.dow], 0.35), 3, 90);
        const wts = CURVE[profile.company.industry].map((c) => c * (0.93 + rand() * 0.14));
        const wSumH = wts.reduce((a, b) => a + b, 0);
        return { date: d.date, dow: d.dow, isToday: d.isToday, rev, vol, avg, eff, hourly: wts.map((x) => (rev * x) / wSumH) };
      });
      return { name, days: out };
    });

    /* ---- today so far vs the same point last week ---- */
    const share = (h, f) => { let s = 0; for (let i = 0; i < HOURS.length; i++) { if (HOURS[i] < h) s += 1; else if (HOURS[i] === h) s += f; } return s; };
    const sofar = (hourly) => hourly.reduce((a, v, i) => a + v * (HOURS[i] < nowHour ? 1 : HOURS[i] === nowHour ? frac : 0), 0);
    const hoursElapsed = share(nowHour, frac);
    const hoursFrac = hoursElapsed / HOURS.length;
    const ti = N_DAYS - 1, li7 = N_DAYS - 8;

    const perLocation = series.map((s) => {
      const t = s.days[ti], lw = s.days[li7];
      const rev = sofar(t.hourly), revLw = sofar(lw.hourly);
      const vol = rev / t.avg, volLw = revLw / lw.avg;
      // labour accrues partly by the clock and partly with trade, so the % so far stays close to the full-day figure
      const labShare = (r, full) => 0.35 * hoursFrac + 0.65 * (r / Math.max(full, 1));
      const eff = higherIsBetter ? t.eff : (t.eff / 100 * t.rev * labShare(rev, t.rev)) / Math.max(rev, 1) * 100;
      const effLw = higherIsBetter ? lw.eff : (lw.eff / 100 * lw.rev * labShare(revLw, lw.rev)) / Math.max(revLw, 1) * 100;
      const bad = higherIsBetter ? eff < target.efficiency : eff > target.efficiency;
      return { name: s.name, rev, revLw, vol, volLw, eff, effLw, bad, labour: higherIsBetter ? 0 : eff / 100 * rev };
    });
    // Make sure the demo always has one real story: if nothing is off target today, tip the weakest location over.
    if (!perLocation.some((p) => p.bad)) {
      const wl = perLocation[worst];
      wl.eff = higherIsBetter ? target.efficiency * 0.93 : target.efficiency * 1.07;
      wl.bad = true;
      wl.labour = higherIsBetter ? 0 : (wl.eff / 100) * wl.rev;
    }
    const sum = (k) => perLocation.reduce((a, p) => a + p[k], 0);
    const revSoFar = sum('rev'), revLw = sum('revLw');
    const volSoFar = sum('vol'), volLw = sum('volLw');
    const effOf = (key, revKey) => higherIsBetter
      ? perLocation.reduce((a, p) => a + p[key], 0) / L
      : (perLocation.reduce((a, p) => a + (p[key] / 100) * p[revKey], 0) / Math.max(perLocation.reduce((a, p) => a + p[revKey], 0), 1)) * 100;
    const effSoFar = effOf('eff', 'rev'), effLwV = effOf('effLw', 'revLw');
    const cum = (t) => { let a = 0; return t.map((v) => (a += v)); };
    const hourlyAll = (idx) => HOURS.map((_, i) => series.reduce((a, s) => a + s.days[idx].hourly[i], 0));
    const hToday = hourlyAll(ti), hLw = hourlyAll(li7);
    const hourlyToday = hToday.map((v, i) => (HOURS[i] < nowHour ? v : HOURS[i] === nowHour ? v * frac : null));
    const curveShare = CURVE[profile.company.industry].slice(0, HOURS.indexOf(nowHour)).reduce((a, b) => a + b, 0) + CURVE[profile.company.industry][HOURS.indexOf(nowHour)] * frac;
    const projected = revSoFar / Math.max(curveShare, 0.05);

    /* ---- company-level daily totals (completed days only) ---- */
    const totals = days.map((d, di) => {
      const rev = series.reduce((a, s) => a + s.days[di].rev, 0);
      const vol = series.reduce((a, s) => a + s.days[di].vol, 0);
      const eff = higherIsBetter ? series.reduce((a, s) => a + s.days[di].eff, 0) / L : (series.reduce((a, s) => a + s.days[di].eff * s.days[di].rev, 0) / Math.max(rev, 1));
      return { date: d.date, dow: d.dow, isToday: d.isToday, rev, vol, avg: rev / Math.max(vol, 1), eff };
    });

    const model = {
      profile, ind, locations: locs, days, series, totals, higherIsBetter, demoClock, nowHour, minute, hours: HOURS,
      today: {
        revSoFar, revLw, volSoFar, volLw, effSoFar, effLw: effLwV,
        avgSoFar: revSoFar / Math.max(volSoFar, 1), avgLw: revLw / Math.max(volLw, 1),
        hourlyToday, hourlyLw: hLw, hourlyTodayCum: cum(hToday.map((v, i) => (HOURS[i] < nowHour ? v : HOURS[i] === nowHour ? v * frac : 0))).map((v, i) => (HOURS[i] <= nowHour ? v : null)),
        perLocation, projected, curveShare,
      },
    };
    // sales mix for today: four categories with stable, slightly jittered shares
    const shares = [0.46, 0.31, 0.15, 0.08].map((x, i) => x * (0.92 + rand() * 0.16));
    const shSum = shares.reduce((a, b) => a + b, 0);
    model.mix = ind.mix.map((label, i) => ({ label, share: shares[i] / shSum }));
    model.alerts = buildAlerts(model);
    return model;
  }


  /**
   * Model from imported rows ([date, location, revenue, volume|null, efficiency|null]).
   * Same shape as the sample model so every page works unchanged. The latest day in the data plays the role
   * of "today", as a finished day. A location with no row on a day is not trading: it is flagged `missing`
   * and left out of averages and alert rules rather than counted as zero.
   */
  function buildReal(profile, rows) {
    const ind = DBProfile.INDUSTRIES[profile.company.industry];
    const higherIsBetter = ind.efficiencyDir === 'higher', target = profile.targets;
    const locs = [...new Set(rows.map((r) => r[1]))];
    const latest = rows.reduce((a, r) => (r[0] > a ? r[0] : a), '0000-00-00');
    const latestMs = Date.parse(latest + 'T12:00:00Z');
    const days = [];
    for (let i = N_DAYS - 1; i >= 0; i--) { const dt = new Date(latestMs - i * 86400000); days.push({ date: iso(dt), dow: dt.getUTCDay(), isToday: i === 0 }); }
    const idx = new Map(days.map((d, i) => [d.date, i]));
    const hasVolume = rows.some((r) => r[3] !== null), hasEff = rows.some((r) => r[4] !== null);
    const series = locs.map((name) => ({ name, days: days.map((d) => ({ date: d.date, dow: d.dow, isToday: d.isToday, rev: 0, vol: 0, avg: 0, eff: 0, hourly: null, missing: true })) }));
    const bySeries = new Map(locs.map((l, i) => [l, series[i]]));
    for (const [date, loc, rev, vol, eff] of rows) {
      const i = idx.get(date); if (i === undefined) continue;
      const d = bySeries.get(loc).days[i];
      d.rev = rev; d.vol = vol === null ? 0 : vol; d.avg = vol ? rev / vol : 0; d.eff = eff === null ? NaN : eff; d.missing = false;
    }
    const live = (d) => !d.missing;
    const totals = days.map((d, di) => {
      const cells = series.map((s) => s.days[di]).filter(live);
      const rev = cells.reduce((a, c) => a + c.rev, 0), vol = cells.reduce((a, c) => a + c.vol, 0);
      const withEff = cells.filter((c) => Number.isFinite(c.eff));
      const eff = !withEff.length ? NaN : higherIsBetter ? withEff.reduce((a, c) => a + c.eff, 0) / withEff.length : withEff.reduce((a, c) => a + c.eff * c.rev, 0) / Math.max(withEff.reduce((a, c) => a + c.rev, 0), 1e-9);
      return { date: d.date, dow: d.dow, isToday: d.isToday, rev, vol, avg: vol ? rev / vol : 0, eff: Number.isFinite(eff) ? eff : 0, has: cells.length > 0 };
    });
    const ti = N_DAYS - 1, li7 = N_DAYS - 8;
    const perLocation = series.map((s) => {
      const t = s.days[ti], lw = s.days[li7];
      const eff = Number.isFinite(t.eff) && !t.missing ? t.eff : null, effLw = Number.isFinite(lw.eff) && !lw.missing ? lw.eff : null;
      const bad = eff !== null && (higherIsBetter ? eff < target.efficiency : eff > target.efficiency);
      return { name: s.name, rev: t.rev, revLw: lw.rev, vol: t.vol, volLw: lw.vol, eff: eff === null ? 0 : eff, effLw: effLw === null ? 0 : effLw, bad, labour: 0, missing: t.missing };
    });
    const sum = (k) => perLocation.reduce((a, p) => a + p[k], 0);
    const revSoFar = sum('rev'), revLw = sum('revLw'), volSoFar = sum('vol'), volLw = sum('volLw');
    const tl = totals[ti], tw = totals[li7];
    const model = {
      real: true, latest, profile, ind, locations: locs, days, series, totals, higherIsBetter, demoClock: false, hasVolume, hasEff,
      nowHour: 0, minute: 0, hours: HOURS, mix: null,
      today: {
        revSoFar, revLw, volSoFar, volLw, effSoFar: tl.eff, effLw: tw.eff,
        avgSoFar: volSoFar ? revSoFar / volSoFar : 0, avgLw: volLw ? revLw / volLw : 0,
        hourlyToday: null, hourlyLw: null, hourlyTodayCum: null, perLocation, projected: revSoFar, curveShare: 1,
      },
    };
    model.alerts = buildAlerts(model);
    return model;
  }

  function buildAlerts(m) {
    const p = m.profile, t = m.today, ind = m.ind, out = [];
    const f = DB.makeFormat(p);
    const lastDate = m.days[m.days.length - 1].date;
    const since = m.real ? 'on ' + f.day(lastDate) : m.demoClock ? 'today' : 'since ' + f.hour(Math.max(7, m.nowHour - 2));
    if (m.hasEff !== false) for (const loc of t.perLocation) {
      if (loc.bad) {
        out.push({ id: 'eff-' + loc.name, severity: 'critical', title: `${ind.efficiency} ${m.higherIsBetter ? 'below' : 'over'} target at ${loc.name}`, body: `${f.pct(loc.eff)} against a ${f.pct(p.targets.efficiency, 0)} target, ${since}.`, ago: m.real ? f.monthDay(lastDate) : '2h' });
      }
    }
    const pace = t.projected / p.targets.dailyRevenue;
    const agoOf = (x) => (m.real ? f.monthDay(lastDate) : x);
    if (m.real) {
      if (pace < 0.95) out.push({ id: 'pace', severity: 'warn', title: 'Revenue was below target', body: `${f.money(t.projected)} on ${f.day(lastDate)}, ${Math.round((1 - pace) * 100)}% under the ${f.money(p.targets.dailyRevenue)} target.`, ago: agoOf('') });
      else if (pace > 1.03) out.push({ id: 'pace', severity: 'ok', title: 'Revenue beat the target', body: `${f.money(t.projected)} on ${f.day(lastDate)} against a ${f.money(p.targets.dailyRevenue)} target.`, ago: agoOf('') });
    } else if (pace < 0.95) out.push({ id: 'pace', severity: 'warn', title: 'Revenue is behind pace', body: `On track for ${f.money(t.projected)} today, ${Math.round((1 - pace) * 100)}% under the ${f.money(p.targets.dailyRevenue)} target.`, ago: '1h' });
    else if (pace > 1.03) out.push({ id: 'pace', severity: 'ok', title: 'On pace to beat today’s target', body: `Projected ${f.money(t.projected)} against a ${f.money(p.targets.dailyRevenue)} target.`, ago: '1h' });
    const sameDow = m.totals.slice(0, -1).filter((d) => d.dow === m.days[m.days.length - 1].dow && d.rev > 0).slice(-8);
    const best = sameDow.length ? Math.max(...sameDow.map((d) => d.rev)) : Infinity;
    if (sameDow.length >= 3 && t.projected > best) out.push({ id: 'best', severity: 'ok', title: `Best ${f.weekday(lastDate)} in ${sameDow.length} weeks`, body: `${m.real ? '' : 'Projected '}${f.money(t.projected)} beats the previous best of ${f.money(best)}.`, ago: agoOf('45m') });
    const top = [...t.perLocation].sort((a, b) => b.rev - a.rev)[0];
    if (L(m) > 1 && t.revSoFar > 0) out.push({ id: 'mix', severity: 'info', title: `${top.name} ${m.real ? 'carried the day' : 'is carrying today'}`, body: `${Math.round((top.rev / t.revSoFar) * 100)}% of revenue ${m.real ? '' : 'so far '}comes from this location.`, ago: agoOf('30m') });
    return out;
  }
  const L = (m) => m.locations.length;

  /* ---- alert rules ---- */
  const METRIC = {
    revenue: { label: 'Daily revenue (per location)', get: (d) => d.rev, fmt: (f, v) => f.money(v) },
    volume: { label: 'Volume (per location)', get: (d) => d.vol, fmt: (f, v) => f.int(v) },
    avg: { label: 'Average value', get: (d) => d.avg, fmt: (f, v) => f.money2(v) },
    efficiency: { label: 'Efficiency', get: (d) => d.eff, fmt: (f, v) => f.pct(v) },
  };
  function defaultRules(profile) {
    const ind = DBProfile.INDUSTRIES[profile.company.industry], dir = ind.efficiencyDir;
    return [
      { id: 'r-eff', metric: 'efficiency', op: dir === 'lower' ? '>' : '<', value: profile.targets.efficiency, channel: 'push', enabled: true, builtin: true },
      { id: 'r-rev', metric: 'revenue', op: '<', value: Math.round((0.85 * profile.targets.dailyRevenue) / profile.locations.length), channel: 'push', enabled: true, builtin: true },
      { id: 'r-avg', metric: 'avg', op: '<', value: Math.round(AVG_VALUE[profile.company.industry] * (CURRENCY_SCALE[profile.company.currency] || 1) * 0.85 * 100) / 100, channel: 'email', enabled: false, builtin: true },
    ];
  }
  function evalRule(rule, m) {
    const g = METRIC[rule.metric].get, hits = [];
    m.series.forEach((s) => s.days.slice(-29, -1).forEach((d) => {
      if (d.missing) return;
      const v = g(d);
      if (!Number.isFinite(v)) return;
      if (rule.op === '>' ? v > rule.value : v < rule.value) hits.push({ date: d.date, location: s.name, value: v });
    }));
    hits.sort((a, b) => (a.date < b.date ? 1 : -1));
    const cells = m.series.reduce((a, s) => a + s.days.slice(-29, -1).filter((d) => !d.missing && Number.isFinite(g(d))).length, 0);
    return { count: hits.length, last: hits[0] || null, cells };
  }
  function ruleTitle(rule, profile) {
    const ind = DBProfile.INDUSTRIES[profile.company.industry];
    const f = DB.makeFormat(profile);
    const name = rule.metric === 'efficiency' ? ind.efficiency : rule.metric === 'volume' ? ind.volume : rule.metric === 'avg' ? ind.avg : 'Daily revenue';
    return `${name} ${rule.op === '>' ? 'above' : 'below'} ${METRIC[rule.metric].fmt(f, rule.value)} at any location`;
  }

  DB.data = { build, buildReal, METRIC, defaultRules, evalRule, ruleTitle, HOURS, hashStr, rng, DOW };
})();
