'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/contracts';
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
import type { PluginAppEntry } from '@genfeedai/props/plugins/organization-plugins-page.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionView from '@ui/collection/CollectionView';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  APP_RAIL_REGISTRY,
  getAppRailHref,
  isAppRailItemEnabled,
} from '@ui/shell/app-rail/app-rail.registry';
import { Puzzle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import PluginAppAccessNote from '@/components/plugins/PluginAppAccessNote';
import PluginAppActions from '@/components/plugins/PluginAppActions';
import PluginAppCard from '@/components/plugins/PluginAppCard';
import PluginAppDetailsPanel from '@/components/plugins/PluginAppDetailsPanel';
import { PLUGIN_APP_CATALOG } from '@/components/plugins/plugin-app-catalog';
import { isPluginAppOpenable } from '@/components/plugins/plugin-app-state';
import { useInstalledApps } from '@/components/shell/installed-apps.provider';
import { useRailPreferencesContext } from '@/components/shell/rail-preferences.provider';

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
  const [searchQuery, setSearchQuery] = useState('');
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
            description: translate(`apps.${appId}.description`),
            highlights: [
              translate(`apps.${appId}.highlightOne`),
              translate(`apps.${appId}.highlightTwo`),
              translate(`apps.${appId}.highlightThree`),
            ],
            icon: app.icon,
            isInstalled: installedApps.installedAppIds.includes(appId),
            label: translateRail(app.label),
            openHref: getAppRailHref(app, {
              brandAwareSlug: brandSlug,
              orgSlug,
            }),
            state,
            summary: translate(`apps.${appId}.summary`),
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
      translate,
      translateRail,
    ],
  );

  const visibleApps = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return apps.filter(
      (app) =>
        term === '' ||
        app.label.toLowerCase().includes(term) ||
        app.description.toLowerCase().includes(term) ||
        app.summary.toLowerCase().includes(term),
    );
  }, [apps, searchQuery]);

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
      .filter((app) => app.isInstalled && isPluginAppOpenable(app))
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

  const selectedApp =
    visibleApps.find((app) => app.appId === selectedAppId) ?? null;
  const getCategoryLabel = (app: PluginAppEntry): string =>
    translate(`categories.${PLUGIN_APP_CATALOG[app.appId].category}`);
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
  const getItemProps = (app: PluginAppEntry) => ({
    actions: renderActions(app),
    app,
    categoryLabel: getCategoryLabel(app),
    isSelected: app.appId === selectedApp?.appId,
    onSelect: setSelectedAppId,
  });
  const failedApps = apps.filter((app) => failedActions[app.appId]);
  const sections = [
    {
      apps: installedRows,
      id: 'installed',
      title: translate('installedTitle'),
    },
    {
      apps: catalogApps,
      id: 'available',
      title: translate('availableTitle'),
    },
  ];

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Puzzle}
      search={
        <FormSearchbar
          ariaLabel={translate('search')}
          isCollapsible
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={translate('search')}
          size={ComponentSize.SM}
          value={searchQuery}
        />
      }
    >
      {installedApps.status === 'error' ? (
        <p className="text-sm text-destructive" role="alert">
          {translate('loadFailed')}
        </p>
      ) : isLoading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label={translate('loadingApp')}
        >
          <CollectionView<PluginAppEntry>
            getItemKey={(app) => app.appId}
            isLoading
            items={[]}
            maxColumns={3}
            renderGridItem={() => null}
            renderListItem={() => null}
            view={ViewType.GRID}
          />
        </div>
      ) : visibleApps.length > 0 ? (
        <div className="flex flex-col gap-8" data-testid="plugins-browser">
          {failedApps.map((app) => (
            <p
              className="text-sm text-destructive"
              key={app.appId}
              role="alert"
            >
              {translate(
                failedActions[app.appId] === 'install'
                  ? 'installFailed'
                  : 'uninstallFailed',
                { app: app.label },
              )}
            </p>
          ))}
          {sections.map((section) => (
            <CollectionSection
              data-testid={`plugins-section-${section.id}`}
              isCountVisible
              itemCount={section.apps.length}
              key={section.id}
              title={section.title}
            >
              {section.apps.length > 0 ? (
                <CollectionGrid maxColumns={3}>
                  {section.apps.map((app) => (
                    <PluginAppCard key={app.appId} {...getItemProps(app)} />
                  ))}
                </CollectionGrid>
              ) : null}
            </CollectionSection>
          ))}
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
            onClick={() => setSearchQuery('')}
          >
            {translate('clearSearch')}
          </Button>
        </div>
      )}
      <PluginAppDetailsPanel
        accessNote={
          selectedApp ? (
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
          ) : null
        }
        actions={selectedApp ? renderActions(selectedApp) : null}
        app={selectedApp}
        categoryLabel={selectedApp ? getCategoryLabel(selectedApp) : ''}
        onClose={() => setSelectedAppId(null)}
      >
        {selectedApp?.appId === 'automation' && isWorkflowLibraryShown ? (
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
      </PluginAppDetailsPanel>
    </AdminPageShell>
  );
}
