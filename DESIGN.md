---
version: alpha
name: Genfeed.ai
description: >
  Design system for Genfeed.ai — an AI-powered content creation OS.
  One ten-step neutral ladder drives both themes: step N does the same job in
  Dark and Light, so a component is authored once and never branches on theme.
  Chrome is grayscale by design — the generated media is the only colour.

colors:
  # ── Canvas ────────────────────────────────────────────────────────────────
  # Two steps, and only two. 100 is the page; 200 is the raised content plane.
  # Dark deliberately stops short of #000000: pure black amplifies halation
  # around light type and leaves elevation nowhere to go.
  background-100: "#0A0A0A"
  background-200: "#161616"

  # ── Neutral ladder ────────────────────────────────────────────────────────
  # Ten steps, each with one job. Values below are the Dark reference; Light
  # mirrors the same jobs with inverted values (packages/ui/src/core/scales.ts).
  # Contrast against the theme's own canvas, dark / light:
  #   100 1.09/1.04 · 200 1.20/1.12 · 300 1.38/1.23 · 400 1.57/1.35
  #   500 2.23/1.71 · 600 3.45/2.42 · 700 5.01/3.10 · 800 6.53/4.54
  #   900 7.66/7.49 · 1000 16.91/17.18
  gray-100: "#161616"   # subtle fill · raised surface (card, panel, sidebar)
  gray-200: "#1F1F1F"   # nested fill · hover on a raised surface
  gray-300: "#2A2A2A"   # active / selected fill
  gray-400: "#333333"   # border
  gray-500: "#4A4A4A"   # border strong · hover border
  gray-600: "#666666"   # disabled foreground
  gray-700: "#808080"   # muted icon (>= 3:1)
  gray-800: "#949494"   # placeholder and muted text (>= 4.5:1)
  gray-900: "#A1A1A1"   # secondary text (>= 7:1)
  gray-1000: "#EDEDED"  # primary text

  # ── Surfaces (semantic aliases onto the ladder) ───────────────────────────
  # Four planes, one step apart: canvas -> card -> nested fill -> hover.
  bg-primary: "#0A0A0A"
  bg-secondary: "#161616"
  bg-tertiary: "#1F1F1F"
  bg-elevated: "#161616"
  bg-hover: "#2A2A2A"
  card: "#161616"

  # ── Structure ─────────────────────────────────────────────────────────────
  border: "#333333"
  border-strong: "#4A4A4A"

  # ── Text — three tiers, all AA or better on their own canvas ──────────────
  text-primary: "#EDEDED"
  text-secondary: "#A1A1A1"
  text-muted: "#949494"

  # ── Primary action — inverts with the theme ───────────────────────────────
  primary: "#EDEDED"
  primary-foreground: "#0A0A0A"
  accent: "#1F1F1F"
  accent-foreground: "#EDEDED"
  accent-hover: "#CCCCCC"

  # ── Semantic status ───────────────────────────────────────────────────────
  # Every status hue is checked as text on its own canvas. Dark values are
  # lifted and light values are darkened so both sides clear AA.
  success: "#10B981"
  warning: "#F59E0B"
  danger: "#FF6166"
  info: "#52A8FF"

  # ── Domain-specific ───────────────────────────────────────────────────────
  agent: "#38BDF8"
  done: "#C084FC"

  # ── Platform brand identifiers ────────────────────────────────────────────
  beehiiv: "#FCD34D"
  devto: "#0A0A0A"
  discord: "#5865F2"
  facebook: "#1877F2"
  fanvue: "#6C63FF"
  ghost: "#15171A"
  hacker_news: "#FF6600"
  instagram: "#E1306C"
  linkedin: "#0A66C2"
  mastodon: "#6364FF"
  medium: "#00AB6C"
  notion: "#000000"
  pinterest: "#E60023"
  product_hunt: "#DA552F"
  reddit: "#FF4500"
  shopify: "#96BF48"
  slack: "#4A154B"
  snapchat: "#FFFC00"
  substack: "#FF6719"
  telegram: "#26A5E4"
  threads: "#000000"
  tiktok: "#FE2C55"
  twitch: "#9146FF"
  twitter: "#1DA1F2"
  whatsapp: "#25D366"
  wordpress: "#21759B"
  youtube: "#FF0000"

