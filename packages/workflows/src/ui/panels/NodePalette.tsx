'use client';

import { getNodesByCategory, type NodeCategory } from '@genfeedai/types';
import {
  ArrowLeftFromLine,
  ArrowRightToLine,
  AudioLines,
  Brain,
  Captions,
  ChevronDown,
  ChevronRight,
  CircleCheckBig,
  Columns2,
  Crop,
  Download,
  Eye,
  FilePlay,
  FileText,
  Film,
  GitBranch,
  Grid3X3,
  Image,
  Layers,
  LayoutGrid,
  Maximize,
  Maximize2,
  MessageSquare,
  Mic,
  Navigation,
  PanelLeftClose,
  Pencil,
  Puzzle,
  Scissors,
  Search,
  Sparkles,
  Video,
  Volume2,
  WandSparkles,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { Button } from '../ui/button';

// Icon mapping
const ICONS: Record<string, typeof Image> = {
  ArrowLeftFromLine,
  // Composition
  ArrowRightToLine,
  AudioLines,
  Brain,
  // Output
  CircleCheckBig,
  Columns2,
  Crop,
  Download,
  Eye,
  FileText,
  FilePlay,
  Film,
  GitBranch,
  Grid3X3,
  // Input
  Image,
  Layers,
  LayoutGrid,
  Maximize,
  // Processing
  Maximize2,
  MessageSquare,
  Mic,
  Navigation,
  Pencil,
  Puzzle,
  Scissors,
  // AI
  Sparkles,
  Captions,
  Video,
  Volume2,
  WandSparkles,
};

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  ai: 'AI Generation',
  composition: 'Composition',
  input: 'Input',
  output: 'Output',
  processing: 'Processing',
};

function escapeSearchPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CATEGORY_COLORS: Record<
  NodeCategory,
  { icon: string; hover: string; cssVar: string }
> = {
  ai: {
    cssVar: 'var(--category-ai)',
    hover: 'hover:border-[var(--category-ai)]',
    icon: 'bg-[var(--category-ai)]/20 text-[var(--category-ai)]',
  },
  composition: {
    cssVar: 'var(--category-composition)',
    hover: 'hover:border-[var(--category-composition)]',
    icon: 'bg-[var(--category-composition)]/20 text-[var(--category-composition)]',
  },
  input: {
    cssVar: 'var(--category-input)',
    hover: 'hover:border-[var(--category-input)]',
    icon: 'bg-[var(--category-input)]/20 text-[var(--category-input)]',
  },
  output: {
    cssVar: 'var(--category-output)',
    hover: 'hover:border-[var(--category-output)]',
    icon: 'bg-[var(--category-output)]/20 text-[var(--category-output)]',
  },
  processing: {
    cssVar: 'var(--category-processing)',
    hover: 'hover:border-[var(--category-processing)]',
    icon: 'bg-[var(--category-processing)]/20 text-[var(--category-processing)]',
  },
};

/** Optional engine primitive or registered-action palette entry. */
export interface PaletteNodeDefinition {
  actionId?: string;
  category: string;
  description: string;
  icon: string;
  label: string;
  type: string;
}

export type PaletteCategory = NodeCategory;

interface NodeCardProps {
  actionId?: string;
  type: string;
  label: string;
  description: string;
  icon: string;
  category: NodeCategory;
}

function NodeCard({
  actionId,
  type,
  label,
  description,
  icon,
  category,
}: NodeCardProps) {
  const Icon = ICONS[icon] ?? Sparkles;

  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData('nodeType', type);
      if (actionId) {
        event.dataTransfer.setData('actionId', actionId);
        event.dataTransfer.setData('actionLabel', label);
      }
      event.dataTransfer.effectAllowed = 'move';
    },
    [actionId, label, type],
  );

  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.processing;

  return (
    <button
      type="button"
      draggable
      onDragStart={handleDragStart}
      className={`p-3 bg-card border border-transparent shadow-border cursor-grab transition-colors group ${colors.hover}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded ${colors.icon}`}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-foreground truncate">
            {label}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}

function mapToPaletteCategory(category: string): NodeCategory {
  if (
    category === 'input' ||
    category === 'ai' ||
    category === 'processing' ||
    category === 'output' ||
    category === 'composition'
  ) {
    return category;
  }
  if (category === 'automation' || category === 'saas') {
    return 'processing';
  }
  if (category === 'distribution' || category === 'repurposing') {
    return 'output';
  }
  return 'processing';
}

