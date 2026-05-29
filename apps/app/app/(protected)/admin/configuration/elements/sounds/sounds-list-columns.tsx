'use client';

import { ComponentSize, PageScope } from '@genfeedai/enums';
import type { ContentScope, ISound } from '@genfeedai/interfaces';
import type { Sound } from '@models/ingredients/sound.model';
import type { TableColumn } from '@props/ui/display/table.props';
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

type BuildSoundsColumnsParams = {
  updatingIds: Set<string>;
  scope: ContentScope;
  onToggleActive: (sound: Sound) => void;
  onToggleDefault: (sound: Sound) => void;
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

export function buildSoundsColumns({
  updatingIds,
  scope,
  onToggleActive,
  onToggleDefault,
}: BuildSoundsColumnsParams): TableColumn<Sound>[] {
  return [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Category',
      key: 'category',
      render: (sound: Sound) => <SoundCategoryCell sound={sound} />,
    },
    {
      header: 'Active',
      key: 'isActive',
      render: (sound: Sound) => (
        <SoundActiveCell
          sound={sound}
          updatingIds={updatingIds}
          scope={scope}
          onChange={onToggleActive}
        />
      ),
    },
    {
      header: 'Default',
      key: 'isDefault',
      render: (sound: Sound) => (
        <SoundDefaultCell
          sound={sound}
          updatingIds={updatingIds}
          scope={scope}
          onChange={onToggleDefault}
        />
      ),
    },
    {
      header: 'Description',
      key: 'description',
      render: (sound: Sound) => <SoundDescriptionCell sound={sound} />,
    },
  ];
}
