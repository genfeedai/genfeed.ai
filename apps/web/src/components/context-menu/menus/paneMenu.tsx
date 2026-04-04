import { getNodesByCategory, type NodeCategory } from '@genfeedai/types';
import {
  ArrowLeftFromLine,
  ArrowRightToLine,
  AudioLines,
  Brain,
  CheckCircle,
  Clipboard,
  Crop,
  FileText,
  FileVideo,
  Film,
  GitBranch,
  Grid3X3,
  Image,
  Layers,
  LayoutGrid,
  type LucideIcon,
  Maximize,
  Maximize2,
  MessageSquare,
  Mic,
  Monitor,
  Navigation,
  Pencil,
  Scissors,
  Sparkles,
  Subtitles,
  Video,
  Volume2,
  Wand2,
} from 'lucide-react';
import { type ContextMenuItemConfig, createSeparator } from '@/components/context-menu/ContextMenu';

// Icon mapping from node definition icon strings to Lucide components
const NODE_ICONS: Record<string, LucideIcon> = {
  ArrowLeftFromLine,
  ArrowRightToLine,
  AudioLines,
  Brain,
  CheckCircle,
  Crop,
  FileText,
  FileVideo,
  Film,
  GitBranch,
  Grid3X3,
  Image,
  Layers,
  Maximize,
  Maximize2,
  MessageSquare,
  Mic,
  Navigation,
  Pencil,
  Scissors,
  Sparkles,
  Subtitles,
  Video,
  Volume2,
  Wand2,
};

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  ai: 'AI Generation',
  composition: 'Composition',
  input: 'Input',
  output: 'Output',
  processing: 'Processing',
};

const CATEGORY_ICONS: Record<NodeCategory, LucideIcon> = {
  ai: Sparkles,
  composition: GitBranch,
  input: Image,
  output: Monitor,
  processing: Wand2,
};

interface PaneMenuOptions {
  screenX: number;
  screenY: number;
  hasClipboard: boolean;
  onAddNode: (type: string, screenX: number, screenY: number) => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onFitView: () => void;
  onAutoLayout: () => void;
}

export function getPaneMenuItems({
  screenX,
  screenY,
  hasClipboard,
  onAddNode,
  onPaste,
  onSelectAll,
  onFitView,
  onAutoLayout,
}: PaneMenuOptions): ContextMenuItemConfig[] {
  const nodesByCategory = getNodesByCategory();
  // Filter out categories with no nodes (e.g., deprecated 'output' category)
  const categories = (
    ['input', 'ai', 'processing', 'output', 'composition'] as NodeCategory[]
  ).filter((cat) => nodesByCategory[cat].length > 0);

  // Generate category submenus with all nodes
  const addNodeItems: ContextMenuItemConfig[] = categories.map((category) => {
    const CategoryIcon = CATEGORY_ICONS[category];
    const nodes = nodesByCategory[category];

    return {
      icon: <CategoryIcon className="w-4 h-4" />,
      id: `add-${category}`,
      label: CATEGORY_LABELS[category],
      submenu: nodes.map((node) => {
        const NodeIcon = NODE_ICONS[node.icon] ?? Sparkles;
        return {
          icon: <NodeIcon className="w-4 h-4" />,
          id: `add-${node.type}`,
          label: node.label,
          onClick: () => onAddNode(node.type, screenX, screenY),
        };
      }),
    };
  });

  return [
    ...addNodeItems,
    createSeparator('separator-1'),
    {
      disabled: !hasClipboard,
      icon: <Clipboard className="w-4 h-4" />,
      id: 'paste',
      label: 'Paste',
      onClick: onPaste,
      shortcut: '⌘V',
    },
    createSeparator('separator-2'),
    {
      id: 'select-all',
      label: 'Select All',
      onClick: onSelectAll,
      shortcut: '⌘A',
    },
    {
      icon: <Maximize className="w-4 h-4" />,
      id: 'fit-view',
      label: 'Fit View',
      onClick: onFitView,
      shortcut: 'F',
    },
    {
      icon: <LayoutGrid className="w-4 h-4" />,
      id: 'auto-layout',
      label: 'Auto-layout Nodes',
      onClick: onAutoLayout,
      shortcut: 'L',
    },
  ];
}
