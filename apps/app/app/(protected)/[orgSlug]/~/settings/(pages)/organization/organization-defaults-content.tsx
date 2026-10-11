'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import Spinner from '@ui/primitives/spinner';
import OrganizationGenerationDefaultsCard from './organization-generation-defaults-card';
import OrganizationIdentityDefaultsCard from './organization-identity-defaults-card';
import OrganizationPublishingCapsCard from './organization-publishing-caps-card';

export default function SettingsOrganizationDefaultsPage() {
  const { isReady } = useBrand();

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OrganizationIdentityDefaultsCard />
      <OrganizationGenerationDefaultsCard />
      <OrganizationPublishingCapsCard />
    </div>
  );
}
