import { cva } from 'class-variance-authority';

/**
 * The one badge. Every variant sets explicit design-token classes so status
 * chips always paint color — semantic Tailwind classes that miss the scan
 * (text-destructive, bg-destructive/10) are not enough on their own.
 *
 * Variants are the semantic set. Product vocabulary (image, video, voice,
 * published, past_due, ...) maps onto them through `getBadgeStatus`, never
 * through a second variant list.
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 h-5 text-2xs font-medium uppercase tracking-wide shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: '',
        lg: 'h-6 px-2 text-xs',
      },
      variant: {
        /** Neutral / default chip — primary tint */
        default: 'bg-primary/10 text-primary',
        /** Failure / disconnected / error — red */
        destructive: 'bg-destructive/10 text-destructive',
        /** Informational / recorded / connected (neutral-positive) — blue */
        info: 'bg-info/10 text-info',
        /**
         * Soft outline that still reads as a chip — neutral ladder tokens so
         * it inverts with the theme instead of freezing a dark-only slate.
         */
        outline: 'bg-tertiary text-muted-foreground',
        /** Secondary / cancelled / idle — muted neutral */
        secondary: 'bg-tertiary text-muted-foreground',
        /** Healthy / completed / success — green */
        success: 'bg-success/10 text-success',
        /** Pending / warning / needs attention — amber */
        warning: 'bg-warning/10 text-warning',
      },
    },
  },
);

export type BadgeVariant = NonNullable<
  Parameters<typeof badgeVariants>[0]
>['variant'];
