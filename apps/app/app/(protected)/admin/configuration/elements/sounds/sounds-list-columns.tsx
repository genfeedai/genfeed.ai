'use client';

import { ComponentSize, PageScope } from '@genfeedai/enums';
import type { ContentScope, ISound } from '@genfeedai/interfaces';
import type { Sound } from '@models/ingredients/sound.model';
import Badge from '@ui/display/badge/Badge';
import { Checkbox } from '@ui/primitives/checkbox';

type SoundCellProps = {
  sound: Sound;
};

type SoundCheckboxCellProps = {
  sound: Sound;
  updatingIds: Set<string>;
  scope: ContentScope;
  onChange: (sound: Sound) => void;
};

export function SoundCategoryCell({ sound }: SoundCellProps) {
  return (
    <Badge variant="outline" size={ComponentSize.SM} className="uppercase">
      {(sound as ISound).category ?? 'Undefined'}
    </Badge>
  );
}

export function SoundDescriptionCell({ sound }: SoundCellProps) {
  return <>{sound.description || '-'}</>;
}

export function SoundActiveCell({
  sound,
  updatingIds,
  scope,
  onChange,
}: SoundCheckboxCellProps) {
  return (
    <Checkbox
      name={`isActive-${sound.id}`}
      isChecked={sound.isActive}
      isDisabled={updatingIds.has(sound.id) || scope !== PageScope.SUPERADMIN}
      onChange={() => onChange(sound)}
    />
  );
}

export function SoundDefaultCell({
  sound,
  updatingIds,
  scope,
  onChange,
}: SoundCheckboxCellProps) {
  return (
    <Checkbox
      name={`isDefault-${sound.id}`}
      isChecked={sound.isDefault}
      isDisabled={
        !sound.isActive ||
        updatingIds.has(sound.id) ||
        scope !== PageScope.SUPERADMIN
      }
      onChange={() => onChange(sound)}
    />
  );
}
