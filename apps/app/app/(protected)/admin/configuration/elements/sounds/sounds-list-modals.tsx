import { PageScope } from '@genfeedai/contracts';
import { LazyModalSound } from '@ui/lazy/modal/LazyModal';
import type { SoundsListModalsProps } from '@/features/admin/props/sounds.props';

export default function SoundsListModals({
  scope,
  selectedSound,
  onConfirm,
}: SoundsListModalsProps) {
  if (scope !== PageScope.SUPERADMIN) {
    return null;
  }

  return <LazyModalSound sound={selectedSound} onConfirm={onConfirm} />;
}
