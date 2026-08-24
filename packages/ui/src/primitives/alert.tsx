import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-md border p-4 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-11',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'bg-secondary border-border text-foreground',
        destructive: 'bg-destructive/10 border-destructive/30 text-destructive',
        info: 'border-info/30 bg-info/10 text-info [&>svg]:text-info',
        success:
          'border-success/30 bg-success/10 text-success [&>svg]:text-success',
        warning: 'bg-warning/10 border-warning/30 text-warning',
      },
    },
  },
);

function Alert({
  className,
  variant = 'default',
  ...props
}: ComponentPropsWithoutRef<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role="alert"
      className={cn(
        alertVariants({ variant: variant ?? 'default' }),
        className,
      )}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: ComponentPropsWithoutRef<'h5'>) {
  return (
    <h5
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('text-sm [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
