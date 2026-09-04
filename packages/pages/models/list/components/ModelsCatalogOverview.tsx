'use client';

import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import type { ModelCatalogOverviewCard } from './models-catalog-overview.helpers';

type ModelsCatalogOverviewProps = {
  cards: ModelCatalogOverviewCard[];
  isLoading: boolean;
};

export default function ModelsCatalogOverview({
  cards,
  isLoading,
}: ModelsCatalogOverviewProps) {
  if (isLoading) {
    return (
      <MetricCardGrid className="mb-6" columns={6}>
        {Array.from({ length: 6 }).map((_, index) => (
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

  return (
    <MetricCardGrid className="mb-6" columns={6}>
      {cards.map((card) => (
        <MetricCard
          key={card.label}
          className={card.cardClassName}
          description={card.description}
          icon={card.icon}
          iconClassName={card.iconClassName}
          label={card.label}
          size="sm"
          value={String(card.count)}
        />
      ))}
    </MetricCardGrid>
  );
}
