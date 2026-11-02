'use client';

import type { ContextSidebarSelectionKind } from '@genfeedai/props/ui/context-sidebar.props';
import type { TableRowSidebar } from '@props/ui/display/table.props';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { UnitEconomicsTableRow } from '@/features/admin/props/unit-economics.props';
import { formatMarginPercent, formatUsd } from '../economics-report.util';
import { formatCredits } from './unit-economics-columns';

const UNATTRIBUTED_ROW_ID = 'unattributed';

/** The sidebar identity of a row; the unattributed bucket has an empty id. */
export function getUnitEconomicsRowId(row: UnitEconomicsTableRow): string {
  return row.id || UNATTRIBUTED_ROW_ID;
}

/**
 * What a unit economics row shows in the right context sidebar: every figure
 * the row carries, then a link to the record's page when it has one.
 */
export function useUnitEconomicsRowSidebar({
  getOpenHref,
  kind,
}: {
  getOpenHref?: (row: UnitEconomicsTableRow) => string | undefined;
  kind: ContextSidebarSelectionKind;
}): TableRowSidebar<UnitEconomicsTableRow> {
  const translate = useTranslations('pages.unitEconomics');

  return useMemo(
    () =>
      createSummaryRowSidebar<UnitEconomicsTableRow>({
        getFacts: (row) => [
          {
            id: 'revenue',
            label: translate('columns.revenue'),
            value: formatUsd(row.revenueUsd),
          },
          {
            id: 'llmCost',
            label: translate('columns.llmCost'),
            value: formatUsd(row.llmProviderCostUsd),
          },
          {
            id: 'generationCost',
            label: translate('columns.generationCost'),
            value: formatUsd(row.mediaProviderCostUsd),
          },
          {
            id: 'grossMargin',
            label: translate('columns.grossMargin'),
            value: formatUsd(row.grossMarginUsd),
          },
          {
            id: 'marginPercent',
            label: translate('columns.marginPercent'),
            value: formatMarginPercent(row.grossMarginPercent),
          },
          {
            id: 'agentChatCredits',
            label: translate('columns.agentChatCredits'),
            value: formatCredits(row.agentChatCredits),
          },
          {
            id: 'generationCredits',
            label: translate('columns.generationCredits'),
            value: formatCredits(row.generationCredits),
          },
          {
            id: 'agentTurns',
            label: translate('columns.agentTurns'),
            value: row.agentTurns.toLocaleString('en-US'),
          },
          {
            id: 'topModels',
            label: translate('columns.topModels'),
            value:
              row.topModels.length === 0 ? undefined : (
                <ul className="space-y-1">
                  {row.topModels.map((model) => (
                    <li key={model.model}>
                      {model.model}{' '}
                      <span className="tabular-nums">
                        {formatUsd(model.providerCostUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              ),
          },
        ],
        getId: getUnitEconomicsRowId,
        getOpenHref,
        getTitle: (row) => row.label,
        kind,
        openLabel: translate('openSpending'),
      }),
    [getOpenHref, kind, translate],
  );
}
