---
version: alpha
name: Genfeed.ai
description: >
  Design system for Genfeed.ai — an AI-powered content creation OS.
  Theme-aware, dark-first, information-dense UI aligned with ShipCode/Linear visual language.
  Layered depth through background shifts, semantic status colors, and
  inset-shadow containment on elevated surfaces.

colors:
  # Backgrounds — layered depth from deepest to elevated
  bg-primary: "#050607"
  bg-secondary: "#0c0d10"
  bg-tertiary: "#131518"
  bg-elevated: "#1a1c21"
  bg-hover: "#20232a"
  card: "#080808"

  # Borders — hex approximations of translucent white on the dark canvas
  border: "#1e2022"
  border-strong: "#333538"

  # Text — three-tier hierarchy. Muted must stay AA on the void canvas.
  # Chroma lives in gallery / video / image artefacts, not in chrome.
  text-primary: "#ffffff"
  text-secondary: "#c8c8d0"
  text-muted: "#8a8a8a"

  # Accent — inverted for dark mode (white CTA on dark bg)
  primary: "#fafafa"
  primary-foreground: "#050607"
  accent: "#fafafa"
  accent-foreground: "#050607"
  accent-hover: "#e4e4e7"

  # Semantic status
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#dc2626"
  info: "#3b82f6"

  # Domain-specific
  agent: "#38bdf8"
  done: "#a855f7"

  # Platform brand identifiers
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
  app-sans:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.01em
  app-mono:
    fontFamily: '"SF Mono", SFMono-Regular, Consolas, Menlo, monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  heading-section:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: 1.875rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.03em

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

spacing:
  base: 4px

components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: 32px
  button-secondary:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: 32px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    height: 32px
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    height: 32px
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
  dialog:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
  badge-default:
    backgroundColor: "{colors.bg-hover}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.full}"
  badge-success:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
  badge-warning:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
  badge-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
  tooltip:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  select:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  dropdown-menu:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  sidebar:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.text-secondary}"
  popover:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  stat-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
  input:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: 32px
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

Genfeed.ai uses a theme-aware, dark-first design system aligned with ShipCode and
Linear's visual language. Users choose System, Light, or Dark; System is the default.
The system prioritizes information density, clear status hierarchy, and layered depth
through background tones rather than heavy borders.

The visual identity is minimal and high-contrast in either mode: neutral backgrounds,
inverted neutral CTAs, layered depth through subtle background shifts, and semantic
colors that map directly to content and workflow states. The YAML palette above records
the Studio dark reference; runtime light and dark values come from the shared token
sources described below.

## Colors

### Theme contract

`packages/ui/src/core/colors.ts` is the canonical semantic Light/Dark palette.
`packages/ui/web-tokens.css`, `packages/ui/src/semantic/mobile.ts`, standalone HTML,
and host adapters project those roles into their platforms. Application chrome uses
semantic roles (`background`, `foreground`, `card`, `muted`, `border`, `primary`, and
their foreground pairs), never raw white/black assumptions.

The stored preference is `system | light | dark`. `system` resolves from the operating
system or host and remains stored as System so later OS changes continue to apply.
Only resolved `light | dark` values may be written to rendered theme attributes.
The public marketing website (`apps/website`) is locked to Dark and does not
follow the OS or expose an Appearance control.

The light palette uses warm-neutral canvas layers (`#fafaf9`, `#f6f6f4`, `#f1f1ef`),
near-black foreground (`#0d0d0d`), and neutral structural borders (`#dad9d6`). Studio
uses its parchment projection from `packages/styles/globals.css`. Dark mode retains the
near-black studio palette documented above.

### Background layers

Five background tones create depth without borders. From deepest to most elevated:
`bg-primary` (main canvas, sidebar) -> `bg-secondary` (cards, panels) ->
`bg-tertiary` (inputs, nested surfaces, overlay menus) -> `bg-elevated` ->
`bg-hover` (interactive hover states). Overlay menus stay on `bg-tertiary`
(`#131518`) — not the lighter `bg-elevated` slab.

