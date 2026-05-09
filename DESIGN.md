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
  beehiiv: "#FCD34D"
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
  display:
    fontFamily: Zodiak, Georgia, Times New Roman, serif
    fontSize: 3rem
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: 0
  h1:
    fontFamily: Satoshi, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
    fontSize: 1.625rem
    fontWeight: 600
    lineHeight: 1.16
    letterSpacing: 0
  h2:
    fontFamily: Satoshi, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  body-md:
    fontFamily: Satoshi, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: Satoshi, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  label:
    fontFamily: Satoshi, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
    fontSize: 0.6875rem
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0
rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 10px
  xxl: 12px
  xxxl: 16px
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
  surface-dark-secondary:
    backgroundColor: "{colors.background-dark-secondary}"
    textColor: "{colors.foreground-dark}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  surface-dark-tertiary:
    backgroundColor: "{colors.background-dark-tertiary}"
    textColor: "{colors.muted-dark}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  surface-light-secondary:
    backgroundColor: "{colors.background-light-secondary}"
    textColor: "{colors.foreground-light}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  surface-light-tertiary:
    backgroundColor: "{colors.background-light-tertiary}"
    textColor: "{colors.foreground-light}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  muted-light-text:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.muted-light}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: "{spacing.sm}"
  border-dark-swatch:
    backgroundColor: "{colors.border-dark}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  border-light-swatch:
    backgroundColor: "{colors.border-light}"
    textColor: "{colors.foreground-light}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
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
    textColor: "{colors.primary}"
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
    textColor: "{colors.primary-foreground}"
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
    textColor: "{colors.primary-foreground}"
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
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  platform-beehiiv:
    backgroundColor: "{colors.beehiiv}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-discord:
    backgroundColor: "{colors.discord}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-facebook:
    backgroundColor: "{colors.facebook}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-fanvue:
    backgroundColor: "{colors.fanvue}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-ghost:
    backgroundColor: "{colors.ghost}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-instagram:
    backgroundColor: "{colors.instagram}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-linkedin:
    backgroundColor: "{colors.linkedin}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-mastodon:
    backgroundColor: "{colors.mastodon}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-medium:
    backgroundColor: "{colors.medium}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-notion:
    backgroundColor: "{colors.notion}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-pinterest:
    backgroundColor: "{colors.pinterest}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-reddit:
    backgroundColor: "{colors.reddit}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-shopify:
    backgroundColor: "{colors.shopify}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-slack:
    backgroundColor: "{colors.slack}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-snapchat:
    backgroundColor: "{colors.snapchat}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-substack:
    backgroundColor: "{colors.substack}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-telegram:
    backgroundColor: "{colors.telegram}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-threads:
    backgroundColor: "{colors.threads}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-tiktok:
    backgroundColor: "{colors.tiktok}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-twitch:
    backgroundColor: "{colors.twitch}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-twitter:
    backgroundColor: "{colors.twitter}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-whatsapp:
    backgroundColor: "{colors.whatsapp}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-wordpress:
    backgroundColor: "{colors.wordpress}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  platform-youtube:
    backgroundColor: "{colors.youtube}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
---

## Overview

Genfeed.ai uses a dark-first operator interface: dense, quiet, high-contrast, and built for repeated work in content operations. The UI should feel like a production console for AI workflows, not a marketing surface. Favor strong information hierarchy, compact controls, restrained color, and visible system state.

This document describes the whole repository, not a single app. It covers the product web app, public website, docs, mobile app, desktop shell, browser and IDE extensions, workflow UI, and CLI. The implementation sources that must stay aligned with this file are `packages/ui/web-tokens.scss`, `packages/ui/src/core/*`, `packages/ui/src/semantic/*`, `packages/styles/globals.scss`, `packages/styles/shadcn-theme.scss`, `packages/next-config/tailwind.config.base.ts`, `apps/docs/styles/globals.css`, and `packages/cli/src/ui/theme.ts`.