typography:
  # Every size ships with its own leading. Leading is a token, not a per-
  # component guess — inconsistent leading makes a dense dark UI feel
  # unreadable long before contrast does.
  caption:
    fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: "0.02em"
  label:
    fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: "-0.011em"
  body-md:
    fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: "-0.011em"
  body-lg:
    fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: "-0.011em"
  lede:
    fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: "-0.011em"
  heading-sm:
    fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 18px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: "-0.02em"
  heading-md:
    fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: "-0.02em"
  heading-lg:
    fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: "-0.02em"
  headline-display:
    fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 30px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: "-0.02em"
  editorial:
    fontFamily: 'Zodiak, Georgia, "Times New Roman", serif'
    fontSize: 36px
    fontWeight: 400
    lineHeight: 40px
    letterSpacing: "-0.02em"
  app-mono:
    fontFamily: '"SF Mono", SFMono-Regular, Consolas, Menlo, monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px

rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 10px
  2xl: 12px
  3xl: 16px
  full: 9999px
  card: 0px

spacing:
  base: 4px

components:
  # Labeled controls snap to 32 / 36 / 40px. A named 28px micro scale is
  # reserved for icon-only controls in genuinely dense chrome such as table
  # row actions and compact rails; it is never used for a labeled button.
  button-micro:
    backgroundColor: transparent
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 28px
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 32px
  button-default-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.primary-foreground}"
  button-secondary:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 32px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 32px
  button-ghost-hover:
    backgroundColor: "{colors.bg-hover}"
    textColor: "{colors.text-primary}"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 32px
  button-medium:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: 36px
  button-large:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: 40px
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.card}"
  card-nested:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  stat-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
  dialog:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
  popover:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  dropdown-menu:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  dropdown-item:
    backgroundColor: transparent
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    height: 32px
  dropdown-item-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.sm}"
  tooltip:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 32px
  input-placeholder:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-muted}"
  select:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: 32px
  sidebar:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.text-secondary}"
  table-head:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-muted}"
    typography: "{typography.caption}"
  table-row-hover:
    backgroundColor: "{colors.gray-300}"
    textColor: "{colors.text-primary}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  divider-strong:
    backgroundColor: "{colors.border-strong}"
    height: 1px
  scrollbar-thumb:
    backgroundColor: "{colors.gray-400}"
    rounded: "{rounded.full}"
  skeleton:
    backgroundColor: "{colors.gray-200}"
    rounded: "{rounded.md}"
  disabled-control:
    # No paired background on purpose: gray-600 is 3.15:1 on the card plane and
    # is exempt from AA precisely because it must read as unavailable.
    textColor: "{colors.gray-600}"
    rounded: "{rounded.md}"
  disabled-control-surface:
    backgroundColor: "{colors.gray-100}"
    rounded: "{rounded.md}"
  icon-muted:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.gray-700}"
    size: 16px
  badge-default:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
  badge-success:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
  badge-warning:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
  badge-info:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.info}"
    rounded: "{rounded.full}"
  badge-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
  badge-agent:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.agent}"
    rounded: "{rounded.full}"
  badge-done:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.done}"
    rounded: "{rounded.full}"
  workspace-composer:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
  workspace-overlay:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.2xl}"
  canvas-page:
    backgroundColor: "{colors.background-100}"
    textColor: "{colors.text-primary}"
  canvas-plane:
    backgroundColor: "{colors.background-200}"
    textColor: "{colors.text-primary}"
  fill-selected:
    backgroundColor: "{colors.gray-300}"
    textColor: "{colors.gray-1000}"
  border-hover:
    backgroundColor: "{colors.gray-500}"
    height: 1px
  text-secondary-sample:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.gray-900}"
  text-muted-sample:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.gray-800}"
  fill-hover:
    backgroundColor: "{colors.gray-200}"
    textColor: "{colors.gray-1000}"
  surface-raised:
    backgroundColor: "{colors.gray-100}"
    textColor: "{colors.gray-1000}"
  platform-beehiiv:
    backgroundColor: "{colors.beehiiv}"
  platform-devto:
    backgroundColor: "{colors.devto}"
  platform-discord:
    backgroundColor: "{colors.discord}"
  platform-facebook:
    backgroundColor: "{colors.facebook}"
  platform-fanvue:
    backgroundColor: "{colors.fanvue}"
  platform-ghost:
    backgroundColor: "{colors.ghost}"
  platform-hacker_news:
    backgroundColor: "{colors.hacker_news}"
  platform-instagram:
    backgroundColor: "{colors.instagram}"
  platform-linkedin:
    backgroundColor: "{colors.linkedin}"
  platform-mastodon:
    backgroundColor: "{colors.mastodon}"
  platform-medium:
    backgroundColor: "{colors.medium}"
  platform-notion:
    backgroundColor: "{colors.notion}"
  platform-pinterest:
    backgroundColor: "{colors.pinterest}"
  platform-product_hunt:
    backgroundColor: "{colors.product_hunt}"
  platform-reddit:
    backgroundColor: "{colors.reddit}"
  platform-shopify:
    backgroundColor: "{colors.shopify}"
  platform-slack:
    backgroundColor: "{colors.slack}"
  platform-snapchat:
    backgroundColor: "{colors.snapchat}"
  platform-substack:
    backgroundColor: "{colors.substack}"
  platform-telegram:
    backgroundColor: "{colors.telegram}"
  platform-threads:
    backgroundColor: "{colors.threads}"
  platform-tiktok:
    backgroundColor: "{colors.tiktok}"
  platform-twitch:
    backgroundColor: "{colors.twitch}"
  platform-twitter:
    backgroundColor: "{colors.twitter}"
  platform-whatsapp:
    backgroundColor: "{colors.whatsapp}"
  platform-wordpress:
    backgroundColor: "{colors.wordpress}"
  platform-youtube:
    backgroundColor: "{colors.youtube}"
