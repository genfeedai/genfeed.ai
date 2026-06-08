import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { pageContainerVariants } from './page-container.variants';

export interface PageContainerProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof pageContainerVariants> {
  ref?: React.Ref<HTMLDivElement>;
}

function PageContainer({
  ref,
  className,
  padding,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(pageContainerVariants({ padding }), className)}
      ref={ref}
      {...props}
    />
  );
}
PageContainer.displayName = 'PageContainer';

export { PageContainer };
