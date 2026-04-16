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
      (typeof accessState?.brandId === 'string' && accessState.brandId.length > 0);

    if (hasOrganization && hasSelectedBrand) {
      const orgSlug = getBrandOrganizationSlug(selectedBrand);
      const brandSlug = selectedBrand?.slug;

      if (orgSlug && brandSlug) {
        setStatusMessage('Opening workspace...');
        window.location.replace(`/${orgSlug}/${brandSlug}/workspace/overview`);
        return;
      }
    }

    const fallbackOrgSlug = getBrandOrganizationSlug(brands[0]);

    if (hasOrganization && fallbackOrgSlug) {
      setStatusMessage('Opening organization...');
      window.location.replace(`/${fallbackOrgSlug}/~`);
      return;
    }

    setStatusMessage('Opening onboarding...');
    window.location.replace('/onboarding');
  }, [accessState, brandId, brands, isAccessStateLoading, organizationId, selectedBrand]);

  return <PageLoadingState className="bg-black" message={statusMessage} />;
}
