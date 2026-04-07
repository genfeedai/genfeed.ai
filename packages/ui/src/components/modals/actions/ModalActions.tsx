import type { ModalActionsProps } from '@props/modals/modal.props';

export default function ModalActions({
  children,
  className = '',
}: ModalActionsProps) {
  return <div className={`flex gap-2 mt-10 ${className}`}>{children}</div>;
}
