import { cva } from 'class-variance-authority';

/**
 * Badge tone layer. Every variant sets explicit design-token classes so
 * status chips always paint color — semantic Tailwind classes that miss the
 * scan (text-danger, bg-danger/12) are not enough on their own.
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm px-1.5 h-5 text-2xs font-medium uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        /** Neutral / default chip — primary tint */
        default: 'bg-primary/15 text-primary',
        /** Failure / disconnected / error — red */
        destructive: 'bg-destructive/15 text-destructive',
        /** Informational / recorded / connected (neutral-positive) — blue */
        info: 'bg-info/15 text-info',
        /**
         * Soft outline that still reads as a chip — neutral ladder tokens so
         * it inverts with the theme instead of freezing a dark-only slate.
         */
        outline: 'bg-tertiary text-muted-foreground',
        /** Secondary / cancelled / idle — muted neutral */
        secondary: 'bg-tertiary text-muted-foreground',
        /** Healthy / completed / success — green */
        success: 'bg-success/15 text-success',
        /** Pending / warning / needs attention — amber */
        warning: 'bg-warning/15 text-warning',
      },
    },
  },
);
