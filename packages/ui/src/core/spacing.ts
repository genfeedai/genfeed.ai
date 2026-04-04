export type SpacingTokenName =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'xxl'
  | 'xxxl'
  | 'xxxxl';

export const spacingTokens = {
  lg: '16px',
  md: '12px',
  sm: '8px',
  xl: '20px',
  xs: '4px',
  xxl: '24px',
  xxxl: '32px',
  xxxxl: '48px',
} as const satisfies Record<SpacingTokenName, string>;
