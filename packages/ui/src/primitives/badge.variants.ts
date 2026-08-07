import { cva } from 'class-variance-authority';

/**
 * Local tone layer on top of @shipshitdev/ui Badge.
 *
 * Ship's semantic classes (`text-danger`, `bg-danger/12`, etc.) often don't
 * emit in this monorepo's Tailwind scan. Every variant must set explicit
 * design-token classes so status chips always paint color on the UI.
 */
export const badgeVariants = cva(
  'ship-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
