import { PageScope } from '@genfeedai/contracts';
import type { SoundsListModalsProps } from '@props/admin/sounds.props';
import { LazyModalSound } from '@ui/lazy/modal/LazyModal';

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
