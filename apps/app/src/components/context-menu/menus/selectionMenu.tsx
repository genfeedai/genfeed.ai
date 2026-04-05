import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Copy,
  Group,
  Lock,
  LockOpen,
  Trash2,
} from 'lucide-react';
import { type ContextMenuItemConfig, createSeparator } from '@/components/context-menu/ContextMenu';

interface SelectionMenuOptions {
  nodeIds: string[];
  onGroup: (nodeIds: string[]) => void;
  onDuplicateAll: (nodeIds: string[]) => void;
  onLockAll: (nodeIds: string[]) => void;
  onUnlockAll: (nodeIds: string[]) => void;
  onAlignHorizontal: (nodeIds: string[]) => void;
  onAlignVertical: (nodeIds: string[]) => void;
  onDeleteAll: (nodeIds: string[]) => void;
}

export function getSelectionMenuItems({
  nodeIds,
  onGroup,
  onDuplicateAll,
  onLockAll,
  onUnlockAll,
  onAlignHorizontal,
  onAlignVertical,
  onDeleteAll,
}: SelectionMenuOptions): ContextMenuItemConfig[] {
  const count = nodeIds.length;

  return [
    {
      icon: <Group className="w-4 h-4" />,
      id: 'group',
      label: 'Create Group',
      onClick: () => onGroup(nodeIds),
      shortcut: '⌘G',
    },
    {
      icon: <Copy className="w-4 h-4" />,
      id: 'duplicate-all',
      label: `Duplicate ${count} Nodes`,
      onClick: () => onDuplicateAll(nodeIds),
      shortcut: '⌘D',
    },
    createSeparator('separator-1'),
    {
      icon: <Lock className="w-4 h-4" />,
      id: 'lock-all',
      label: 'Lock All',
      onClick: () => onLockAll(nodeIds),
      shortcut: 'L',
    },
    {
      icon: <LockOpen className="w-4 h-4" />,
      id: 'unlock-all',
      label: 'Unlock All',
      onClick: () => onUnlockAll(nodeIds),
    },
    createSeparator('separator-2'),
    {
      icon: <AlignHorizontalJustifyCenter className="w-4 h-4" />,
      id: 'align-horizontal',
      label: 'Align Horizontally',
      onClick: () => onAlignHorizontal(nodeIds),
    },
    {
      icon: <AlignVerticalJustifyCenter className="w-4 h-4" />,
      id: 'align-vertical',
      label: 'Align Vertically',
      onClick: () => onAlignVertical(nodeIds),
    },
    createSeparator('separator-3'),
    {
      danger: true,
      icon: <Trash2 className="w-4 h-4" />,
      id: 'delete-all',
      label: `Delete ${count} Nodes`,
      onClick: () => onDeleteAll(nodeIds),
      shortcut: '⌫',
    },
  ];
}
