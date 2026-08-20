/**
 * Elevation.
 *
 * Depth is two things stacked, never one: a **hairline border** that defines the
 * shape's edge, and a **two-layer shadow** — a tight direct layer that grounds
 * the element plus a wide ambient layer that separates it from the plane below.
 * A single blurry `box-shadow` reads as smudge, especially on a dark canvas.
 *
 * Dark shadows are darker *and* the border does more of the work, because a
 * shadow cast on `#0A0A0A` has almost nowhere to go.
 */
export type ElevationTokenName =
  | 'shadowBorder'
  | 'shadowBorderInset'
  | 'shadowSm'
  | 'shadowMd'
  | 'shadowLg'
  | 'shadowMenu'
  | 'shadowModal'
  | 'shadowTooltip';

export type ElevationTokens = Record<ElevationTokenName, string>;

export const elevationTokens = {
  dark: {
    shadowBorder: '0 0 0 1px rgba(255, 255, 255, 0.13)',
    shadowBorderInset: 'inset 0 0 0 1px rgba(255, 255, 255, 0.09)',
    shadowLg:
      '0 4px 8px rgba(0, 0, 0, 0.4), 0 16px 32px -8px rgba(0, 0, 0, 0.44)',
    shadowMd:
      '0 2px 4px rgba(0, 0, 0, 0.36), 0 8px 16px -8px rgba(0, 0, 0, 0.32)',
    shadowMenu:
      '0 0 0 1px rgba(255, 255, 255, 0.13), 0 1px 1px rgba(0, 0, 0, 0.28), 0 4px 8px -4px rgba(0, 0, 0, 0.36), 0 16px 24px -8px rgba(0, 0, 0, 0.44)',
    shadowModal:
      '0 0 0 1px rgba(255, 255, 255, 0.13), 0 1px 1px rgba(0, 0, 0, 0.28), 0 8px 16px -4px rgba(0, 0, 0, 0.36), 0 24px 32px -8px rgba(0, 0, 0, 0.52)',
    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.36)',
    shadowTooltip:
      '0 0 0 1px rgba(255, 255, 255, 0.13), 0 1px 1px rgba(0, 0, 0, 0.28), 0 4px 8px rgba(0, 0, 0, 0.36)',
  },
  light: {
    shadowBorder: '0 0 0 1px rgba(0, 0, 0, 0.09)',
    shadowBorderInset: 'inset 0 0 0 1px rgba(0, 0, 0, 0.09)',
    shadowLg:
      '0 2px 2px rgba(0, 0, 0, 0.04), 0 8px 16px -4px rgba(0, 0, 0, 0.06)',
    shadowMd:
      '0 2px 2px rgba(0, 0, 0, 0.04), 0 8px 8px -8px rgba(0, 0, 0, 0.04)',
    shadowMenu:
      '0 0 0 1px rgba(0, 0, 0, 0.09), 0 1px 1px rgba(0, 0, 0, 0.02), 0 4px 8px -4px rgba(0, 0, 0, 0.04), 0 16px 24px -8px rgba(0, 0, 0, 0.06)',
    shadowModal:
      '0 0 0 1px rgba(0, 0, 0, 0.09), 0 1px 1px rgba(0, 0, 0, 0.02), 0 8px 16px -4px rgba(0, 0, 0, 0.04), 0 24px 32px -8px rgba(0, 0, 0, 0.06)',
    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.04)',
    shadowTooltip:
      '0 0 0 1px rgba(0, 0, 0, 0.09), 0 1px 1px rgba(0, 0, 0, 0.02), 0 4px 8px rgba(0, 0, 0, 0.04)',
  },
} as const satisfies Record<'dark' | 'light', ElevationTokens>;

export type FocusTokenName = 'focusRing' | 'focusRingInset' | 'focusRingWidth';

/**
 * One focus treatment for the whole product. The two-layer form paints a gap in
 * the canvas colour before the ring, so the ring stays visible on any surface —
 * including one whose background already matches the ring colour.
 *
 * These resolve through `--background` / `--ring`, so a single value serves both
 * themes.
 */
export const focusTokens = {
  focusRing: '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring))',
  focusRingInset: 'inset 0 0 0 2px hsl(var(--ring))',
  focusRingWidth: '2px',
} as const satisfies Record<FocusTokenName, string>;