### Accent

The primary action pair inverts with the theme: near-white on near-black in Dark and
near-black on warm white in Light. Always pair `primary` with `primary-foreground`;
never hardcode either half.

### Semantic status

Four standard status colors:
- **Success** (#10b981) -- completed, passing, published
- **Warning** (#f59e0b) -- needs attention, awaiting approval
- **Danger** (#dc2626) -- failed, errored, rejected
- **Info** (#3b82f6) -- informational, neutral status

### Domain colors

- **Agent** (#38bdf8, sky-400) -- AI agent activity states
- **Done** (#a855f7, purple) -- completed workflows

### Platform colors

Platform brand colors are identifiers only. Do not use them for layout chrome or
primary actions. They appear on platform icons, connection badges, and analytics
breakdowns.

## Typography

### Scale (app)

| Element         | Size   |
|-----------------|--------|
| Badge / chip    | 10px   |
| Table head      | 11px   |
| Table cell      | 12px   |
| Body / button   | 13px   |
| Card title      | 14px   |

Body text uses `-0.01em` letter-spacing. Headings use `-0.03em`.

## Layout

### Border radius

Nine-step scale — the canonical source is `packages/ui/src/core/radius.ts`
(`radiusTokens`), mirrored 1:1 as `--radius-*` in `packages/ui/web-tokens.css`:
- `none` (0px) -- cards and flat surfaces (`--radius-card` resolves to 0px)
- `xs` (2px) -- smallest chip corners and hairline insets
- `sm` (4px) -- menu and dropdown items
- `md` (6px) -- buttons, inputs, tooltips, selects, dropdown panels
- `lg` (8px) -- toasts and overlay panels
- `xl` (10px) -- dialogs and command palette
- `2xl` (12px) -- large modals and feature surfaces
- `3xl` (16px) -- oversized media and promo surfaces
- `full` (9999px) -- badges, pills, avatars, and circular controls

Conversation workspace geometry uses semantic, locally scoped aliases from
`packages/ui/web-tokens.css`: `--radius-workspace-shell` (8px),
`--radius-workspace-shell-emphasis` (10px),
`--radius-workspace-composer` (10px), and `--radius-workspace-overlay` (12px).
These aliases apply only through the `[data-workspace-shell="true"]` and
`[data-workspace-shell-overlay="true"]` scoped selectors; editorial cards continue
to resolve through `--radius-card` and remain square.

### Shadows

Elevated surfaces use inset box-shadow for containment instead of CSS border:
- `shadow-border`: `inset 0 0 0 1px hsl(var(--border))`
- `shadow-border-strong`: `inset 0 0 0 1px hsl(var(--border-strong))`
- `shadow-dropdown`: `inset 0 0 0 1px hsl(var(--border)), 0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -4px rgba(0,0,0,0.3)`
- `shadow-dialog`: `inset 0 0 0 1px hsl(var(--border)), 0 25px 50px -12px rgba(0,0,0,0.4)`

Reserve CSS `border` for structural dividers only (sidebar edges, header/footer
separators).

## Components

### Button

The canonical semantic hierarchy is:
- `default` -- the single primary action on a surface; white accent in dark mode
- `secondary` -- ordinary neutral actions
- `ghost` -- toolbar and icon-only chrome
- `destructive` -- dangerous actions only
- `link` -- inline navigation
- `unstyled` -- internal composite primitives only, never page-level styling

All styled variants use `rounded-md` (6px). `white`, `black`, `generate`,
`soft`, `outline-white`, and `outline` are not button variants; select the
semantic role instead.

Ghost buttons are the standard for toolbar/topbar icon actions -- transparent
background, no border, `hover:bg-hover` on interaction.

### Card

`bg-secondary` background with `shadow-border` containment. Hover lifts to
`shadow-border-strong`. Stat cards support semantic tones via `bg-{color}/5` tinting.

### Sidebar

`bg-primary` background with `border-r border-border` structural divider. Menu items
use ghost button semantics: transparent background, `hover:bg-hover`, active state =
`bg-hover text-foreground`. Section labels use `10px uppercase tracking-[0.15em]
text-muted-foreground`.

### App Switcher

Google-style popover grid (3 columns). Icon + label per cell. Opens from topbar ghost
trigger button. Grouped into Content and Tools sections with a subtle divider.

### Dropdown

`bg-tertiary` with `shadow-dropdown`. Items use `rounded-sm` (4px) with `hover:bg-hover`.
Inline margin `mx-1` insets items from panel edges. Popovers use the same overlay
surface — never `bg-elevated`, `bg-card`, or the page canvas.

## Brand OS Surfaces

Brand OS surfaces are product-led acquisition surfaces, not a full visual
rebrand. The public CTA and preview may use campaign-scale composition, but the
authenticated review/apply flow stays dense and operational.

### Evidence Labels

Every Brand OS recommendation must be visibly tagged as extracted, inferred,
candidate, or missing. Source-backed color and voice suggestions can appear in
public previews, but candidate palettes do not become Genfeed product tokens
until accepted into the real token source and reflected in this file.

### Scale Roles

Brand OS preview surfaces distinguish four roles:
- `product` -- 32px control baseline for dense review fields and source rows
- `block` -- standard public CTA and preview modules
- `hero` -- primary public promise or conversion proof
- `monument` -- one large proof artifact per page, used sparingly

Do not use campaign-scale roles inside authenticated settings pages unless the
screen is explicitly presenting a single launch artifact.

## Color Entry — Content Is the Accent

Genfeed chrome is a neutral studio: the gallery wall, not the art. The product's
output (generated images, video, audio artwork) is inherently colorful, so the
interface never competes with it. This is the studio rationale (Adobe, Figma,
Frame.io — neutral chrome so content color reads true), not a dev-tool
aesthetic borrowed for its own sake.

Color enters the UI through exactly four doors:

1. **User content** — generated media is the primary color source. Render it
   borderless and full-bleed wherever possible; chrome recedes behind it.
2. **Platform brand identifiers** — the platform tokens above, scoped to
   badges/icons only.
3. **Semantic status** — success/warning/danger/info, for state, never decoration.
4. **Categorical palettes** — workflow-node and tag colors, for function
   (identification), never chrome.

Everything else — buttons, cards, borders, hovers, focus rings — is grayscale.
Ambient treatments may derive tint FROM focused content (e.g. a low-opacity
dominant-color wash behind a media canvas); chrome never imposes its own hue
onto content.

No glow textures: no `box-shadow` halos, spotlight tints, or pulsing glow
animations in chrome. Elevation comes from background layering and inset-shadow
containment only.

## Do's and Don'ts

- **Do** use background layering for hierarchy instead of heavy borders.
- **Do** use inset `box-shadow` borders on elevated surfaces (cards, dialogs, dropdowns).
- **Do** use `border-border` token for structural dividers (sidebar edges, header bottoms).
- **Do** use ghost buttons for toolbar/topbar actions.
- **Do** use semantic status colors consistently across all surfaces.
- **Do** verify System, Light, and Dark whenever application chrome changes.
- **Do** pair semantic surfaces with their matching foreground token.
- **Do** use `-0.01em` letter-spacing on body, tighter on headings.
- **Don't** use CSS `border` for card/dialog/dropdown containment -- use inset `box-shadow`.
- **Don't** mix hardcoded colors with token references.
- **Don't** collapse System into its currently resolved Light or Dark value when persisting.
- **Don't** use `accent` for status indication -- it's for primary CTAs only.
- **Don't** add new semantic colors without updating this DESIGN.md.
- **Don't** use large decorative gradients as core product surfaces.
- **Don't** nest cards inside cards.
- **Don't** add colored accents or glow/spotlight shadows to chrome — color
  enters only through the four doors in "Color Entry" above.
