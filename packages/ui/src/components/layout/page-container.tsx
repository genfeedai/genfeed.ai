import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

const pageContainerVariants = cva('container mx-auto', {
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

export interface PageContainerProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof pageContainerVariants> {}

const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(
  ({ className, padding, ...props }, ref) => (
    <div
      className={cn(pageContainerVariants({ padding }), className)}
      ref={ref}
      {...props}
    />
  ),
);
PageContainer.displayName = 'PageContainer';

export { PageContainer, pageContainerVariants };
