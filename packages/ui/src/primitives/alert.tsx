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
  'group/alert relative grid w-full items-start border',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'gap-3 rounded-lg px-4 py-3 text-sm',
        sm: 'gap-2 rounded-md px-2.5 py-1.5 text-xs',
      },
      variant: {
        default: 'bg-muted border-border text-foreground',
        destructive: 'bg-destructive/10 border-destructive/20 text-destructive',
        info: 'border-info/20 bg-info/10 text-info',
        /** A quiet aside: static muted copy on a faint wash, no icon, announced as a note. */
        note: 'border-transparent bg-muted/50 text-muted-foreground',
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

function getIconSizeClass(size: 'default' | 'sm'): string {
  return size === 'sm' ? '[&>svg]:size-3.5' : '[&>svg]:size-4';
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
  size = 'default',
  variant = 'default',
  role,
  'aria-live': ariaLive,
  ...props
}: AlertProps) {
  const resolvedVariant: AlertVariant = variant ?? 'default';
  const isAssertive =
    resolvedVariant === 'destructive' || resolvedVariant === 'warning';
  const isNote = resolvedVariant === 'note';
  const resolvedRole =
    role ?? (isAssertive ? 'alert' : isNote ? 'note' : 'status');
  const resolvedAriaLive =
    ariaLive ??
    (role === undefined && !isAssertive && !isNote ? 'polite' : undefined);
  const resolvedIcon = icon ?? getDefaultIcon(resolvedVariant);
  const hasIcon = resolvedIcon !== undefined && resolvedIcon !== false;

  return (
    <div
      aria-live={resolvedAriaLive}
      data-size={size}
      role={resolvedRole}
      className={cn(
        alertVariants({ size, variant: resolvedVariant }),
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
          className={cn(
            // Sits on the first line of text, never centred on the whole box.
            'shrink-0',
            size === 'sm' ? 'mt-px' : 'mt-0.5',
            icon == null && getIconSizeClass(size ?? 'default'),
          )}
          data-slot="alert-icon"
        >
          {resolvedIcon}
        </span>
      )}

      <div className="min-w-0">{children}</div>

      {onClose && (
        <Button
          ariaLabel={closeLabel}
          className={cn(
            'shrink-0 text-current hover:text-current',
            size === 'sm' ? 'size-5' : '-mt-1 -mr-1 size-7',
          )}
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
      className={cn(
        'mb-0.5 font-semibold leading-5 tracking-tight',
        'group-data-[size=default]/alert:text-base',
        className,
      )}
      data-slot="alert-title"
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
      className={cn(
        'text-foreground/80 group-data-[size=default]/alert:text-sm [&_p]:leading-relaxed',
        className,
      )}
      data-slot="alert-description"
      {...props}
    />
  );
}

/** Buttons and links that act on the notice, under its text. */
function AlertActions({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('mt-2 flex flex-wrap items-center gap-2', className)}
      data-slot="alert-actions"
      {...props}
    />
  );
}

export { Alert, AlertActions, AlertDescription, AlertTitle };
