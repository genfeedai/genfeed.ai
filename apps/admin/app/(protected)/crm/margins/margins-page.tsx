'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import KpiCard from '@components/cards/KpiCard';
import type { IMarginSummary, IMonthlyMargin } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminCrmService } from '@services/admin/crm.service';
import { logger } from '@services/core/logger.service';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useMemo, useState } from 'react';
import {
  HiOutlineBanknotes,
  HiOutlineCalculator,
  HiOutlineChartBar,
  HiOutlineCurrencyDollar,
  HiOutlineReceiptPercent,
} from 'react-icons/hi2';

const YEARS = [2025, 2026];

function formatCents(value: number): string {
  return (value / 100).toLocaleString('en-US', {
    currency: 'USD',
    style: 'currency',
  });
}

function marginColorClass(percentage: number): string {
  if (percentage >= 70) {
    return 'text-emerald-400';
  }
  if (percentage >= 0) {
    return 'text-amber-400';
  }
  return 'text-rose-400';
}

export default function MarginsPage() {
  const [year, setYear] = useState(2026);

  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const {
    data: summary,
    isRefreshing: isSummaryRefreshing,
    refresh: refreshSummary,
  } = useResource<IMarginSummary>(
    async () => {
      const service = await getCrmService();
      return service.getMargins();
    },
    {
      onError: (error: Error) => {
        logger.error('GET /admin/crm/margins failed', error);
      },
    },
  );

  const {
    data: monthly,
    isLoading: isMonthlyLoading,
    isRefreshing: isMonthlyRefreshing,
    refresh: refreshMonthly,
  } = useResource<IMonthlyMargin[]>(
    async () => {
      const service = await getCrmService();
      return service.getMonthlyMargins(year);
    },
    {
      defaultValue: [],
      dependencies: [year],
      onError: (error: Error) => {
        logger.error('GET /admin/crm/margins/monthly failed', error);
      },
    },
  );

  const refreshAll = async () => {
    await Promise.all([refreshSummary(), refreshMonthly()]);
  };

  // Computed totals and averages
  const { totalRow, averageRow } = useMemo(() => {
    if (monthly.length === 0) {
      return { averageRow: null, totalRow: null };
    }

    const totals = monthly.reduce(
      (acc, m) => ({
        margin: acc.margin + m.margin,
        modelsCost: acc.modelsCost + m.modelsCost,
        otherCost: acc.otherCost + m.otherCost,
        replicateCost: acc.replicateCost + m.replicateCost,
        revenue: acc.revenue + m.revenue,
        totalCosts: acc.totalCosts + m.totalCosts,
      }),
      {
        margin: 0,
        modelsCost: 0,
        otherCost: 0,
        replicateCost: 0,
        revenue: 0,
        totalCosts: 0,
      },
    );

    const totalMarginPct =
      totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0;
    const count = monthly.length;

    return {
      averageRow: {
        margin: Math.round(totals.margin / count),
        marginPercentage: totalMarginPct,
        modelsCost: Math.round(totals.modelsCost / count),
        month: 'Average',
        otherCost: Math.round(totals.otherCost / count),
        replicateCost: Math.round(totals.replicateCost / count),
        revenue: Math.round(totals.revenue / count),
        totalCosts: Math.round(totals.totalCosts / count),
      } satisfies IMonthlyMargin,
      totalRow: {
        margin: totals.margin,
        marginPercentage: totalMarginPct,
        modelsCost: totals.modelsCost,
        month: 'Total',
        otherCost: totals.otherCost,
        replicateCost: totals.replicateCost,
        revenue: totals.revenue,
        totalCosts: totals.totalCosts,
      } satisfies IMonthlyMargin,
    };
  }, [monthly]);

  const tableData = useMemo(() => {
    const rows = [...monthly];
    if (totalRow) {
      rows.push(totalRow);
    }
    if (averageRow) {
      rows.push(averageRow);
    }
    return rows;
  }, [monthly, totalRow, averageRow]);

  const columns: TableColumn<IMonthlyMargin>[] = useMemo(
    () => [
      {
        header: 'Month',
        key: 'month',
        render: (m: IMonthlyMargin) => (
          <span
            className={
              m.month === 'Total' || m.month === 'Average' ? 'font-bold' : ''
            }
          >
            {m.month}
          </span>
        ),
      },
      {
        header: 'Revenue',
        key: 'revenue',
        render: (m: IMonthlyMargin) => (
          <span className="text-emerald-400">{formatCents(m.revenue)}</span>
        ),
      },
      {
        header: 'Replicate Cost',
        key: 'replicateCost',
        render: (m: IMonthlyMargin) => formatCents(m.replicateCost),
      },
      {
        header: 'Models Cost',
        key: 'modelsCost',
        render: (m: IMonthlyMargin) => formatCents(m.modelsCost),
      },
      {
        header: 'Other Cost',
        key: 'otherCost',
        render: (m: IMonthlyMargin) => formatCents(m.otherCost),
      },
      {
        header: 'Total Costs',
        key: 'totalCosts',
        render: (m: IMonthlyMargin) => (
          <span className="text-rose-400">{formatCents(m.totalCosts)}</span>
        ),
      },
      {
        header: 'Margin',
        key: 'margin',
        render: (m: IMonthlyMargin) => (
          <span className={marginColorClass(m.marginPercentage)}>
            {formatCents(m.margin)}
          </span>
        ),
      },
      {
        header: 'Margin %',
        key: 'marginPercentage',
        render: (m: IMonthlyMargin) => (
          <span className={marginColorClass(m.marginPercentage)}>
            {m.marginPercentage.toFixed(1)}%
          </span>
        ),
      },
    ],
    [],
  );

  const marginPct =
    summary && summary.revenue > 0
      ? (summary.margin / summary.revenue) * 100
      : 0;

  return (
    <Container
      label="Margins"
      description="Cost vs. revenue analysis and margin tracking"
      icon={HiOutlineChartBar}
      right={
        <>
          <Select
            value={String(year)}
            onValueChange={(value) => setYear(Number(value))}
          >
            <SelectTrigger className="w-24 bg-white/5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ButtonRefresh
            onClick={() => refreshAll()}
            isRefreshing={isSummaryRefreshing || isMonthlyRefreshing}
          />
        </>
      }
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <KpiCard
          title="Actual Revenue"
          value={summary ? formatCents(summary.revenue) : '-'}
          icon={HiOutlineCurrencyDollar}
          colorClass="text-emerald-400"
        />
        <KpiCard
          title="Expected Revenue"
          value={summary ? formatCents(summary.revenue) : '-'}
          icon={HiOutlineBanknotes}
          colorClass="text-blue-400"
        />
        <KpiCard
          title="Costs"
          value={summary ? formatCents(summary.costs) : '-'}
          icon={HiOutlineCalculator}
          colorClass="text-rose-400"
        />
        <KpiCard
          title="Margin"
          value={summary ? formatCents(summary.margin) : '-'}
          icon={HiOutlineChartBar}
          colorClass={marginColorClass(marginPct)}
        />
        <KpiCard
          title="Margin %"
          value={summary ? `${marginPct.toFixed(1)}%` : '-'}
          icon={HiOutlineReceiptPercent}
          colorClass={marginColorClass(marginPct)}
        />
      </div>

      {/* Monthly Breakdown */}
      <AppTable<IMonthlyMargin>
        items={tableData}
        isLoading={isMonthlyLoading}
        columns={columns}
        getRowKey={(m, i) => `${m.month}-${i}`}
        getRowClassName={(m) =>
          m.month === 'Total' || m.month === 'Average'
            ? 'bg-white/[0.03] font-semibold'
            : ''
        }
        emptyLabel="No margin data"
      />
    </Container>
  );
}