function mergeNodesByCategory(
  additionalNodes: readonly PaletteNodeDefinition[] = [],
  baseNodeTypes?: ReadonlySet<string>,
): Record<NodeCategory, PaletteNodeDefinition[]> {
  const base = getNodesByCategory();
  const merged: Record<NodeCategory, PaletteNodeDefinition[]> = {
    ai: base.ai.filter(
      (node) => !baseNodeTypes || baseNodeTypes.has(node.type),
    ),
    composition: base.composition.filter(
      (node) => !baseNodeTypes || baseNodeTypes.has(node.type),
    ),
    input: base.input.filter(
      (node) => !baseNodeTypes || baseNodeTypes.has(node.type),
    ),
    output: base.output.filter(
      (node) => !baseNodeTypes || baseNodeTypes.has(node.type),
    ),
    processing: base.processing.filter(
      (node) => !baseNodeTypes || baseNodeTypes.has(node.type),
    ),
  };

  for (const node of additionalNodes) {
    const category = mapToPaletteCategory(node.category);
    if (
      merged[category].some(
        (entry) =>
          (entry.actionId ?? entry.type) === (node.actionId ?? node.type),
      )
    ) {
      continue;
    }
    merged[category].push({
      actionId: node.actionId,
      category,
      description: node.description,
      icon: node.icon,
      label: node.label,
      type: node.type,
    });
  }

  return merged;
}

interface CategorySectionProps {
  category: NodeCategory;
  isExpanded: boolean;
  nodes: PaletteNodeDefinition[];
  onToggle: () => void;
}

function CategorySection({
  category,
  isExpanded,
  nodes,
  onToggle,
}: CategorySectionProps) {
  return (
    <div className="border-b border-border last:border-0">
      <Button
        variant="ghost"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-left h-auto justify-start"
      >
        {isExpanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
        <span className="font-medium text-sm text-foreground">
          {CATEGORY_LABELS[category]}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {nodes.length}
        </span>
      </Button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {nodes.map((node) => (
            <NodeCard
              key={node.actionId ?? node.type}
              actionId={node.actionId}
              type={node.type}
              label={node.label}
              description={node.description}
              icon={node.icon}
              category={category}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface NodePaletteProps {
  /** Extra palette entries merged into the visible categories. */
  additionalNodes?: readonly PaletteNodeDefinition[];
  /** Optional hard-cut filter for which core engine primitives are visible. */
  baseNodeTypes?: readonly string[];
}

export function NodePalette({
  additionalNodes = [],
  baseNodeTypes,
}: NodePaletteProps = {}) {
  const { togglePalette } = useUIStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<
    Set<NodeCategory>
  >(new Set(['input']));

  const nodesByCategory = useMemo(
    () =>
      mergeNodesByCategory(
        additionalNodes,
        baseNodeTypes ? new Set(baseNodeTypes) : undefined,
      ),
    [additionalNodes, baseNodeTypes],
  );

  // Filter nodes across all categories when searching
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return null;

    const query = new RegExp(escapeSearchPattern(searchQuery), 'i');
    const results: PaletteNodeDefinition[] = [];

    for (const category of Object.keys(nodesByCategory) as NodeCategory[]) {
      for (const node of nodesByCategory[category]) {
        if (query.test(node.label) || query.test(node.description)) {
          results.push(node);
        }
      }
    }

    return results;
  }, [searchQuery, nodesByCategory]);

  const toggleCategory = useCallback((category: NodeCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Filter out categories with no nodes (e.g., deprecated 'output' category)
  const categories = useMemo(
    () =>
      (
        ['input', 'ai', 'processing', 'output', 'composition'] as NodeCategory[]
      ).filter((cat) => nodesByCategory[cat].length > 0),
    [nodesByCategory],
  );

  return (
    <div className="w-64 min-w-64 h-full bg-background border-r border-border flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-sm text-foreground">Nodes</h2>
          <p className="text-xs text-muted-foreground mt-1">Drag to canvas</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={togglePalette}
          title="Close sidebar (M)"
        >
          <PanelLeftClose className="size-4 text-muted-foreground group-hover:text-foreground" />
        </Button>
      </div>

      {/* Search bar */}
      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search nodes..."
            aria-label="Search nodes"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredNodes ? (
          // Search results
          <div className="px-4 py-3 space-y-2">
            {filteredNodes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No nodes found
              </p>
            ) : (
              filteredNodes.map((node) => (
                <NodeCard
                  key={node.type}
                  type={node.type}
                  label={node.label}
                  description={node.description}
                  icon={node.icon}
                  category={mapToPaletteCategory(node.category)}
                />
              ))
            )}
          </div>
        ) : (
          // Category view
          categories.map((category) => (
            <CategorySection
              key={category}
              category={category}
              isExpanded={expandedCategories.has(category)}
              nodes={nodesByCategory[category]}
              onToggle={() => toggleCategory(category)}
            />
          ))
        )}
      </div>
    </div>
  );
}
