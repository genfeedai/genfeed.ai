'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { hasAgentFirstOnboarding } from '@genfeedai/config/deployment';
import { ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/contracts/constants';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Brand } from '@models/organization/brand.model';
import { Button } from '@ui/primitives/button';
import { Building2, Globe, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

function BrandCard({ brand, orgSlug }: { brand: Brand; orgSlug: string }) {
  const cardHref = createBrandAppRoute(orgSlug, brand.slug, '/workspace');

  return (
    <Link
      href={cardHref}
      className="group flex flex-col gap-4 rounded-card bg-card p-5 shadow-border transition hover:shadow-border-strong hover:bg-foreground/[0.04]"
    >
      <div className="flex items-center gap-3">
        {brand.logoUrl ? (
          <Image
            alt={brand.label}
            className="size-10 rounded-lg object-cover"
            height={40}
            sizes="40px"
            src={brand.logoUrl}
            unoptimized={!canOptimizeImageSource(brand.logoUrl)}
            width={40}
          />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-foreground/[0.04]">
            <Building2 className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">
            {brand.label}
          </h3>
          {brand.slug ? (
            <p className="truncate text-xs text-muted-foreground">
              @{brand.slug}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {brand.totalCredentials > 0 ? (
          <span className="flex items-center gap-1">
            <Globe className="size-3.5" />
            {brand.totalCredentials} platform
            {brand.totalCredentials === 1 ? '' : 's'}
          </span>
        ) : null}
        {brand.createdAt ? (
          <ClientFormattedDate format="date" value={brand.createdAt} />
        ) : null}
      </div>
    </Link>
  );
}

export default function OrgLandingContent() {
  const { brands, isReady } = useBrand();
  const { currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { orgSlug, orgHref } = useOrgUrl();
  const { replace } = useRouter();
  const primaryBrandSlug = brands[0]?.slug ?? '';

  useEffect(() => {
    if (!isReady || isCurrentUserLoading || !currentUser) {
      return;
    }

    const completedSteps = currentUser.onboardingStepsCompleted ?? [];
    const hasCompletedOnboarding =
      currentUser.isOnboardingCompleted === true ||
      ONBOARDING_STEPS.every((step) => completedSteps.includes(step));

    if (!hasCompletedOnboarding) {
      replace(
        resolveForcedOnboardingHref({
          completedSteps,
          hasAgentFirstOnboarding: hasAgentFirstOnboarding(),
          orgSlug,
        }),
      );
      return;
    }

    if (brands.length === 0) {
      replace(APP_ROUTES.ONBOARDING.BRAND);
      return;
    }

    if (brands.length <= 1 && primaryBrandSlug) {
      replace(createBrandAppRoute(orgSlug, primaryBrandSlug, '/workspace'));
    }
  }, [
    brands.length,
    currentUser,
    isCurrentUserLoading,
    isReady,
    orgSlug,
    primaryBrandSlug,
    replace,
  ]);

  if (!isReady || isCurrentUserLoading || !currentUser || brands.length <= 1) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          aria-hidden="true"
          className="size-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Projects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {brands.length} brand{brands.length === 1 ? '' : 's'} in this
            workspace
          </p>
        </div>
        <Button
          asChild
          className="inline-flex items-center gap-2 rounded-md bg-foreground/[0.03] px-3.5 py-2 text-sm font-medium text-foreground/70 shadow-border transition hover:shadow-border-strong hover:bg-foreground/[0.06] hover:text-foreground"
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        >
          <Link href={orgHref('/settings/brands')}>
            <Plus className="size-4" />
            New Brand
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((brand) => (
          <BrandCard key={brand.id} brand={brand} orgSlug={orgSlug} />
        ))}
      </div>
    </div>
  );
}
