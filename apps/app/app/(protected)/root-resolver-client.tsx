'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAccessState } from '@providers/access-state/access-state.provider';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { useEffect, useRef, useState } from 'react';

function getBrandOrganizationSlug(
  brand: ReturnType<typeof useBrand>['selectedBrand'],
): string {
  const organization = brand?.organization;

  if (
    organization &&
    typeof organization === 'object' &&
    'slug' in organization &&
    typeof organization.slug === 'string'
  ) {
    return organization.slug;
  }

  return '';
}

export default function ProtectedRootResolver() {
  const { brandId, brands, organizationId, selectedBrand } = useBrand();
  const { accessState, isLoading: isAccessStateLoading } = useAccessState();
  const hasStartedRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState(
    'Checking workspace state...',
  );

  useEffect(() => {
    if (isAccessStateLoading || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    const hasOrganization =
      (typeof organizationId === 'string' && organizationId.length > 0) ||
      (typeof accessState?.organizationId === 'string' &&
        accessState.organizationId.length > 0);
    const hasSelectedBrand =
      (typeof brandId === 'string' && brandId.length > 0) ||
      (typeof accessState?.brandId === 'string' &&
        accessState.brandId.length > 0);

    let nextMessage: string;
    let nextUrl: string;

    if (hasOrganization && hasSelectedBrand) {
      const orgSlug = getBrandOrganizationSlug(selectedBrand);
      const brandSlug = selectedBrand?.slug;

      if (orgSlug && brandSlug) {
        nextMessage = 'Opening workspace...';
        nextUrl = `/${orgSlug}/${brandSlug}/workspace/overview`;
      } else {
        const fallbackOrgSlug = getBrandOrganizationSlug(brands[0]);
        nextMessage =
          hasOrganization && fallbackOrgSlug
            ? 'Opening organization...'
            : 'Opening onboarding...';
        nextUrl =
          hasOrganization && fallbackOrgSlug
            ? `/${fallbackOrgSlug}/~`
            : '/onboarding';
      }
    } else {
      const fallbackOrgSlug = getBrandOrganizationSlug(brands[0]);
      nextMessage =
        hasOrganization && fallbackOrgSlug
          ? 'Opening organization...'
          : 'Opening onboarding...';
      nextUrl =
        hasOrganization && fallbackOrgSlug
          ? `/${fallbackOrgSlug}/~`
          : '/onboarding';
    }

    setStatusMessage(nextMessage);
    window.location.replace(nextUrl);
  }, [
    accessState,
    brandId,
    brands,
    isAccessStateLoading,
    organizationId,
    selectedBrand,
  ]);

  return (
    <PageLoadingState className="bg-neutral-950" message={statusMessage} />
  );
}
