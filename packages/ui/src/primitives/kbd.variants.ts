import { cva } from 'class-variance-authority';

export const kbdVariants = cva(
  'inline-flex items-center justify-center font-mono',
  {
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
    variants: {
      variant: {
        default: 'bg-background border border-white/[0.08]',
        subtle: 'bg-white/[0.06] font-medium text-white/25',
        muted: 'bg-secondary',
        ghost: 'bg-transparent text-white/30',
      },
      size: {
        xs: 'px-1 py-0.5 text-[10px]',
        sm: 'px-1.5 py-0.5 text-xs',
      },
    },
  },
);
