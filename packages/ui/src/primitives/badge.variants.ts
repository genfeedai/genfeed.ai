import { cva } from 'class-variance-authority';

/**
 * Local tone layer on top of @shipshitdev/ui Badge.
 *
 * Ship's `danger` variant uses `text-danger` / `bg-danger/12`, but those
 * utilities are not emitted in this monorepo's Tailwind scan — so FAILED
 * badges rendered white while COMPLETED (success) stayed green. Always set
 * explicit semantic token classes here so failure is visibly red.
 */
export const badgeVariants = cva(
  'ship-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'bg-primary/15 text-primary border-primary/30',
        /** Must stay red — do not leave empty or rely on ship `danger` alone. */
        destructive: 'bg-destructive/15 text-destructive border-destructive/40',
        info: 'bg-info/15 text-info border-info/30',
        outline:
          'border-white/[0.08] bg-transparent text-foreground shadow-none',
        secondary: 'bg-hover text-primary border-border',
        success: 'bg-success/15 text-success border-success/30',
        warning: 'bg-warning/15 text-warning border-warning/30',
      },
    },
  },
);
