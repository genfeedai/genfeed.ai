import { PageScope } from '@genfeedai/contracts';
import { LazyModalPreset } from '@/components/lazy/modal/LazyModal';
import type { PresetsListModalsProps } from '@/features/admin/props/presets.props';

export default function PresetsListModals({
  scope,
  selectedPreset,
  onClose,
  onConfirm,
}: PresetsListModalsProps) {
  if (scope !== PageScope.SUPERADMIN) {
    return null;
  }

  return (
    <LazyModalPreset
      item={selectedPreset}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
