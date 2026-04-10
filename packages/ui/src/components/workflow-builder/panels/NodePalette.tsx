'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { NodeDefinition } from '@genfeedai/interfaces/automation/workflow-builder.interface';
import type { NodePaletteProps } from '@genfeedai/props/automation/workflow-builder.props';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';
import {
  HiOutlineArrowUpTray,
  HiOutlineChevronDown,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineCpuChip,
  HiOutlinePhoto,
  HiOutlineSparkles,
} from 'react-icons/hi2';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  ai: <HiOutlineCpuChip className="h-4 w-4" />,
  control: <HiOutlineClock className="h-4 w-4" />,
  effects: <HiOutlineSparkles className="h-4 w-4" />,
  input: <HiOutlinePhoto className="h-4 w-4" />,
  output: <HiOutlineArrowUpTray className="h-4 w-4" />,
  processing: <HiOutlineCog6Tooth className="h-4 w-4" />,
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
          <HiOutlineChevronDown className="h-4 w-4" />
        ) : (
          <HiOutlineChevronRight className="h-4 w-4" />
        )}
      </Button>
      {isExpanded && (
        <div className="space-y-1 px-2 py-1">
          {nodes.map(([nodeType, definition]) => (
            <div
              key={nodeType}
              className="cursor-grab border border-white/[0.08] bg-card px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-background active:cursor-grabbing"
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
          icon={<HiOutlineChevronRight className="h-4 w-4" />}
        />
      </div>
    );
  }

  const categories = [
    'input',
    'processing',
    'effects',
    'ai',
    'output',
    'control',
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2">
        <span className="font-semibold text-sm">Nodes</span>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          onClick={onToggleCollapse}
          ariaLabel="Collapse palette"
          icon={<HiOutlineChevronLeft className="h-4 w-4" />}
        />
      </div>

      {/* Node Categories */}
      <div className="flex-1 overflow-y-auto">
        {categories.map((category) => {
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
