'use client';

import { PageScope } from '@genfeedai/contracts';
import type { PresetsListModalsProps } from '@props/admin/presets.props';
import { LazyModalPreset } from '@ui/lazy/modal/LazyModal';

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
