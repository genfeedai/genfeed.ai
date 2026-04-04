/**
 * Category colors for workflow nodes.
 * These hex values match the CSS variables in globals.scss.
 * Update both places when changing colors.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  ai: '#a855f7', // purple - oklch(0.65 0.25 300)
  input: '#2dd4bf', // teal - oklch(0.7 0.15 160)
  output: '#f59e0b', // amber - oklch(0.75 0.18 70)
  processing: '#818cf8', // blue - oklch(0.65 0.2 250)
};

export const DEFAULT_NODE_COLOR = '#6b7280';

/**
 * Node color palette for individual node coloring.
 * These are the same colors used for groups.
 */
export type NodeColor =
  | 'none'
  | 'purple'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'gray';

export const NODE_COLOR_VALUES: Record<NodeColor, string | null> = {
  blue: '#3b82f6',
  gray: '#6b7280',
  green: '#22c55e',
  none: null,
  orange: '#f97316',
  pink: '#ec4899',
  purple: '#a855f7',
  red: '#ef4444',
  yellow: '#eab308',
};

export const NODE_COLOR_LABELS: Record<NodeColor, string> = {
  blue: 'Blue',
  gray: 'Gray',
  green: 'Green',
  none: 'Default',
  orange: 'Orange',
  pink: 'Pink',
  purple: 'Purple',
  red: 'Red',
  yellow: 'Yellow',
};

export const NODE_COLORS: NodeColor[] = [
  'none',
  'purple',
  'blue',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'gray',
];
