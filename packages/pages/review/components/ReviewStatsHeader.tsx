'use client';

import type { IBatchSummary } from '@genfeedai/interfaces';
import StatsCards from '@ui/card/stats/StatsCards';
import {
  HiCheckCircle,
  HiClock,
  HiExclamationTriangle,
  HiSquare3Stack3D,
} from 'react-icons/hi2';

interface ReviewStatsHeaderProps {
  batch: IBatchSummary | null;
  isLoading: boolean;
}

export default function ReviewStatsHeader({
  batch,
  isLoading,
}: ReviewStatsHeaderProps) {
  const items = batch
    ? [
        {
          colorClass: 'bg-blue-500/20 text-blue-400',
          count: batch.totalCount,
          icon: HiSquare3Stack3D,
          label: 'Total',
          singularLabel: 'item',
        },
        {
          colorClass: 'bg-emerald-500/20 text-emerald-400',
          count: batch.completedCount,
          icon: HiCheckCircle,
          label: 'Completed',
          singularLabel: 'item',
        },
        {
          colorClass: 'bg-rose-500/20 text-rose-400',
          count: batch.failedCount,
          icon: HiExclamationTriangle,
          label: 'Failed',
          singularLabel: 'item',
        },
        {
          colorClass: 'bg-amber-500/20 text-amber-400',
          count: batch.pendingCount,
          icon: HiClock,
          label: 'Pending',
          singularLabel: 'item',
        },
      ]
    : [];

  return <StatsCards items={items} isLoading={isLoading} />;
}
