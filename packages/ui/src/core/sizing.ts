/**
 * Control geometry.
 *
 * Three heights, and nothing between them. Buttons, inputs, selects, and the
 * segmented controls all snap to this ladder so a toolbar row lines up without
 * per-component padding maths.
 *
 * Icons ride along: an icon inside a control uses the matching step, which is
 * what keeps a 14px label and its glyph optically the same weight.
 */
export type SizingTokenName =
  | 'controlSm'
  | 'controlMd'
  | 'controlLg'
  | 'iconSm'
  | 'iconMd'
  | 'iconLg';

export const sizingTokens = {
  controlLg: '40px',
  controlMd: '36px',
  controlSm: '32px',
  iconLg: '20px',
  iconMd: '16px',
  iconSm: '14px',
} as const satisfies Record<SizingTokenName, string>;
