# White label: how it works

When a customer signs up, their business profile and brand are applied to the daily tool their team opens. This page explains the flow, what is guaranteed, what is not built, and what to settle before launch.

## The flow

0. **Account.** The customer signs up with an email and password and is shown a one-time recovery code. Everything below belongs to that account and is invisible to every other account.
1. **Profile.** The customer enters business name, website, industry, currency, time zone, locations and targets. The server validates it with `site/js/profile.js`, the single schema shared by the browser, the server and the tests.
2. **Brand discovery (optional).** "Pull my branding" sends the website to `POST /api/brand/extract`. The server reads only what the home page publishes about itself:
   - theme colour, web manifest colours, Windows tile colour
   - brand-named CSS variables in the page and its first three stylesheets
   - logo candidates: structured data, header images, home-screen icons, favicon
3. **Confirmation.** Nothing is applied silently. The customer sees what was found, picks the logo and colour, and can upload their own instead. The logo's most prominent colour is read in the browser and offered as a suggestion.
4. **Consent.** Creating a workspace requires ticking that they are allowed to use the name and logo.
5. **Theme generation.** `site/js/theme.js` turns the brand colour (and optional button colour) into complete light and dark themes.
6. **Applied everywhere.** Each page loads the profile, injects the generated CSS variables, sets the font, logo, favicon and title, and shows the customer's data: their imported sales if they have imported any, otherwise sample data shaped by their profile.
7. **Installable.** The browser gets a per-customer manifest (name, colours, icon made from their logo), so "install" puts their brand on the phone's home screen, not ours.

## What the theme engine guarantees

Brand colours are rarely picked for dashboards, so the engine adjusts only what must change and reports each change to the customer.

| Guarantee | How |
|---|---|
| Body, secondary and muted text reach 7:1, 7:1 and 4.5:1 | lightness is moved, hue kept |
| Links and selected-nav text reach 4.5:1 | a darker or lighter shade of the brand colour |
| Button text reaches 4.5:1 | white or ink is chosen; the fill only moves if neither works |
| The brand fill itself is kept | yellow stays yellow, with dark text on it |
| Logos that would vanish get a backing chip | transparent logos only, decided from measured luminance |
| Four chart colours stay apart for colour-blind viewers | searched from a pool; series 1 keeps the brand hue |
| Status colours (good, warning, serious, critical) are never the brand | reserved, always paired with an icon and a word |

Evidence: 48 automated tests, including 400 random brand colours; 106 generated palettes also passed an independent palette validator.

## Security model

| Risk | Control |
|---|---|
| Server-side request forgery through the website field | `server/lib/safe-fetch.js`: http(s) on ports 80/443 only, every redirect hop re-checked, the connection address is validated at connect time (so DNS tricks cannot swap it), private, loopback, link-local and cloud-metadata ranges blocked, size, decompressed size, redirects and time capped, rate limited |
| CSS injection through brand values | colours are parsed to numbers and re-emitted as `#RRGGBB`; fonts come from an allow-list; no tenant string ever reaches CSS |
| Script injection through names or logos | text goes through `textContent` only (a test forbids `innerHTML`); logos are re-encoded to PNG in the browser and verified by magic bytes on the server; SVG is never stored or inlined |
| Stolen or guessed passwords | scrypt hashing with a per-password salt; five wrong tries lock the account for 15 minutes; login, sign-up and recovery are rate limited; unknown emails cost the same time as wrong passwords |
| Session theft | random 256-bit token in an HttpOnly, SameSite=Lax cookie (Secure and host-bound over HTTPS); only a hash is stored; password change signs out other devices |
| Cross-site request forgery | writes need a JSON body, SameSite cookies, and an Origin check |
| One customer reading another's data | every query is scoped to the signed-in account's workspace; no endpoint accepts a workspace id for private data; tests cover it in both directions |
| Bad or hostile CSV | parsed twice (browser preview, server decision) with the same code; size, row, location and date limits; formulas are never evaluated; values are stored as numbers and text only |
| Leaving data on a shared computer | sign-out clears the cached profile and rows from the browser |
| Clickjacking, script injection at large | Content Security Policy with no inline scripts, `frame-ancestors 'none'`, `nosniff` |

## Not built yet (be clear with customers)

- **Live connectors.** CSV import is the only data source. Point of sale, accounting and rostering connectors do not exist.
- **Email.** No email is sent, so there are no emailed password resets, invitations or alerts. A one-time recovery code is the only recovery path. If someone loses both their password and the code, you must reset them by hand.
- **Alert delivery.** Rules are evaluated when the app opens. Nothing is pushed or emailed.
- **Real AI.** The analyst answers by rules over the data. It is not a language model.
- **Team members.** One login per workspace. Staff cannot have their own accounts yet.
- **Per-tenant domains** such as `numbers.customer.com`: needs DNS verification, certificates and routing.
- **Billing and plan limits.** "Powered by" removal is a setting today, not a paid feature.
- **More than one server.** Storage is one SQLite file. Fine for one instance and a few thousand accounts; move to a networked database before running two.
- **Legal pages.** The sign-up box says "I agree to the terms" but there are no terms or privacy policy yet. Do not launch to the public without them.

## Is white label OK?

Yes. It is a standard model, and nothing here depends on hiding who you are. What to settle before launch:

1. **Brand authority.** Reading a public website's colours is fine. Putting a name and logo into a product is a trademark question, so the sign-up asks for confirmation. Get that wording from a lawyer and publish terms.
2. **Who owns the data.** Customers' staff will use a tool that shows their brand. Decide who the data controller is, and put a data-processing agreement in place before connecting payroll, sales or accounting data.
3. **"Powered by" and your own brand.** Decide whether removing it is a paid feature and whether customers may drop the dashboards.business name entirely.
4. **Support and trust.** If customers' teams can no longer tell it is your product, support requests and security reports will arrive at the customer. Provide a route for that.
5. **Custom domains** are expected by white-label customers and are real infrastructure work.
