'use client';

import { PageScope } from '@genfeedai/enums';
import type { ContentScope } from '@genfeedai/interfaces';
import type { Preset } from '@models/elements/preset.model';
import { LazyModalPreset } from '@ui/lazy/modal/LazyModal';

type PresetsListModalsProps = {
  scope: ContentScope;
  selectedPreset: Preset | null | undefined;
  onClose: () => void;
  onConfirm: () => void;
};

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
