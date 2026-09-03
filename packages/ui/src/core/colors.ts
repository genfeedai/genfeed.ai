/**
 * Semantic colour roles — the only palette product code is allowed to name.
 *
 * Every value here is a step from `@ui/core/scales` (or a status hue verified
 * against the theme canvas). Pick a role by what the element *is*, never by how
 * the swatch looks; the two themes are role-parallel, so one class works in both.
 *
 * Verified contrast (WCAG 2.1 relative luminance) — dark canvas `#0A0A0A`,
 * light canvas `#FAFAFA`:
 *
 * | role                     | dark    | light   |
 * | ------------------------ | ------- | ------- |
 * | foreground               | 16.91:1 | 17.18:1 |
 * | mutedForeground          |  7.66:1 |  7.49:1 |
 * | card vs background       |  1.09:1 |  1.06:1 |
 * | border vs background     |  1.57:1 |  1.35:1 |
 * | destructive (as text)    |  6.74:1 |  4.83:1 |
 * | success (as text)        |  7.80:1 |  5.48:1 |
 * | warning (as text)        |  9.22:1 |  5.02:1 |
 * | info (as text)           |  7.92:1 |  5.62:1 |
 */
export const semanticColorRoles = [
  'background',
  'backgroundSecondary',
  'backgroundTertiary',
  'foreground',
  'card',
  'cardForeground',
  'popover',
  'popoverForeground',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'accent',
  'accentForeground',
  'destructive',
  'destructiveForeground',
  'border',
  'borderStrong',
  'input',
  'ring',
  'success',
  'successForeground',
  'warning',
  'warningForeground',
  'info',
  'infoForeground',
  'surface',
  'fill',
  'edge',
  'inv',
  'invFg',
] as const;

export type SemanticColorRole = (typeof semanticColorRoles)[number];
export type ColorTokenName = SemanticColorRole;

export interface SemanticColorValue {
  hsl: string;
  hex: string;
}

export type SemanticThemeColors = Record<SemanticColorRole, SemanticColorValue>;

