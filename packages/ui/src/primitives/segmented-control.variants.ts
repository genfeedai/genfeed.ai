import { cva } from 'class-variance-authority';

/**
 * Looks for the shared single/multi choice controls: one joined bar, the
 * selected segment lifts (the same look as the tab bar, which imports these
 * classes so the two never drift). There is no chip look: a one-value choice
 * is a `Select`, a set of filters is the `FilterMenu`.
 *
 * Callers pick `size`; they do not restyle with `className`.
 */
export const segmentedListVariants = cva(
  'flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/50 p-0.5 text-foreground/70',
  {
    defaultVariants: {
      isFullWidth: false,
      size: 'default',
    },
    variants: {
      isFullWidth: { false: '', true: 'w-full' },
      size: {
        default: 'h-8',
        lg: 'h-9',
        sm: 'h-control-sm',
        touch: 'h-11',
      },
    },
  },
);

export const segmentedItemVariants = cva(
  'inline-flex h-full min-w-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-transparent font-medium text-foreground/70 shadow-none transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring forced-colors:focus-visible:-outline-offset-2 disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm data-[state=on]:bg-background data-[state=on]:text-accent-foreground data-[state=on]:shadow-sm data-checked:bg-background data-checked:text-accent-foreground data-checked:shadow-sm data-pressed:bg-background data-pressed:text-accent-foreground data-pressed:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    defaultVariants: {
      isFullWidth: false,
      size: 'default',
    },
    variants: {
      isFullWidth: { false: '', true: 'min-w-0 flex-1' },
      size: {
        default: 'px-3 text-xs [&_svg]:size-4',
        lg: 'px-4 text-sm [&_svg]:size-4',
        sm: 'px-2.5 text-xs [&_svg]:size-3.5',
        touch: 'px-4 text-sm [&_svg]:size-4',
      },
    },
  },
);
