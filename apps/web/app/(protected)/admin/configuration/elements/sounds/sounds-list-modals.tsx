import { PageScope } from '@genfeedai/contracts';
import { LazyModalSound } from '@/components/lazy/modal/LazyModal';
import type { SoundsListModalsProps } from '@/features/admin/props/sounds.props';

export default function SoundsListModals({
  scope,
  onConfirm,
}: SoundsListModalsProps) {
  if (scope !== PageScope.SUPERADMIN) {
    return null;
  }

  return <LazyModalSound onConfirm={onConfirm} />;
}
