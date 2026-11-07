# dashboards.business — Brand Guidelines v1.0

> One place for every number that matters. Built for operators, not analysts.

## 1. Who we are

**Product name:** dashboards.business (always lowercase, always one word with the dot).
**Short name in UI:** dash.boards (the stacked wordmark) or simply "Dashboards".
**Domain:** dashboards.business

**Category:** Business intelligence for small and mid-sized operators. The reference
experience is an "all-in-one for frontline teams" platform like All Gravy, applied to
numbers instead of people: every source connected, every KPI live, one app that the
owner, the managers and the team all open every morning.

**Positioning statement**
For owners and operations leads who run on gut feel because their data is scattered,
dashboards.business is the one app that connects every system you already use and
turns it into live dashboards, alerts and an AI analyst, so you know what is happening
in the business the moment it happens.

**Promise:** *Know your numbers. Every day. Without a data team.*

## 2. Voice and tone

We sound like a sharp operations manager, not a vendor.

| We are | We are not |
|---|---|
| Plain. "Sales are down 12% vs last Tuesday." | Jargon. "Leverage actionable insights." |
| Confident. Short sentences. Verbs first. | Hedging. "Might possibly help you to…" |
| Warm. We like the people we build for. | Cute. No puns in product UI. |
| Specific. Numbers, names, times. | Vague. "Boost performance." |

**Rules**
- Sentence case everywhere, including headlines and buttons. ("Get started", not "Get Started".)
- One idea per sentence. About 15 words or fewer in UI.
- Say "you" and "your business". Never "users".
- Numbers are written as digits. Percentages carry the sign: +12%, −4%.
- Calls to action name the outcome: "See my numbers", "Connect Shopify", "Start free".

**Taglines**
- Know your numbers.
- Every number. One app.
- Built for the people who run the place.

## 3. Logo

Three assets, all in `brand/logo/`:

| Asset | File | Use |
|---|---|---|
| Mark | `mark.svg` | App icon, avatar, favicon source, tight spaces |
| Stacked wordmark | `wordmark-light.svg` / `wordmark-dark.svg` | Website header, decks, merch |
| Horizontal lockup | `lockup-horizontal.svg` | Email footers, partner logos, documents |

**The mark** is a rounded violet tile with three white bars rising left to right and
one coral dot. The bars are the dashboard; the dot is the "." in the domain, and it
sits where the "live" indicator sits in the product.

**The stacked wordmark** sets `dash.` small in violet above `boards` large in ink,
set in Outfit ExtraBold at -4% tracking and delivered as outlined vectors, so it renders identically everywhere. The coral period is the only colour accent.

**Clear space:** keep at least the height of one bar (12.5% of the mark) empty on all sides.
**Minimum size:** mark 20px, stacked wordmark 72px wide, lockup 140px wide.
**Never:** rotate, add gradients or shadows, recolour the bars, outline, or put the
coral dot anywhere but top-left.

## 4. Colour

### Core palette

| Token | Hex | Role |
|---|---|---|
| Violet | `#6B4EFF` | Primary brand. Links, focus, selected state, logo. |
| Coral | `#FF5C7A` | Call to action. **One per screen.** |
| Lime | `#C8F55A` | "Live" accent, highlights on dark. Never for text. |
| Ink | `#0F1222` | Footer, app chrome, dark background. |
| Slate | `#171B2E` | Dark cards. |
| Cloud | `#F6F7FB` | Light page background. |
| White | `#FFFFFF` | Light cards. |

**The rhythm (borrowed from the reference site):** light, airy marketing sections on
Cloud/White, with a deep Ink footer and an Ink app shell. Coral is reserved for the
single primary action so it always reads as "the button".

### Status colours (reserved)

Good `#1A9E6B` · Warning `#C98A12` · Serious `#E0502B` · Critical `#C9264A`.
Never reuse these for chart series. Always paired with an icon and a word.

### Chart colours

Fixed order, never cycled. Validated with a colour-vision-deficiency check on both surfaces.

| Slot | Light | Dark |
|---|---|---|
| 1 | `#5B3FE6` | `#8A74F5` |
| 2 | `#D63A5B` | `#E8607E` |
| 3 | `#0A9A94` | `#1FA39C` |
| 4 | `#B06A12` | `#C4872A` |

More than four series fold into "Other" or split into small multiples. Sequential
scales are one hue (violet) light to dark. Diverging scales run coral, grey, teal.

## 5. Typography

| Role | Face | Weights | Notes |
|---|---|---|---|
| Display | **Outfit** | 600, 700, 800 | Headlines, wordmark, hero numbers. Tracking −2% to −4%. |
| Body / UI | **Inter** | 400, 500, 600 | Everything else. |
| Figures | **JetBrains Mono** | 500 | Tabular numbers in tables and KPI tiles. |

Scale (rem): 0.75 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.25 · 3 · 3.75.
Body line-height 1.55. Headlines 1.1.

All three are open-licensed Google Fonts, so the brand costs nothing to use anywhere.

## 6. Shape, space, motion

- Corner radius: 12px for controls, 20px for cards, 28px for hero panels, pill for tags and the CTA.
- Spacing on a 4px grid. Section padding 80px desktop, 48px mobile.
- Shadows are soft and cool-tinted. Dark mode uses borders, not shadows.
- Motion is quick and quiet: 120ms for hover, 220ms for layout, easing `cubic-bezier(.2,.8,.2,1)`.
  Numbers count up once on first view. Nothing loops.

## 7. Imagery and illustration

- Real product, real numbers. Screenshots over illustrations.
- When illustrating, use flat shapes in Violet, Coral, Lime and Ink on Cloud. No gradients, no 3D.
- Photography: people at work in real businesses (kitchens, shop floors, warehouses, clinics), natural light, candid.

## 8. Product principles

1. **Glanceable first.** The home screen answers "how are we doing?" in three seconds.
2. **Every number is a door.** Tap any figure to see where it came from.
3. **Alerts, not reports.** The app tells you when something changed. You do not go looking.
4. **Works on a phone in a stockroom.** Mobile is the primary surface, like the reference product.
5. **No setup tax.** Connect a source, get a dashboard. Templates do the modelling.

## 9. Site information architecture

The footer keeps the reference site's rhythm (centred columns on a phone, deep ink background) but lists only pages that exist.

**Platform:** All features · Dashboards · Alerts · AI analyst · Data sources · Goals & targets · White label
**Resources:** Try the demo · Set up a workspace · Log in · Early access

Pages to add before launch: About, Blog, Careers, Terms, Privacy, Search, Pricing. They are deliberately not linked until they exist.

## White label

dashboards.business is itself white-label: each customer's app wears their brand, not ours. See `WHITE-LABEL.md`.

- **Our brand** (this guide) governs the marketing site, sign-up, the demo and anything that carries "Powered by dashboards.business".
- **Customer brands** are generated by `site/js/theme.js` from one brand colour (plus an optional button colour), a logo and an allow-listed font. Text and buttons always reach WCAG AA contrast, charts stay colour-blind safe, and status colours stay reserved.
- Customers may remove "Powered by dashboards.business"; whether that is a paid option is undecided.

## 10. Files in this kit

```
brand/
  BRAND-GUIDELINES.md     this document
  logo/                   mark, favicon, outlined wordmarks (light/dark), horizontal lockups
  tokens/tokens.css       dashboards.business own tokens (marketing site)
  tokens/tokens.json      the same tokens in W3C design-token format
  tools/                  outline-wordmark.cjs regenerates the outlined SVGs
```

Customer themes are not stored as files. They are generated at runtime from each customer's profile.
