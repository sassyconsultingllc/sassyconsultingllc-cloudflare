# Theming standard

Every colour, font and theme-sensitive layout knob on sassyconsultingllc.com comes
from one file: `public/theme/tokens.css`. Pages never hard-code a colour; they
reference a role (`var(--sc-accent)`), and a theme decides what that role is.

```
public/theme/
  tokens.css    every value, for every theme. The single source of truth.
  seasonal.js   picks the theme before first paint, persists it, the (c) long-press
                toggle, snowfall (winter) and falling leaves (fall). Loaded
                synchronously in <head>.
  winter.css    winter-only layout and ornament rules, all scoped to
                html[data-theme="winter"].
  fall.css      fall-only layout and ornament rules, all scoped to
                html[data-theme="fall"].
```

Themes are selected by `html[data-theme]`: `winter` (current default), `fall`, or `original`
(the site as it looked before this system existed — preserved exactly, verified by
computed-style diff). Each page declares itself with `html[data-page="<key>"]` so a
theme can give each product its own accent.

## Changing the look later

- **Recolour the site:** edit the theme's block in `tokens.css`. Nothing else.
- **Change the default season:** set `DEFAULT_THEME` in `seasonal.js` (the order of
  `THEMES` is the order the (c) toggle cycles through), and update the expectations in
  `scripts/theme/toggle.mjs`.
- **Add a season:** copy an existing season's block in `tokens.css` to
  `html[data-theme="<name>"]`, add it to `THEMES`/`LABEL` in `seasonal.js`, add a
  `<name>.css` for layout, link it on every page, and add it to the `seasons` list in
  `scripts/theme/check.mjs`.
- **Add a page:** use only `--sc-*` roles; add `data-page`; include the three theme
  files (see "Page head" below). If its original look differs from the defaults,
  give it an `html[data-page="..."]` block in the original section of `tokens.css`.

## Token roles

All tokens are prefixed `--sc-`. Roles describe *what a colour is for*, never what
colour it is — `--sc-ok`, not `--sc-green` — so a theme can change the value
without the name becoming a lie.

### Surfaces
| role | use |
|---|---|
| `--sc-bg` | page canvas: `body` background |
| `--sc-bg-2` | alternate section band, secondary page background |
| `--sc-bg-3` | wells: inputs, chips, code blocks, table headers, tags |
| `--sc-surface` | cards and panels |
| `--sc-surface-2` | raised card, card hover, panel inside a card |
| `--sc-nav-bg` | translucent fixed-nav background (has alpha) |
| `--sc-overlay` | modal backdrop (has alpha) |

### Lines
| role | use |
|---|---|
| `--sc-border` | default hairline / card border / divider |
| `--sc-border-2` | stronger border: hover, active, focused, emphasised |

### Text
| role | use |
|---|---|
| `--sc-text` | headings, primary copy |
| `--sc-text-2` | body copy that is not primary, descriptions |
| `--sc-text-3` | captions, labels, meta, footers |
| `--sc-text-4` | disabled, placeholder, purely decorative text |

### Accent (each page's brand colour)
| role | use |
|---|---|
| `--sc-accent` | the page's brand colour: buttons, links, highlights |
| `--sc-accent-2` | accent hover / pressed / the darker partner |
| `--sc-accent-3` | second brand hue (gradient partner) |
| `--sc-accent-ink` | text and icons drawn ON an accent fill |

Tints of the accent are expressed inline, not as more tokens, so the alpha stays
next to the rule that needs it and follows whatever the accent is:
`color-mix(in srgb, var(--sc-accent) 15%, transparent)` is exactly
`rgba(<accent>, 0.15)`.

### Status — meaning must survive every theme
| role | meaning |
|---|---|
| `--sc-ok` | done, live, success, verified, "yes" |
| `--sc-warn` | partial, caution, in progress, pending |
| `--sc-bad` | error, danger, failed, destructive |
| `--sc-info` | informational, neutral highlight |
| `--sc-neutral` | planned, inactive, not started |

