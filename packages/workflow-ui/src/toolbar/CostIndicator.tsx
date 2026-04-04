'use client';

import { DollarSign } from 'lucide-react';
import { useMemo } from 'react';
import { calculateWorkflowCost, formatCost } from '../lib/costCalculator';
import { useExecutionStore } from '../stores/executionStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflowStore';

export function CostIndicator() {
  const nodes = useWorkflowStore((state) => state.nodes);
  const isRunning = useExecutionStore((state) => state.isRunning);
  const actualCost = useExecutionStore((state) => state.actualCost);
  const { openModal } = useUIStore();

  const breakdown = useMemo(() => calculateWorkflowCost(nodes), [nodes]);

  const displayCost =
    isRunning && actualCost > 0 ? actualCost : breakdown.total;

  if (breakdown.items.length === 0) return null;

  return (
    <button
      onClick={() => openModal('cost')}
      title="View cost breakdown"
      className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-sm text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
    >
      <DollarSign className="h-3.5 w-3.5" />
      <span className="font-mono text-xs">{formatCost(displayCost)}</span>
      {isRunning && actualCost > 0 && (
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
    </button>
  );
}