export const semanticColorTokens = {
  dark: {
    // gray-200 — the hover/selected fill every interactive surface lands on.
    accent: { hex: '#1F1F1F', hsl: '0 0% 12%' },
    accentForeground: { hex: '#EDEDED', hsl: '0 0% 93%' },
    // background-100 — the canvas. Deliberately not #000: pure black amplifies
    // halation around light type and kills every elevation cue above it.
    background: { hex: '#0A0A0A', hsl: '0 0% 4%' },
    // background-200 — the content plane (sidebars, panels, cards).
    backgroundSecondary: { hex: '#161616', hsl: '0 0% 9%' },
    backgroundTertiary: { hex: '#1F1F1F', hsl: '0 0% 12%' },
    border: { hex: '#333333', hsl: '0 0% 20%' },
    borderStrong: { hex: '#4A4A4A', hsl: '0 0% 29%' },
    // Lighter than the canvas, so a card reads as raised without a border.
    // 5% (not 9%) so dark panels separate from the 4% canvas.
    card: { hex: '#0D0D0D', hsl: '0 0% 5%' },
    cardForeground: { hex: '#EDEDED', hsl: '0 0% 93%' },
    // #DC2626 only reaches 4.10:1 on this canvas — fails AA as text.
    destructive: { hex: '#FF6166', hsl: '358 100% 69%' },
    destructiveForeground: { hex: '#0A0A0A', hsl: '0 0% 4%' },
    edge: { hex: '#EDEDED', hsl: '237 237 237' },
    fill: { hex: '#EDEDED', hsl: '237 237 237' },
    // gray-1000 — capped short of #FFF to keep 13-16px type from blooming.
    foreground: { hex: '#EDEDED', hsl: '0 0% 93%' },
    info: { hex: '#52A8FF', hsl: '210 100% 66%' },
    infoForeground: { hex: '#0A0A0A', hsl: '0 0% 4%' },
    input: { hex: '#333333', hsl: '0 0% 20%' },
    inv: { hex: '#EDEDED', hsl: '237 237 237' },
    invFg: { hex: '#0A0A0A', hsl: '10 10 10' },
    muted: { hex: '#161616', hsl: '0 0% 9%' },
    // gray-900 — 7.66:1, comfortably past AAA for body copy.
    mutedForeground: { hex: '#A1A1A1', hsl: '0 0% 63%' },
    // background-200, same plane as a card. Overlays separate with the
    // shadow-dropdown hairline + shadow, never by getting lighter than the
    // surface they cover — that reads as a second, competing canvas.
    popover: { hex: '#161616', hsl: '0 0% 9%' },
    popoverForeground: { hex: '#EDEDED', hsl: '0 0% 93%' },
    primary: { hex: '#EDEDED', hsl: '0 0% 93%' },
    primaryForeground: { hex: '#0A0A0A', hsl: '0 0% 4%' },
    ring: { hex: '#EDEDED', hsl: '0 0% 93%' },
    secondary: { hex: '#161616', hsl: '0 0% 9%' },
    secondaryForeground: { hex: '#EDEDED', hsl: '0 0% 93%' },
    success: { hex: '#10B981', hsl: '160 84% 39%' },
    successForeground: { hex: '#0A0A0A', hsl: '0 0% 4%' },
    surface: { hex: '#EDEDED', hsl: '237 237 237' },
    warning: { hex: '#F59E0B', hsl: '38 92% 50%' },
    warningForeground: { hex: '#0A0A0A', hsl: '0 0% 4%' },
  },
  light: {
    accent: { hex: '#EDEDED', hsl: '0 0% 93%' },
    accentForeground: { hex: '#171717', hsl: '0 0% 9%' },
    // True neutral. Every hue angle here is 0 by design — a warm canvas tints
    // every screenshot, thumbnail, and brand colour the product renders on it.
    background: { hex: '#FAFAFA', hsl: '0 0% 98%' },
    backgroundSecondary: { hex: '#FFFFFF', hsl: '0 0% 100%' },
    backgroundTertiary: { hex: '#EDEDED', hsl: '0 0% 93%' },
    border: { hex: '#D9D9D9', hsl: '0 0% 85%' },
    borderStrong: { hex: '#C2C2C2', hsl: '0 0% 76%' },
    card: { hex: '#FFFFFF', hsl: '0 0% 100%' },
    cardForeground: { hex: '#171717', hsl: '0 0% 9%' },
    destructive: { hex: '#DC2626', hsl: '0 72% 51%' },
    destructiveForeground: { hex: '#FFFFFF', hsl: '0 0% 100%' },
    edge: { hex: '#171717', hsl: '23 23 23' },
    fill: { hex: '#171717', hsl: '23 23 23' },
    foreground: { hex: '#171717', hsl: '0 0% 9%' },
    info: { hex: '#0060DF', hsl: '214 100% 44%' },
    infoForeground: { hex: '#FFFFFF', hsl: '0 0% 100%' },
    input: { hex: '#D9D9D9', hsl: '0 0% 85%' },
    inv: { hex: '#171717', hsl: '23 23 23' },
    invFg: { hex: '#FAFAFA', hsl: '250 250 250' },
    muted: { hex: '#F5F5F5', hsl: '0 0% 96%' },
    // gray-900 — 7.49:1. The old #707070 sat at 4.74:1, barely legal.
    mutedForeground: { hex: '#525252', hsl: '0 0% 32%' },
    popover: { hex: '#FFFFFF', hsl: '0 0% 100%' },
    popoverForeground: { hex: '#171717', hsl: '0 0% 9%' },
    primary: { hex: '#171717', hsl: '0 0% 9%' },
    primaryForeground: { hex: '#FAFAFA', hsl: '0 0% 98%' },
    ring: { hex: '#171717', hsl: '0 0% 9%' },
    secondary: { hex: '#F5F5F5', hsl: '0 0% 96%' },
    secondaryForeground: { hex: '#171717', hsl: '0 0% 9%' },
    // Status hues darken in light mode so they stay legible as text on #FAFAFA.
    success: { hex: '#047857', hsl: '163 94% 24%' },
    successForeground: { hex: '#FFFFFF', hsl: '0 0% 100%' },
    surface: { hex: '#171717', hsl: '23 23 23' },
    warning: { hex: '#B45309', hsl: '26 90% 37%' },
    warningForeground: { hex: '#FFFFFF', hsl: '0 0% 100%' },
  },
} as const satisfies Record<'dark' | 'light', SemanticThemeColors>;
