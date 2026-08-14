'use client';

import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import type { DefaultModelCard } from './models-admin-header.helpers';

type ModelsAdminHeaderProps = {
  defaultModelCards: DefaultModelCard[];
  isLoadingDefaults: boolean;
};

export default function ModelsAdminHeader({
  defaultModelCards,
  isLoadingDefaults,
}: ModelsAdminHeaderProps) {
  if (isLoadingDefaults) {
    return (
      <MetricCardGrid className="mb-6" columns={4}>
        {Array.from({ length: 4 }).map((_, index) => (
          <MetricCard
            key={`loading-${index}`}
            isLoading
            label="Loading"
            size="sm"
            value="0"
          />
        ))}
      </MetricCardGrid>
    );
  }

  if (defaultModelCards.length === 0) {
    return null;
  }

  return (
    <MetricCardGrid className="mb-6" columns={4}>
      {defaultModelCards.map((stat) => (
        <MetricCard
          key={stat.label}
          className={stat.cardClassName}
          description={stat.description}
          icon={stat.icon}
          iconClassName={stat.colorClass}
          label={stat.label}
          size="sm"
          value={String(stat.count)}
        />
      ))}
    </MetricCardGrid>
  );
}
