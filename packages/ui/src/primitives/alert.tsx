import { cn } from '@genfeedai/helpers';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-md border p-4 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'bg-muted border-border text-foreground',
        destructive: 'bg-destructive/10 border-destructive/20 text-destructive',
        info: 'border-info/20 bg-info/10 text-info [&>svg]:text-info',
        success:
          'border-success/20 bg-success/10 text-success [&>svg]:text-success',
        warning: 'bg-warning/10 border-warning/20 text-warning',
      },
    },
  },
);

function Alert({
  className,
  variant = 'default',
  role,
  'aria-live': ariaLive,
  ...props
}: ComponentPropsWithoutRef<'div'> & VariantProps<typeof alertVariants>) {
  const resolvedVariant = variant ?? 'default';
  const isAssertive =
    resolvedVariant === 'destructive' || resolvedVariant === 'warning';
  const resolvedRole = role ?? (isAssertive ? 'alert' : 'status');
  const resolvedAriaLive =
    ariaLive ?? (role === undefined && !isAssertive ? 'polite' : undefined);

  return (
    <div
      aria-live={resolvedAriaLive}
      role={resolvedRole}
      className={cn(alertVariants({ variant: resolvedVariant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'col-start-2 mb-1 font-medium leading-none tracking-tight',
        className,
      )}
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
      className={cn('col-start-2 text-sm [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
