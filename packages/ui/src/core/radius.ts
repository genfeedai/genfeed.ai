export type RadiusTokenName =
  | 'none'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'xxl'
  | 'xxxl'
  | 'full';

export const radiusTokens = {
  full: '9999px',
  lg: '8px',
  md: '6px',
  none: '0px',
  sm: '4px',
  xl: '10px',
  xxl: '12px',
  xxxl: '16px',
} as const satisfies Record<RadiusTokenName, string>;
