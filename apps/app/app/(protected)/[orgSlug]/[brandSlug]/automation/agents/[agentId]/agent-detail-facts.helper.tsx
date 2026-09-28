import type { RecordFact } from '@genfeedai/props/ui/record-detail/record-fact-line.props';
import type { AgentDetailFactLabels } from '@props/automation/agent-detail-fact-labels.props';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

/**
 * The agent's own known facts for the record detail fact line (#5483).
 * Consecutive failures deliberately stay out of this line — a non-zero count
 * already surfaces in the Needs You block, so repeating it here would say the
 * same thing twice. `typeLabel`/`autonomyLabel`/`labels` are resolved by the
 * caller through next-intl.
 */
export function buildAgentDetailFacts(
  strategy: AgentStrategy,
  typeLabel: string,
  autonomyLabel: string,
  labels: AgentDetailFactLabels,
): RecordFact[] {
  return [
    { id: 'type', label: labels.type, value: typeLabel },
    { id: 'brand', label: labels.brand, value: strategy.brand?.label },
    { id: 'autonomy', label: labels.autonomy, value: autonomyLabel },
    {
      id: 'creditsToday',
      label: labels.creditsToday,
      value: `${strategy.creditsUsedToday} / ${strategy.dailyCreditBudget}`,
    },
    {
      id: 'nextRun',
      label: labels.nextRun,
      value: strategy.nextRunAt ? (
        <ClientFormattedDate format="relative" value={strategy.nextRunAt} />
      ) : undefined,
    },
    {
      id: 'lastRun',
      label: labels.lastRun,
      value: strategy.lastRunAt ? (
        <ClientFormattedDate format="relative" value={strategy.lastRunAt} />
      ) : undefined,
    },
  ];
}
