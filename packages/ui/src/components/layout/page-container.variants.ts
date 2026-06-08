import { cva } from 'class-variance-authority';

export const pageContainerVariants = cva('container mx-auto', {
  defaultVariants: {
    padding: 'default',
  },
  variants: {
    padding: {
      default: 'px-6',
      lg: 'px-8',
      none: 'px-0',
      responsive: 'px-4 md:px-8',
      sm: 'px-4',
    },
  },
});
