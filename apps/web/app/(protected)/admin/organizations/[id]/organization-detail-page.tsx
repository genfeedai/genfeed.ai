'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/contracts';
import { APP_ROUTES, isReleaseItemId } from '@genfeedai/contracts/constants';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import type { OrganizationDetailPageProps } from '@genfeedai/props/admin/organization-detail-page.props';
import EconomicsPeriodFilter from '@protected/economics/economics-period-filter';
import { DEFAULT_ECONOMICS_PERIOD_DAYS } from '@protected/economics/economics-report.util';
import { useUnitEconomicsReport } from '@protected/economics/organizations/use-unit-economics-report';
import OrganizationProfileHeader from '@protected/organizations/components/organization-profile-header';
import OrganizationReleaseGrants from '@protected/organizations/components/organization-release-grants';
import { OrganizationSettingsTable } from '@protected/organizations/components/organization-settings-table';
import OrganizationSpendingPanel from '@protected/organizations/components/organization-spending-panel';
import { useOrganizationProfile } from '@protected/organizations/hooks/use-organization-profile';
import { useOrganizationSettings } from '@protected/organizations/hooks/use-organization-settings';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Alert } from '@ui/primitives/alert';
import DateRangePicker from '@ui/primitives/date-range-picker';
import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import LearningReportPanel from '@/features/admin/learning/learning-report-panel';
import { useLearningReport } from '@/features/admin/learning/use-learning-report';
import AnalyticsOrganizationOverview from '@/features/analytics/organization-overview/analytics-organization-overview';
import { readRouteParam } from '@/lib/route-params';

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

  const isLearningTab = activeTab === 'learning';
  const learning = useLearningReport({
    isEnabled: isLearningTab,
    organizationId: organizationId ?? '',
  });
  const isSpendingTab = activeTab === 'spending';
  const [spendingPeriodDays, setSpendingPeriodDays] = useState(
    DEFAULT_ECONOMICS_PERIOD_DAYS,
  );
  const spending = useUnitEconomicsReport({
    isEnabled: isSpendingTab && Boolean(organizationId),
    organizationId,
    periodDays: spendingPeriodDays,
  });

  // Every branch declares the same chrome mode so the topbar never flips
  // between the missing-id and loaded states.
  if (!organizationId) {
    return (
      <AdminPageShell title={translate('detailTitle')} icon={Building2}>
        <Alert variant="warning">{translate('missingId')}</Alert>
      </AdminPageShell>
    );
  }

  const isSettingsTab = activeTab === 'settings';
  const handleSpendingPeriodChange = (days: string) => {
    setSpendingPeriodDays(days);
    spending.resetPage();
  };

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
            href: `${APP_ROUTES.ADMIN.ORGANIZATIONS}/${organizationId}/spending`,
            label: translate('spendingTab'),
          },
          {
            href: `${APP_ROUTES.ADMIN.ORGANIZATIONS}/${organizationId}/learning`,
            label: translate('learningTab'),
          },
          {
            href: `${APP_ROUTES.ADMIN.ORGANIZATIONS}/${organizationId}/settings`,
            label: translate('settingsTab'),
          },
        ],
      }}
      onRefresh={
        isSettingsTab
          ? () => refresh()
          : isLearningTab
            ? () => void learning.refetch()
            : isSpendingTab
              ? () => void spending.refetch()
              : triggerRefresh
      }
      isRefreshing={
        isSettingsTab
          ? isRefreshing
          : isLearningTab
            ? learning.isFetching
            : isSpendingTab
              ? spending.isFetching && !spending.isLoading
              : isAnalyticsRefreshing
      }
      filters={
        isSettingsTab || isLearningTab ? undefined : isSpendingTab ? (
          <EconomicsPeriodFilter
            onChange={handleSpendingPeriodChange}
            value={spendingPeriodDays}
          />
        ) : (
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
            <Alert variant="destructive">
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
        ) : isLearningTab ? (
          <LearningReportPanel
            hasOrganization
            isError={learning.isError}
            isLoading={learning.isLoading}
            onRetry={() => void learning.refetch()}
            report={learning.data}
          />
        ) : isSpendingTab ? (
          <OrganizationSpendingPanel
            error={spending.error}
            isLoading={spending.isLoading}
            onSortChange={spending.onSortChange}
            report={spending.data}
            sortDirection={spending.sortDirection}
            sortKey={spending.sortKey}
          />
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
 * One organization: its analytics at `/admin/organizations/:id`, its revenue,
 * cost and margin at `/admin/organizations/:id/spending`, its prompt slot
 * learning report at `/admin/organizations/:id/learning` and its settings
 * (release preview, released apps, per-organization settings) at
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
