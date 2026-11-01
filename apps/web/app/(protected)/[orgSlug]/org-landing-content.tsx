'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationAccountType } from '@contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import {
  hasSingleStepOnboarding,
  isCloudDeployment,
} from '@genfeedai/config/deployment';
import {
  ButtonSize,
  ButtonVariant,
  MemberRole,
  ViewType,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  DEFAULT_HOME_APP_ID,
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/contracts/constants';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useAccessState } from '@providers/access-state/access-state.provider';
import Card from '@ui/card/Card';
import CollectionView from '@ui/collection/CollectionView';
import CollectionViewToggle from '@ui/collection/CollectionViewToggle';
import Container from '@ui/layout/container/Container';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { Building2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fragment, useCallback, useEffect } from 'react';
import { useHomeApp } from '@/components/shell/use-home-app';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { useCollectionViewPreference } from '@/hooks/utils/use-collection-view-preference/use-collection-view-preference';
import type {
  OrgLandingBrandFact,
  OrgLandingBrandFactsProps,
  OrgLandingBrandItemProps,
} from '@/props/pages/org-landing.props';

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
          <Avatar
            alt={brand.label}
            name={brand.label}
            shape="square"
            size="lg"
            src={brand.logoUrl}
          />
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
      leading={
        <Avatar
          alt={brand.label}
          name={brand.label}
          shape="square"
          size="md"
          src={brand.logoUrl}
        />
      }
      meta={<BrandFacts brand={brand} />}
      title={brand.label}
    />
  );
}

export default function OrgLandingContent() {
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
  const {
    appId: homeAppId,
    isResolved: isHomeAppResolved,
    resolveHref: resolveHomeHref,
  } = useHomeApp();
  // Picking a brand opens the member's home app in it. Workspace keeps its
  // established brand entry path.
  const getBrandHomeHref = useCallback(
    (brandSlug: string) =>
      homeAppId === DEFAULT_HOME_APP_ID
        ? createBrandAppRoute(orgSlug, brandSlug, '/workspace')
        : resolveHomeHref(orgSlug, brandSlug),
    [homeAppId, orgSlug, resolveHomeHref],
  );
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
          hasSingleStepOnboarding: hasSingleStepOnboarding(),
        }),
      );
      return;
    }

    if (brands.length === 0) {
      replace(APP_ROUTES.ONBOARDING.BRAND);
      return;
    }

    if (brands.length <= 1 && primaryBrandSlug && isHomeAppResolved) {
      replace(getBrandHomeHref(primaryBrandSlug));
    }
  }, [
    accountType,
    getBrandHomeHref,
    hasNoBrandAccess,
    brands.length,
    currentUser,
    isCurrentUserLoading,
    isHomeAppResolved,
    isReady,
    primaryBrandSlug,
    replace,
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
    <Container
      icon={Building2}
      label={translate('title')}
      right={
        <>
          <CollectionViewToggle onViewChange={setView} view={view} />
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            <Link href={orgHref('/settings/brands')}>
              <Plus className="size-4" />
              {translate('newBrand')}
            </Link>
          </Button>
        </>
      }
    >
      <div aria-busy={isResolving || undefined}>
        <CollectionView
          data-testid="org-brands"
          getItemKey={(brand) => brand.id}
          isLoading={isResolving}
          items={brands}
          maxColumns={3}
          renderGridItem={(brand) => (
            <BrandCard brand={brand} href={getBrandHomeHref(brand.slug)} />
          )}
          renderListItem={(brand) => (
            <BrandRow brand={brand} href={getBrandHomeHref(brand.slug)} />
          )}
          view={view}
        />
      </div>
    </Container>
  );
}
