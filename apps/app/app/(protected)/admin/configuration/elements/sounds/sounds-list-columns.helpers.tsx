'use client';

import type { ContentScope } from '@genfeedai/contracts/interfaces';
import type { Sound } from '@models/ingredients/sound.model';
import type { TableColumn } from '@props/ui/display/table.props';
import {
  SoundActiveCell,
  SoundCategoryCell,
  SoundDefaultCell,
} from './sounds-list-columns';

type BuildSoundsColumnsParams = {
  updatingIds: Set<string>;
  scope: ContentScope;
  onToggleActive: (sound: Sound) => void;
  onToggleDefault: (sound: Sound) => void;
};

export function buildSoundsColumns({
  updatingIds,
  scope,
  onToggleActive,
  onToggleDefault,
}: BuildSoundsColumnsParams): TableColumn<Sound>[] {
  return [
    {
      header: 'Label',
      key: 'label',
      subtext: (sound: Sound) => sound.description,
    },
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
  ];
}
