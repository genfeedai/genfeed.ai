'use client';

import type { KPICardProps } from '@props/ui/kpi/kpi-card.props';
import {
  formatCount,
  formatMarginPercent,
  formatUsd,
} from '@protected/economics/economics-report.util';
import EconomicsReportError from '@protected/economics/economics-report-error';
import { useUnitEconomicsColumns } from '@protected/economics/organizations/unit-economics-columns';
import {
  getUnitEconomicsRowId,
  useUnitEconomicsRowSidebar,
} from '@protected/economics/organizations/unit-economics-row-sidebar';
import AppTable from '@ui/display/table/Table';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type {
  OrganizationSpendingPanelProps,
  UnitEconomicsTableRow,
} from '@/features/admin/props/unit-economics.props';

/**
 * One organization's revenue, provider cost and margin for the period, then the
 * same figures per user. Backs the organization page's Spending tab.
 */
export default function OrganizationSpendingPanel({
  error,
  isLoading,
  onSortChange,
  report,
  sortDirection,
  sortKey,
}: OrganizationSpendingPanelProps) {
  const translate = useTranslations('pages.unitEconomics');

  const rows = useMemo<UnitEconomicsTableRow[]>(
    () => (report?.rows ?? []).map((row) => ({ ...row, isTotal: false })),
    [report],
  );
  const columns = useUnitEconomicsColumns(translate('columns.user'));
  const rowSidebar = useUnitEconomicsRowSidebar({ kind: 'user' });

  const items = useMemo<KPICardProps[]>(() => {
    const totals = report?.totals;
    const providerCost =
      (totals?.llmProviderCostUsd ?? 0) + (totals?.mediaProviderCostUsd ?? 0);

    return [
      {
        description: translate('spending.kpis.revenueDescription', {
          turns: formatCount(totals?.agentTurns ?? 0),
        }),
        label: translate('spending.kpis.revenue'),
        value: formatUsd(totals?.revenueUsd ?? 0),
      },
      {
        description: translate('spending.kpis.providerCostDescription', {
          llm: formatUsd(totals?.llmProviderCostUsd ?? 0),
          media: formatUsd(totals?.mediaProviderCostUsd ?? 0),
        }),
        label: translate('spending.kpis.providerCost'),
        value: formatUsd(providerCost),
      },
      {
        description: translate('spending.kpis.grossMarginDescription', {
          percent: formatMarginPercent(totals?.grossMarginPercent ?? null),
        }),
        label: translate('spending.kpis.grossMargin'),
        tone: (totals?.grossMarginUsd ?? 0) < 0 ? 'destructive' : undefined,
        value: formatUsd(totals?.grossMarginUsd ?? 0),
      },
      {
        description: translate('spending.kpis.creditsDescription', {
          chat: formatCount(Math.round(totals?.agentChatCredits ?? 0)),
          generation: formatCount(Math.round(totals?.generationCredits ?? 0)),
        }),
        label: translate('spending.kpis.credits'),
        value: formatCount(
          Math.round(
            (totals?.agentChatCredits ?? 0) + (totals?.generationCredits ?? 0),
          ),
        ),
      },
    ];
  }, [report, translate]);

  if (error) {
    return <EconomicsReportError error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <KPISection
        className="mb-0"
        gridCols={{ desktop: 4, mobile: 1 }}
        isLoading={isLoading}
        items={items}
        size="md"
      />
      <div>
        <AppTable<UnitEconomicsTableRow>
          ariaLabel={translate('spending.tableLabel')}
          columns={columns}
          emptyLabel={translate('empty')}
          getRowKey={getUnitEconomicsRowId}
          isLoading={isLoading}
          items={rows}
          onSortChange={onSortChange}
          rowSidebar={rowSidebar}
          sortDirection={sortDirection}
          sortKey={sortKey}
        />
        <div className="mt-4">
          <AutoPagination
            showTotal
            totalLabel={translate('spending.totalLabel')}
          />
        </div>
      </div>
    </div>
  );
}
