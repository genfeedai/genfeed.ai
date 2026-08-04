'use client';

import type { StatsCardItem } from '@genfeedai/props/ui/cards/stats-cards.props';
import StatsCards from '@ui/card/stats/StatsCards';
import type { DefaultModelCard } from './models-admin-header.helpers';

type ModelsAdminHeaderProps = {
  defaultModelCards: DefaultModelCard[];
  isLoadingDefaults: boolean;
};

export default function ModelsAdminHeader({
  defaultModelCards,
  isLoadingDefaults,
}: ModelsAdminHeaderProps) {
  // Lucide IconType is assignable at runtime; StatsCards only needs a component.
  const statsItems = defaultModelCards as unknown as StatsCardItem[];

  return <StatsCards items={statsItems} isLoading={isLoadingDefaults} />;
}