---

## Overview

Genfeed.ai is a theme-aware, dark-first, information-dense product surface. Users
choose System, Light, or Dark; System is the default and stays stored as System so
later OS changes keep applying.

One idea holds the whole system together: **a single ten-step neutral ladder, where
step N does the same job in both themes.** A card is `gray-100` in Dark and
`gray-100` in Light. A border is `gray-400` in both. Because the *roles* are
parallel, a component is authored once and never branches on theme — and the light
theme is not a second design to maintain, it is the same design with the ladder
turned over.

The canvas is deliberately not pure black and the primary text is deliberately not
pure white. `#EDEDED` on `#0A0A0A` is 16.9:1 — lower than `#FFFFFF` on `#000000`
would be, and materially easier to read at 14px, because pure white on pure black
halates: the glyph edges bloom and the counters close up. Maximum contrast and
maximum readability are not the same target.

The YAML block above records the **Dark reference**. Light values live in the same
token source, at the same step names.

## Colors

### Theme contract

`packages/ui/src/core/scales.ts` holds the ladder; `packages/ui/src/core/colors.ts`
maps semantic roles onto it. Those two files generate
`packages/ui/web-tokens.css`, which every web surface imports, and project into
`packages/ui/src/semantic/mobile.ts`, `packages/ui/src/semantic/web.ts`, and
`packages/ui/src/static/surface.ts` for native, extension, and standalone-HTML
targets. Nothing else may define a colour.

Only resolved `light | dark` values are written to rendered theme attributes. The
public marketing website (`apps/website`) is locked to Dark and does not follow the
OS or expose an Appearance control.

### The ladder

Ten steps, each with one job. Pick a step by the job, never by how the swatch looks.

