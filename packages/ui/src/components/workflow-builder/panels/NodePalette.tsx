'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { NodeDefinition } from '@genfeedai/contracts/interfaces/automation/workflow-builder.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { NodePaletteProps } from '@genfeedai/props/automation/workflow-builder.props';
import { Button } from '@ui/primitives/button';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Image,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useState } from 'react';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  ai: <Cpu className="size-4" />,
  control: <Clock className="size-4" />,
  effects: <Sparkles className="size-4" />,
  input: <Image className="size-4" />,
  output: <Upload className="size-4" />,
  processing: <Settings className="size-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  ai: 'text-amber-600',
  control: 'text-muted-foreground',
  effects: 'text-purple-600',
  input: 'text-green-600',
  output: 'text-red-600',
  processing: 'text-blue-600',
};

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI',
  control: 'Control',
  effects: 'Effects',
  input: 'Inputs',
  output: 'Outputs',
  processing: 'Processing',
};

const CATEGORY_ORDER = [
  'input',
  'processing',
  'effects',
  'ai',
  'output',
  'control',
];

interface CategorySectionProps {
  category: string;
  nodes: Array<[string, NodeDefinition]>;
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

function CategorySection({
  category,
  nodes,
  onDragStart,
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className="mb-2">
      <Button
        type="button"
        variant={ButtonVariant.UNSTYLED}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
          CATEGORY_COLORS[category],
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {CATEGORY_ICONS[category]}
        <span className="flex-1 text-left">{CATEGORY_LABELS[category]}</span>
        {isExpanded ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
      </Button>
      {isExpanded && (
        <div className="space-y-1 px-2 py-1">
          {nodes.map(([nodeType, definition]) => (
            <div
              key={nodeType}
              className="cursor-grab bg-card px-3 py-2 text-sm shadow-border transition-colors hover:border-primary hover:bg-accent active:cursor-grabbing"
              draggable
              onDragStart={(e) => onDragStart(e, nodeType)}
              title={definition.description}
            >
              <div className="font-medium">{definition.label}</div>
              <div className="text-xs opacity-60 truncate">
                {definition.description}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NodePalette({
  nodesByCategory,
  onDragStart,
  isCollapsed = false,
  onToggleCollapse,
}: NodePaletteProps) {
  if (isCollapsed) {
    return (
      <div className="flex h-full flex-col items-center py-4">
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          onClick={onToggleCollapse}
          ariaLabel="Expand palette"
          icon={<ChevronRight className="size-4" />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-semibold text-sm">Nodes</span>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.MICRO}
          onClick={onToggleCollapse}
          ariaLabel="Collapse palette"
          icon={<ChevronLeft className="size-4" />}
        />
      </div>

      {/* Node Categories */}
      <div className="flex-1 overflow-y-auto">
        {CATEGORY_ORDER.map((category) => {
          const nodes =
            nodesByCategory[category as keyof typeof nodesByCategory] || [];
          const nodesWithTypes: Array<[string, NodeDefinition]> = nodes.map(
            (n, _i) => [
              `${category}-${n.label.toLowerCase().replace(/\s+/g, '-')}`,
              n,
            ],
          );
          return (
            <CategorySection
              key={category}
              category={category}
              nodes={nodesWithTypes}
              onDragStart={onDragStart}
            />
          );
        })}
      </div>
    </div>
  );
}