The default product theme is dark. Light mode exists for readability and public surfaces, but new product UI should be designed dark-first and verified in both themes.

## Colors

The product palette is monochrome-first. In dark mode, surfaces step from near-black backgrounds to subtle raised panels and low-contrast borders. In light mode, surfaces use warm off-white neutrals rather than pure white.

Use `primary` as white-on-black interaction in dark mode. Use `primary-light` for the light-mode primary action color, matching the shared shadcn `--primary` token. Reserve semantic colors for state: success, warning, destructive, info, workflow agent, and workflow done. Platform colors are brand identifiers only; do not let them dominate layout chrome.

Status and platform chips must meet text contrast with their foreground token. Use black text on bright status colors and platform colors unless the contrast table requires white text.

## Typography

Product UI uses Satoshi through `--font-sans`, with system fallbacks. Editorial and brand moments may use Zodiak through `--font-serif`; keep this limited to true headings, empty states, public site hero copy, or content previews. App controls, tables, sidebars, modals, forms, and workflow nodes should use compact sans-serif text.

The root app shell runs at a dense 13px base, so component typography must be explicit when larger text is needed. Letter spacing is zero by default. Do not scale font size with viewport width.

## Layout

Spacing follows the shared token scale: 4, 8, 12, 16, 20, 24, 32, and 48px. Use the smaller steps for product controls and docked panels. Use 32 and 48px for page sections, public website composition, and large empty states.

Panels and tools should align to predictable grids and stable dimensions. Avoid decorative cards around whole page sections. Cards are for repeated items, modals, and genuinely framed tools.

## Elevation & Depth

Elevation is mostly expressed through borders, surface steps, and occasional inset highlights. Box shadows are restrained and should not become the main visual language. In dark mode, prefer subtle border contrast over glow. In light mode, use soft shadows only when a panel must separate from an off-white background.

## Shapes

The default web radius is small. Interactive elements should generally use 4px. Medium surfaces may use 6px, 8px, or 10px. Larger radii are reserved for images, media previews, large marketing surfaces, or native controls where touch targets need more softness. Use `rounded-full` only for avatars, badges, status pills, toggles, and circular icon buttons.

## Components

Use the existing shared UI primitives and package boundaries. In production TSX, use `@ui/primitives/*` for controls such as buttons, inputs, selects, dialogs, tables, separators, toggles, and textareas. Navigation should use links; commands should use buttons.

Buttons should be compact, direct, and stateful. Icon buttons should use lucide icons when available. Panels should not nest cards inside cards. Workflow surfaces should make current state, inputs, outputs, cost, and errors easy to scan.

## Surfaces

Product web and workflow UI should use the shared Tailwind preset, semantic CSS variables, `@genfeedai/styles`, and `@ui/primitives`. Website and marketing pages may use larger editorial type and media-forward composition, but they still use the same surface, spacing, radius, and platform-color language.

Docs should look like the product’s public reference surface: warm light mode, near-black dark mode, compact tables, restrained borders, and API method colors only inside Swagger/OpenAPI blocks. Mobile should consume `nativeTokenMap` rather than screen-local palettes. Desktop boot UI should stay minimal and dark, using the wordmark as the brand signal. Extensions should respect host-platform constraints while preserving Genfeed status, spacing, and platform-color semantics. CLI output should be quiet, semantic, and monochrome-first; accent color is for primary Genfeed actions only.

## Do's and Don'ts

Do use semantic tokens from `@genfeedai/ui`, `@genfeedai/styles`, and the shared Tailwind preset. Do keep product UI dark-first. Do check light mode when adding public or shared components. Do use platform colors only as identifiers.

Don't add raw HTML form/control elements in production TSX. Don't introduce a second theme system, hard-code broad palettes, or use large decorative gradients as the core product surface. Don't make app workflows feel like landing pages.
