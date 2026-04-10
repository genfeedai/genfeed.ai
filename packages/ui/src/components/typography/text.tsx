import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { cva, type VariantProps } from 'class-variance-authority';
import { type ElementType, forwardRef, type HTMLAttributes } from 'react';

const textVariants = cva('', {
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

export interface TextProps
  extends Omit<HTMLAttributes<HTMLElement>, 'color'>,
    VariantProps<typeof textVariants> {
  /** HTML element to render. Defaults to `span`. */
  as?: ElementType;
}

const Text = forwardRef<HTMLElement, TextProps>(
  (
    { as: Component = 'span', className, color, size, weight, ...props },
    ref,
  ) => (
    <Component
      className={cn(textVariants({ color, size, weight }), className)}
      ref={ref}
      {...props}
    />
  ),
);
Text.displayName = 'Text';

export { Text, textVariants };
