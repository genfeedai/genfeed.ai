'use client';

import StatsCards from '@ui/card/stats/StatsCards';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import type { DefaultModelCard } from './models-admin-header.helpers';

type ModelsAdminHeaderProps = {
  organization: string;
  brand: string;
  onOrganizationChange: (orgId: string) => void;
  onBrandChange: (brandId: string) => void;
  defaultModelCards: DefaultModelCard[];
  isLoadingDefaults: boolean;
};

export default function ModelsAdminHeader({
  organization,
  brand,
  onOrganizationChange,
  onBrandChange,
  defaultModelCards,
  isLoadingDefaults,
}: ModelsAdminHeaderProps) {
  return (
    <>
      <div className="mb-4">
        <AdminOrgBrandFilter
          organization={organization}
          brand={brand}
          onOrganizationChange={onOrganizationChange}
          onBrandChange={onBrandChange}
        />
      </div>
      <StatsCards items={defaultModelCards} isLoading={isLoadingDefaults} />
    </>
  );
}
