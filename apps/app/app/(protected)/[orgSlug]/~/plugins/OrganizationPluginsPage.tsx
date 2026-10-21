'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
  isNativeSecondaryAppId,
  isWorkflowLibraryVisible,
  type NativeSecondaryAppId,
  resolveNativeAppAvailability,
  resolveOrganizationModulePresentationAccess,
} from '@genfeedai/contracts/constants';
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import type {
  PluginAppAccessNoteProps,
  PluginAppEntry,
  PluginAppRowProps,
  PluginFilterId,
} from '@genfeedai/props/plugins/organization-plugins-page.props';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionSection from '@ui/collection/CollectionSection';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  APP_RAIL_REGISTRY,
  getAppRailHref,
  isAppRailItemEnabled,
} from '@ui/shell/app-rail/app-rail.registry';
import { Puzzle, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import PluginAppThumbnail from '@/components/plugins/PluginAppThumbnail';
import {
  PLUGIN_APP_CATALOG,
  PLUGIN_CATEGORY_IDS,
} from '@/components/plugins/plugin-app-catalog';
import { useInstalledApps } from '@/components/shell/installed-apps.provider';
import { useRailPreferencesContext } from '@/components/shell/rail-preferences.provider';

const ALL_FILTER = 'all';

const STORE_SKELETON_KEYS = [
  'plugins-skeleton-1',
  'plugins-skeleton-2',
  'plugins-skeleton-3',
  'plugins-skeleton-4',
] as const;

const ROW_GRID_CLASS = 'grid gap-x-6 gap-y-1 md:grid-cols-2';

function isAppOpenable(app: PluginAppEntry): boolean {
  return app.state === 'installed' || app.state === 'pinned';
}

/**
 * Plugins at `/:orgSlug/~/plugins` (#5502): the native apps a member installs
 * into their own setup. Installing is a presentation preference;
 * organization, subscription and release access still decide what the member
 * can open, and the server rechecks every new piece of work. Apps switched off
 * for the platform or not released to the organization are not listed.
 */
export default function OrganizationPluginsPage() {
  const translate = useTranslations('common.plugins');
  const translateRail = useTranslations('common.appRail');
  const { selectedBrand, settings, settingsLoading } = useBrand();
  const { flags, isConfigured } = useFeatureFlagContext();
  const { orgSlug } = useOrgUrl();
  const installedApps = useInstalledApps();
  const { pinnedAppIds, togglePin } = useRailPreferencesContext();
  const [failedActions, setFailedActions] = useState<
    Partial<Record<NativeSecondaryAppId, 'install' | 'uninstall'>>
  >({});
  const [filter, setFilter] = useState<PluginFilterId>(ALL_FILTER);
  const [searchQuery, setSearchQuery] = useState('');
  const brandSlug = selectedBrand?.slug?.trim() || undefined;
  const isLoading = settingsLoading || installedApps.status === 'loading';

  const apps = useMemo<PluginAppEntry[]>(
    () =>
      APP_RAIL_REGISTRY.flatMap((app) => {
        const appId = app.id;
        if (
          !isNativeSecondaryAppId(appId) ||
          !app.organizationModule ||
          !isAppRailItemEnabled(app, flags, isConfigured)
        ) {
          return [];
        }
        const state = resolveNativeAppAvailability({
          appId,
          installedAppIds: installedApps.installedAppIds,
          organizationAccess: resolveOrganizationModulePresentationAccess(
            settingsLoading ? null : settings,
            app.organizationModule,
            flags,
          ),
          pinnedAppIds,
        });
        if (state === 'unreleased') {
          return [];
        }
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
      }),
    [
      brandSlug,
      flags,
      installedApps.installedAppIds,
      isConfigured,
      orgSlug,
      pinnedAppIds,
      settings,
      settingsLoading,
      translateRail,
    ],
  );

  // Only categories that hold an app the member can see are offered, so a
  // category that is empty for this member never shows up as a filter.
  const filterIds = useMemo<PluginFilterId[]>(
    () =>
      PLUGIN_CATEGORY_IDS.filter((categoryId) =>
        apps.some(
          (app) => PLUGIN_APP_CATALOG[app.appId].category === categoryId,
        ),
      ),
    [apps],
  );
  const activeFilter = filterIds.some((filterId) => filterId === filter)
    ? filter
    : ALL_FILTER;

  const visibleApps = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return apps.filter(
      (app) =>
        (activeFilter === ALL_FILTER ||
          PLUGIN_APP_CATALOG[app.appId].category === activeFilter) &&
        (term === '' ||
          app.label.toLowerCase().includes(term) ||
          app.description.toLowerCase().includes(term)),
    );
  }, [activeFilter, apps, searchQuery]);

  // No per-member app usage is recorded anywhere, so "most used" cannot be
  // computed. Installed apps the member can open come first, pinned ones
  // before the rest, then in the order they were installed.
  const installedRows = useMemo(() => {
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
  // The catalog lists what is left to add, plus apps the member installed but
  // cannot open right now, so their access note stays visible.
  const catalogApps = useMemo(
    () => visibleApps.filter((app) => !installedRows.includes(app)),
    [installedRows, visibleApps],
  );

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

  const renderRow = (app: PluginAppEntry) => (
    <PluginAppRow
      key={app.appId}
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
    />
  );

  const filterFacets: FilterMenuFacet[] = [
    {
      defaultValue: ALL_FILTER,
      key: 'category',
      label: translate('filters.category'),
      onChange: (value) =>
        setFilter(
          filterIds.find((filterId) => filterId === value) ?? ALL_FILTER,
        ),
      options: [
        { label: translate('filterAll'), value: ALL_FILTER },
        ...filterIds.map((filterId) => ({
          label: translate(`categories.${filterId}`),
          value: filterId,
        })),
      ],
      selection: 'single',
      value: activeFilter,
    },
  ];

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Puzzle}
      search={
        <FormSearchbar
          ariaLabel={translate('search')}
          className="w-48 sm:w-64"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={translate('search')}
          size={ComponentSize.SM}
          value={searchQuery}
        />
      }
      filters={
        filterIds.length > 1 ? (
          <FilterMenu
            allLabel={translate('filterAll')}
            clearLabel={translate('filters.clear')}
            facets={filterFacets}
            getActiveCountLabel={(count) =>
              translate('filters.activeCount', { count })
            }
            label={translate('filters.menu')}
            onClear={() => setFilter(ALL_FILTER)}
          />
        ) : undefined
      }
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
          title={translate('catalogTitle')}
        >
          <div className={ROW_GRID_CLASS} data-testid="plugins-apps">
            {STORE_SKELETON_KEYS.map((key) => (
              <SkeletonCard
                key={key}
                label={translate('loadingApp')}
                showImage={false}
              />
            ))}
          </div>
        </CollectionSection>
      ) : (
        <div className="flex flex-col gap-8">
          <CollectionSection
            data-testid="plugins-installed"
            itemCount={installedRows.length}
            title={translate('installedTitle')}
          >
            <div className={ROW_GRID_CLASS}>{installedRows.map(renderRow)}</div>
          </CollectionSection>

          <div className="flex flex-col gap-8" data-testid="plugins-apps">
            {PLUGIN_CATEGORY_IDS.map((categoryId) => {
              const categoryApps = catalogApps.filter(
                (app) => PLUGIN_APP_CATALOG[app.appId].category === categoryId,
              );
              return (
                <CollectionSection
                  key={categoryId}
                  data-testid={`plugins-category-${categoryId}`}
                  itemCount={categoryApps.length}
                  title={translate(`categories.${categoryId}`)}
                >
                  <div className={ROW_GRID_CLASS}>
                    {categoryApps.map(renderRow)}
                  </div>
                </CollectionSection>
              );
            })}
          </div>

          {visibleApps.length === 0 ? (
            <p
              className="px-1 text-sm text-muted-foreground"
              data-testid="plugins-empty"
            >
              {translate('noMatches')}
            </p>
          ) : null}
        </div>
      )}

      {isWorkflowLibraryShown ? (
        <CollectionSection itemCount={1} title={translate('workflowsTitle')}>
          <Card
            bodyClassName="flex flex-col gap-3"
            data-testid="plugins-workflows"
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
    </AdminPageShell>
  );
}

