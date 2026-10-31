'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import AnalyticsOrganizationsList from '@protected/organizations/analytics-organizations-list';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import DateRangePicker from '@ui/primitives/date-range-picker';
import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The organization's Settings tab: release preview, released apps, settings. */
function getReleaseAccessHref(organizationId: string): string {
  return `${APP_ROUTES.ADMIN.ORGANIZATIONS}/${organizationId}/settings`;
}

function AdminOrganizationsLandingContent() {
  const translate = useTranslations('pages.adminOrganizations');
  const { setDateRange, triggerRefresh, isRefreshing, searchNode } =
    useAnalyticsContext();

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Building2}
      onRefresh={triggerRefresh}
      isRefreshing={isRefreshing}
      search={searchNode}
      dropdowns={
        <DateRangePicker onChange={setDateRange} defaultPreset={Timeframe.D7} />
      }
    >
      <AnalyticsOrganizationsList getReleaseAccessHref={getReleaseAccessHref} />
    </AdminPageShell>
  );
}

/**
 * `/admin/organizations` is the organizations list. The live product page is
 * this analytics table; each row links to `/admin/organizations/:id`, where the
 * organization's analytics and settings are tabs.
 *
 * The list publishes its search (with the sort menu attached inside it) to the
 * subbar through `searchNode`, so this route owns an `AdminPageShell` (without
 * the analytics tab bar) that renders it beside the date range and refresh.
 */
export default function AdminOrganizationsLanding() {
  return (
    <AnalyticsProvider>
      <AdminOrganizationsLandingContent />
    </AnalyticsProvider>
  );
}
