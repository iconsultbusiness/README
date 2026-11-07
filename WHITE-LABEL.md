# White label: how it works

When a customer signs up, their business profile and brand are applied to the daily tool their team opens. This page explains the flow, what is guaranteed, what is not built, and what to settle before launch.

## The flow

1. **Profile.** The customer enters business name, website, industry, currency, time zone, locations and targets. The server validates it with `site/js/profile.js`, the single schema shared by the browser, the server and the tests.
2. **Brand discovery (optional).** "Pull my branding" sends the website to `POST /api/brand/extract`. The server reads only what the home page publishes about itself:
   - theme colour, web manifest colours, Windows tile colour
   - brand-named CSS variables in the page and its first three stylesheets
   - logo candidates: structured data, header images, home-screen icons, favicon
3. **Confirmation.** Nothing is applied silently. The customer sees what was found, picks the logo and colour, and can upload their own instead. The logo's most prominent colour is read in the browser and offered as a suggestion.
4. **Consent.** Creating a workspace requires ticking that they are allowed to use the name and logo.
5. **Theme generation.** `site/js/theme.js` turns the brand colour (and optional button colour) into complete light and dark themes.
6. **Applied everywhere.** Each page loads the profile, injects the generated CSS variables, sets the font, logo, favicon and title, and builds the sample data from the customer's locations, industry, currency and targets.

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
| Cross-tenant edits | each workspace has a random 192-bit edit key, stored hashed, compared in constant time |
| Clickjacking, script injection at large | Content Security Policy with no inline scripts, `frame-ancestors 'none'`, `nosniff` |

## Not built yet (be clear with customers)

- **Accounts.** There is no login, password, email or single sign-on. The workspace id selects the tenant; the edit key from sign-up is kept in that browser. Anyone with a workspace link can view it. Replace this before real data goes in.
- **Live data.** Every number is generated sample data. No connector exists.
- **Real AI.** The analyst answers by rules over the sample data. It is not a language model.
- **Notifications.** Alert rules are evaluated, but nothing is pushed or emailed.
- **Per-tenant domains** such as `numbers.customer.com`: needs DNS verification, certificates and routing.
- **Billing, plan limits** (the "Powered by" removal is a setting today, not a paid feature).
- **Database.** Tenants live in one JSON file. Fine for a single instance; swap for a database before running two.
- **Legal pages.** The sign-up box says "I agree to the terms" but there are no terms or privacy policy yet.

## Is white label OK?

Yes. It is a standard model, and nothing here depends on hiding who you are. What to settle before launch:

1. **Brand authority.** Reading a public website's colours is fine. Putting a name and logo into a product is a trademark question, so the sign-up asks for confirmation. Get that wording from a lawyer and publish terms.
2. **Who owns the data.** Customers' staff will use a tool that shows their brand. Decide who the data controller is, and put a data-processing agreement in place before connecting payroll, sales or accounting data.
3. **"Powered by" and your own brand.** Decide whether removing it is a paid feature and whether customers may drop the dashboards.business name entirely.
4. **Support and trust.** If customers' teams can no longer tell it is your product, support requests and security reports will arrive at the customer. Provide a route for that.
5. **Custom domains** are expected by white-label customers and are real infrastructure work.
