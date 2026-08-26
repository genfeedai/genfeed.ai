'use client';

import { BYOK_CREDIT_VALUE_DOLLARS } from '@genfeedai/pricing';
import { NodeStatusEnum } from '@genfeedai/workflows/nodes';
import { calculateWorkflowCost } from '@genfeedai/workflows/ui/lib';
import {
  selectNodes,
  useExecutionStore,
  useWorkflowStore,
} from '@genfeedai/workflows/ui/stores';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import Badge from '@ui/display/badge/Badge';
import { CreditCard } from 'lucide-react';
import { useMemo } from 'react';

import {
  coerceWorkflowItems,
  getWorkflowNodeConfig,
  getWorkflowNodeLabel,
  type WorkflowGraphNodeLike,
} from '@/features/workflows/utils/workflow-graph';

export function CloudCreditsIndicator() {
  const nodes = useWorkflowStore(selectNodes);
  const actualCostUsd = useExecutionStore((state) => state.actualCost);
  const isRunning = useExecutionStore((state) => state.isRunning);
  const safeNodes = coerceWorkflowItems<WorkflowGraphNodeLike>(nodes);
  const costNodes = useMemo(
    () =>
      safeNodes.map((node) => ({
        data: {
          ...getWorkflowNodeConfig(node),
          label: getWorkflowNodeLabel(node),
          status: NodeStatusEnum.IDLE,
        },
        id: node.id,
        position: {
          x: typeof node.position?.x === 'number' ? node.position.x : 0,
          y: typeof node.position?.y === 'number' ? node.position.y : 0,
        },
        type: node.type ?? 'unknown',
      })),
    [safeNodes],
  );

  const breakdown = useMemo(
    () =>
      calculateWorkflowCost(
        costNodes as Parameters<typeof calculateWorkflowCost>[0],
      ),
    [costNodes],
  );
  const hasBreakdown = breakdown.items.length > 0;

  if (!hasBreakdown) {
    return null;
  }

  const displayCostUsd =
    isRunning && actualCostUsd > 0 ? actualCostUsd : breakdown.total;
  const displayCredits = Math.ceil(displayCostUsd / BYOK_CREDIT_VALUE_DOLLARS);

  return (
    <div
      title="Estimated workflow cost in credits"
      className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-sm text-muted-foreground"
    >
      <CreditCard className="size-3.5" />
      <span className="font-mono text-xs">
        {formatNumberWithCommas(displayCredits)} credits
      </span>
      {isRunning && actualCostUsd > 0 ? (
        <Badge status="running">Running</Badge>
      ) : null}
    </div>
  );
}
