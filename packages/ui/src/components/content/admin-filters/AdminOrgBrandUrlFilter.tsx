'use client';

import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * The admin organization / brand picker, stored in the URL as `organization`
 * and `brand`. Every admin list reads the same two params, so the subbar
 * filter looks and behaves the same on every page.
 */
export function useAdminOrgBrandParams(): {
  brand: string;
  organization: string;
} {
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  return useMemo(() => {
    const params = new URLSearchParams(searchParamsString);
    return {
      brand: params.get('brand') || '',
      organization: params.get('organization') || '',
    };
  }, [searchParamsString]);
}

export default function AdminOrgBrandUrlFilter() {
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const { brand, organization } = useAdminOrgBrandParams();

  const updateParams = useCallback(
    (update: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParamsString);
      update(params);
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  const handleOrganizationChange = useCallback(
    (orgId: string) =>
      updateParams((params) => {
        if (orgId) params.set('organization', orgId);
        else params.delete('organization');
        params.delete('brand');
      }),
    [updateParams],
  );

  const handleBrandChange = useCallback(
    (brandId: string) =>
      updateParams((params) => {
        if (brandId) params.set('brand', brandId);
        else params.delete('brand');
      }),
    [updateParams],
  );

  return (
    <AdminOrgBrandFilter
      organization={organization}
      brand={brand}
      onOrganizationChange={handleOrganizationChange}
      onBrandChange={handleBrandChange}
    />
  );
}
