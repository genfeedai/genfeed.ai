'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/contracts';
import type { LayoutProps } from '@props/layout/layout.props';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import DateRangePicker from '@ui/primitives/date-range-picker';
import { ChartColumn } from 'lucide-react';

function AnalyticsLayoutContent({ children }: LayoutProps) {
  const {
    isRefreshing,
    searchNode,
    setDateRange,
    toolbarNode,
    triggerRefresh,
  } = useAnalyticsContext();

  return (
    <AdminPageShell
      title="Analytics"
      icon={ChartColumn}
      onRefresh={triggerRefresh}
      isRefreshing={isRefreshing}
      search={searchNode}
      filters={
        <>
          {toolbarNode}
          <DateRangePicker
            onChange={setDateRange}
            defaultPreset={Timeframe.D7}
          />
        </>
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
