export type MotionTokenName =
  | 'durationFast'
  | 'durationNormal'
  | 'durationSlow'
  | 'easeStandard';

export const motionTokens = {
  durationFast: '200ms',
  durationNormal: '300ms',
  durationSlow: '500ms',
  easeStandard: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const satisfies Record<MotionTokenName, string>;
