'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { LayoutProps } from '@props/layout/layout.props';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import DateRangePicker from '@ui/primitives/date-range-picker';
import { ChartColumn } from 'lucide-react';

function AnalyticsLayoutContent({ children }: LayoutProps) {
  const { setDateRange, triggerRefresh, isRefreshing, toolbarNode } =
    useAnalyticsContext();

  return (
    <AdminPageShell
      title="Analytics"
      icon={ChartColumn}
      tabs={{
        fullWidth: false,
        tabs: [
          { href: APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ALL, label: 'Overview' },
          {
            href: APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS,
            label: 'Organizations',
          },
          { href: APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BRANDS, label: 'Brands' },
          {
            href: APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
            label: 'Business',
          },
        ],
      }}
      onRefresh={triggerRefresh}
      isRefreshing={isRefreshing}
      dropdowns={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {toolbarNode}
          <DateRangePicker
            onChange={setDateRange}
            defaultPreset={Timeframe.D7}
          />
        </div>
      }
    >
      {children}
    </AdminPageShell>
  );
}

export default function AnalyticsLayout({ children }: LayoutProps) {
  return (
    <AnalyticsProvider>
      <AnalyticsLayoutContent>{children}</AnalyticsLayoutContent>
    </AnalyticsProvider>
  );
}
