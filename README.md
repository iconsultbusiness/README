# dashboards.business

White-label business dashboards for owners and operators. A customer creates an account, we read their brand from their website (they confirm it), and the app their team opens carries their name, logo, colours and font. They import their sales from a CSV and see their own numbers, on a laptop or installed on a phone.

Status: **working product, early stage.** Accounts, data import, branding and the installable app are real and tested. Live connectors, email and billing are not built yet.

## What is real and what is not

| Area | State |
|---|---|
| Accounts: sign-up, login, sessions, password change, recovery code, account deletion | Real. Passwords hashed with scrypt, sessions in SQLite, lock-out after repeated failures |
| Workspaces, one per account, owner-only, fully isolated | Real, covered by isolation tests |
| Your sales data: CSV import (preview, line-numbered errors, replace or merge), export, delete | Real. Every screen switches from sample to your data |
| Branding: pulled from your website, confirmed by you, applied everywhere, light and dark | Real, with SSRF protection and contrast guarantees |
| Installable app: per-customer name, colours and icon; opens offline | Real (service worker and manifest) |
| Screens: Today, Dashboards, Alerts, AI analyst, Data sources, Goals, Brand and settings | Real |
| Before you import anything | Sample data generated from your profile, clearly labelled |
| Live connectors (point of sale, accounting, rostering) | **Not built.** CSV is the only source |
| AI analyst | **Rules over your data**, not a language model |
| Alert notifications (push, email) | **Not built.** Rules are evaluated when you open the app |
| Emailed password reset, team members, billing, custom domains | **Not built.** Recovery uses a one-time code |
| Terms and privacy pages | **Not written** |

## Run it

Needs Node 22.13 or newer. No dependencies to install.

```bash
npm start            # http://127.0.0.1:8080
npm test             # 63 unit, API, security and site tests
npm run e2e          # 45-step browser run (needs Playwright with Chromium)
```

Open `http://127.0.0.1:8080/signup.html` to create an account, or `/app.html?demo` for a demo workspace that needs no account.

Settings and deployment are in `DEPLOY.md`. Design, security model and the launch checklist are in `WHITE-LABEL.md`.

## Layout

```
brand/                brand kit: guidelines, outlined logos, design tokens, outline tool
server/
  server.js           API and static files
  lib/db.js           SQLite schema (built-in node:sqlite)
  lib/auth.js         passwords, sessions, recovery codes
  lib/safe-fetch.js   SSRF-guarded fetching of customer-supplied URLs
  lib/brand.js        brand discovery from a website
site/
  index.html          marketing page
  signup.html, login.html
  app.html, dashboards.html, alerts.html, analyst.html, sources.html, goals.html, settings.html
  sw.js, manifest.webmanifest   installable app and offline shell
  js/theme.js         per-customer theme engine (shared by browser, server and tests)
  js/profile.js       profile schema and sanitiser (shared)
  js/csv.js           sales CSV parser (shared: the browser previews, the server decides)
  js/data.js          sample-data engine and the real-data model
tests/                unit, API, security, site-guard tests and the browser flow
```

## Importing your sales

One row per day per location. Needed columns: `date`, `revenue`. Helpful: `location`, `orders` (or `jobs`), `labour_cost` or `labour_pct` (services use `utilisation_pct`). Dates as `YYYY-MM-DD` are safest; `31/12/2026` and `12/31/2026` are accepted when unambiguous, and the app asks when they are not. Rows for the same day and location are added together. The latest 400 days are kept, up to 12 locations.

The Data sources screen has a template to download.
