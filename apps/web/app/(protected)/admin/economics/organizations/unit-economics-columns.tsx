'use client';

import { formatCreditCost } from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { TableColumn } from '@props/ui/display/table.props';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { UnitEconomicsTableRow } from '@/features/admin/props/unit-economics.props';
import { formatMarginPercent, formatUsd } from '../economics-report.util';

/** A report column has no free credits: zero spend is a dash, not "Free". */
export function formatCredits(credits: number): string {
  return credits === 0 ? '—' : formatCreditCost(credits);
}

function numberCell(value: string, row: UnitEconomicsTableRow) {
  return (
    <span className={cn('tabular-nums', row.isTotal && 'font-semibold')}>
      {value}
    </span>
  );
}

/**
 * The unit economics columns: revenue, credits, provider cost, margin and
 * models. `labelHeader` names the first column (organization or user).
 */
export function useUnitEconomicsColumns(
  labelHeader: string,
): TableColumn<UnitEconomicsTableRow>[] {
  const translate = useTranslations('pages.unitEconomics');

  return useMemo(
    () => [
      {
        header: labelHeader,
        key: 'label',
        render: (row) => (
          <span className={cn(row.isTotal && 'font-semibold')}>
            {row.label}
          </span>
        ),
        sortable: true,
      },
      {
        header: translate('columns.revenue'),
        key: 'revenueUsd',
        render: (row) => numberCell(formatUsd(row.revenueUsd), row),
        sortable: true,
      },
      {
        header: translate('columns.agentChatCredits'),
        key: 'agentChatCredits',
        render: (row) => numberCell(formatCredits(row.agentChatCredits), row),
        sortable: true,
      },
      {
        header: translate('columns.generationCredits'),
        key: 'generationCredits',
        render: (row) => numberCell(formatCredits(row.generationCredits), row),
        sortable: true,
        sortLabel: translate('columns.generationCreditsSort'),
      },
      {
        header: translate('columns.llmCost'),
        key: 'llmProviderCostUsd',
        render: (row) => numberCell(formatUsd(row.llmProviderCostUsd), row),
        sortable: true,
      },
      {
        header: translate('columns.generationCost'),
        key: 'mediaProviderCostUsd',
        render: (row) => numberCell(formatUsd(row.mediaProviderCostUsd), row),
        sortable: true,
      },
      {
        header: translate('columns.grossMargin'),
        key: 'grossMarginUsd',
        render: (row) => (
          <span
            className={cn(
              'tabular-nums',
              row.isTotal && 'font-semibold',
              row.grossMarginUsd < 0 && 'text-destructive',
            )}
          >
            {formatUsd(row.grossMarginUsd)}
          </span>
        ),
        sortable: true,
      },
      {
        header: translate('columns.marginPercent'),
        key: 'grossMarginPercent',
        render: (row) =>
          numberCell(formatMarginPercent(row.grossMarginPercent), row),
        sortable: true,
      },
      {
        header: translate('columns.agentTurns'),
        key: 'agentTurns',
        render: (row) =>
          numberCell(row.agentTurns.toLocaleString('en-US'), row),
        sortable: true,
      },
      {
        header: translate('columns.topModels'),
        key: 'topModels',
        render: (row) =>
          row.topModels.length === 0 ? (
            '—'
          ) : (
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {row.topModels.map((model) => (
                <span key={model.model} className="whitespace-nowrap">
                  {model.model}{' '}
                  <span className="tabular-nums">
                    {formatUsd(model.providerCostUsd)}
                  </span>
                </span>
              ))}
            </div>
          ),
      },
    ],
    [labelHeader, translate],
  );
}
