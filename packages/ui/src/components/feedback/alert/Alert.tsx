import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AlertProps } from '@genfeedai/props/ui/ui.props';
import { Alert as PrimitiveAlert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { cva } from 'class-variance-authority';
import { CircleAlert, CircleCheck, CircleX, Info, X } from 'lucide-react';

/**
 * CVA alert variants with semantic color options
 */
const alertVariants = cva(
  'relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-4 py-3',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'bg-background text-foreground border-white/[0.08]',
        error: 'bg-destructive/10 text-destructive border-destructive/20',
        info: 'bg-info/10 text-info border-info/20',
        success: 'bg-success/10 text-success border-success/20',
        warning: 'bg-warning/10 text-warning border-warning/20',
      },
    },
  },
);

const DEFAULT_ICONS = {
  error: <CircleX />,
  info: <Info />,
  success: <CircleCheck />,
  warning: <CircleAlert />,
};

const TYPE_TO_VARIANT: Record<
  AlertCategory,
  'error' | 'success' | 'warning' | 'info'
> = {
  [AlertCategory.ERROR]: 'error',
  [AlertCategory.INFO]: 'info',
  [AlertCategory.SUCCESS]: 'success',
  [AlertCategory.WARNING]: 'warning',
};

export default function Alert({
  type = AlertCategory.INFO,
  className = '',
  children,
  icon,
  onClose,
}: AlertProps) {
  const variant = TYPE_TO_VARIANT[type] ?? 'info';
  const resolvedIcon = icon ?? DEFAULT_ICONS[variant];

  return (
    <PrimitiveAlert
      className={cn(alertVariants({ variant }), className)}
      variant={variant === 'error' ? 'destructive' : variant}
    >
      <span
        aria-hidden="true"
        className={cn('shrink-0', icon == null && '[&>svg]:size-5')}
        data-slot="alert-icon"
      >
        {resolvedIcon}
      </span>

      <div className="min-w-0">{children}</div>

      {onClose && (
        <Button
          ariaLabel="Dismiss alert"
          className="size-7 shrink-0 text-current hover:text-current"
          icon={<X className="size-4" />}
          onClick={onClose}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      )}
    </PrimitiveAlert>
  );
}
