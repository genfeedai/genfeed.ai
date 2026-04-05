'use client';

import { Brain, ChevronDown, ChevronRight, Film, Image, Mic } from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';
import type { NodeCostEstimate } from '@genfeedai/types';
import { calculateWorkflowCostWithBreakdown, PRICING } from '@/lib/replicate/client';
import { useExecutionStore } from '@/store/executionStore';
import { useWorkflowStore } from '@/store/workflowStore';

// =============================================================================
// TYPES
// =============================================================================

interface NodeTypeGroup {
  type: string;
  label: string;
  icon: React.ReactNode;
  items: NodeCostEstimate[];
  subtotal: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return '<$0.01';
  }
  return `$${cost.toFixed(2)}`;
}

function getNodeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    imageGen: 'Image Generation',
    lipSync: 'Lip Sync',
    llm: 'LLM / Text',
    videoGen: 'Video Generation',
  };
  return labels[type] ?? type;
}

function getNodeTypeIcon(type: string): React.ReactNode {
  const iconClass = 'h-4 w-4';
  switch (type) {
    case 'imageGen':
      return <Image className={iconClass} />;
    case 'videoGen':
      return <Film className={iconClass} />;
    case 'lipSync':
      return <Mic className={iconClass} />;
    case 'llm':
      return <Brain className={iconClass} />;
    default:
      return null;
  }
}

// =============================================================================
// NODE TYPE GROUP
// =============================================================================

interface NodeTypeGroupSectionProps {
  group: NodeTypeGroup;
}

const NodeTypeGroupSection = memo(function NodeTypeGroupSection({
  group,
}: NodeTypeGroupSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-3 text-left transition hover:bg-secondary/30"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            {group.icon}
          </div>
          <div>
            <div className="font-medium text-foreground">{group.label}</div>
            <div className="text-xs text-muted-foreground">
              {group.items.length} {group.items.length === 1 ? 'node' : 'nodes'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground">{formatCost(group.subtotal)}</span>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border">
          {group.items.map((item, index) => (
            <div
              key={item.nodeId || index}
              className="flex items-center justify-between border-b border-border/50 px-4 py-2 last:border-b-0"
            >
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{item.nodeLabel}</span>
                <span className="text-xs text-muted-foreground">
                  {item.model} - {item.details}
                </span>
              </div>
              <span className="text-sm font-medium text-foreground">
                {formatCost(item.subtotal)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// PRICING REFERENCE
// =============================================================================

function PricingReference() {
  return (
    <div className="mt-6 rounded-lg border border-border bg-secondary/30 p-4">
      <h4 className="font-medium text-foreground">Pricing Reference</h4>
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
        <div>
          <div className="font-medium text-foreground">Image Generation</div>
          <div>Nano Banana: ${PRICING['nano-banana']}/image</div>
          <div>Nano Banana Pro: $0.15-0.30/image</div>
        </div>
        <div>
          <div className="font-medium text-foreground">Video Generation</div>
          <div>Veo 3.1 Fast: $0.10-0.15/sec</div>
          <div>Veo 3.1: $0.20-0.40/sec</div>
        </div>
        <div>
          <div className="font-medium text-foreground">Lip Sync</div>
          <div>Lipsync 2: $0.05/sec</div>
          <div>Lipsync 2 Pro: $0.08/sec</div>
        </div>
        <div>
          <div className="font-medium text-foreground">LLM</div>
          <div>Llama 3.1 405B: ${PRICING.llama}/1K tokens</div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// HELPERS FOR STABLE NODE COMPARISON
// =============================================================================

// Extract only cost-relevant data from nodes to prevent recalculation on position changes
function extractCostRelevantData(
  nodes: Array<{ id?: string; type: string; data: Record<string, unknown> }>
): string {
  // Create a stable string representation of only cost-affecting properties
  return JSON.stringify(
    nodes.map((node) => ({
      duration: node.data.duration,
      generateAudio: node.data.generateAudio,
      id: node.id,
      // Only include data properties that affect cost calculation
      model: node.data.model,
      resolution: node.data.resolution,
      type: node.type,
    }))
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function CostBreakdownTabComponent() {
  // Subscribe only to nodes array - we'll handle granular updates manually
  const nodes = useWorkflowStore((state) => state.nodes);
  const actualCost = useExecutionStore((state) => state.actualCost);

  // Track previous cost-relevant data to avoid unnecessary recalculations
  const prevCostDataRef = useRef<string>('');
  const cachedResultRef = useRef<{ total: number; items: NodeCostEstimate[] }>({
    items: [],
    total: 0,
  });

  const { total, items } = useMemo(() => {
    // Extract only cost-relevant properties (excludes position, status, etc.)
    const costData = extractCostRelevantData(nodes);

    // Only recalculate if cost-relevant data changed
    if (costData !== prevCostDataRef.current) {
      prevCostDataRef.current = costData;
      cachedResultRef.current = calculateWorkflowCostWithBreakdown(nodes);
    }

    return cachedResultRef.current;
  }, [nodes]);

  // Group items by node type
  const groups = useMemo((): NodeTypeGroup[] => {
    const groupMap = new Map<string, NodeCostEstimate[]>();

    for (const item of items) {
      const existing = groupMap.get(item.nodeType) ?? [];
      existing.push(item);
      groupMap.set(item.nodeType, existing);
    }

    return Array.from(groupMap.entries()).map(([type, groupItems]) => ({
      icon: getNodeTypeIcon(type),
      items: groupItems,
      label: getNodeTypeLabel(type),
      subtotal: groupItems.reduce((sum, item) => sum + item.subtotal, 0),
      type,
    }));
  }, [items]);

  const hasVariance = actualCost > 0 && Math.abs(actualCost - total) > 0.01;
  const variancePercent = actualCost > 0 ? ((actualCost - total) / total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="rounded-lg border border-border bg-secondary/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Estimated Cost</div>
            <div className="text-2xl font-semibold text-foreground">{formatCost(total)}</div>
          </div>
          {actualCost > 0 && (
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Actual Cost</div>
              <div className="text-2xl font-semibold text-foreground">{formatCost(actualCost)}</div>
              {hasVariance && (
                <div
                  className={`text-xs ${variancePercent > 10 ? 'text-red-400' : variancePercent < -10 ? 'text-green-400' : 'text-muted-foreground'}`}
                >
                  {variancePercent > 0 ? '+' : ''}
                  {variancePercent.toFixed(1)}% variance
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Empty State */}
      {items.length === 0 && (
        <div className="rounded-lg border border-border p-8 text-center">
          <div className="text-muted-foreground">No billable nodes in workflow</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Add image generation, video generation, lip sync, or LLM nodes to see cost estimates.
          </p>
        </div>
      )}

      {/* Breakdown by Type */}
      {groups.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Cost Breakdown</h3>
          {groups.map((group) => (
            <NodeTypeGroupSection key={group.type} group={group} />
          ))}
        </div>
      )}

      {/* Pricing Reference */}
      <PricingReference />
    </div>
  );
}

export const CostBreakdownTab = memo(CostBreakdownTabComponent);
