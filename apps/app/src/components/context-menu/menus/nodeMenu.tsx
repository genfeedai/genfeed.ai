import { Copy, Image, Lock, LockOpen, Palette, Scissors, Trash2 } from 'lucide-react';
import { type ContextMenuItemConfig, createSeparator } from '@/components/context-menu/ContextMenu';
import { NODE_COLORS, NODE_COLOR_LABELS, NODE_COLOR_VALUES } from '@/lib/constants/colors';

interface NodeMenuOptions {
  nodeId: string;
  isLocked: boolean;
  hasMediaOutput: boolean;
  currentColor?: string;
  onDuplicate: (nodeId: string) => void;
  onLock: (nodeId: string) => void;
  onUnlock: (nodeId: string) => void;
  onCut: (nodeId: string) => void;
  onCopy: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onSetAsThumbnail?: (nodeId: string) => void;
  onSetColor?: (nodeId: string, color: string | null) => void;
}

export function getNodeMenuItems({
  nodeId,
  isLocked,
  hasMediaOutput,
  currentColor,
  onDuplicate,
  onLock,
  onUnlock,
  onCut,
  onCopy,
  onDelete,
  onSetAsThumbnail,
  onSetColor,
}: NodeMenuOptions): ContextMenuItemConfig[] {
  const items: ContextMenuItemConfig[] = [
    {
      icon: <Copy className="w-4 h-4" />,
      id: 'duplicate',
      label: 'Duplicate',
      onClick: () => onDuplicate(nodeId),
      shortcut: '⌘D',
    },
  ];

  // Add "Set as Thumbnail" option for nodes with media output
  if (hasMediaOutput && onSetAsThumbnail) {
    items.push({
      icon: <Image className="w-4 h-4" />,
      id: 'setThumbnail',
      label: 'Set as Thumbnail',
      onClick: () => onSetAsThumbnail(nodeId),
    });
  }

  // Add color picker submenu
  if (onSetColor) {
    const colorSubmenu: ContextMenuItemConfig[] = NODE_COLORS.map((color) => {
      const colorValue = NODE_COLOR_VALUES[color];
      const isSelected = colorValue === currentColor || (color === 'none' && !currentColor);
      return {
        icon: (
          <div
            className="w-4 h-4 rounded-sm border border-border"
            style={{ backgroundColor: colorValue || 'transparent' }}
          />
        ),
        id: `color-${color}`,
        label: `${isSelected ? '✓ ' : ''}${NODE_COLOR_LABELS[color]}`,
        onClick: () => onSetColor(nodeId, colorValue),
      };
    });

    items.push({
      icon: <Palette className="w-4 h-4" />,
      id: 'setColor',
      label: 'Set Color',
      submenu: colorSubmenu,
    });
  }

  items.push(createSeparator('separator-1'));

  items.push(
    isLocked
      ? {
          icon: <LockOpen className="w-4 h-4" />,
          id: 'unlock',
          label: 'Unlock Node',
          onClick: () => onUnlock(nodeId),
          shortcut: 'L',
        }
      : {
          icon: <Lock className="w-4 h-4" />,
          id: 'lock',
          label: 'Lock Node',
          onClick: () => onLock(nodeId),
          shortcut: 'L',
        }
  );

  items.push(createSeparator('separator-2'));

  items.push(
    {
      icon: <Scissors className="w-4 h-4" />,
      id: 'cut',
      label: 'Cut',
      onClick: () => onCut(nodeId),
      shortcut: '⌘X',
    },
    {
      icon: <Copy className="w-4 h-4" />,
      id: 'copy',
      label: 'Copy',
      onClick: () => onCopy(nodeId),
      shortcut: '⌘C',
    }
  );

  items.push(createSeparator('separator-3'));

  items.push({
    danger: true,
    icon: <Trash2 className="w-4 h-4" />,
    id: 'delete',
    label: 'Delete',
    onClick: () => onDelete(nodeId),
    shortcut: '⌫',
  });

  return items;
}
