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
  const { brandId, organizationId, selectedBrand } = useBrand();
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

    const hasExistingWorkspace =
      (typeof organizationId === 'string' &&
        organizationId.length > 0 &&
        typeof brandId === 'string' &&
        brandId.length > 0) ||
      (typeof accessState?.organizationId === 'string' &&
        accessState.organizationId.length > 0 &&
        typeof accessState?.brandId === 'string' &&
        accessState.brandId.length > 0);

    if (hasExistingWorkspace) {
      const orgSlug = getBrandOrganizationSlug(selectedBrand);
      const brandSlug = selectedBrand?.slug;

      if (orgSlug && brandSlug) {
        setStatusMessage('Opening workspace...');
        window.location.replace(`/${orgSlug}/${brandSlug}/workspace/overview`);
        return;
      }
    }

    setStatusMessage('Opening onboarding...');
    window.location.replace('/onboarding');
  }, [
    accessState,
    brandId,
    isAccessStateLoading,
    organizationId,
    selectedBrand,
  ]);

  return <PageLoadingState className="bg-black" message={statusMessage} />;
}
