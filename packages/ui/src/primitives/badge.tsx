import { Badge as ShipBadge } from '@shipshitdev/ui/primitives';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/utils';

const badgeVariants = cva(
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

export { Badge, badgeVariants };
