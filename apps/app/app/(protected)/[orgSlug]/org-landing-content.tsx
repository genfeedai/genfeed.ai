'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationAccountType } from '@contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import {
  hasAgentFirstOnboarding,
  isCloudDeployment,
} from '@genfeedai/config/deployment';
import { ButtonVariant, MemberRole, ViewType } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/contracts/constants';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import type {
  OrgLandingBrandFact,
  OrgLandingBrandFactsProps,
  OrgLandingBrandItemProps,
  OrgLandingBrandLogoProps,
} from '@props/pages/org-landing.props';
import { useAccessState } from '@providers/access-state/access-state.provider';
import Card from '@ui/card/Card';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import CollectionView from '@ui/collection/CollectionView';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { Building2, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fragment, useEffect } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

/** Up to this many brands the picker leads with logo cards; above it, a list. */
const ORG_LANDING_GRID_BRAND_LIMIT = 6;

const ORG_LANDING_VIEW_SURFACE = 'org.brands';

function hasCompletedOnboarding(user: IUser): boolean {
  const completedSteps = user.onboardingStepsCompleted ?? [];

  return (
    user.isOnboardingCompleted === true ||
    ONBOARDING_STEPS.every((step) => completedSteps.includes(step))
  );
}

function BrandLogo({ brand, className }: OrgLandingBrandLogoProps) {
  if (brand.logoUrl) {
    return (
      <Image
        alt={brand.label}
        className={cn(
          'shrink-0 rounded-lg object-cover outline-media',
          className,
        )}
        height={40}
        sizes="40px"
        src={brand.logoUrl}
        unoptimized={!canOptimizeImageSource(brand.logoUrl)}
        width={40}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg border border-border',
        className,
      )}
    >
      <Building2 className="size-5 text-muted-foreground" />
    </div>
  );
}

/** One line of known facts; empty fields are left out, never placeholders. */
function BrandFacts({ brand, className }: OrgLandingBrandFactsProps) {
  const translate = useTranslations('pages.organizationLanding');
  const facts: OrgLandingBrandFact[] = [];

  if (brand.slug) {
    facts.push({ id: 'slug', node: `@${brand.slug}` });
  }

  if (brand.totalCredentials > 0) {
    facts.push({
      id: 'platforms',
      node: translate('platformCount', { count: brand.totalCredentials }),
    });
  }

  if (brand.createdAt) {
    facts.push({
      id: 'created',
      node: <ClientFormattedDate format="date" value={brand.createdAt} />,
    });
  }

  if (facts.length === 0) {
    return null;
  }

  return (
    <p
      className={cn(
        'min-w-0 truncate text-xs text-muted-foreground',
        className,
      )}
      data-testid="org-brand-facts"
    >
      {facts.map((fact, index) => (
        <Fragment key={fact.id}>
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          {fact.node}
        </Fragment>
      ))}
    </p>
  );
}

function BrandCard({ brand, href }: OrgLandingBrandItemProps) {
  return (
    <Link className="block h-full" data-testid="org-brand-card" href={href}>
      <Card className="h-full hover:shadow-border-strong">
        <div className="flex items-center gap-3">
          <BrandLogo brand={brand} className="size-10" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {brand.label}
            </h3>
            <BrandFacts brand={brand} className="mt-0.5" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function BrandRow({ brand, href }: OrgLandingBrandItemProps) {
  return (
    <ListRow
      data-testid="org-brand-row"
      density="compact"
      href={href}
      leading={<BrandLogo brand={brand} className="size-8" />}
      meta={<BrandFacts brand={brand} />}
      title={brand.label}
    />
  );
}

export default function OrgLandingContent() {
  // Admin `agent` flag (#5468): with Agent off, onboarding takes the classic wizard.
  const isAgentModuleEnabled = useFeatureFlag('agent');
  const translate = useTranslations('pages.organizationLanding');
  const { brands, isReady, isBrandScopeResolved } = useBrand();
  const { accessState } = useAccessState();
  const hasNoBrandAccess =
    isCloudDeployment() &&
    isBrandScopeResolved &&
    brands.length === 0 &&
    Boolean(accessState?.memberRole) &&
    accessState?.memberRole !== MemberRole.OWNER &&
    accessState?.memberRole !== MemberRole.ADMIN;
  const { currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { orgSlug, orgHref } = useOrgUrl();
  const { replace } = useRouter();
  const primaryBrandSlug = brands[0]?.slug ?? '';
  const accountType = getBrandOrganizationAccountType(brands[0]);
  const { view, setView } = useCollectionViewPreference({
    defaultView:
      brands.length > ORG_LANDING_GRID_BRAND_LIMIT
        ? ViewType.LIST
        : ViewType.GRID,
    surface: ORG_LANDING_VIEW_SURFACE,
  });

  useEffect(() => {
    if (!isReady || isCurrentUserLoading || !currentUser || hasNoBrandAccess) {
      return;
    }

    if (!hasCompletedOnboarding(currentUser)) {
      replace(
        resolveForcedOnboardingHref({
          accountType,
          completedSteps: currentUser.onboardingStepsCompleted ?? [],
          hasAgentFirstOnboarding:
            hasAgentFirstOnboarding(isAgentModuleEnabled),
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
    accountType,
    hasNoBrandAccess,
    brands.length,
    currentUser,
    isCurrentUserLoading,
    isReady,
    orgSlug,
    primaryBrandSlug,
    replace,
    isAgentModuleEnabled,
  ]);

  const isResolving = !isReady || isCurrentUserLoading || !currentUser;
  const isOnboardingPending =
    currentUser !== null &&
    !isCurrentUserLoading &&
    !hasCompletedOnboarding(currentUser);
  // Zero or one brand, or unfinished onboarding, always ends in a redirect, so
  // the picker never paints for those viewers — not even as a skeleton.
  const isRedirecting = isReady && (brands.length <= 1 || isOnboardingPending);

  if (hasNoBrandAccess)
    return (
      <p className="px-6 py-12 text-muted-foreground" role="status">
        {translate('noBrandAccess')}
      </p>
    );

  if (isRedirecting) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        data-testid="org-landing-redirecting"
        role="status"
      >
        <Spinner aria-hidden="true" className="size-6 text-foreground" />
        <span className="sr-only">{translate('redirecting')}</span>
      </div>
    );
  }

  return (
    <div
      aria-busy={isResolving || undefined}
      className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            {translate('title')}
          </h2>
          {isResolving ? null : (
            <p className="mt-1 text-sm text-muted-foreground">
              {translate('brandCount', { count: brands.length })}
            </p>
          )}
        </div>
        <Button
          asChild
          className="inline-flex items-center gap-2 rounded-md bg-foreground/[0.03] px-3.5 py-2 text-sm font-medium text-foreground/70 shadow-border transition hover:shadow-border-strong hover:bg-foreground/[0.06] hover:text-foreground"
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        >
          <Link href={orgHref('/settings/brands')}>
            <Plus className="size-4" />
            {translate('newBrand')}
          </Link>
        </Button>
      </div>

      <CollectionToolbar onViewChange={setView} view={view} />

      <CollectionView
        data-testid="org-brands"
        getItemKey={(brand) => brand.id}
        isLoading={isResolving}
        items={brands}
        maxColumns={3}
        renderGridItem={(brand) => (
          <BrandCard
            brand={brand}
            href={createBrandAppRoute(orgSlug, brand.slug, '/workspace')}
          />
        )}
        renderListItem={(brand) => (
          <BrandRow
            brand={brand}
            href={createBrandAppRoute(orgSlug, brand.slug, '/workspace')}
          />
        )}
        view={view}
      />
    </div>
  );
}
