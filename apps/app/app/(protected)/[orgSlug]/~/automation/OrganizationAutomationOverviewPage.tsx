'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@contexts/user/brand-context/brand-context.helpers';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_DISPLAY_LABELS,
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  OrganizationAutomationBrand,
  OrganizationAutomationBrandCardProps,
} from '@props/automation/organization-automation-overview-page.props';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionSection from '@ui/collection/CollectionSection';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import OverviewLayout from '@ui/overview/OverviewLayout';
import { Button } from '@ui/primitives/button';
import { ChartLine, Cpu, MessageSquare, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/**
 * Deep links offered per brand. Automation data itself is brand-scoped, so the
 * org surface is a read across brands rather than an aggregate of its own.
 */
const AUTOMATION_SURFACES = [
  {
    icon: Workflow,
    id: 'workflows',
    path: APP_ROUTES.AUTOMATION.WORKFLOWS,
  },
  { icon: Cpu, id: 'runs', path: APP_ROUTES.AUTOMATION.RUNS },
  {
    icon: MessageSquare,
    id: 'agents',
    path: APP_ROUTES.AUTOMATION.AGENTS,
  },
  {
    icon: ChartLine,
    id: 'analytics',
    path: APP_ROUTES.ANALYTICS.OVERVIEW,
  },
] as const;

/** Placeholder cards while the brand context resolves. */
const ORGANIZATION_AUTOMATION_SKELETON_KEYS = [
  'brand-skeleton-1',
  'brand-skeleton-2',
  'brand-skeleton-3',
] as const;

/**
 * Org-level Automation home at `/:orgSlug/~/automation`.
 *
 * The app rail routes here whenever no brand is selected, so this is the
 * global view: every brand's automation entry points in one place.
 */
export default function OrganizationAutomationOverviewPage() {
  const translate = useTranslations('common.automation.organizationOverview');
  const { brands, isReady } = useBrand();
  const { orgSlug } = useOrgUrl();

  const brandCards: OrganizationAutomationBrand[] = useMemo(
    () =>
      brands.flatMap((brand) => {
        const id = getBrandEntityId(brand);
        const slug = brand.slug?.trim();

        if (!id || !slug) {
          return [];
        }

        return [
          {
            href: createBrandAppRoute(
              orgSlug,
              slug,
              APP_ROUTES.AUTOMATION.ROOT,
            ),
            id,
            label: brand.label || slug,
            slug,
            surfaces: AUTOMATION_SURFACES.map((surface) => ({
              href: createBrandAppRoute(orgSlug, slug, surface.path),
              icon: surface.icon,
              id: surface.id,
              label: translate(`surfaces.${surface.id}`),
            })),
            totalCredentials: brand.totalCredentials,
          },
        ];
      }),
    [brands, orgSlug, translate],
  );

  return (
    <OverviewLayout
      label={APP_DISPLAY_LABELS.automation}
      description={translate('description')}
      icon={Workflow}
    >
      {isReady && brandCards.length === 0 ? (
        <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center">
          <Workflow className="size-10 text-foreground/20" />
          <h2 className="text-lg font-semibold text-foreground">
            {translate('emptyTitle')}
          </h2>
          <p className="max-w-md text-sm text-foreground/55">
            {translate('emptyDescription')}
          </p>
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={`/${orgSlug}/~/settings/brands`}>
              {translate('emptyAction')}
            </Link>
          </Button>
        </div>
      ) : null}

      <CollectionSection
        isLoading={!isReady}
        itemCount={brandCards.length}
        title={translate('brandsTitle')}
      >
        <CollectionGrid data-testid="organization-automation-brands">
          {isReady
            ? brandCards.map((brand) => (
                <OrganizationAutomationBrandCard key={brand.id} brand={brand} />
              ))
            : ORGANIZATION_AUTOMATION_SKELETON_KEYS.map((key) => (
                <SkeletonCard
                  key={key}
                  label={translate('loadingBrand')}
                  showImage={false}
                />
              ))}
        </CollectionGrid>
      </CollectionSection>
    </OverviewLayout>
  );
}

function OrganizationAutomationBrandCard({
  brand,
}: OrganizationAutomationBrandCardProps) {
  const translate = useTranslations('common.automation.organizationOverview');
  const facts = [
    `@${brand.slug}`,
    brand.totalCredentials > 0
      ? translate('platformCount', { count: brand.totalCredentials })
      : null,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <Card
      bodyClassName="flex h-full flex-col justify-between gap-4"
      className="h-full"
      data-testid="organization-automation-brand-card"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Workflow aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {brand.label}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {facts.join(' · ')}
          </p>
        </div>
      </div>

      <CollectionItemActions
        overflow={brand.surfaces.map((surface) => ({
          href: surface.href,
          icon: <surface.icon className="size-4" />,
          id: surface.id,
          label: surface.label,
        }))}
        overflowLabel={translate('moreActions', { brand: brand.label })}
        primary={
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={brand.href}>{translate('openAutomation')}</Link>
          </Button>
        }
      />
    </Card>
  );
}
