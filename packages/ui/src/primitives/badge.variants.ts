import { cva } from 'class-variance-authority';

/**
 * The one badge. Every variant sets explicit design-token classes so status
 * chips always paint color — semantic Tailwind classes that miss the scan
 * (text-destructive, bg-destructive/10) are not enough on their own.
 *
 * Variants are the semantic set. Product vocabulary (image, video, voice,
 * published, past_due, ...) maps onto them through `getBadgeStatus`, never
 * through a second variant list. Shape, size, casing, solid fill, dot and
 * mono are separate axes, so a caller never restyles a badge with className.
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 h-5 text-2xs font-medium tabular-nums uppercase tracking-wide shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    compoundVariants: [
      {
        class: 'bg-primary text-primary-foreground',
        isSolid: true,
        variant: 'default',
      },
      {
        class: 'bg-destructive text-destructive-foreground',
        isSolid: true,
        variant: 'destructive',
      },
      {
        class: 'bg-info text-info-foreground',
        isSolid: true,
        variant: 'info',
      },
      {
        class: 'bg-success text-success-foreground',
        isSolid: true,
        variant: 'success',
      },
      {
        class: 'bg-warning text-warning-foreground',
        isSolid: true,
        variant: 'warning',
      },
      {
        class: 'bg-muted-foreground text-background',
        isSolid: true,
        variant: 'secondary',
      },
      { class: 'bg-current', isDot: true },
      {
        class: 'min-w-4 justify-center',
        shape: 'pill',
        size: 'sm',
      },
    ],
    defaultVariants: {
      casing: 'upper',
      isDot: false,
      isMono: false,
      isSolid: false,
      shape: 'default',
      size: 'default',
      variant: 'default',
    },
    variants: {
      /** `normal` keeps the author's casing: tags, hashtags, counts. */
      casing: {
        normal: 'normal-case tracking-normal',
        upper: '',
      },
      /** A status dot: no label, painted in the variant's text colour. */
      isDot: {
        false: '',
        true: 'size-1.5 min-w-0 gap-0 rounded-full p-0',
      },
      /** Identifiers, ids, keys and durations. */
      isMono: {
        false: '',
        true: 'font-mono normal-case tracking-normal tabular-nums',
      },
      /** A filled tone for a selected, ranked or scored badge. */
      isSolid: {
        false: '',
        true: '',
      },
      shape: {
        default: '',
        pill: 'rounded-full',
      },
      size: {
        default: '',
        lg: 'h-6 px-2 text-xs',
        sm: 'h-4 px-1 text-2xs',
        xl: 'h-7 px-3 text-sm',
      },
      variant: {
        /** Neutral / default chip — primary tint */
        default: 'bg-primary/10 text-primary',
        /** Failure / disconnected / error — red */
        destructive: 'bg-destructive/10 text-destructive',
        /** Informational / recorded / connected (neutral-positive) — blue */
        info: 'bg-info/10 text-info',
        /** A user-picked tag colour. Pass `colors`; the badge paints them. */
        custom: '',
        /** Count or key on a neutral surface — reads against any background. */
        inverse: 'bg-foreground text-background',
        /** Over media (thumbnails, previews): legible on any image. */
        overlay: 'bg-black/60 text-white backdrop-blur-sm',
        /** Bordered, transparent chip for metadata that should stay quiet. */
        outline: 'border border-border bg-transparent text-muted-foreground',
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
