import { cva } from 'class-variance-authority';

export const stepperVariants = cva('flex', {
  defaultVariants: { orientation: 'horizontal' },
  variants: {
    orientation: {
      horizontal: 'items-center justify-between',
      vertical: 'flex-col gap-1',
    },
  },
});

export const stepVariants = cva('flex items-center gap-2 text-left', {
  defaultVariants: { isCurrent: false, orientation: 'horizontal' },
  variants: {
    isCurrent: {
      false: '',
      true: '',
    },
    orientation: {
      horizontal: '',
      vertical: 'h-9 w-full rounded-md px-2.5',
    },
  },
  compoundVariants: [
    { class: 'bg-hover', isCurrent: true, orientation: 'vertical' },
  ],
});

export const stepIndicatorVariants = cva(
  'flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold transition-colors duration-300',
  {
    defaultVariants: { status: 'upcoming' },
    variants: {
      status: {
        complete: 'bg-primary text-primary-foreground',
        current: 'border border-border-strong bg-hover text-foreground',
        upcoming: 'border border-border bg-tertiary text-muted-foreground',
      },
    },
  },
);

export const stepLabelVariants = cva(
  'text-xs font-medium transition-colors duration-300',
  {
    defaultVariants: { orientation: 'horizontal', status: 'upcoming' },
    variants: {
      orientation: {
        horizontal: 'hidden sm:inline',
        vertical: '',
      },
      status: {
        complete: 'text-muted-foreground',
        current: 'text-foreground',
        upcoming: 'text-muted-foreground',
      },
    },
  },
);

export type StepStatus = NonNullable<
  Parameters<typeof stepIndicatorVariants>[0]
>['status'];