function PluginAppRow({
  app,
  failedAction,
  isPending,
  isPinned,
  manageModulesHref,
  onInstall,
  onTogglePin,
  onUninstall,
  subscriptionHref,
}: PluginAppRowProps) {
  const translate = useTranslations('common.plugins');
  const translateRail = useTranslations('common.appRail');
  const isOpenable = isAppOpenable(app);
  const isLocked = !isOpenable && app.state !== 'not-installed';

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
      data-app-state={app.state}
      data-locked={isLocked}
      data-testid={`plugins-app-${app.appId}`}
    >
      <PluginAppThumbnail
        appId={app.appId}
        icon={app.icon}
        label={app.label}
        size="compact"
      />
      <div
        className={isLocked ? 'min-w-0 flex-1 opacity-60' : 'min-w-0 flex-1'}
      >
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {app.label}
          </p>
          {isPinned && isOpenable ? (
            <Badge variant="primary">{translate('pinned')}</Badge>
          ) : null}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {app.description}
        </p>
        <PluginAppAccessNote
          manageModulesHref={manageModulesHref}
          state={app.state}
          subscriptionHref={subscriptionHref}
        />
        {failedAction ? (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {translate(
              failedAction === 'install' ? 'installFailed' : 'uninstallFailed',
              { app: app.label },
            )}
          </p>
        ) : null}
      </div>

      <CollectionItemActions
        primary={
          isOpenable ? (
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
          ) : (
            <Button
              ariaLabel={`${translate('install')} ${app.label}`}
              isDisabled={isPending || isLocked}
              onClick={() => onInstall(app.appId)}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              {translate('install')}
            </Button>
          )
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
  );
}

function PluginAppAccessNote({
  manageModulesHref,
  state,
  subscriptionHref,
}: PluginAppAccessNoteProps) {
  const translate = useTranslations('common.plugins');
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
