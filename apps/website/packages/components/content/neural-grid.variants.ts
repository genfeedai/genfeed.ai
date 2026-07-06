import { cva } from 'class-variance-authority';

export const neuralGridVariants = cva(
  'grid gap-px bg-fill/5 border border-edge/5 overflow-hidden',
  {
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
  },
);

export const neuralGridItemVariants = cva(
  'bg-background group hover:bg-fill/[0.02] transition-colors',
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
