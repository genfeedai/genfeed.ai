import { cva } from 'class-variance-authority';

export const dlVariants = cva('', {
  defaultVariants: { variant: 'default' },
  variants: {
    /** Column count for `variant="metrics"` and `variant="properties"`. */
    columns: {
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-2 md:grid-cols-4',
    },
    variant: {
      compact: 'space-y-2',
      default: 'space-y-3',
      grid: 'grid grid-cols-2 gap-y-2',
      /** Metric blocks side by side (`MetricCard appearance="plain" isDefinition`). */
      metrics: 'grid gap-3',
      /**
       * Term column beside a value column, one row per property. Pair with
       * `DefinitionRow` children.
       */
      properties: 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5',
      /** Rows separated by rules; pair with `DefinitionRow variant="split"`. */
      ruled: 'divide-y divide-foreground/10',
    },
  },
});

export const dtVariants = cva('', {
  defaultVariants: { variant: 'default' },
  variants: {
    variant: {
      default: 'text-sm text-muted-foreground',
      label: 'text-2xs uppercase tracking-wider text-muted-foreground',
      muted: 'text-xs text-muted-foreground',
    },
  },
});

export const ddVariants = cva('', {
  defaultVariants: { variant: 'default' },
  variants: {
    variant: {
      compact: 'text-xs text-foreground/80',
      default: 'text-sm text-foreground/80',
      inline: 'mt-0.5',
      value: 'text-right text-foreground/80',
    },
  },
});

/**
 * `contents` lets the term and detail join the list's own grid, so columns
 * line up across rows. `split` gives each row its own two-column grid.
 */
export const dRowVariants = cva('', {
  defaultVariants: { variant: 'contents' },
  variants: {
    variant: {
      contents: 'contents',
      split: 'grid gap-2 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]',
    },
  },
});
