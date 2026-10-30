'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { AlertCategory, Timeframe } from '@genfeedai/contracts';
import { APP_ROUTES, isReleaseItemId } from '@genfeedai/contracts/constants';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';
import OrganizationReleaseGrants from '@protected/organizations/components/organization-release-grants';
import { OrganizationSettingsTable } from '@protected/organizations/components/organization-settings-table';
import { useOrganizationSettings } from '@protected/organizations/hooks/use-organization-settings';
import Alert from '@ui/feedback/alert/Alert';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import DateRangePicker from '@ui/primitives/date-range-picker';
import { Building2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback } from 'react';
import { readRouteParam } from '@/lib/route-params';

function OrganizationDetailPageContent() {
  const translate = useTranslations('pages.adminOrganizations');
  const params = useRouteParams<{ id?: string | string[] }>();
  const organizationId = readRouteParam(params?.id);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab =
    searchParams.get('tab') === 'settings' ? 'settings' : 'analytics';

  const { settings, isLoading, isRefreshing, error, refresh, updateSettings } =
    useOrganizationSettings(organizationId);
  const {
    isRefreshing: isAnalyticsRefreshing,
    setDateRange,
    toolbarNode,
    triggerRefresh,
  } = useAnalyticsContext();

  // The tab is a query param, like every other filter on an admin page.
  const handleTabChange = useCallback(
    (tab: string) => {
      router.replace(
        tab === 'settings' ? `${pathname}?tab=settings` : pathname,
      );
    },
    [pathname, router],
  );

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
        activeTab,
        fullWidth: false,
        onTabChange: handleTabChange,
        tabs: [
          { id: 'analytics', label: translate('analyticsTab') },
          { id: 'settings', label: translate('settingsTab') },
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
    </AdminPageShell>
  );
}

/**
 * `/admin/organizations/:id`: one organization, with its analytics and its
 * settings (release preview, released apps, per-organization settings) as tabs.
 */
export default function OrganizationDetailPage() {
  return (
    <AnalyticsProvider>
      <Suspense fallback={null}>
        <OrganizationDetailPageContent />
      </Suspense>
    </AnalyticsProvider>
  );
}
