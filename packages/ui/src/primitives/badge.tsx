import { cn } from '@genfeedai/helpers';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { badgeVariants } from './badge.variants';

export interface BadgeProps
  extends ComponentPropsWithoutRef<'span'>,
    VariantProps<typeof badgeVariants> {
  icon?: ReactNode;
}

function Badge({ children, className, icon, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {icon && (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 [&_svg]:size-3"
          data-slot="badge-icon"
        >
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

export { Badge };
