'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAccessState } from '@providers/access-state/access-state.provider';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { resolveOperationalHomeScope } from './operational-home.helpers';
import OperationalHomeSections from './operational-home-sections';

export default function OperationalHomeContent() {
  const { brands, organizationId, selectedBrand } = useBrand();
  const { accessState } = useAccessState();
  const { brandSlug, orgSlug } = resolveOperationalHomeScope({
    accessOrganizationId: accessState?.organizationId,
    brands,
    organizationId,
    selectedBrand,
  });

  if (!orgSlug) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <Alert className="w-full max-w-3xl">
          <AlertTitle aria-level={1} role="heading">
            Operational home needs an organization
          </AlertTitle>
          <AlertDescription>
            <p>
              Select or create an organization and brand before opening the
              operational control plane.
            </p>
            <Button asChild className="mt-4" variant={ButtonVariant.SECONDARY}>
              <Link href={APP_ROUTES.ONBOARDING.ROOT}>Continue setup</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Shell Container owns equal page insets — do not re-apply px/py here.
  return (
    <div className="flex w-full flex-col">
      <h1 className="sr-only">Operational home</h1>

      <OperationalHomeSections brandSlug={brandSlug} orgSlug={orgSlug} />
    </div>
  );
}
