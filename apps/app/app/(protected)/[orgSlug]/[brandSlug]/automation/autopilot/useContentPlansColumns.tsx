import type { IContentPlan } from '@genfeedai/contracts/interfaces';
import { parsePlanSeedSummary } from '@helpers/content/content-plan-seed.helper';
import type { TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

function formatPeriod(plan: IContentPlan): string {
  try {
    return `${format(new Date(plan.periodStart), 'MMM d')} – ${format(
      new Date(plan.periodEnd),
      'MMM d',
    )}`;
  } catch {
    return '—';
  }
}

export function useContentPlansColumns() {
  const translate = useTranslations('common.automation.contentPlans');

  const columns = useMemo<TableColumn<IContentPlan>[]>(
    () => [
      {
        header: translate('columnName'),
        key: 'name',
        render: (plan) => {
          const { kind, seedSummary } = parsePlanSeedSummary(plan.description);

          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{plan.name}</span>
                {kind === 'cold-start' ? (
                  <Badge variant="warning">{translate('badgeColdStart')}</Badge>
                ) : null}
                {kind === 'grounded' ? (
                  <Badge variant="success">{translate('badgeGrounded')}</Badge>
                ) : null}
              </div>
              {seedSummary ? (
                <span className="text-xs text-foreground/50">
                  {seedSummary}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        header: translate('columnPeriod'),
        key: 'periodStart',
        render: (plan) => <span className="text-sm">{formatPeriod(plan)}</span>,
      },
      {
        header: translate('columnItems'),
        key: 'itemCount',
        render: (plan) => (
          <span className="text-sm">
            {plan.executedCount} / {plan.itemCount}
          </span>
        ),
      },
      {
        header: translate('columnStatus'),
        key: 'status',
        render: (plan) => <Badge status={plan.status} />,
      },
    ],
    [translate],
  );

  return { columns };
}
