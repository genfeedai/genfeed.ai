'use client';

import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@genfeedai/hooks/data/resource/use-resource/use-resource';
import type { IBrand, IOrganization } from '@genfeedai/interfaces';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import { useCallback, useMemo } from 'react';

type CachedEntry<T> = {
  data: T | null;
  fetchedAt: number;
  promise: Promise<T> | null;
};

const ORG_CACHE_TTL_MS = 5 * 60 * 1000;

const organizationsCache: CachedEntry<IOrganization[]> = {
  data: null,
  fetchedAt: 0,
  promise: null,
};

const brandsCache = new Map<string, CachedEntry<IBrand[]>>();

const isFresh = <T,>(entry: CachedEntry<T>): boolean =>
  entry.data !== null && Date.now() - entry.fetchedAt < ORG_CACHE_TTL_MS;

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

  // Fetch all organizations
  const { data: organizations } = useResource(
    async () => {
      if (isFresh(organizationsCache)) {
        return organizationsCache.data ?? [];
      }
      if (organizationsCache.promise) {
        return organizationsCache.promise;
      }

      const promise = (async () => {
        const service = await getOrganizationsService();
        const result = await service.findAll({ pagination: false });
        organizationsCache.data = result;
        organizationsCache.fetchedAt = Date.now();
        organizationsCache.promise = null;
        return result;
      })();

      organizationsCache.promise = promise;

      return promise.catch((error) => {
        organizationsCache.promise = null;
        throw error;
      });
    },
    {
      defaultValue: organizationsCache.data ?? ([] as IOrganization[]),
      dependencies: [],
    },
  );

  // Fetch brands for selected organization
  const { data: brands } = useResource(
    async () => {
      if (!organization) {
        return [];
      }

      const cached = brandsCache.get(organization);
      if (cached && isFresh(cached)) {
        return cached.data ?? [];
      }
      if (cached?.promise) {
        return cached.promise;
      }

      const promise = (async () => {
        const service = await getOrganizationsService();
        const result = await service.findOrganizationBrands(organization, {
          pagination: false,
        });
        brandsCache.set(organization, {
          data: result,
          fetchedAt: Date.now(),
          promise: null,
        });
        return result;
      })();

      brandsCache.set(organization, {
        data: cached?.data ?? null,
        fetchedAt: cached?.fetchedAt ?? 0,
        promise,
      });

      return promise.catch((error) => {
        const entry = brandsCache.get(organization);
        if (entry) {
          entry.promise = null;
        }
        throw error;
      });
    },
    {
      defaultValue: brandsCache.get(organization)?.data ?? ([] as IBrand[]),
      dependencies: [organization],
      enabled: !!organization,
    },
  );

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
