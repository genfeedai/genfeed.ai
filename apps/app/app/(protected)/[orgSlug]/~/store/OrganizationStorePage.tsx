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
} from '@genfeedai/props/store/organization-store-page.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionSection from '@ui/collection/CollectionSection';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
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

const STORE_SKELETON_KEYS = [
  'store-skeleton-1',
  'store-skeleton-2',
  'store-skeleton-3',
] as const;

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
  const [failedActions, setFailedActions] = useState<
    Partial<Record<NativeSecondaryAppId, 'install' | 'uninstall'>>
  >({});
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
        pinnedAppIds: [],
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
    settings,
    translateRail,
  ]);

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

      <CollectionSection
        isLoading={isLoading}
        itemCount={apps.length}
        title={translate('appsTitle')}
      >
        <CollectionGrid data-testid="store-apps">
          {isLoading
            ? STORE_SKELETON_KEYS.map((key) => (
                <SkeletonCard
                  key={key}
                  label={translate('loadingApp')}
                  showImage={false}
                />
              ))
            : apps.map((app) => (
                <StoreAppCard
                  key={app.appId}
                  app={app}
                  failedAction={failedActions[app.appId] ?? null}
                  isPending={installedApps.pendingAppIds.includes(app.appId)}
                  manageModulesHref={createOrganizationAppRoute(
                    orgSlug,
                    APP_ROUTES.SETTINGS.ORGANIZATION,
                  )}
                  onInstall={(appId) => void runAction(appId, 'install')}
                  onUninstall={(appId) => void runAction(appId, 'uninstall')}
                  subscriptionHref={createOrganizationAppRoute(
                    orgSlug,
                    APP_ROUTES.SETTINGS.SUBSCRIPTION,
                  )}
                />
              ))}
        </CollectionGrid>
      </CollectionSection>

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
  manageModulesHref,
  onInstall,
  onUninstall,
  subscriptionHref,
}: StoreAppCardProps) {
  const translate = useTranslations('common.store');
  const Icon = app.icon;
  const isOpenable = app.state === 'installed' || app.state === 'pinned';

  return (
    <Card
      bodyClassName="flex h-full flex-col justify-between gap-4"
      className="h-full"
      data-testid={`store-app-${app.appId}`}
    >
      <div
        className="flex min-w-0 items-start gap-3"
        data-app-state={app.state}
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
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
          ) : app.state === 'not-installed' ? (
            <Button
              ariaLabel={`${translate('install')} ${app.label}`}
              isDisabled={isPending}
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
