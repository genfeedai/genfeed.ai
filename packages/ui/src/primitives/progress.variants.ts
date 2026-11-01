import { cva } from 'class-variance-authority';

/**
 * Progress track. `size` sets the bar height and `tone` tints the track; the
 * indicator colour comes from the same tone via `progressIndicatorVariants`,
 * so callers never restyle either part with a className.
 */
export const progressVariants = cva(
  'relative w-full overflow-hidden rounded-full',
  {
    defaultVariants: { size: 'md', tone: 'primary' },
    variants: {
      size: {
        lg: 'h-2.5',
        md: 'h-2',
        sm: 'h-1.5',
        xs: 'h-1',
      },
      tone: {
        /** Critical / over budget — red */
        destructive: 'bg-destructive/20',
        /** Informational — blue */
        info: 'bg-info/20',
        /** Quiet usage meter — follows the foreground ladder */
        neutral: 'bg-foreground/10',
        /** Bar over media or a dark caption: takes the parent's text colour */
        overlay: 'bg-current/20',
        /** Default brand fill */
        primary: 'bg-primary/20',
        /** Healthy / complete — green */
        success: 'bg-success/20',
        /** Approaching a limit — amber */
        warning: 'bg-warning/20',
      },
    },
  },
);

export const progressIndicatorVariants = cva(
  'h-full flex-1 transition-transform duration-300 ease-out',
  {
    defaultVariants: { tone: 'primary' },
    variants: {
      tone: {
        destructive: 'bg-destructive',
        info: 'bg-info',
        neutral: 'bg-foreground/60',
        overlay: 'bg-current',
        primary: 'bg-primary',
        success: 'bg-success',
        warning: 'bg-warning',
      },
    },
  },
);

export type ProgressTone = NonNullable<
  Parameters<typeof progressVariants>[0]
>['tone'];