| step | job                                     | dark      | light     |
|------|-----------------------------------------|-----------|-----------|
| 100  | subtle fill · raised surface            | `#161616` | `#F5F5F5` |
| 200  | nested fill · hover on a raised surface | `#1F1F1F` | `#EDEDED` |
| 300  | active / selected fill                  | `#2A2A2A` | `#E3E3E3` |
| 400  | border                                  | `#333333` | `#D9D9D9` |
| 500  | border strong · hover border            | `#4A4A4A` | `#C2C2C2` |
| 600  | disabled foreground                     | `#666666` | `#A3A3A3` |
| 700  | muted icon                              | `#808080` | `#8F8F8F` |
| 800  | placeholder and muted text              | `#949494` | `#737373` |
| 900  | secondary text                          | `#A1A1A1` | `#525252` |
| 1000 | primary text                            | `#EDEDED` | `#171717` |

**Steps 100–500 are surfaces and edges. Steps 800–1000 carry words. Nothing below
800 is allowed to carry words**, and 600/700 exist only for disabled states and
icons.

Every step has a translucent twin — `gray-alpha-100` … `gray-alpha-1000` — that
composites to the solid value on the theme's own canvas. Use the alpha step over
media, gradients, and any surface whose colour is not known at author time; use the
solid step everywhere else. They are interchangeable by design.

### Backgrounds

Four planes, one step apart, and no fifth:

1. `bg-primary` — the page canvas and the sidebar (`background-100`).
2. `bg-secondary` / `card` / `bg-elevated` — the raised content plane: cards,
   panels, dropdowns, dialogs, the composer (`gray-100` in Dark,
   `background-200` in Light).
3. `bg-tertiary` / `accent` — one step above the card: fills nested *inside* a
   card, inputs, chips, and the hover state of a row that sits on a card
   (`gray-200`).
4. `bg-hover` — the hover step (`gray-300`). It is a step above `bg-tertiary`
   specifically so hover stays visible on all three planes beneath it.

The general rule behind those names: **hover is `+1` step, selected is `+2`.**
Reach for the relative move before reaching for a named token.

### Text

Three tiers, all AA or better against their own canvas:
`text-primary` (`gray-1000`, 16.9:1 dark / 17.2:1 light), `text-secondary`
(`gray-900`, 7.7:1 / 7.5:1), `text-muted` (`gray-800`, 6.5:1 / 4.5:1).

### Accent

`primary` / `primary-foreground` is the single inverted CTA pair: near-white on
near-black in Dark, near-black on near-white in Light. `accent` is **not** the CTA —
it is the interactive fill (`gray-200`) that hover and selection land on. Always
pair a surface token with its matching foreground token; never hardcode either half.

### Semantic status

Four status colours, each verified as text on its own canvas. Dark values are
lifted and Light values darkened so both sides clear AA:

| role      | dark      | contrast | light     | contrast |
|-----------|-----------|----------|-----------|----------|
| `success` | `#10B981` | 7.80:1   | `#047857` | 5.48:1   |
| `warning` | `#F59E0B` | 9.22:1   | `#B45309` | 5.02:1   |
| `danger`  | `#FF6166` | 6.74:1   | `#DC2626` | 4.83:1   |
| `info`    | `#52A8FF` | 7.92:1   | `#0060DF` | 5.62:1   |

Dark `danger` is lifted from `#DC2626` on purpose: that red only reaches 4.1:1 on
`#0A0A0A` and fails AA as text.

Status **fills** are the hue at low alpha over the current surface —
`hsl(var(--success) / 0.12)` with a `/ 0.24` border — never a second opaque token.
There is no `success-subtle`, and there must not be one.

### Domain colors

- **Agent** `#38BDF8` dark / `#0369A1` light — AI agent activity states.
- **Done** `#C084FC` dark / `#7C3AED` light — completed workflows.

Both are checked as text: 9.25:1 and 7.49:1 on the dark canvas. The previous light
agent blue (`#0284C7`) was 3.9:1 and failed AA.

### Platform colors

