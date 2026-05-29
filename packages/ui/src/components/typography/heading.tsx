import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { VariantProps } from 'class-variance-authority';
import type { ElementType, HTMLAttributes } from 'react';
import { headingVariants } from './heading.variants';

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
  ref?: React.Ref<HTMLHeadingElement>;
}

function Heading({ ref, as, className, size = 'lg', ...props }: HeadingProps) {
  const Component = as ?? headingElementMap[size ?? 'lg'] ?? 'h3';
  return (
    <Component
      className={cn(headingVariants({ size }), className)}
      ref={ref}
      {...props}
    />
  );
}
Heading.displayName = 'Heading';

export { Heading };
