export type RadiusTokenName =
  | 'none'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'xxl'
  | 'full';

export const radiusTokens = {
  full: '999px',
  lg: '12px',
  md: '8px',
  none: '0px',
  sm: '6px',
  xl: '16px',
  xxl: '24px',
} as const satisfies Record<RadiusTokenName, string>;