Platform brand colours are identifiers only. Do not use them for layout chrome or
primary actions. They appear on platform icons, connection badges, and analytics
breakdowns.

## Typography

### Scale

Every size ships with its own leading. Leading is a token, not a per-component
guess; inconsistent leading is what makes a dense dark UI feel unreadable long
before contrast does.

| token              | size | leading | weight | use                                  |
|--------------------|------|---------|--------|--------------------------------------|
| `caption`          | 11px | 14px    | 500    | badges, chips, uppercase micro-labels |
| `label`            | 12px | 16px    | 500    | table cells, button labels, metadata  |
| `body-md`          | 14px | 20px    | 400    | body copy and controls — the default  |
| `body-lg`          | 15px | 24px    | 400    | comfortable reading columns           |
| `lede`             | 16px | 24px    | 400    | intro paragraphs                      |
| `heading-sm`       | 18px | 28px    | 600    | card titles                           |
| `heading-md`       | 20px | 28px    | 600    | subsection headings                   |
| `heading-lg`       | 24px | 32px    | 600    | section headings                      |
| `headline-display` | 30px | 40px    | 600    | page titles                           |
| `editorial`        | 36px | 40px    | 400    | Zodiak serif, editorial covers only   |

**11px is a hard floor.** Anything that wants to be smaller wants to be uppercase
instead. Use `text-2xs` (11px/14px); `text-[10px]` is not a size, it is a bug.

Body is 14px, not 13px. The 13px default was the single most common readability
complaint, and one point of size buys more legibility here than any contrast change.

### Tracking

`-0.011em` on body and controls, `-0.02em` on anything 18px and up, `0.02em` on
uppercase micro-labels. Larger type needs *more* negative tracking, not less.

### Fonts

Satoshi is the product sans and Zodiak the editorial serif, both loaded as
`--font-satoshi` / `--font-zodiak` with a system stack behind them. Satoshi has a
low x-height for its point size, which is the second reason the 11px floor exists.

## Layout

### Spacing

4px base. Every gap, pad, and inset is a multiple of it.

### Control sizes

Three heights, and nothing between them: `control-sm` 32px, `control-md` 36px,
`control-lg` 40px. Icons ride along at `icon-sm` 14px, `icon-md` 16px, `icon-lg`
20px, so a label and its glyph stay optically the same weight. A bare `h-[34px]` on
a toolbar row is always a mistake.

### Border radius

Canonical source is `packages/ui/src/core/radius.ts`, mirrored 1:1 as `--radius-*`
in `packages/ui/web-tokens.css`:

- `none` (0px) — flat surfaces
- `xs` (2px) — smallest chip corners and hairline insets
- `sm` (4px) — menu and dropdown items
- `md` (6px) — buttons, inputs, tooltips, selects, dropdown panels
- `lg` (8px) — toasts and overlay panels
- `xl` (10px) — dialogs, command palette, composer
- `2xl` (12px) — large modals and workspace overlays
- `3xl` (16px) — oversized media and promo surfaces
- `full` (9999px) — badges, pills, avatars, circular controls
- `card` (0px) — cards are square on purpose; they separate by plane and
  hairline, not by rounding

**Concentric rule:** a child's radius is never larger than its parent's. Something
inset by a single padding step takes the step *below* its parent, or the inner
corner bulges.

Conversation workspace geometry uses scoped aliases —
`--radius-workspace-shell` (8px), `--radius-workspace-shell-emphasis` (10px),
`--radius-workspace-composer` (10px), `--radius-workspace-overlay` (12px) — applied
only through `[data-workspace-shell="true"]` and
`[data-workspace-shell-overlay="true"]`.

## Elevation & Depth

### Shadows

Depth is two things stacked, never one: a **hairline edge** that defines the shape,
and a **two-layer shadow** — a tight direct layer that grounds the element plus a
wide ambient layer that separates it from the plane below. A single blurry
`box-shadow` reads as a smudge, especially on a near-black canvas.

