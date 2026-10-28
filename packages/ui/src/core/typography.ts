/**
 * Type tokens.
 *
 * Two rules the sizes encode. First, 11px is the floor — nothing in the product
 * is allowed to be smaller, which is why there is a named `xs` step instead of
 * an arbitrary `text-2xs`. Second, every size has a *paired* line height:
 * leading is a token, not a per-component guess, because inconsistent leading is
 * what makes a dense dark UI feel unreadable long before contrast does.
 *
 * Only the steps Tailwind has no slot for live here: `xs` (11px, `text-2xs`),
 * `md` (14px body) and `lg` (15px, `text-md`). Every other size is a stock
 * Tailwind class (`text-xs` … `text-4xl`), so it is not duplicated as a token.
 *
 * Pairings: xs → caption · md → body · lg → lede.
 */
export type TypographyTokenName =
  | 'fontSans'
  | 'fontSerif'
  | 'fontSizeXs'
  | 'fontSizeMd'
  | 'fontSizeLg'
  | 'lineHeightCaption'
  | 'lineHeightBody'
  | 'lineHeightLede'
  | 'fontWeightRegular'
  | 'fontWeightMedium'
  | 'fontWeightSemibold'
  | 'trackingTight'
  | 'trackingNormal'
  | 'trackingWide';

export const typographyTokens = {
  fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSerif: "Georgia, 'Times New Roman', serif",
  fontSizeLg: '15px',
  // Body. Was 13px — the single biggest readability complaint in the app.
  fontSizeMd: '14px',
  // Hard floor. Anything that wants to be smaller wants to be uppercase instead.
  fontSizeXs: '11px',
  fontWeightMedium: '500',
  fontWeightRegular: '400',
  fontWeightSemibold: '600',
  lineHeightBody: '20px',
  lineHeightCaption: '14px',
  lineHeightLede: '24px',
  // Optical correction: large type needs negative tracking to avoid looking loose.
  trackingNormal: '-0.011em',
  trackingTight: '-0.02em',
  // Uppercase micro-labels only.
  trackingWide: '0.02em',
} as const satisfies Record<TypographyTokenName, string>;
