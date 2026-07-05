---
version: alpha
name: Genfeed.ai
description: >
  Design system for Genfeed.ai — an AI-powered content creation OS.
  Dark-first, information-dense UI aligned with ShipCode/Linear visual language.
  Layered depth through background shifts, semantic status colors, and
  inset-shadow containment on elevated surfaces.

colors:
  # Backgrounds — layered depth from deepest to elevated
  bg-primary: "#050607"
  bg-secondary: "#0c0d10"
  bg-tertiary: "#131518"
  bg-elevated: "#1a1c21"
  bg-hover: "#20232a"

  # Borders — hex approximations of translucent white on the dark canvas
  border: "#1e2022"
  border-strong: "#333538"

  # Text — three-tier hierarchy
  text-primary: "#f4f4f5"
  text-secondary: "#b4b4bc"
  text-muted: "#6b6b78"

  # Accent — inverted for dark mode (white CTA on dark bg)
  accent: "#fafafa"
  accent-foreground: "#050607"
  accent-hover: "#e4e4e7"

  # Semantic status
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
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
  instagram: "#E1306C"
  linkedin: "#0A66C2"
  mastodon: "#6364FF"
  medium: "#00AB6C"
  notion: "#000000"
  pinterest: "#E60023"
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
  sm: 2px
  md: 6px
  lg: 8px
  xl: 10px

spacing:
  base: 4px

components:
  button-default:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
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
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    shadow: "inset 0 0 0 1px {colors.border}"
  dialog:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
  badge-default:
    backgroundColor: "{colors.bg-hover}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
  badge-success:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.success}"
    rounded: "{rounded.sm}"
  badge-warning:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.warning}"
    rounded: "{rounded.sm}"
  badge-danger:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
  tooltip:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  select:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  dropdown-menu:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    shadow: "inset 0 0 0 1px {colors.border}, 0 10px 15px -3px rgba(0,0,0,0.3)"
  sidebar:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.text-secondary}"
    borderRight: "1px solid {colors.border}"
  popover:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  stat-card:
    backgroundColor: "{colors.bg-secondary}"
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

Genfeed.ai uses a dark-first design system aligned with ShipCode and Linear's visual
language. The system prioritizes information density, clear status hierarchy, and layered
depth through background tones rather than heavy borders.

The visual identity is minimal and high-contrast: near-black backgrounds with white
accent CTAs, layered depth through subtle background shifts, and semantic colors that
map directly to content and workflow states.

## Colors

### Background layers

Five background tones create depth without borders. From deepest to most elevated:
`bg-primary` (main canvas, sidebar) -> `bg-secondary` (cards, panels) ->
`bg-tertiary` (inputs, nested surfaces) -> `bg-elevated` (popovers, dropdowns) ->
`bg-hover` (interactive hover states).

### Accent

Dark mode inverts the typical accent pattern: `accent` is near-white (#fafafa) for
maximum contrast CTAs on dark backgrounds. `accent-foreground` matches `bg-primary`
for text on accent surfaces.

### Semantic status

Four standard status colors:
- **Success** (#10b981) -- completed, passing, published
- **Warning** (#f59e0b) -- needs attention, awaiting approval
- **Danger** (#ef4444) -- failed, errored, rejected
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

Four-step scale matching ShipCode/Linear:
- `sm` (2px) -- badges, tags, inline chips
- `md` (6px) -- cards, buttons, inputs, tooltips, popovers, dropdowns
- `lg` (8px) -- toasts, overlay panels
- `xl` (10px) -- dialogs, command palette

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

Four primary variants: default (white accent), secondary (tertiary bg), ghost
(transparent), destructive (danger red). All use `rounded-md` (6px).

Ghost buttons are the standard for toolbar/topbar icon actions -- transparent
background, no border, `hover:bg-hover` on interaction.

### Card

`bg-secondary` background with `shadow-border` containment. Hover lifts to
`shadow-border-strong`. Stat cards support semantic tones via `bg-{color}/5` tinting.

### Sidebar

`bg-primary` background with `border-r border-border` structural divider. Menu items
use ghost button semantics: transparent bg, `hover:bg-white/[0.06]`, active state =
`bg-white/[0.06] text-foreground`. Section labels: `10px uppercase tracking-[0.15em]
text-white/30`.

### App Switcher

Google-style popover grid (3 columns). Icon + label per cell. Opens from topbar ghost
trigger button. Grouped into Content and Tools sections with a subtle divider.

### Dropdown

`bg-secondary` with `shadow-dropdown`. Items use `rounded-sm` (2px) with `hover:bg-hover`.
Inline margin `mx-1` insets items from panel edges.

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
- **Do** use `-0.01em` letter-spacing on body, tighter on headings.
- **Don't** use CSS `border` for card/dialog/dropdown containment -- use inset `box-shadow`.
- **Don't** mix hardcoded colors with token references.
- **Don't** use `accent` for status indication -- it's for primary CTAs only.
- **Don't** add new semantic colors without updating this DESIGN.md.
- **Don't** use large decorative gradients as core product surfaces.
- **Don't** nest cards inside cards.
- **Don't** add colored accents or glow/spotlight shadows to chrome — color
  enters only through the four doors in "Color Entry" above.
