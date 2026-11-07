# dashboards.business

White-label business dashboards for owners and operators. A customer signs up, we read their brand from their website (they confirm it), and the daily tool their team opens carries their name, logo, colours and font, with their locations, currency and targets.

Status: **early preview**. The branding and profile flow is real and tested. The numbers are sample data.

## What is real and what is sample

| Area | State |
|---|---|
| Sign-up, profile, tenant storage, edit key | Real (single-instance JSON file, no accounts yet) |
| Brand discovery from a website | Real, with SSRF protection |
| Theme engine (contrast, light/dark, colour-blind-safe charts) | Real, 48 automated tests |
| Screens: Today, Dashboards, Alerts, AI analyst, Data sources, Goals, Brand & settings | Real UI |
| Every number in the app | **Generated sample data** shaped by the profile |
| Data connectors | **Not built** |
| AI analyst | **Rule-based over sample data**, not a language model |
| Alert delivery (push, email) | **Not built**; rules are evaluated only |
| Login, accounts, billing, custom domains | **Not built** |
| Terms and privacy pages | **Not written** |

Details, security model and the launch checklist are in `WHITE-LABEL.md`. Deployment notes are in `DEPLOY.md`.

## Run it

```bash
npm start            # http://127.0.0.1:8080  (landing, sign-up, app)
npm test             # 48 unit and API tests, no dependencies
npm run e2e          # full browser flow; needs Playwright + Chromium
```

Try `http://127.0.0.1:8080/app.html?demo` for the default-brand demo workspace, or go through `signup.html`.

## Layout

```
brand/                brand kit: guidelines, logos (outlined SVG), design tokens, outline tool
server/               zero-dependency Node server: API, guarded fetcher, brand extraction, storage
site/
  index.html          marketing page
  signup.html         create a workspace (profile + brand + live preview)
  app.html, dashboards.html, alerts.html, analyst.html, sources.html, goals.html, settings.html
  app.css             app styles, token-driven (one stylesheet for every tenant)
  js/theme.js         tenant theme engine, shared by browser, server and tests
  js/profile.js       profile schema and sanitiser, shared likewise
  js/data.js          sample-data engine (the layer a real connector replaces)
tests/                unit, API, security and site-guard tests, plus the browser flow
```

## Brand kit

See `brand/BRAND-GUIDELINES.md`. The wordmark and lockup SVGs are outlined vectors (no font needed). Regenerate with `npm run outline-logo`.
