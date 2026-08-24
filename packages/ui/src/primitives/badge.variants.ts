import { cva } from 'class-variance-authority';

/**
 * Badge tone layer. Every variant sets explicit design-token classes so
 * status chips always paint color — semantic Tailwind classes that miss the
 * scan (text-danger, bg-danger/12) are not enough on their own.
 */
export const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-1.5 h-5 text-[10px] font-medium uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        /** Neutral / default chip — primary tint */
        default: 'bg-primary/15 text-primary border-primary/30',
        /** Failure / disconnected / error — red */
        destructive: 'bg-destructive/15 text-destructive border-destructive/40',
        /** Informational / recorded / connected (neutral-positive) — blue */
        info: 'bg-info/15 text-info border-info/30',
        /**
         * Soft outline that still reads as a chip (slate), not bare white
         * text on a dark border.
         */
        outline: 'bg-slate-500/15 text-slate-300 border-slate-500/35',
        /** Secondary / cancelled / idle — muted slate */
        secondary: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
        /** Healthy / completed / success — green */
        success: 'bg-success/15 text-success border-success/30',
        /** Pending / warning / needs attention — amber */
        warning: 'bg-warning/15 text-warning border-warning/30',
      },
    },
  },
);
