'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { statusIcon } from '@genfeedai/ui';
import { Badge } from '@genfeedai/ui/primitives/badge';
import { Button } from '@genfeedai/ui/primitives/button';
import { DollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { calculateWorkflowCost, formatCost } from '../lib/costCalculator';
import { useExecutionStore } from '../stores/execution';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflow';

export function CostIndicator() {
  const translate = useTranslations('pages.workflows.status');
  const nodes = useWorkflowStore((state) => state.nodes);
  const isRunning = useExecutionStore((state) => state.isRunning);
  const actualCost = useExecutionStore((state) => state.actualCost);
  const { openModal } = useUIStore();

  const breakdown = useMemo(() => calculateWorkflowCost(nodes), [nodes]);

  const displayCost =
    isRunning && actualCost > 0 ? actualCost : breakdown.total;
  const RunningIcon = statusIcon.running;

  if (breakdown.items.length === 0) return null;

  return (
    <Button
      withWrapper={false}
      variant={ButtonVariant.SECONDARY}
      size={ButtonSize.SM}
      onClick={() => openModal('cost')}
      title={translate('viewCostBreakdown')}
      className="text-muted-foreground hover:text-foreground"
    >
      <DollarSign className="size-3.5" />
      <span className="font-mono text-xs">{formatCost(displayCost)}</span>
      {isRunning && actualCost > 0 && (
        <Badge icon={<RunningIcon />} variant="info">
          {translate('running')}
        </Badge>
      )}
    </Button>
  );
}