If a page's brand colour and a status colour happen to be the same hex in the
original (Sassy Browser's green is both its brand and "DONE"), map each *usage* to
its meaning. A brand usage becomes `--sc-accent`; a "done" badge becomes `--sc-ok`.

### Spectrum — decorative multi-hue
`--sc-hue-1` … `--sc-hue-8`, ordered red, orange, yellow, green, teal/cyan, blue,
purple, pink. For things that are colourful for decoration rather than meaning:
rainbow borders, syntax highlighting, tag tints, chart series, falling leaves.

### Gradients
| role | use |
|---|---|
| `--sc-gradient-brand` | headline gradient text and brand gradient fills |
| `--sc-gradient-glow` | large decorative radial/hero glows (full `radial-gradient(...)`) — optional |

### Type
| role | use |
|---|---|
| `--sc-font-sans` | body / UI family stack |
| `--sc-font-display` | headline family stack (serif on most pages) |
| `--sc-font-mono` | code / numeric family stack |

### Layout knobs (fallback pattern)
These are **not defined by `original`**. Pages use them with their original value as
the CSS fallback, so `original` renders byte-identically and only themes that want a
different layout define them:

```css
padding: 6rem var(--sc-gutter, 2rem);          /* top-level container side padding */
border-radius: var(--sc-radius-card, 16px);     /* card-like components */
border-radius: var(--sc-radius-btn, 8px);       /* buttons */
box-shadow: var(--sc-shadow-card, none);        /* cards */
```

| knob | applies to |
|---|---|
| `--sc-gutter` | horizontal padding of top-level page containers (nav inner, sections, footer, wraps) |
| `--sc-radius-card` | border-radius of card / panel / tile components |
| `--sc-radius-btn` | border-radius of buttons and button-like links |
| `--sc-shadow-card` | box-shadow of cards at rest |

### Seasonal
`--sc-snow-1` … `--sc-snow-6` are the snowflake colours (winter) and `--sc-leaf-1` …
`--sc-leaf-6` the falling-leaf colours (fall); both are read by `seasonal.js`.

## What stays literal

- Neutral shadows: `rgba(0,0,0,a)` and white highlights used purely for depth.
- Third-party brand marks that must not change (Google Play badge art, Cloudflare
  Turnstile, payment-provider logos).
- Colours inside raster images and favicons.
- Values that are not colours or theme knobs (spacing other than gutters, sizes).

## Page head

Order matters: the script must run before the first paint, and the season files
(`fall.css`, `winter.css`) must come after the page's own `<style>` so
equal-specificity rules resolve in their favour. `seasonal.js` would inject a missing
season file at runtime, but only after first paint, so link both statically.

```html
<html lang="en" data-page="store">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="/theme/seasonal.js"></script>
  <link rel="stylesheet" href="/theme/tokens.css">
  ...page <style>...
  <link rel="stylesheet" href="/theme/fall.css">
  <link rel="stylesheet" href="/theme/winter.css">
</head>
```

## The winter theme (default)

Arctic Midnight & Electric Ice Blue: midnight canvas `#0b1320`, frost-white type
`#f0f6fc`, DM Serif Display headings, DM Sans body. Per-page accents:

| name | accent | pages |
|---|---|---|
| Electric Ice (brand) | `#38bdf8` | home, store, contact, success, privacy, refund, eula, app-testers, guides |
| Polar Cyan | `#0ea5e9` | winforensics |
| Aurora Mint | `#2dd4bf` | sassy-talk, sassytalk-privacy |
| Frost Twilight | `#a78bfa` | website-creator |
| Hearth Gold | `#facc15` | about |
| Glacial Diamond | `#38bdf8` | browser, coming-soon |
| Glacier Blue | `#60a5fa` | nda |
| Hearth Amber | `#fbbf24` | terms |
| Glacial Orange | `#fb923c` | cfadmin-* |
| Winter Berry | `#fb7185` | foodie-* |

Layout in winter (`winter.css`, CSS only): aurora light pooled at the top of the
canvas; a snowflake before section eyebrows and the (c) line; an ice-gradient rule
under section titles; frosted card borders; glittering snowfall behind content (24
flakes on desktop, 12 on phones, none under reduced motion). The same contrast
guarantees as fall apply.

## The fall theme

Ember & Bark with golden-hour light: espresso canvas `#17100b`, cream type
`#f8eddd`, Fraunces display headings (SOFT/WONK axes), DM Sans body. One palette for
every page; every product is a different leaf through its accent:

| leaf | accent | pages |
|---|---|---|
| Pumpkin (brand) | `#f28c3f` | home, store, contact, success, privacy, refund, eula, app-testers, guides |
| Maple | `#f47b5d` | winforensics |
| Spruce | `#5ec4ae` | sassy-talk, sassytalk-privacy |
| Plum | `#c993d6` | website-creator |
| Birch gold | `#f2c14e` | about (the founder's page) |
| Ginkgo | `#cfd96d` | browser, coming-soon |
| Dusk | `#93b8de` | nda |
| Harvest | `#f2b84b` | terms |
| Cloudflare orange | `#f6821f` | cfadmin-* |
| Cranberry | `#ec8097` | foodie-* |

Layout in fall (`fall.css`, CSS only): one site-wide gutter `clamp(1.5rem, 5vw, 2.5rem)`;
leaf-shaped cards (`22px 6px`) and buttons (`14px 4px`); golden-hour light on the
canvas; leaf before section eyebrows and the (c) line; turning-leaf rule under section
titles; homepage hero left-aligned on the product-grid edge with a line-art leaf; each
homepage product tile topped with a different leaf colour; falling leaves behind content.

Guarantees, enforced by `npm run theme:contrast`: every text role (including
`--sc-text-4`) is >= 4.5:1 on every surface, every accent is >= 4.5:1 as link text, ink
on every accent fill is >= 7:1, status colours are >= 4.5:1, and ok/bad differ in
lightness for colour-blind readers.

## Verifying a change

```bash
npm run theme:contrast                      # palette maths for winter and fall
npm run theme:check -- public/store.html    # literals, unknown roles, knob fallbacks, head order, JS syntax
npm run dev                                 # then, in another shell:
npm run theme:snap -- --out .snap/before --theme original      # snapshot every page (390 + 1280)
npm run theme:snap -- --out .snap/after  --theme original
npm run theme:diff -- .snap/before .snap/after .snap/report    # computed colour/font/geometry diff
npm run theme:snap -- --out .snap/fall --theme fall --widths 320,390,1280   # overflow, gutters, WCAG per element
npm run theme:toggle -- --pages /,/store.html                  # (c) long-press behaviour
```

`theme:snap` needs Chrome (`CHROME_PATH` to override). Two runs over unchanged code
diff to exactly zero, so any difference it reports is real.

## Known exceptions

- `original` is byte-exact against the pre-token site except: the (c) lines added for
  the toggle (pages that had none now have one), and four mobile alignment bugs fixed
  for every theme — Sassy Browser capability cards overhung the gutter by 14px at
  390px, the Sassy-Talk licence input started 2.5px outside the gutter, fixed-pixel
  grid minimums (`minmax(340px, …)`) overflowed 320px phones (now `minmax(min(340px,
  100%), 1fr)` site-wide), and footer link rows did not wrap.
- `public/styles.css` (guides only) still defines legacy colour variables used only by
  rules that match nothing on either guide. Safe to delete with those rules.
- `public/design-system.css`, `public/app.js` and `public/glossary.js` are referenced by
  nothing.

## The (c) toggle

The copyright line in each footer carries `data-theme-toggle`. Pressing and holding
it (or holding Enter/Space while it is focused) for 0.7s moves to the next theme:
`winter` → `fall` → `original` → `winter`. The choice persists in `localStorage`
(`sc-theme`) and syncs across open tabs. `?theme=winter` / `?theme=fall` /
`?theme=original` on any URL sets it too, which is handy for screenshots and support.
