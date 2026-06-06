'use client';

import { PageScope } from '@genfeedai/enums';
import type { ContentScope } from '@genfeedai/interfaces';
import type { Sound } from '@models/ingredients/sound.model';
import { LazyModalSound } from '@ui/lazy/modal/LazyModal';

type SoundsListModalsProps = {
  scope: ContentScope;
  selectedSound: Sound | null;
  onConfirm: () => void;
};

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
