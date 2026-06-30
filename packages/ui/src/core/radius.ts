export type RadiusTokenName =
  | 'none'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | 'full';

export const radiusTokens = {
  '2xl': '12px',
  '3xl': '16px',
  full: '9999px',
  lg: '8px',
  md: '6px',
  none: '0px',
  sm: '4px',
  xl: '10px',
  xs: '2px',
} as const satisfies Record<RadiusTokenName, string>;
