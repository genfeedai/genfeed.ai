import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModalActionsProps } from '@genfeedai/props/modals/modal.props';

/**
 * Shared modal footer. Default: actions flush right (Cancel … Primary).
 * Override with className when needed (e.g. onboarding uses justify-between).
 */
export default function ModalActions({
  children,
  className = '',
}: ModalActionsProps) {
  return (
    <div className={cn('mt-6 flex items-center justify-end gap-2', className)}>
      {children}
    </div>
  );
}
