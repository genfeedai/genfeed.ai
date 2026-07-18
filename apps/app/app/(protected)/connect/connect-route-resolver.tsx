'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/constants';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { useRouter } from 'next/navigation';
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

export default function ConnectRouteResolver() {
  const { brands, isReady, selectedBrand } = useBrand();
  const { replace } = useRouter();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const orgSlug =
      getOrganizationSlug(selectedBrand) || getOrganizationSlug(brands[0]);

    replace(
      orgSlug
        ? createOrganizationAppRoute(orgSlug, APP_ROUTES.CONNECT)
        : '/onboarding',
    );
  }, [brands, isReady, replace, selectedBrand]);

  return (
    <PageLoadingState
      className="bg-background"
      message="Opening Connect Genfeed..."
    />
  );
}
