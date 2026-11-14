# BIKE CULTURE — design system

A riders' collective. Rideouts, films, a members' app, and the people who live for the road.
Brand idea: **One pride.** The lion is a pride animal; so is the crew.

## 1. Visual direction
Cinematic, editorial, expensive. Night asphalt, chrome, one red signal.
Oversized condensed type used as a graphic object, the chrome lion sitting *between* the letters.
Photography is grainy, underexposed, documentary. No gradients blobs, no glow, no cards.

## 2. Typography
| Role | Face | Setting |
|---|---|---|
| Display | Archivo (variable, `wdth` 62) | 800–900, tracking -0.03em, leading 0.82 |
| Editorial accent | Instrument Serif Italic | 400, used for 1–3 words inside a headline |
| Body | Archivo (`wdth` 100) | 400/500, 16–18px, max 36ch |
| Label | Archivo | 500, 11px, tracking 0.22em, uppercase |

Scale: `clamp()` driven. Display 1 = `clamp(4rem, 17vw, 22rem)`. Display 2 = `clamp(3rem, 9vw, 11rem)`.

## 3. Colour
| Token | Hex | Use |
|---|---|---|
| ink | #0A0A0C | page |
| asphalt | #141518 | raised surfaces |
| steel | #2A2C31 | rules, muted |
| chrome | #C9CDD3 | secondary text |
| bone | #ECE9E2 | primary text, light section |
| signal | #D4151C | one accent, used sparingly |
| oxblood | #8A0E13 | dark red section |

## 4. Animation language
- Easing: `expo.out` for entrances, `power2.inOut` for scrubbed transforms.
- Durations: 0.8–1.4s. Scrub smoothing 0.8.
- Text: line-split reveals from `yPercent: 110` inside `overflow:hidden` masks.
- Images: `clip-path: inset()` reveals; 1.0 → 1.12 zoom on scroll; ±6–10% parallax.
- Pinned chapters with content swapping beside a fixed visual.
- Layered sections: later sections slide over earlier ones (sticky stack).
- Buttons: magnetic (strength 0.35), label slides up on hover.
- Cursor: dot + ring on desktop, grows with a label over media and drag areas.
- Reduced motion: no pinning, no parallax, opacity-only reveals. Mobile: no horizontal pinning, no cursor.

## 5. Page structure
Preloader (emblem etch draws in) → Hero → Manifesto (pinned word reveal) →
Mask reveal (silhouette clip opens onto film) → Chapters (pinned visual, 4 beats) →
Films (horizontal) → Numbers → The Code (sticky stack, ink/oxblood/bone) →
Voices (marquee + pull quote) → Closing statement + CTA → Footer.

## 6. Interaction system
One CTA everywhere: **Join the ride** → https://app.wotboyz.com/join (campaign link preserved).
Nav: wordmark left, two links + CTA right, collapses to a full-screen overlay with the emblem.
