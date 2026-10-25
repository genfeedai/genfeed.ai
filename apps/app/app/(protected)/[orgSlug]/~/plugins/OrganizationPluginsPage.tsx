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
  PluginAppActionsProps,
  PluginAppEntry,
  PluginAppStateProps,
  PluginFilterId,
  PluginStatusFilter,
} from '@genfeedai/props/plugins/organization-plugins-page.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import ListRow from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  APP_RAIL_REGISTRY,
  getAppRailHref,
  isAppRailItemEnabled,
} from '@ui/shell/app-rail/app-rail.registry';
import { Check, ChevronRight, LockKeyhole, Puzzle } from 'lucide-react';
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
  const { orgSlug } = useOrgUrl();
  return <OrganizationPluginsCatalog key={orgSlug} />;
}

function OrganizationPluginsCatalog() {
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
  const [statusFilter, setStatusFilter] = useState<PluginStatusFilter>('all');
  const [selectedAppId, setSelectedAppId] =
    useState<NativeSecondaryAppId | null>(null);
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
        (statusFilter === 'all' ||
          (statusFilter === 'installed'
            ? app.isInstalled && isAppOpenable(app)
            : statusFilter === 'available'
              ? app.state === 'not-installed'
              : !isAppOpenable(app) && app.state !== 'not-installed')) &&
        (term === '' ||
          app.label.toLowerCase().includes(term) ||
          app.description.toLowerCase().includes(term)),
    );
  }, [activeFilter, apps, searchQuery, statusFilter]);

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

  const orderedApps = [...installedRows, ...catalogApps];
  const selectedApp =
    orderedApps.find((app) => app.appId === selectedAppId) ?? orderedApps[0];
  const selectedCategory = selectedApp
    ? PLUGIN_APP_CATALOG[selectedApp.appId].category
    : undefined;
  const renderActions = (app: PluginAppEntry) => (
    <PluginAppActions
      app={app}
      isPending={installedApps.pendingAppIds.includes(app.appId)}
      isPinned={pinnedAppIds.includes(app.appId)}
      onInstall={(appId) => void runAction(appId, 'install')}
      onTogglePin={togglePin}
      onUninstall={(appId) => void runAction(appId, 'uninstall')}
    />
  );

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
        <Select
          value={activeFilter}
          onValueChange={(value) =>
            setFilter(filterIds.find((id) => id === value) ?? ALL_FILTER)
          }
        >
          <SelectTrigger
            aria-label={translate('filters.category')}
            className="h-8 w-40"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>
              {translate('allCategories')}
            </SelectItem>
            {filterIds.map((id) => (
              <SelectItem key={id} value={id}>
                {translate(`categories.${id}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      tabs={{
        activeTab: statusFilter,
        ariaLabel: translate('status.label'),
        fullWidth: false,
        items: [
          { id: 'all', label: translate('status.all') },
          { id: 'installed', label: translate('status.installed') },
          { id: 'available', label: translate('status.available') },
          { id: 'restricted', label: translate('status.restricted') },
        ],
        onTabChange: (value) => {
          if (
            value === 'all' ||
            value === 'installed' ||
            value === 'available' ||
            value === 'restricted'
          )
            setStatusFilter(value);
        },
      }}
    >
      {installedApps.status === 'error' ? (
        <p className="text-sm text-destructive" role="alert">
          {translate('loadFailed')}
        </p>
      ) : isLoading ? (
        <div
          className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"
          role="status"
          aria-busy="true"
          aria-label={translate('loadingApp')}
        >
          <SkeletonCard label={translate('loadingApp')} showImage={false} />
          <SkeletonCard label={translate('loadingApp')} />
        </div>
      ) : selectedApp ? (
        <div
          className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"
          data-testid="plugins-browser"
        >
          <nav
            className="max-h-60 overflow-y-auto rounded-card border border-border lg:sticky lg:top-4 lg:max-h-none"
            aria-label={translate('catalogTitle')}
            data-testid="plugins-apps"
          >
            {orderedApps.map((app) => (
              <ListRow
                key={app.appId}
                density="compact"
                ariaLabel={translate(
                  app.appId === selectedApp.appId ? 'selectedApp' : 'selectApp',
                  { app: app.label },
                )}
                onClick={() => setSelectedAppId(app.appId)}
                leading={
                  <app.icon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                }
                title={app.label}
                meta={<PluginAppState app={app} />}
                trailing={
                  app.appId === selectedApp.appId ? (
                    <Check className="size-4 text-foreground" aria-hidden />
                  ) : (
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  )
                }
                className={
                  app.appId === selectedApp.appId ? 'bg-accent' : undefined
                }
                data-testid={`plugins-app-${app.appId}`}
              />
            ))}
          </nav>
          <Card
            className="min-w-0"
            bodyClassName="gap-0 p-0"
            data-testid="plugins-app-detail"
          >
            <PluginAppThumbnail
              appId={selectedApp.appId}
              icon={selectedApp.icon}
              label={selectedApp.label}
              size="preview"
            />
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {selectedCategory
                      ? translate(`categories.${selectedCategory}`)
                      : null}
                  </p>
                  <h2 className="text-xl font-semibold">{selectedApp.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedApp.description}
                  </p>
                </div>
                {renderActions(selectedApp)}
              </div>
              <div className="border-t border-border pt-4">
                <PluginAppState app={selectedApp} />
                <PluginAppAccessNote
                  manageModulesHref={createOrganizationAppRoute(
                    orgSlug,
                    APP_ROUTES.SETTINGS.MODULES,
                  )}
                  state={selectedApp.state}
                  subscriptionHref={createOrganizationAppRoute(
                    orgSlug,
                    APP_ROUTES.SETTINGS.SUBSCRIPTION,
                  )}
                />
              </div>
              {selectedApp.appId === 'automation' && isWorkflowLibraryShown ? (
                <div data-testid="plugins-workflows">
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
                              APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES,
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
              ) : null}
              {failedActions[selectedApp.appId] ? (
                <p className="text-sm text-destructive" role="alert">
                  {translate(
                    failedActions[selectedApp.appId] === 'install'
                      ? 'installFailed'
                      : 'uninstallFailed',
                    { app: selectedApp.label },
                  )}
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : (
        <div
          className="flex flex-col items-center gap-3 py-12"
          data-testid="plugins-empty"
        >
          <p className="text-sm text-muted-foreground">
            {translate('noMatches')}
          </p>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={() => {
              setSearchQuery('');
              setFilter(ALL_FILTER);
              setStatusFilter('all');
            }}
          >
            {translate('filters.clear')}
          </Button>
        </div>
      )}
    </AdminPageShell>
  );
}

function PluginAppActions({
  app,
  isPending,
  isPinned,
  onInstall,
  onTogglePin,
  onUninstall,
}: PluginAppActionsProps) {
  const translate = useTranslations('common.plugins');
  const translateRail = useTranslations('common.appRail');
  const isOpenable = isAppOpenable(app);
  const isLocked = !isOpenable && app.state !== 'not-installed';

  return (
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
                      isDisabled: isPending,
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
  );
}

function PluginAppState({ app }: PluginAppStateProps) {
  const translate = useTranslations('common.plugins');
  const Icon = isAppOpenable(app)
    ? Check
    : app.state === 'not-installed'
      ? app.icon
      : LockKeyhole;
  const label =
    app.state === 'pinned'
      ? translate('pinned')
      : app.state === 'installed'
        ? translate('status.installed')
        : app.state === 'not-installed'
          ? translate('status.available')
          : app.state === 'organization-disabled'
            ? translate('organizationDisabled')
            : app.state === 'subscription-required'
              ? translate('subscriptionRequired')
              : translate('unavailable');
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      data-app-state={app.state}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {label}
    </span>
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
