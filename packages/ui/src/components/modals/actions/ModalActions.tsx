import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModalActionsProps } from '@genfeedai/props/modals/modal.props';

/**
 * Shared modal footer. Default: actions flush right (Cancel … Primary).
 * Override alignment with className when needed (onboarding uses
 * justify-between). It carries no margin: the Form or modal body that stacks
 * it owns the space above it.
 */
export default function ModalActions({
  children,
  className = '',
}: ModalActionsProps) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-end gap-2', className)}
    >
      {children}
    </div>
  );
}
