/**
 * Node Group UI Constants
 * Re-exports types from shared package, defines Tailwind-specific styling
 */

// Re-export types from shared package
export type { GroupColor, NodeGroup } from '@genfeedai/contracts/types';

import type { GroupColor } from '@genfeedai/contracts/types';

export const GROUP_COLORS: Record<
  GroupColor,
  { bg: string; border: string; text: string }
> = {
  blue: {
    bg: 'bg-categorical-blue/10',
    border: 'border-categorical-blue/20',
    text: 'text-categorical-blue',
  },
  gray: {
    bg: 'bg-foreground/10',
    border: 'border-foreground/20',
    text: 'text-muted-foreground',
  },
  green: {
    bg: 'bg-categorical-emerald/10',
    border: 'border-categorical-emerald/20',
    text: 'text-categorical-emerald',
  },
  orange: {
    bg: 'bg-categorical-orange/10',
    border: 'border-categorical-orange/20',
    text: 'text-categorical-orange',
  },
  pink: {
    bg: 'bg-categorical-pink/10',
    border: 'border-categorical-pink/20',
    text: 'text-categorical-pink',
  },
  purple: {
    bg: 'bg-categorical-violet/10',
    border: 'border-categorical-violet/20',
    text: 'text-categorical-violet',
  },
  red: {
    bg: 'bg-categorical-red/10',
    border: 'border-categorical-red/20',
    text: 'text-categorical-red',
  },
  yellow: {
    bg: 'bg-categorical-amber/10',
    border: 'border-categorical-amber/20',
    text: 'text-categorical-amber',
  },
};

export const DEFAULT_GROUP_COLORS: GroupColor[] = [
  'purple',
  'blue',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'gray',
];
