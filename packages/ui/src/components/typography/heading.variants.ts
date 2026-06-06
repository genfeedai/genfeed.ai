import { cva } from 'class-variance-authority';

export const headingVariants = cva('font-semibold text-foreground', {
  defaultVariants: {
    size: 'lg',
  },
  variants: {
    size: {
      '2xl': 'text-2xl font-bold',
      '3xl': 'text-3xl font-bold',
      lg: 'text-lg',
      md: 'text-base',
      sm: 'text-sm',
      xl: 'text-xl',
    },
  },
});
