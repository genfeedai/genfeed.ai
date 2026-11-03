'use client';

import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import useAdminOrgBrandFacets from '@/components/content/admin-filters/AdminOrgBrandFilter';

/**
 * The admin organization / brand scope, stored in the URL as `organization`
 * and `brand`. Every admin list reads the same two params, so the Filters menu
 * behaves the same on every page.
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

/** How long a scope clear waits for the page's own clear to reach the URL. */
const SCOPE_CLEAR_FALLBACK_MS = 250;

/**
 * The organization and brand facets of the admin Filters menu, wired to the
 * URL.
 *
 * `clearAfterPageClear` drops the scope once the page's own "Clear filters"
 * has reached the URL. Both write the same query string, so applying them in
 * one tick would let the second overwrite the first: the scope clear waits for
 * the next URL change (or a short fallback when the page's clear leaves the
 * URL alone) and then removes `organization` and `brand` from the fresh one.
 */
export function useAdminOrgBrandUrlFacets(): {
  clearAfterPageClear: () => void;
  facets: FilterMenuFacet[];
} {
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

  const facets = useAdminOrgBrandFacets({
    brand,
    onBrandChange: handleBrandChange,
    onOrganizationChange: handleOrganizationChange,
    organization,
  });

  const handleOrganizationChangeRef = useRef(handleOrganizationChange);
  handleOrganizationChangeRef.current = handleOrganizationChange;
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScopeClearPendingRef = useRef(false);

  const runScopeClear = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (!isScopeClearPendingRef.current) {
      return;
    }
    isScopeClearPendingRef.current = false;
    handleOrganizationChangeRef.current('');
  }, []);

  // The page's clear landed: `searchParamsString` is the fresh query now.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the URL change is the trigger.
  useEffect(() => {
    if (isScopeClearPendingRef.current) {
      runScopeClear();
    }
  }, [searchParamsString, runScopeClear]);

  useEffect(
    () => () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    },
    [],
  );

  const clearAfterPageClear = useCallback(() => {
    if (!organization && !brand) {
      return;
    }
    isScopeClearPendingRef.current = true;
    fallbackTimerRef.current = setTimeout(
      runScopeClear,
      SCOPE_CLEAR_FALLBACK_MS,
    );
  }, [brand, organization, runScopeClear]);

  return { clearAfterPageClear, facets };
}
