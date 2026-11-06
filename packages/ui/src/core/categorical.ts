/**
 * Categorical palette — DESIGN.md "Color Entry", door 4.
 *
 * Hues that tell records of different *kinds* apart (content types, tag
 * categories, asset scopes, workflow nodes). They identify; they never carry
 * state (that is the status set) and never paint chrome. Each step is checked
 * as text on its own canvas: light against #FFFFFF / #FAFAFA, dark against
 * #0A0A0A / #000000. Fills are the hue at `/10` over the current surface.
 *
 * | hue     | light   | contrast | dark    | contrast |
 * | ------- | ------- | -------- | ------- | -------- |
 * | blue    | #1D4ED8 | 6.42:1   | #93C5FD | 10.98:1  |
 * | cyan    | #0E7490 | 5.13:1   | #67E8F9 | 13.66:1  |
 * | emerald | #047857 | 5.25:1   | #6EE7B7 | 12.99:1  |
 * | amber   | #B45309 | 4.81:1   | #FCD34D | 13.73:1  |
 * | orange  | #C2410C | 4.96:1   | #FDBA74 | 11.74:1  |
 * | red     | #B91C1C | 6.20:1   | #FCA5A5 | 10.43:1  |
 * | pink    | #BE185D | 5.78:1   | #F9A8D4 | 10.92:1  |
 * | violet  | #6D28D9 | 6.81:1   | #C4B5FD | 10.72:1  |
 */
export const categoricalHues = [
  'amber',
  'blue',
  'cyan',
  'emerald',
  'orange',
  'pink',
  'red',
  'violet',
] as const;

export type CategoricalHue = (typeof categoricalHues)[number];

export interface CategoricalColorValue {
  hex: string;
  hsl: string;
}

export const categoricalColorTokens = {
  dark: {
    amber: { hex: '#FCD34D', hsl: '46 97% 65%' },
    blue: { hex: '#93C5FD', hsl: '212 96% 78%' },
    cyan: { hex: '#67E8F9', hsl: '187 92% 69%' },
    emerald: { hex: '#6EE7B7', hsl: '156 72% 67%' },
    orange: { hex: '#FDBA74', hsl: '31 97% 72%' },
    pink: { hex: '#F9A8D4', hsl: '327 87% 82%' },
    red: { hex: '#FCA5A5', hsl: '0 94% 82%' },
    violet: { hex: '#C4B5FD', hsl: '252 95% 85%' },
  },
  light: {
    amber: { hex: '#B45309', hsl: '26 90% 37%' },
    blue: { hex: '#1D4ED8', hsl: '224 76% 48%' },
    cyan: { hex: '#0E7490', hsl: '193 82% 31%' },
    emerald: { hex: '#047857', hsl: '163 94% 24%' },
    orange: { hex: '#C2410C', hsl: '17 88% 40%' },
    pink: { hex: '#BE185D', hsl: '335 78% 42%' },
    red: { hex: '#B91C1C', hsl: '0 74% 42%' },
    violet: { hex: '#6D28D9', hsl: '263 70% 50%' },
  },
} as const satisfies Record<
  'dark' | 'light',
  Record<CategoricalHue, CategoricalColorValue>
>;
