# dashboards.business

Brand kit and product prototype for **dashboards.business**, an all-in-one business
intelligence app for owners and operators. Structure and rhythm are modelled on the
All Gravy frontline-team platform (sticky header, single coral call to action, light
marketing sections, deep ink footer with Platform / Resources columns), with an
original identity built for the dashboards.business domain.

## What is here

| Path | Contents |
|---|---|
| `brand/BRAND-GUIDELINES.md` | Positioning, voice, logo rules, colour, type, spacing, product principles, site IA |
| `brand/logo/` | App mark, favicon, stacked wordmarks (light/dark), horizontal lockup, all SVG |
| `brand/tokens/tokens.css` | CSS custom properties for light and dark mode |
| `brand/tokens/tokens.json` | Same tokens in W3C design-token format |
| `site/index.html` | Marketing landing page |
| `site/app.html` | Dashboard app shell ("Today" screen) with live-sizing SVG charts |
| `site/styles.css` | Shared stylesheet, imports the tokens |

## Preview locally

```bash
cd site && python3 -m http.server 8080
# open http://localhost:8080/index.html and http://localhost:8080/app.html
```

No build step. Fonts (Outfit, Inter, JetBrains Mono) load from Google Fonts.

## Identity at a glance

- **Wordmark:** `dash.` small in violet over `boards` large in ink. The coral period is the only accent.
- **Mark:** violet rounded tile, three rising white bars, one coral dot top-left.
- **Colours:** Violet `#6B4EFF` (brand), Coral `#FF5C7A` (CTA only), Lime `#C8F55A` (live accent), Ink `#0F1222`, Cloud `#F6F7FB`.
- **Type:** Outfit for display, Inter for UI, JetBrains Mono for figures.
- **Voice:** plain, confident, specific. Sentence case everywhere.

## Next steps

1. Outline the wordmark text to paths for print and app-store assets.
2. Build the remaining app screens: Dashboards, Alerts, AI analyst, Data sources, Goals.
3. Wire the landing page to a real sign-up and point `dashboards.business` at the deploy.
