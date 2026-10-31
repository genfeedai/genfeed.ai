'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { AlertCategory, Timeframe } from '@genfeedai/contracts';
import { APP_ROUTES, isReleaseItemId } from '@genfeedai/contracts/constants';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import OrganizationProfileHeader from '@protected/organizations/components/organization-profile-header';
import OrganizationReleaseGrants from '@protected/organizations/components/organization-release-grants';
import { OrganizationSettingsTable } from '@protected/organizations/components/organization-settings-table';
import { useOrganizationProfile } from '@protected/organizations/hooks/use-organization-profile';
import { useOrganizationSettings } from '@protected/organizations/hooks/use-organization-settings';
import Alert from '@ui/feedback/alert/Alert';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import DateRangePicker from '@ui/primitives/date-range-picker';
import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import AnalyticsOrganizationOverview from '@/features/analytics/organization-overview/analytics-organization-overview';
import { readRouteParam } from '@/lib/route-params';

interface OrganizationDetailPageProps {
  activeTab: 'analytics' | 'settings';
}

function OrganizationDetailPageContent({
  activeTab,
}: OrganizationDetailPageProps) {
  const translate = useTranslations('pages.adminOrganizations');
  const params = useRouteParams<{ id?: string | string[] }>();
  const organizationId = readRouteParam(params?.id);

  const { settings, isLoading, isRefreshing, error, refresh, updateSettings } =
    useOrganizationSettings(organizationId);
  const { data: profile, isLoading: isProfileLoading } =
    useOrganizationProfile(organizationId);
  const {
    isRefreshing: isAnalyticsRefreshing,
    setDateRange,
    toolbarNode,
    triggerRefresh,
  } = useAnalyticsContext();

  // Every branch declares the same chrome mode so the topbar never flips
  // between the missing-id and loaded states.
  if (!organizationId) {
    return (
      <AdminPageShell title={translate('detailTitle')} icon={Building2}>
        <Alert type={AlertCategory.WARNING}>{translate('missingId')}</Alert>
      </AdminPageShell>
    );
  }

  const isSettingsTab = activeTab === 'settings';

  return (
    <AdminPageShell
      title={translate('detailTitle')}
      icon={Building2}
      tabs={{
        fullWidth: false,
        tabs: [
          {
            href: `${APP_ROUTES.ADMIN.ORGANIZATIONS}/${organizationId}`,
            label: translate('analyticsTab'),
          },
          {
            href: `${APP_ROUTES.ADMIN.ORGANIZATIONS}/${organizationId}/settings`,
            label: translate('settingsTab'),
          },
        ],
      }}
      onRefresh={isSettingsTab ? () => refresh() : triggerRefresh}
      isRefreshing={isSettingsTab ? isRefreshing : isAnalyticsRefreshing}
      filters={
        isSettingsTab ? undefined : (
          <>
            {toolbarNode}
            <DateRangePicker
              onChange={setDateRange}
              defaultPreset={Timeframe.D7}
            />
          </>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <OrganizationProfileHeader
          isLoading={isProfileLoading}
          profile={profile}
        />
        {isSettingsTab ? (
          error ? (
            <Alert type={AlertCategory.ERROR}>
              {translate('settingsLoadError')}
            </Alert>
          ) : (
            <>
              {settings ? (
                <OrganizationReleaseGrants
                  hasOrganizationBilling={
                    settings.hasOrganizationBilling !== false
                  }
                  isReleasePreviewEnabled={
                    settings.isReleasePreviewEnabled === true
                  }
                  moduleOverrides={settings.moduleOverrides ?? {}}
                  releasedItemIds={(settings.releasedItemIds ?? []).filter(
                    isReleaseItemId,
                  )}
                  onModuleOverridesChange={(moduleOverrides) =>
                    updateSettings({ moduleOverrides })
                  }
                  onReleasedItemIdsChange={(releasedItemIds) =>
                    updateSettings({ releasedItemIds })
                  }
                />
              ) : null}
              <OrganizationSettingsTable
                settings={settings}
                isLoading={isLoading}
                organizationId={organizationId}
                onUpdate={refresh}
              />
            </>
          )
        ) : (
          <AnalyticsOrganizationOverview
            organizationId={organizationId}
            basePath={APP_ROUTES.ADMIN.ROOT}
          />
        )}
      </div>
    </AdminPageShell>
  );
}

/**
 * One organization: its analytics at `/admin/organizations/:id` and its
 * settings (release preview, released apps, per-organization settings) at
 * `/admin/organizations/:id/settings`, as route tabs.
 */
export default function OrganizationDetailPage({
  activeTab,
}: OrganizationDetailPageProps) {
  return (
    <AnalyticsProvider>
      <Suspense fallback={null}>
        <OrganizationDetailPageContent activeTab={activeTab} />
      </Suspense>
    </AnalyticsProvider>
  );
}
