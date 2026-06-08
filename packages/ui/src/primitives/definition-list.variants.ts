import { cva } from 'class-variance-authority';

export const dlVariants = cva('', {
  defaultVariants: { variant: 'default' },
  variants: {
    variant: {
      compact: 'space-y-2',
      default: 'space-y-3',
      grid: 'grid grid-cols-2 gap-y-2',
    },
  },
});

export const dtVariants = cva('', {
  defaultVariants: { variant: 'default' },
  variants: {
    variant: {
      default: 'text-sm text-foreground/45',
      label: 'text-[10px] uppercase tracking-wider text-white/30',
      muted: 'text-xs text-muted-foreground',
    },
  },
});

export const ddVariants = cva('', {
  defaultVariants: { variant: 'default' },
  variants: {
    variant: {
      default: 'text-sm text-foreground/80',
      inline: 'mt-0.5',
      value: 'text-right text-foreground/80',
    },
  },
});
