import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, CircleX, Info, X } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Button } from './button';

/**
 * The one alert. A grid of icon, content and optional dismiss; the tone comes
 * from `variant`. Title and description are slots inside the content column.
 */
const alertVariants = cva(
  'relative grid w-full items-center gap-3 rounded-lg border px-4 py-3 text-sm',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'bg-muted border-border text-foreground',
        destructive: 'bg-destructive/10 border-destructive/20 text-destructive',
        info: 'border-info/20 bg-info/10 text-info',
        success: 'border-success/20 bg-success/10 text-success',
        warning: 'bg-warning/10 border-warning/20 text-warning',
      },
    },
  },
);

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>;

function getDefaultIcon(variant: AlertVariant): ReactNode {
  switch (variant) {
    case 'destructive':
      return <CircleX />;
    case 'info':
      return <Info />;
    case 'success':
      return <CircleCheck />;
    case 'warning':
      return <CircleAlert />;
    default:
      return undefined;
  }
}

type AlertDismissProps =
  | { closeLabel?: never; onClose?: undefined }
  | {
      /** Accessible name of the dismiss button; callers translate it. */
      closeLabel: string;
      onClose: () => void;
    };

export type AlertProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'> &
  VariantProps<typeof alertVariants> &
  AlertDismissProps & {
    /**
     * Replaces the default severity icon. `false` renders no icon, for a
     * neutral note that should not carry one.
     */
    icon?: ReactNode;
  };

function Alert({
  children,
  className,
  closeLabel,
  icon,
  onClose,
  variant = 'default',
  role,
  'aria-live': ariaLive,
  ...props
}: AlertProps) {
  const resolvedVariant: AlertVariant = variant ?? 'default';
  const isAssertive =
    resolvedVariant === 'destructive' || resolvedVariant === 'warning';
  const resolvedRole = role ?? (isAssertive ? 'alert' : 'status');
  const resolvedAriaLive =
    ariaLive ?? (role === undefined && !isAssertive ? 'polite' : undefined);
  const resolvedIcon = icon ?? getDefaultIcon(resolvedVariant);
  const hasIcon = resolvedIcon !== undefined && resolvedIcon !== false;

  return (
    <div
      aria-live={resolvedAriaLive}
      role={resolvedRole}
      className={cn(
        alertVariants({ variant: resolvedVariant }),
        hasIcon
          ? 'grid-cols-[auto_minmax(0,1fr)_auto]'
          : 'grid-cols-[minmax(0,1fr)_auto]',
        className,
      )}
      {...props}
    >
      {hasIcon && (
        <span
          aria-hidden="true"
          className={cn('shrink-0', icon == null && '[&>svg]:size-5')}
          data-slot="alert-icon"
        >
          {resolvedIcon}
        </span>
      )}

      <div className="min-w-0">{children}</div>

      {onClose && (
        <Button
          ariaLabel={closeLabel}
          className="size-7 shrink-0 text-current hover:text-current"
          icon={<X className="size-4" />}
          onClick={onClose}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      )}
    </div>
  );
}

function AlertTitle({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
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
