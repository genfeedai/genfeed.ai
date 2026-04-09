'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/enums';
import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import DateRangePicker from '@ui/primitives/date-range-picker';
import { HiOutlineChartBar } from 'react-icons/hi2';

function AnalyticsLayoutContent({ children }: LayoutProps) {
  const { setDateRange, triggerRefresh, isRefreshing } = useAnalyticsContext();

  return (
    <Container
      label="Analytics"
      description="Track platform performance, usage statistics, and growth metrics"
      icon={HiOutlineChartBar}
      tabs={[
        { href: '/overview/analytics/all', label: 'Overview' },
        { href: '/overview/analytics/organizations', label: 'Organizations' },
        { href: '/overview/analytics/brands', label: 'Brands' },
        { href: '/overview/analytics/business', label: 'Business' },
      ]}
      right={
        <div className="flex items-center gap-2">
          <DateRangePicker
            onChange={setDateRange}
            defaultPreset={Timeframe.D7}
          />
          <ButtonRefresh onClick={triggerRefresh} isRefreshing={isRefreshing} />
        </div>
      }
    >
      {children}
    </Container>
  );
}

export default function AnalyticsLayout({ children }: LayoutProps) {
  return (
    <AnalyticsProvider>
      <AnalyticsLayoutContent>{children}</AnalyticsLayoutContent>
    </AnalyticsProvider>
  );
}
