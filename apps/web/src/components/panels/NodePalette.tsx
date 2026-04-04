'use client';

import { getNodesByCategory, type NodeCategory, type NodeType } from '@genfeedai/types';
import {
  ArrowLeftFromLine,
  ArrowRightToLine,
  AudioLines,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Columns2,
  Crop,
  Download,
  Eye,
  FileText,
  FileVideo,
  Film,
  GitBranch,
  Grid3X3,
  Image,
  LayoutGrid,
  Layers,
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
  Subtitles,
  Video,
  Volume2,
  Wand2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useUIStore } from '@genfeedai/workflow-ui/stores';

// Icon mapping
const ICONS: Record<string, typeof Image> = {
  ArrowLeftFromLine,
  // Composition
  ArrowRightToLine,
  AudioLines,
  Brain,
  // Output
  CheckCircle,
  Columns2,
  Crop,
  Download,
  Eye,
  FileText,
  FileVideo,
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

const CATEGORY_COLORS: Record<NodeCategory, { icon: string; hover: string; cssVar: string }> = {
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

interface NodeCardProps {
  type: NodeType;
  label: string;
  description: string;
  icon: string;
  category: NodeCategory;
}

function NodeCard({ type, label, description, icon, category }: NodeCardProps) {
  const Icon = ICONS[icon] ?? Sparkles;

  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData('nodeType', type);
      event.dataTransfer.effectAllowed = 'move';
    },
    [type]
  );

  const colors = CATEGORY_COLORS[category];

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg cursor-grab transition-colors group ${colors.hover}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded ${colors.icon}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-[var(--foreground)] truncate">{label}</div>
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-2">
            {description}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CategorySectionProps {
  category: NodeCategory;
  isExpanded: boolean;
  onToggle: () => void;
}

function CategorySection({ category, isExpanded, onToggle }: CategorySectionProps) {
  const nodes = getNodesByCategory()[category];

  return (
    <div className="border-b border-[var(--border)] last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--secondary)] transition cursor-pointer"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />
        )}
        <span className="font-medium text-sm text-[var(--foreground)]">
          {CATEGORY_LABELS[category]}
        </span>
        <span className="text-xs text-[var(--muted-foreground)] ml-auto">{nodes.length}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {nodes.map((node) => (
            <NodeCard
              key={node.type}
              type={node.type}
              label={node.label}
              description={node.description}
              icon={node.icon}
              category={node.category}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NodePalette() {
  const { togglePalette } = useUIStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<NodeCategory>>(
    new Set(['input'])
  );

  const nodesByCategory = useMemo(() => getNodesByCategory(), []);

  // Filter nodes across all categories when searching
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return null;

    const query = searchQuery.toLowerCase();
    const results: Array<{
      type: NodeType;
      label: string;
      description: string;
      icon: string;
      category: NodeCategory;
    }> = [];

    for (const category of Object.keys(nodesByCategory) as NodeCategory[]) {
      for (const node of nodesByCategory[category]) {
        if (
          node.label.toLowerCase().includes(query) ||
          node.description.toLowerCase().includes(query)
        ) {
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
      (['input', 'ai', 'processing', 'output', 'composition'] as NodeCategory[]).filter(
        (cat) => nodesByCategory[cat].length > 0
      ),
    [nodesByCategory]
  );

  return (
    <div className="w-64 min-w-64 h-full bg-[var(--background)] border-r border-[var(--border)] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-sm text-[var(--foreground)]">Nodes</h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">Drag to canvas</p>
        </div>
        <button
          onClick={togglePalette}
          className="p-1.5 hover:bg-[var(--secondary)] rounded-md transition-colors group"
          title="Close sidebar (M)"
        >
          <PanelLeftClose className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
        </button>
      </div>

      {/* Search bar */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-[var(--secondary)] border border-[var(--border)] rounded-md placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredNodes ? (
          // Search results
          <div className="px-4 py-3 space-y-2">
            {filteredNodes.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)] text-center py-4">
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
                  category={node.category}
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
              onToggle={() => toggleCategory(category)}
            />
          ))
        )}
      </div>
    </div>
  );
}
