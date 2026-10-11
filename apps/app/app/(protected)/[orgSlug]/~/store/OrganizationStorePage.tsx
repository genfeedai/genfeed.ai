'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
  isNativeSecondaryAppId,
  isReleasePreviewActive,
  isWorkflowLibraryVisible,
  listStoreNativeAppIds,
  type NativeSecondaryAppId,
  resolveNativeAppAvailability,
  resolveOrganizationModulePresentationAccess,
} from '@genfeedai/contracts/constants';
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import type {
  StoreAppAccessNoteProps,
  StoreAppCardProps,
  StoreAppEntry,
  StoreFilterId,
} from '@genfeedai/props/store/organization-store-page.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { ListRow } from '@ui/lists/list-row/ListRow';
import OverviewLayout from '@ui/overview/OverviewLayout';
import { Button } from '@ui/primitives/button';
import {
  APP_RAIL_REGISTRY,
  getAppRailHref,
  isAppRailItemEnabled,
} from '@ui/shell/app-rail/app-rail.registry';
import { Store, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useInstalledApps } from '@/components/shell/installed-apps.provider';
import { usePinnedRailAppsContext } from '@/components/shell/pinned-rail-apps.provider';
import StoreAppThumbnail from './StoreAppThumbnail';
import { STORE_APP_CATALOG, STORE_CATEGORY_IDS } from './store-app-catalog';

const ALL_FILTER = 'all';

const STORE_SKELETON_KEYS = [
  'store-skeleton-1',
  'store-skeleton-2',
  'store-skeleton-3',
] as const;

function isAppOpenable(app: StoreAppEntry): boolean {
  return app.state === 'installed' || app.state === 'pinned';
}

/**
 * Store v1 at `/:orgSlug/~/store` (#5502): native apps a member installs into
 * their own setup. Installing is a presentation preference; organization,
 * subscription and release access still decide what the member can open, and
 * the server rechecks every new piece of work. Founder-only experiments are
 * listed only for the founder.
 */