Elevation is themed. Dark runs darker shadows and leans harder on the hairline,
because a shadow cast on `#0A0A0A` has nowhere to go; Light runs the same geometry
at a fraction of the opacity. Values live in `packages/ui/src/core/elevation.ts`.

| utility                | composition                                       | use                        |
|------------------------|---------------------------------------------------|----------------------------|
| `shadow-border`        | inset hairline, `border`                          | cards, resting surfaces    |
| `shadow-border-strong` | inset hairline, `border-strong`                   | hover and focus-within     |
| `shadow-dropdown`      | inset hairline + `--shadow-md`                    | menus, popovers, selects   |
| `shadow-dialog`        | inset hairline + `--shadow-lg`                    | dialogs, sheets            |
| `shadow-composer`      | `--shadow-lg` (outer ambient, no hairline)        | the docked composer        |
| `shadow-tooltip`       | `--shadow-tooltip` (ring + direct + ambient)      | tooltips                   |

A card may carry a CSS `border` *or* an inset hairline; both are legal and they
render identically. The rule is that a raised surface must have **an edge and a
plane shift** — a card that differs from the canvas by 1.09:1 and has no edge is
invisible, which is exactly what the previous `#080808`-on-`#030303` card was.

The docked composer is the exception: a 1px ring on the glass prompt bar reads as
a slab on `#0A0A0A`. `shadow-composer` / `shadow-composer-strong` lift with
`--shadow-lg` only — no inset or outer hairline.

Reserve plain `border` for structural dividers (sidebar edges, header separators)
where there is no elevation to express.

### Focus

One focus treatment product-wide: `--focus-ring` paints a 2px gap in the canvas
colour and then a 2px ring in `--ring`, so the ring survives on any surface —
including one whose background already matches the ring colour. The ring is
monochrome; focus is not a place to introduce hue.

## Components

### Button

Semantic hierarchy: `default` (the one primary action on a surface) · `secondary`
(ordinary neutral actions) · `ghost` (toolbar and icon-only chrome) · `destructive`
(dangerous actions only) · `link` (inline navigation) · `unstyled` (internal
composite primitives only).

All styled variants use `rounded-md` (6px) and `control-sm` (32px) by default.
`white`, `black`, `generate`, `soft`, `outline-white`, and `outline` are not button
variants; pick the semantic role instead. Ghost is the standard for toolbar and
topbar icon actions: transparent, no border, `hover:bg-hover`.

### Card

`bg-secondary` plane with an edge — `shadow-border` or a `border-border` CSS border.
Hover lifts the edge to `shadow-border-strong`. Stat cards tint with `bg-{color}/5`.
Cards are square (`rounded-card`, 0px).

### Input

`bg-tertiary` fill (one step above the card it sits on), `border-border`, 32px tall,
`rounded-md`, `body-md` type. Placeholders use `text-muted` (`gray-800`), never
lower. Focus applies `--focus-ring` and lifts the border to `border-strong`.

### Dropdown

`bg-elevated` panel with `shadow-dropdown`. Items are `rounded-sm` (4px), 32px tall,
inset `mx-1` from the panel edge, and hover to `accent` (`gray-200`). Popovers use
the same overlay surface — never `bg-hover`, never the page canvas.

### Sidebar

`bg-primary` with a `border-r border-border` structural divider. Menu items use
ghost semantics: transparent, `hover:bg-hover`, active is `bg-hover text-foreground`.
Section labels are `caption` type, uppercase, `text-muted`.

### App Switcher

Google-style popover grid, three columns, icon + label per cell, opened from a
topbar ghost trigger, grouped into Content and Tools with a subtle divider.

## Iconography

Trailing chevrons describe what a control will do, not merely that something can
open. The one-question test is: **after the user picks, does the trigger's own
displayed value change?**

| Affordance | Promise | Use |
|------------|---------|-----|
| `ChevronsUpDown` | Replaces the value displayed by the trigger | Organization, brand, and app switchers; Select and combobox triggers; model pickers |
| `ChevronDown` | Reveals commands or content beneath an unchanged trigger | Action and overflow menus, accordions, disclosures, and apply-style filters |

