/**
 * Radius.
 *
 * Concentric rule: a child's radius is never larger than its parent's. Nesting a
 * `lg` control inside an `md` container makes the inner corner bulge — pick the
 * step *below* the parent for anything inset by a single padding step.
 *
 * `card` is deliberately sharp. That is a brand decision, not an oversight:
 * cards separate by plane and hairline, not by rounding.
 */
export type RadiusTokenName =
  | 'none'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | 'full'
  | 'card'
  | 'workspaceComposer'
  | 'workspaceOverlay';

export const radiusTokens = {
  '2xl': '12px',
  '3xl': '16px',
  card: '0px',
  full: '9999px',
  lg: '8px',
  md: '6px',
  none: '0px',
  sm: '4px',
  workspaceComposer: 'var(--radius-xl)',
  workspaceOverlay: 'var(--radius-2xl)',
  xl: '10px',
  xs: '2px',
} as const satisfies Record<RadiusTokenName, string>;
