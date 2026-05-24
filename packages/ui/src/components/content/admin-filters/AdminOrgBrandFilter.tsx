'use client';

import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { IBrand, IOrganization } from '@genfeedai/interfaces';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { useQuery } from '@tanstack/react-query';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import { useCallback, useMemo } from 'react';

export interface AdminOrgBrandFilterProps {
  organization: string;
  brand: string;
  onOrganizationChange: (orgId: string) => void;
  onBrandChange: (brandId: string) => void;
}

export default function AdminOrgBrandFilter({
  organization,
  brand,
  onOrganizationChange,
  onBrandChange,
}: AdminOrgBrandFilterProps) {
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const { data: organizations = [] } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const service = await getOrganizationsService();
      return service.findAll({ pagination: false });
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['admin-org-brands', organization],
    queryFn: async () => {
      const service = await getOrganizationsService();
      return service.findOrganizationBrands(organization, {
        pagination: false,
      });
    },
    enabled: !!organization,
    staleTime: 5 * 60 * 1000,
  });

  const orgOptions = useMemo(
    () => [
      { label: 'All Organizations', value: '' },
      ...organizations.map((org: IOrganization) => ({
        label: org.label || org.id,
        value: org.id,
      })),
    ],
    [organizations],
  );

  const brandOptions = useMemo(
    () => [
      { label: 'All Brands', value: '' },
      ...brands.map((b: IBrand) => ({
        label: b.label || b.id,
        value: b.id,
      })),
    ],
    [brands],
  );

  const handleOrgChange = useCallback(
    (_name: string, value: string) => {
      onOrganizationChange(value);
      // Clear brand when org changes
      if (brand) {
        onBrandChange('');
      }
    },
    [onOrganizationChange, onBrandChange, brand],
  );

  const handleBrandChange = useCallback(
    (_name: string, value: string) => {
      onBrandChange(value);
    },
    [onBrandChange],
  );

  return (
    <div className="flex items-center gap-2">
      <ButtonDropdown
        name="organization"
        value={organization}
        options={orgOptions}
        onChange={handleOrgChange}
        placeholder="All Organizations"
      />
      {organization && (
        <ButtonDropdown
          name="brand"
          value={brand}
          options={brandOptions}
          onChange={handleBrandChange}
          placeholder="All Brands"
        />
      )}
    </div>
  );
}