Both use the existing 14 / 16 / 20px icon scale and a muted foreground role.
A value-swap glyph is stable while its popover is open; it does not rotate into a
directional disclosure icon.

Status is never encoded by a generic colored dot alone. A status pill renders a
status-specific icon alongside its visible label; the semantic tint reinforces
that meaning but does not carry it. Icon, tint, and canonical status key come from
`packages/ui/src/tokens/status-colors.ts`. Status chrome does not pulse or glow.

## Brand OS Surfaces

Brand OS surfaces are product-led acquisition surfaces, not a visual rebrand. The
public CTA and preview may use campaign-scale composition; the authenticated
review/apply flow stays dense and operational.

### Evidence Labels

Every Brand OS recommendation must be visibly tagged as extracted, inferred,
candidate, or missing. Source-backed colour and voice suggestions can appear in
public previews, but candidate palettes do not become Genfeed product tokens until
accepted into the real token source and reflected in this file.

### Scale Roles

- `product` — 32px control baseline for dense review fields and source rows
- `block` — standard public CTA and preview modules
- `hero` — primary public promise or conversion proof
- `monument` — one large proof artifact per page, used sparingly

Do not use campaign-scale roles inside authenticated settings pages unless the
screen is presenting a single launch artifact.

## Color Entry — Content Is the Accent

Genfeed chrome is a neutral studio: the gallery wall, not the art. The product's
output is inherently colourful, so the interface never competes with it. This is
the studio rationale (Adobe, Figma, Frame.io — neutral chrome so content colour
reads true), not a dev-tool aesthetic borrowed for its own sake.

Colour enters through exactly four doors:

1. **User content** — generated media is the primary colour source. Render it
   borderless and full-bleed wherever possible; chrome recedes behind it.
2. **Platform brand identifiers** — scoped to badges and icons only.
3. **Semantic status** — success/warning/danger/info, for state, never decoration.
4. **Categorical palettes** — workflow-node and tag colours, for identification,
   never chrome.

Everything else — buttons, cards, borders, hovers, focus rings — is grayscale.
Ambient treatments may derive tint *from* focused content (a low-opacity dominant-
colour wash behind a media canvas); chrome never imposes its own hue onto content.

No glow textures: no `box-shadow` halos, spotlight tints, or pulsing glow
animations in chrome.

## Do's and Don'ts

- **Do** pick a ladder step by its job, and move `+1` for hover, `+2` for selected.
- **Do** give every raised surface both an edge and a plane shift.
- **Do** use the alpha ladder (`gray-alpha-*`) over media, gradients, and unknown
  surfaces, and the solid ladder everywhere else.
- **Do** pair every surface token with its matching foreground token.
- **Do** ship a leading token with every size — `text-2xs`, `text-sm`, `text-md`
  all carry their own.
- **Do** snap controls to 32 / 36 / 40 and icons to 14 / 16 / 20.
- **Do** use `--focus-ring` for every focus state.
- **Do** verify System, Light, and Dark whenever application chrome changes.
- **Don't** put words on anything below `gray-800`.
- **Don't** write `text-[10px]`, `text-[11px]`, or any arbitrary size — 11px is the
  floor and it has a name.
- **Don't** add a per-theme override. If a component needs one, the step it picked
  was wrong.
- **Don't** mix Tailwind's built-in `gray-*` with this ladder; the default ramp is
  blue-tinted and is cleared from the theme on purpose.
- **Don't** add opaque status variants — status fills are the hue at low alpha.
- **Don't** use `accent` for a CTA; it is the interactive fill, and `primary` is
  the CTA.
- **Don't** collapse System into its resolved Light or Dark value when persisting.
- **Don't** add new semantic colours without updating this file and the token source.
- **Don't** use large decorative gradients as core product surfaces, or nest cards
  inside cards.
- **Don't** add coloured accents or glow shadows to chrome — colour enters only
  through the four doors above.
