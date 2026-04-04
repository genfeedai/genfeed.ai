import { Trash2 } from 'lucide-react';
import type { ContextMenuItemConfig } from '@/components/context-menu/ContextMenu';

interface EdgeMenuOptions {
  edgeId: string;
  onDelete: (edgeId: string) => void;
}

export function getEdgeMenuItems({ edgeId, onDelete }: EdgeMenuOptions): ContextMenuItemConfig[] {
  return [
    {
      danger: true,
      icon: <Trash2 className="w-4 h-4" />,
      id: 'delete',
      label: 'Delete Connection',
      onClick: () => onDelete(edgeId),
    },
  ];
}
