/**
 * Neutral scales — the readability spine of the design system.
 *
 * Ten steps per theme, each step with one assigned job. The two themes are
 * *role-parallel*: step N does the same job in dark and light, so a component
 * written against a step never needs a per-theme branch.
 *
 * The dark canvas is `#0A0A0A` (not `#000000`) and dark primary text is
 * `#EDEDED` (not `#FFFFFF`). Capping the extremes trades ~3 points of raw WCAG
 * ratio for a large reduction in halation — the glare that makes pure white on
 * pure black hard to read at UI type sizes.
 */

export const neutralScaleSteps = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '1000',
] as const;

export type NeutralScaleStep = (typeof neutralScaleSteps)[number];

export interface ScaleValue {
  hsl: string;
  hex: string;
}

export type NeutralScale = Record<NeutralScaleStep, ScaleValue>;
export type NeutralAlphaScale = Record<NeutralScaleStep, string>;

/**
 * What each step is for. Never pick a step by how it looks — pick it by job.
 */
export const neutralScaleJobs = {
  '100': 'subtle fill · raised surface (card, panel, sidebar plane)',
  '200': 'hover fill',
  '300': 'active / selected fill',
  '400': 'border',
  '500': 'border strong · hover border',
  '600': 'disabled foreground',
  '700': 'muted icon (>= 3:1 non-text contrast)',
  '800': 'placeholder text (>= 4.5:1)',
  '900': 'secondary text (>= 7:1)',
  '1000': 'primary text',
} as const satisfies Record<NeutralScaleStep, string>;

/**
 * Solid neutral ladders. Both are monotonic in contrast against their own
 * canvas, so "one step up" is always a visible, predictable change.
 *
 * Contrast against canvas — dark (`#0A0A0A`) / light (`#FAFAFA`):
 * 100 1.09/1.04 · 200 1.20/1.12 · 300 1.38/1.23 · 400 1.57/1.35 · 500 2.23/1.71
 * 600 3.45/2.42 · 700 5.01/3.10 · 800 6.53/4.54 · 900 7.66/7.49 · 1000 16.91/17.18
 */
export const neutralScale = {
  dark: {
    '100': { hex: '#161616', hsl: '0 0% 9%' },
    '200': { hex: '#1F1F1F', hsl: '0 0% 12%' },
    '300': { hex: '#2A2A2A', hsl: '0 0% 16%' },
    '400': { hex: '#333333', hsl: '0 0% 20%' },
    '500': { hex: '#4A4A4A', hsl: '0 0% 29%' },
    '600': { hex: '#666666', hsl: '0 0% 40%' },
    '700': { hex: '#808080', hsl: '0 0% 50%' },
    '800': { hex: '#949494', hsl: '0 0% 58%' },
    '900': { hex: '#A1A1A1', hsl: '0 0% 63%' },
    '1000': { hex: '#EDEDED', hsl: '0 0% 93%' },
  },
  light: {
    '100': { hex: '#F5F5F5', hsl: '0 0% 96%' },
    '200': { hex: '#EDEDED', hsl: '0 0% 93%' },
    '300': { hex: '#E3E3E3', hsl: '0 0% 89%' },
    '400': { hex: '#D9D9D9', hsl: '0 0% 85%' },
    '500': { hex: '#C2C2C2', hsl: '0 0% 76%' },
    '600': { hex: '#A3A3A3', hsl: '0 0% 64%' },
    '700': { hex: '#8F8F8F', hsl: '0 0% 56%' },
    '800': { hex: '#737373', hsl: '0 0% 45%' },
    '900': { hex: '#525252', hsl: '0 0% 32%' },
    '1000': { hex: '#171717', hsl: '0 0% 9%' },
  },
} as const satisfies Record<'dark' | 'light', NeutralScale>;

/**
 * Translucent twin of {@link neutralScale}. Each alpha step composites to its
 * solid counterpart when painted on the theme canvas, so the two ladders are
 * interchangeable — use the alpha step whenever the element sits on media,
 * a gradient, or another translucent layer.
 */
export const neutralAlphaScale = {
  dark: {
    '100': 'rgba(255, 255, 255, 0.05)',
    '200': 'rgba(255, 255, 255, 0.09)',
    '300': 'rgba(255, 255, 255, 0.13)',
    '400': 'rgba(255, 255, 255, 0.17)',
    '500': 'rgba(255, 255, 255, 0.26)',
    '600': 'rgba(255, 255, 255, 0.38)',
    '700': 'rgba(255, 255, 255, 0.48)',
    '800': 'rgba(255, 255, 255, 0.56)',
    '900': 'rgba(255, 255, 255, 0.62)',
    '1000': 'rgba(255, 255, 255, 0.93)',
  },
  light: {
    '100': 'rgba(0, 0, 0, 0.02)',
    '200': 'rgba(0, 0, 0, 0.05)',
    '300': 'rgba(0, 0, 0, 0.09)',
    '400': 'rgba(0, 0, 0, 0.13)',
    '500': 'rgba(0, 0, 0, 0.22)',
    '600': 'rgba(0, 0, 0, 0.35)',
    '700': 'rgba(0, 0, 0, 0.43)',
    '800': 'rgba(0, 0, 0, 0.54)',
    '900': 'rgba(0, 0, 0, 0.67)',
    '1000': 'rgba(0, 0, 0, 0.91)',
  },
} as const satisfies Record<'dark' | 'light', NeutralAlphaScale>;

export const backgroundScaleSteps = ['100', '200'] as const;
export type BackgroundScaleStep = (typeof backgroundScaleSteps)[number];
export type BackgroundScale = Record<BackgroundScaleStep, ScaleValue>;

/**
 * Page planes. `100` is the canvas the app paints on; `200` is the plane that
 * carries content (cards, sidebars, popovers). In both themes `200` is the
 * *lighter* of the pair, so a card always reads as raised toward the light.
 */
export const backgroundScale = {
  dark: {
    '100': { hex: '#0A0A0A', hsl: '0 0% 4%' },
    '200': { hex: '#161616', hsl: '0 0% 9%' },
  },
  light: {
    '100': { hex: '#FAFAFA', hsl: '0 0% 98%' },
    '200': { hex: '#FFFFFF', hsl: '0 0% 100%' },
  },
} as const satisfies Record<'dark' | 'light', BackgroundScale>;
