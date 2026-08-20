/**
 * Type tokens.
 *
 * Two rules the sizes encode. First, 11px is the floor — nothing in the product
 * is allowed to be smaller, which is why there is a named `xs` step instead of
 * an arbitrary `text-2xs`. Second, every size has a *paired* line height:
 * leading is a token, not a per-component guess, because inconsistent leading is
 * what makes a dense dark UI feel unreadable long before contrast does.
 *
 * Pairings: xs → caption · sm → compact · md → body · lg/xl → lede ·
 * xxl/h3 → heading · xxxl/h2 → title · h1/hero → display.
 */
export type TypographyTokenName =
  | 'fontSans'
  | 'fontSerif'
  | 'fontSizeXs'
  | 'fontSizeSm'
  | 'fontSizeMd'
  | 'fontSizeLg'
  | 'fontSizeXl'
  | 'fontSizeXxl'
  | 'fontSizeXxxl'
  | 'fontSizeHero'
  | 'fontSizeH1'
  | 'fontSizeH2'
  | 'fontSizeH3'
  | 'lineHeightCaption'
  | 'lineHeightCompact'
  | 'lineHeightBody'
  | 'lineHeightLede'
  | 'lineHeightHeading'
  | 'lineHeightTitle'
  | 'lineHeightDisplay'
  | 'fontWeightRegular'
  | 'fontWeightMedium'
  | 'fontWeightSemibold'
  | 'trackingTight'
  | 'trackingNormal'
  | 'trackingWide';

export const typographyTokens = {
  fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSerif: "Georgia, 'Times New Roman', serif",
  fontSizeH1: '30px',
  fontSizeH2: '24px',
  fontSizeH3: '20px',
  fontSizeHero: '36px',
  fontSizeLg: '15px',
  // Body. Was 13px — the single biggest readability complaint in the app.
  fontSizeMd: '14px',
  fontSizeSm: '12px',
  fontSizeXl: '16px',
  // Hard floor. Anything that wants to be smaller wants to be uppercase instead.
  fontSizeXs: '11px',
  fontSizeXxl: '18px',
  fontSizeXxxl: '20px',
  fontWeightMedium: '500',
  fontWeightRegular: '400',
  fontWeightSemibold: '600',
  lineHeightBody: '20px',
  lineHeightCaption: '14px',
  lineHeightCompact: '16px',
  lineHeightDisplay: '40px',
  lineHeightHeading: '28px',
  lineHeightLede: '24px',
  lineHeightTitle: '32px',
  // Optical correction: large type needs negative tracking to avoid looking loose.
  trackingNormal: '-0.011em',
  trackingTight: '-0.02em',
  // Uppercase micro-labels only.
  trackingWide: '0.02em',
} as const satisfies Record<TypographyTokenName, string>;
