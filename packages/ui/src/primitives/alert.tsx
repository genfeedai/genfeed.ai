import {
  Alert as ShipAlert,
  AlertDescription as ShipAlertDescription,
  AlertTitle as ShipAlertTitle,
} from '@shipshitdev/ui/primitives';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/utils';

const alertVariants = cva('ship-ui', {
  defaultVariants: {
    variant: 'default',
  },
  variants: {
    variant: {
      default: '',
      destructive: '',
      info: 'border-info/30 bg-info/10 text-info [&>svg]:text-info',
      success:
        'border-success/30 bg-success/10 text-success [&>svg]:text-success',
      warning: '',
    },
  },
});

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>;

const SHIP_VARIANT_MAP: Record<
  AlertVariant,
  'default' | 'destructive' | 'warning'
> = {
  default: 'default',
  destructive: 'destructive',
  info: 'default',
  success: 'default',
  warning: 'warning',
};

function Alert({
  className,
  variant = 'default',
  ...props
}: ComponentPropsWithoutRef<'div'> & VariantProps<typeof alertVariants>) {
  const resolvedVariant = variant ?? 'default';

  return (
    <ShipAlert
      className={cn(alertVariants({ variant: resolvedVariant }), className)}
      variant={SHIP_VARIANT_MAP[resolvedVariant]}
      {...props}
    />
  );
}

function AlertTitle(props: ComponentPropsWithoutRef<'h5'>) {
  return <ShipAlertTitle {...props} />;
}

function AlertDescription(props: ComponentPropsWithoutRef<'div'>) {
  return <ShipAlertDescription {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
