import { cva } from 'class-variance-authority';

export const textVariants = cva('', {
  defaultVariants: {
    color: 'default',
    size: 'base',
    weight: 'normal',
  },
  variants: {
    color: {
      default: 'text-foreground',
      destructive: 'text-destructive',
      muted: 'text-muted-foreground',
      primary: 'text-primary',
      'subtle-50': 'text-foreground/50',
      'subtle-60': 'text-foreground/60',
      'subtle-70': 'text-foreground/70',
    },
    size: {
      '2xs': 'text-[10px]',
      base: 'text-base',
      lg: 'text-lg',
      sm: 'text-sm',
      xl: 'text-xl',
      xs: 'text-xs',
    },
    weight: {
      black: 'font-black',
      bold: 'font-bold',
      medium: 'font-medium',
      normal: 'font-normal',
      semibold: 'font-semibold',
    },
  },
});
