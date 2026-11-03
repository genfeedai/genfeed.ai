'use client';

import ProvisionConciergeDialog from '@app/(protected)/admin/organizations/components/concierge/provision-concierge-dialog';
import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { ButtonVariant, Timeframe } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import AnalyticsOrganizationsList from '@protected/organizations/analytics-organizations-list';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Button } from '@ui/primitives/button';
import DateRangePicker from '@ui/primitives/date-range-picker';
import { Building2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** The organization's Settings tab: release preview, released apps, settings. */
function getReleaseAccessHref(organizationId: string): string {
  return `${APP_ROUTES.ADMIN.ORGANIZATIONS}/${organizationId}/settings`;
}

function AdminOrganizationsLandingContent() {
  const translate = useTranslations('pages.adminOrganizations');
  const conciergeT = useTranslations('pages.warmupAccounts');
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const { setDateRange, triggerRefresh, isRefreshing, searchNode } =
    useAnalyticsContext();

  return (
    <>
      <AdminPageShell
        title={translate('title')}
        icon={Building2}
        onRefresh={triggerRefresh}
        isRefreshing={isRefreshing}
        search={searchNode}
        dateRange={
          <DateRangePicker
            onChange={setDateRange}
            defaultPreset={Timeframe.D7}
          />
        }
        primaryAction={
          <Button
            icon={<Plus />}
            label={conciergeT('provision')}
            onClick={() => setIsProvisionOpen(true)}
            variant={ButtonVariant.DEFAULT}
          />
        }
      >
        <AnalyticsOrganizationsList
          getReleaseAccessHref={getReleaseAccessHref}
        />
      </AdminPageShell>
      <ProvisionConciergeDialog
        isOpen={isProvisionOpen}
        onClose={() => setIsProvisionOpen(false)}
        onProvisioned={triggerRefresh}
      />
    </>
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