export default function OrganizationStorePage() {
  const translate = useTranslations('common.store');
  const translateRail = useTranslations('common.appRail');
  const { selectedBrand, settings, settingsLoading } = useBrand();
  const { flags, isConfigured } = useFeatureFlagContext();
  const { orgSlug } = useOrgUrl();
  const installedApps = useInstalledApps();
  const { pinnedAppIds, togglePin } = usePinnedRailAppsContext();
  const [failedActions, setFailedActions] = useState<
    Partial<Record<NativeSecondaryAppId, 'install' | 'uninstall'>>
  >({});
  const [filter, setFilter] = useState<StoreFilterId>(ALL_FILTER);
  const brandSlug = selectedBrand?.slug?.trim() || undefined;
  const isLoading = settingsLoading || installedApps.status === 'loading';
  // Founder-only apps are listed where unreleased work is visible: self-hosted
  // or a cloud organization on release preview.
  const isReleasePreview = isReleasePreviewActive(
    settingsLoading ? null : settings,
  );

  const apps = useMemo<StoreAppEntry[]>(() => {
    const listedAppIds = new Set(listStoreNativeAppIds(isReleasePreview));
    return APP_RAIL_REGISTRY.flatMap((app) => {
      const appId = app.id;
      if (!isNativeSecondaryAppId(appId) || !listedAppIds.has(appId)) {
        return [];
      }
      const isEnabled = isAppRailItemEnabled(app, flags, isConfigured);
      const state = resolveNativeAppAvailability({
        appId,
        installedAppIds: installedApps.installedAppIds,
        isFounderOperator: isReleasePreview,
        organizationAccess:
          !isEnabled || !app.organizationModule
            ? { isAllowed: false, reason: 'unavailable' }
            : resolveOrganizationModulePresentationAccess(
                settings,
                app.organizationModule,
              ),
        pinnedAppIds,
      });
      return [
        {
          appId,
          description: translateRail(app.description),
          icon: app.icon,
          isInstalled: installedApps.installedAppIds.includes(appId),
          label: translateRail(app.label),
          openHref: getAppRailHref(app, {
            brandAwareSlug: brandSlug,
            orgSlug,
          }),
          state,
        },
      ];
    });
  }, [
    brandSlug,
    flags,
    installedApps.installedAppIds,
    isConfigured,
    isReleasePreview,
    orgSlug,
    pinnedAppIds,
    settings,
    translateRail,
  ]);

  // Only shelves that hold an app the member can see get a chip, so a shelf
  // that is empty for this member never offers an empty filter.
  const filterIds = useMemo<StoreFilterId[]>(() => {
    const shelves = STORE_CATEGORY_IDS.filter((categoryId) =>
      apps.some((app) => STORE_APP_CATALOG[app.appId].category === categoryId),
    );
    return shelves.length > 1 ? [ALL_FILTER, ...shelves] : [ALL_FILTER];
  }, [apps]);
  const activeFilter = filterIds.includes(filter) ? filter : ALL_FILTER;
  const visibleApps = useMemo(
    () =>
      activeFilter === ALL_FILTER
        ? apps
        : apps.filter(
            (app) => STORE_APP_CATALOG[app.appId].category === activeFilter,
          ),
    [activeFilter, apps],
  );
  const featuredApps = visibleApps.filter(
    (app) => STORE_APP_CATALOG[app.appId].isFeatured,
  );
  // No per-member app usage is recorded anywhere, so "most used" cannot be
  // computed. Show the member's own openable apps instead: pinned first, then
  // in the order they were installed.
  const yourApps = useMemo(() => {
    const rank = (appId: NativeSecondaryAppId): number => {
      const pinnedIndex = pinnedAppIds.indexOf(appId);
      return pinnedIndex >= 0
        ? pinnedIndex
        : pinnedAppIds.length + installedApps.installedAppIds.indexOf(appId);
    };
    return visibleApps
      .filter((app) => app.isInstalled && isAppOpenable(app))
      .sort((left, right) => rank(left.appId) - rank(right.appId));
  }, [installedApps.installedAppIds, pinnedAppIds, visibleApps]);

  const automation = apps.find((app) => app.appId === 'automation');
  const isWorkflowLibraryShown =
    !isLoading &&
    automation !== undefined &&
    isWorkflowLibraryVisible(automation.state);

  const runAction = async (
    appId: NativeSecondaryAppId,
    action: 'install' | 'uninstall',
  ) => {
    setFailedActions((previous) => ({ ...previous, [appId]: undefined }));
    const isSaved =
      action === 'install'
        ? await installedApps.install(appId)
        : await installedApps.uninstall(appId);
    if (!isSaved) {
      setFailedActions((previous) => ({ ...previous, [appId]: action }));
    }
  };

  const renderCard = (app: StoreAppEntry, variant: 'featured' | 'standard') => (
    <StoreAppCard
      key={`${variant}-${app.appId}`}
      app={app}
      failedAction={failedActions[app.appId] ?? null}
      isPending={installedApps.pendingAppIds.includes(app.appId)}
      isPinned={pinnedAppIds.includes(app.appId)}
      manageModulesHref={createOrganizationAppRoute(
        orgSlug,
        APP_ROUTES.SETTINGS.MODULES,
      )}
      onInstall={(appId) => void runAction(appId, 'install')}
      onTogglePin={togglePin}
      onUninstall={(appId) => void runAction(appId, 'uninstall')}
      subscriptionHref={createOrganizationAppRoute(
        orgSlug,
        APP_ROUTES.SETTINGS.SUBSCRIPTION,
      )}
      variant={variant}
    />
  );

  return (
    <OverviewLayout
      label={translate('title')}
      description={translate('description')}
      icon={Store}
    >
      {installedApps.status === 'error' ? (
        <p className="px-1 text-sm text-destructive" role="alert">
          {translate('loadFailed')}
        </p>
      ) : null}

      {isLoading ? (
        <CollectionSection
          isLoading
          itemCount={apps.length}
          title={translate('appsTitle')}
        >
          <CollectionGrid data-testid="store-apps">
            {STORE_SKELETON_KEYS.map((key) => (
              <SkeletonCard
                key={key}
                label={translate('loadingApp')}
                showImage={false}
              />
            ))}
          </CollectionGrid>
        </CollectionSection>
      ) : (
        <>
          {filterIds.length > 1 ? (
            <div className="flex flex-wrap gap-2" data-testid="store-filters">
              {filterIds.map((filterId) => (
                <Button
                  key={filterId}
                  aria-pressed={activeFilter === filterId}
                  onClick={() => setFilter(filterId)}
                  size={ButtonSize.SM}
                  variant={
                    activeFilter === filterId
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                >
                  {filterId === ALL_FILTER
                    ? translate('filterAll')
                    : translate(`categories.${filterId}`)}
                </Button>
              ))}
            </div>
          ) : null}

          <CollectionSection
            data-testid="store-featured"
            itemCount={featuredApps.length}
            title={translate('featuredTitle')}
          >
            <CollectionGrid maxColumns={3}>
              {featuredApps.map((app) => renderCard(app, 'featured'))}
            </CollectionGrid>
          </CollectionSection>

          <CollectionSection
            data-testid="store-yours"
            description={translate('yoursDescription')}
            itemCount={yourApps.length}
            title={translate('yoursTitle')}
          >
            <CollectionList>
              {yourApps.map((app) => (
                <ListRow
                  key={app.appId}
                  data-testid={`store-yours-${app.appId}`}
                  density="compact"
                  leading={
                    <StoreAppThumbnail
                      appId={app.appId}
                      icon={app.icon}
                      label={app.label}
                      size="compact"
                    />
                  }
                  meta={
                    pinnedAppIds.includes(app.appId)
                      ? translate('pinned')
                      : undefined
                  }
                  title={app.label}
                  trailing={
                    <Button
                      asChild
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                    >
                      <Link
                        aria-label={`${translate('open')} ${app.label}`}
                        href={app.openHref}
                      >
                        {translate('open')}
                      </Link>
                    </Button>
                  }
                />
              ))}
            </CollectionList>
          </CollectionSection>

          <div className="flex flex-col gap-8" data-testid="store-apps">
            {STORE_CATEGORY_IDS.map((categoryId) => {
              const categoryApps = visibleApps.filter(
                (app) => STORE_APP_CATALOG[app.appId].category === categoryId,
              );
              return (
                <CollectionSection
                  key={categoryId}
                  data-testid={`store-category-${categoryId}`}
                  description={translate(`categoryDescriptions.${categoryId}`)}
                  itemCount={categoryApps.length}
                  title={translate(`categories.${categoryId}`)}
                >
                  <CollectionGrid>
                    {categoryApps.map((app) => renderCard(app, 'standard'))}
                  </CollectionGrid>
                </CollectionSection>
              );
            })}
          </div>
        </>
      )}

      {isWorkflowLibraryShown ? (
        <CollectionSection itemCount={1} title={translate('workflowsTitle')}>
          <Card
            bodyClassName="flex flex-col gap-3"
            data-testid="store-workflows"
          >
            <div className="flex items-center gap-3">
              <Workflow
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
              />
              <p className="text-sm text-muted-foreground">
                {translate('workflowsDescription')}
              </p>
            </div>
            <div>
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <Link
                  href={
                    brandSlug
                      ? createBrandAppRoute(
                          orgSlug,
                          brandSlug,
                          `${APP_ROUTES.AUTOMATION.WORKFLOWS}?view=templates`,
                        )
                      : createOrganizationAppRoute(
                          orgSlug,
                          APP_ROUTES.AUTOMATION.ROOT,
                        )
                  }
                >
                  {translate('openWorkflows')}
                </Link>
              </Button>
            </div>
          </Card>
        </CollectionSection>
      ) : null}
    </OverviewLayout>
  );
}

function StoreAppCard({
  app,
  failedAction,
  isPending,
  isPinned,
  manageModulesHref,
  onInstall,
  onTogglePin,
  onUninstall,
  subscriptionHref,
  variant = 'standard',
}: StoreAppCardProps) {
  const translate = useTranslations('common.store');
  const translateRail = useTranslations('common.appRail');
  const isOpenable = isAppOpenable(app);
  const isLocked = !isOpenable && app.state !== 'not-installed';
  const isFeatured = variant === 'featured';

  return (
    <Card
      bodyClassName="flex h-full flex-col gap-0 p-0"
      className={isLocked ? 'h-full opacity-60' : 'h-full'}
      data-locked={isLocked}
      data-testid={`${isFeatured ? 'store-featured' : 'store-app'}-${app.appId}`}
    >
      <StoreAppThumbnail
        appId={app.appId}
        icon={app.icon}
        label={app.label}
        size={isFeatured ? 'featured' : 'standard'}
      />
      <div className="flex flex-1 flex-col justify-between gap-4 p-4">
        <div
          className="flex min-w-0 items-start gap-3"
          data-app-state={app.state}
        >
          <div className="min-w-0">
            <h3
              className={
                isFeatured
                  ? 'truncate text-base font-semibold text-foreground'
                  : 'truncate text-sm font-semibold text-foreground'
              }
            >
              {app.label}
            </h3>
            <p className="text-xs text-muted-foreground">{app.description}</p>
            <StoreAppAccessNote
              manageModulesHref={manageModulesHref}
              state={app.state}
              subscriptionHref={subscriptionHref}
            />
            {failedAction ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {translate(
                  failedAction === 'install'
                    ? 'installFailed'
                    : 'uninstallFailed',
                  { app: app.label },
                )}
              </p>
            ) : null}
          </div>
        </div>

        <CollectionItemActions
          primary={
            isOpenable ? (
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <Link href={app.openHref}>{translate('open')}</Link>
              </Button>
            ) : app.state === 'not-installed' || isLocked ? (
              <Button
                ariaLabel={`${translate('install')} ${app.label}`}
                isDisabled={isPending || isLocked}
                onClick={() => onInstall(app.appId)}
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
              >
                {translate('install')}
              </Button>
            ) : null
          }
          overflow={
            app.isInstalled
              ? [
                  ...(isOpenable
                    ? [
                        {
                          id: 'pin',
                          label: translateRail(isPinned ? 'unpin' : 'pin', {
                            app: app.label,
                          }),
                          onSelect: () => onTogglePin(app.appId),
                        },
                      ]
                    : []),
                  {
                    id: 'uninstall',
                    isDisabled: isPending,
                    label: translate('uninstall'),
                    onSelect: () => onUninstall(app.appId),
                  },
                ]
              : undefined
          }
          overflowLabel={app.label}
        />
      </div>
    </Card>
  );
}

function StoreAppAccessNote({
  manageModulesHref,
  state,
  subscriptionHref,
}: StoreAppAccessNoteProps) {
  const translate = useTranslations('common.store');
  const linkClassName = 'ml-1 underline underline-offset-2';

  switch (state) {
    case 'organization-disabled':
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {translate('organizationDisabled')}
          <Link className={linkClassName} href={manageModulesHref}>
            {translate('manageModules')}
          </Link>
        </p>
      );
    case 'subscription-required':
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {translate('subscriptionRequired')}
          <Link className={linkClassName} href={subscriptionHref}>
            {translate('viewPlans')}
          </Link>
        </p>
      );
    case 'founder-only':
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {translate('founderOnly')}
        </p>
      );
    case 'unavailable':
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {translate('unavailable')}
        </p>
      );
    default:
      return null;
  }
}
