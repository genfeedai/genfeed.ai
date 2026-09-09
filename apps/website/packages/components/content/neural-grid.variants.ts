import { cva } from 'class-variance-authority';

export const neuralGridVariants = cva('grid gap-px bg-edge/5', {
  defaultVariants: {
    columns: 3,
    radius: 'lg',
  },
  variants: {
    columns: {
      1: 'grid-cols-1',
      2: 'grid-cols-1 md:grid-cols-2',
      3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
      5: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
    },
    radius: {
      lg: '',
      xl: '',
    },
  },
});

/**
 * A column, not a block. Grid children already stretch to the row's height, so
 * a card whose body is shorter than its neighbour's used to leave the gap
 * *under* its last element — which is why three pricing columns with different
 * feature counts put their CTAs at three different heights. Laying the item out
 * as a flex column lets `mb-auto` on the body push a trailing CTA to the floor
 * of the card, where the eye expects to find it in every column.
 */
export const neuralGridItemVariants = cva(
  'group flex flex-col bg-background transition-colors hover:bg-fill/[0.02]',
  {
    defaultVariants: {
      align: 'left',
      padding: 'md',
    },
    variants: {
      align: {
        center: 'text-center',
        left: 'text-left',
      },
      padding: {
        lg: 'p-12',
        md: 'p-10',
        sm: 'p-6',
      },
    },
  },
);
