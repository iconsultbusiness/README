# Bike Culture — website

Cinematic, scroll-driven site for the Bike Culture riders' collective.
Next.js 15 · React 19 · TypeScript · Tailwind 4 · GSAP ScrollTrigger · Lenis.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Where things live

| Path | What |
|---|---|
| `DESIGN.md` | Visual direction, type, colour, motion rules |
| `src/lib/content.ts` | All copy, numbers, quotes, film titles |
| `src/lib/gsap.ts` | GSAP setup and the **Join** link (campaign URL) |
| `src/components/*` | One file per chapter of the page |
| `public/brand/` | Vector logo set traced from the badge (see below) |
| `public/media/` | Photography plates, replace with real footage (`public/media/README.md`) |

## Brand vectors

Traced from the chrome badge and supplied as SVG:

- `emblem-steel.svg` — full-colour chrome badge (hero, OG image, favicon)
- `emblem-line.svg` — engraved chrome line art (preloader)
- `etch.svg` — single-colour etch, recolour with `currentColor`/filters (watermarks)
- `silhouette.svg` — solid wings silhouette, used as a CSS mask for the film reveal
- `emblem-tonal.svg` — five-tone flat version for print and merch

## Motion & accessibility

Pinned chapters, horizontal film strip and the custom cursor only run on desktop
pointers. `prefers-reduced-motion` disables pinning, parallax and the preloader;
content renders static. Mobile gets a re-flowed layout, not a shrunk one.

## Deploy

Any Next.js host (Vercel: import the repo, no config needed). Set
`metadataBase` in `src/app/layout.tsx` to the production domain for correct
social previews.
