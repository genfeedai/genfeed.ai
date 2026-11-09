'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

function getOrganizationSlug(
  brand: ReturnType<typeof useBrand>['brands'][number] | undefined,
): string {
  const organization = brand?.organization;

  return organization &&
    typeof organization === 'object' &&
    'slug' in organization &&
    typeof organization.slug === 'string'
    ? organization.slug
    : '';
}

/**
 * `/support/<handle>` is the link a public profile or article sends readers to.
 * The reader pays from their current organization, so resolve it first.
 */
export default function SupportRouteResolver() {
  const { handle } = useRouteParams<{ handle: string }>();
  const { brands, isReady, selectedBrand } = useBrand();
  const { replace } = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const orgSlug =
      getOrganizationSlug(selectedBrand) || getOrganizationSlug(brands[0]);
    const query = searchParams.toString();

    replace(
      orgSlug
        ? `${createOrganizationAppRoute(
            orgSlug,
            `${APP_ROUTES.SUPPORT}/${encodeURIComponent(handle ?? '')}`,
          )}${query ? `?${query}` : ''}`
        : '/onboarding',
    );
  }, [brands, handle, isReady, replace, searchParams, selectedBrand]);

  return null;
}
