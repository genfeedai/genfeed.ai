---
version: alpha
name: Genfeed.ai
description: Dark-first operator interface for an open source AI OS for content creation.
colors:
  background-dark: "#030303"
  background-dark-secondary: "#0F0F0F"
  background-dark-tertiary: "#1A1A1A"
  foreground-dark: "#FAFAFA"
  card-dark: "#080808"
  border-dark: "#262626"
  muted-dark: "#949494"
  background-light: "#FAFAF9"
  background-light-secondary: "#F6F6F4"
  background-light-tertiary: "#F1F1EF"
  foreground-light: "#0D0D0D"
  card-light: "#F6F6F4"
  border-light: "#DAD9D6"
  muted-light: "#707070"
  primary: "#FFFFFF"
  primary-light: "#2563EB"
  primary-foreground: "#000000"
  destructive: "#DC2626"
  success: "#10B981"
  warning: "#F59E0B"
  info: "#3B82F6"
  agent: "#38BDF8"
  done: "#A855F7"
  instagram: "#E1306C"
  facebook: "#1877F2"
  linkedin: "#0A66C2"
  reddit: "#FF4500"
  tiktok: "#FE2C55"
  discord: "#5865F2"
typography:
  h1:
    fontFamily: Zodiak, Georgia, Times New Roman, serif
    fontSize: 3rem
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: 0
  h2:
    fontFamily: Satoshi, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
    fontSize: 1.875rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  body-md:
    fontFamily: Satoshi, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: Satoshi, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  label:
    fontFamily: Satoshi, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0
rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 10px
  xl: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px
  xxxl: 32px
  xxxxl: 48px
components:
  app-shell-dark:
    backgroundColor: "{colors.background-dark}"
    textColor: "{colors.foreground-dark}"
    typography: "{typography.body-md}"
  app-shell-light:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.foreground-light}"
    typography: "{typography.body-md}"
  panel-dark:
    backgroundColor: "{colors.card-dark}"
    textColor: "{colors.foreground-dark}"
    rounded: "{rounded.sm}"
    padding: "{spacing.lg}"
  panel-light:
    backgroundColor: "{colors.card-light}"
    textColor: "{colors.foreground-light}"
    rounded: "{rounded.sm}"
    padding: "{spacing.lg}"
  button-primary-dark:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  button-primary-light:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.background-light}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  button-danger:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  status-info:
    backgroundColor: "{colors.info}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  workflow-agent:
    backgroundColor: "{colors.agent}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  workflow-done:
    backgroundColor: "{colors.done}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  platform-instagram:
    backgroundColor: "{colors.instagram}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-facebook:
    backgroundColor: "{colors.facebook}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-linkedin:
    backgroundColor: "{colors.linkedin}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-reddit:
    backgroundColor: "{colors.reddit}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-tiktok:
    backgroundColor: "{colors.tiktok}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-discord:
    backgroundColor: "{colors.discord}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
---

## Overview

Genfeed.ai uses a dark-first operator interface: dense, quiet, high-contrast, and built for repeated work in content operations. The UI should feel like a production console for AI workflows, not a marketing surface. Favor strong information hierarchy, compact controls, restrained color, and visible system state.

The default product theme is dark. Light mode exists for readability and public surfaces, but new product UI should be designed dark-first and verified in both themes.

## Colors

The product palette is monochrome-first. In dark mode, surfaces step from near-black backgrounds to subtle raised panels and low-contrast borders. In light mode, surfaces use warm off-white neutrals rather than pure white.

Use `primary` as white-on-black interaction in dark mode. Use `primary-light` for the light-mode primary action color, matching the existing shadcn `--primary` token. Reserve semantic colors for state: success, warning, destructive, info, workflow agent, and workflow done. Platform colors are brand identifiers only; do not let them dominate layout chrome.

## Typography

Product UI uses Satoshi through `--font-sans`, with system fallbacks. Editorial and brand moments may use Zodiak through `--font-serif`; keep this limited to true headings, empty states, public site hero copy, or content previews. App controls, tables, sidebars, modals, forms, and workflow nodes should use compact sans-serif text.

The root app shell runs at a dense 13px base, so component typography must be explicit when larger text is needed. Letter spacing is zero by default.

## Layout

Spacing follows the shared CSS variables in `packages/ui/web-tokens.scss`: 4, 8, 12, 16, 20, 24, 32, and 48px. Use the smaller steps for product controls and docked panels. Use 32 and 48px for page sections, public website composition, and large empty states.

Panels and tools should align to predictable grids and stable dimensions. Avoid decorative cards around whole page sections. Cards are for repeated items, modals, and genuinely framed tools.

## Elevation & Depth

Elevation is mostly expressed through borders, surface steps, and occasional inset highlights. Box shadows are restrained and should not become the main visual language. In dark mode, prefer subtle border contrast over glow. In light mode, use soft shadows only when a panel must separate from an off-white background.

## Shapes

The default radius is small. Interactive elements should generally use 4px. Medium surfaces may use 6px or 10px. Larger radii are reserved for images, media previews, or rare editorial surfaces. Use `rounded-full` only for avatars, badges, status pills, toggles, and circular icon buttons.

## Components

Use the existing shared UI primitives and package boundaries. In production TSX, use `@ui/primitives/*` for controls such as buttons, inputs, selects, dialogs, tables, separators, toggles, and textareas. Navigation should use links; commands should use buttons.

Buttons should be compact, direct, and stateful. Icon buttons should use lucide icons when available. Panels should not nest cards inside cards. Workflow surfaces should make current state, inputs, outputs, cost, and errors easy to scan.

## Do's and Don'ts

Do use semantic tokens from `@genfeedai/ui`, `@genfeedai/styles`, and the shared Tailwind preset. Do keep product UI dark-first. Do check light mode when adding public or shared components. Do use platform colors only as identifiers.

Don't add raw HTML form/control elements in production TSX. Don't introduce a second theme system, hard-code broad palettes, or use large decorative gradients as the core product surface. Don't make app workflows feel like landing pages.
