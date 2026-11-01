import { cva } from 'class-variance-authority';

/**
 * Looks for the shared single/multi choice controls.
 *
 * - `segmented`: one joined bar, the selected segment lifts (the same look as
 *   the tab bar, which imports these classes so the two never drift).
 * - `chip`: separate rounded chips, the selected chip takes the primary tint.
 *
 * Callers pick `appearance` and `size`; they do not restyle with `className`.
 */
export const segmentedListVariants = cva('max-w-full', {
  defaultVariants: {
    appearance: 'segmented',
    isFullWidth: false,
    size: 'default',
  },
  variants: {
    isFullWidth: { false: '', true: 'w-full' },
    appearance: {
      chip: 'flex flex-wrap items-center gap-2',
      segmented:
        'flex w-fit items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/50 p-0.5 text-foreground/70',
    },
    size: {
      default: '',
      lg: '',
      sm: '',
      touch: '',
    },
  },
  compoundVariants: [
    { appearance: 'segmented', className: 'h-8', size: 'default' },
    { appearance: 'segmented', className: 'h-11', size: 'touch' },
    { appearance: 'segmented', className: 'h-control-sm', size: 'sm' },
    { appearance: 'segmented', className: 'h-9', size: 'lg' },
  ],
});

/** The selected-chip look, shared with the single `Toggle` chip variant. */
export const chipItemClassName =
  'rounded-full border border-border bg-transparent text-foreground/70 hover:bg-hover hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary';

export const segmentedItemVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    defaultVariants: {
      appearance: 'segmented',
      isFullWidth: false,
      size: 'default',
    },
    variants: {
      isFullWidth: { false: '', true: 'min-w-0 flex-1' },
      appearance: {
        chip: chipItemClassName,
        segmented:
          'h-full min-w-8 rounded-md border-0 bg-transparent text-foreground/70 shadow-none hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-background data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm data-[state=on]:bg-background data-[state=on]:text-accent-foreground data-[state=on]:shadow-sm',
      },
      size: {
        default: 'text-xs [&_svg]:size-4',
        lg: 'text-sm [&_svg]:size-4',
        sm: 'text-xs [&_svg]:size-3.5',
        touch: 'text-sm [&_svg]:size-4',
      },
    },
    compoundVariants: [
      { appearance: 'segmented', className: 'px-3', size: 'default' },
      { appearance: 'segmented', className: 'px-2.5', size: 'sm' },
      { appearance: 'segmented', className: 'px-4', size: 'lg' },
      { appearance: 'segmented', className: 'px-4', size: 'touch' },
      { appearance: 'chip', className: 'h-8 px-3', size: 'default' },
      { appearance: 'chip', className: 'h-control-sm px-2.5', size: 'sm' },
      { appearance: 'chip', className: 'h-9 px-4', size: 'lg' },
      { appearance: 'chip', className: 'h-11 px-4', size: 'touch' },
    ],
  },
);
