import { PageScope } from '@genfeedai/contracts';
import { LazyModalPreset } from '@/components/lazy/modal/LazyModal';
import type { PresetsListModalsProps } from '@/features/admin/props/presets.props';

export default function PresetsListModals({
  scope,
  onConfirm,
}: PresetsListModalsProps) {
  if (scope !== PageScope.SUPERADMIN) {
    return null;
  }

  return <LazyModalPreset onConfirm={onConfirm} />;
}
