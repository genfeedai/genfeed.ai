import { Badge as ShipBadge } from '@shipshitdev/ui/primitives';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/utils';
import { badgeVariants } from './badge.variants';

export interface BadgeProps
  extends ComponentPropsWithoutRef<'span'>,
    VariantProps<typeof badgeVariants> {}

const SHIP_VARIANT_MAP = {
  default: 'default',
  destructive: 'danger',
  info: 'info',
  outline: 'accent',
  secondary: 'default',
  success: 'success',
  warning: 'warning',
} as const;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <ShipBadge
      className={cn(badgeVariants({ variant }), className)}
      variant={SHIP_VARIANT_MAP[variant ?? 'default']}
      {...props}
    />
  );
}

export { Badge };
