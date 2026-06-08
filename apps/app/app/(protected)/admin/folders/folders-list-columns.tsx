'use client';

import type { IFolder } from '@genfeedai/interfaces';
import type { Folder } from '@models/content/folder.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { Switch } from '@ui/primitives/switch';

type OnToggleActive = (folder: IFolder) => void;

export function buildFoldersColumns(
  onToggleActive: OnToggleActive,
): TableColumn<Folder>[] {
  return [
    {
      header: 'Label',
      key: 'label',
      render: (folder: Folder) => folder.label || '-',
    },
    {
      header: 'Description',
      key: 'description',
      render: (folder: Folder) => folder.description || '-',
    },
    {
      header: 'Brand',
      key: 'brand',
      render: (folder: Folder) => folder.brand?.label || '-',
    },
    {
      header: 'Active',
      key: 'active',
      render: (folder: IFolder) => (
        <Switch
          isChecked={folder.isActive !== false}
          onChange={() => onToggleActive(folder)}
        />
      ),
    },
  ];
}
