import { cn } from '@helpers/formatting/cn/cn.util';
import { cva, type VariantProps } from 'class-variance-authority';
import { type ElementType, forwardRef, type HTMLAttributes } from 'react';

const headingVariants = cva('font-semibold text-foreground', {
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

const headingElementMap: Record<string, ElementType> = {
  '2xl': 'h2',
  '3xl': 'h1',
  lg: 'h3',
  md: 'h4',
  sm: 'h5',
  xl: 'h3',
};

export interface HeadingProps
  extends HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  as?: ElementType;
}

const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ as, className, size = 'lg', ...props }, ref) => {
    const Component = as ?? headingElementMap[size ?? 'lg'] ?? 'h3';
    return (
      <Component
        className={cn(headingVariants({ size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Heading.displayName = 'Heading';

export { Heading, headingVariants };
