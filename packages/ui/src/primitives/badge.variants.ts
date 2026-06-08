import { cva } from 'class-variance-authority';

export const badgeVariants = cva(
  'ship-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: '',
        destructive: '',
        info: '',
        outline:
          'border-white/[0.08] bg-transparent text-foreground shadow-none',
        secondary: 'bg-hover text-primary border-border',
        success: '',
        warning: '',
      },
    },
  },
);
