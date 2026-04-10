import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AlertProps } from '@genfeedai/props/ui/ui.props';
import { Button } from '@ui/primitives/button';
import { cva } from 'class-variance-authority';
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiInformationCircle,
  HiOutlineXCircle,
  HiXCircle,
} from 'react-icons/hi2';

/**
 * CVA alert variants with semantic color options
 */
const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm flex items-center gap-3 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'bg-background text-foreground border-white/[0.08]',
        error:
          'bg-destructive/10 text-destructive border-destructive/20 [&>svg]:text-destructive',
        info: 'bg-info/10 text-info border-info/20 [&>svg]:text-info',
        success:
          'bg-success/10 text-success border-success/20 [&>svg]:text-success',
        warning:
          'bg-warning/10 text-warning border-warning/20 [&>svg]:text-warning',
      },
    },
  },
);

const DEFAULT_ICONS = {
  error: <HiXCircle />,
  info: <HiInformationCircle />,
  success: <HiCheckCircle />,
  warning: <HiExclamationCircle />,
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

  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)}>
      {icon ?? DEFAULT_ICONS[variant]}

      <div className="flex-1">{children}</div>

      {onClose && (
        <Button
          label={<HiOutlineXCircle />}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          onClick={onClose}
        />
      )}
    </div>
  );
}
