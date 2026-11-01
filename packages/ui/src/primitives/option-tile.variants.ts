import { cva } from 'class-variance-authority';

/**
 * A selectable bordered tile. The selected tile takes the primary border and
 * tint; callers pick `size`, `layout` and `columns` and never restyle it.
 */
export const optionTileGroupVariants = cva('', {
  defaultVariants: { columns: 'auto' },
  variants: {
    columns: {
      1: 'grid grid-cols-1 gap-2',
      2: 'grid grid-cols-2 gap-2',
      3: 'grid grid-cols-3 gap-2',
      4: 'grid grid-cols-2 gap-2 sm:grid-cols-4',
      auto: 'flex flex-wrap gap-2',
      scroll: 'flex gap-2 overflow-x-auto',
    },
  },
});

export const optionTileVariants = cva(
  'min-w-0 rounded-lg border border-border bg-transparent text-left transition-colors duration-200 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[state=on]:border-primary data-[state=on]:bg-primary/10',
  {
    defaultVariants: { layout: 'row', size: 'default' },
    variants: {
      layout: {
        row: 'flex w-full items-start gap-3',
        stack: 'flex w-full flex-col items-stretch gap-1.5',
      },
      size: {
        default: 'p-3',
        lg: 'p-4',
        none: 'gap-0 overflow-hidden p-0',
        sm: 'p-2',
      },
    },
  },
);
