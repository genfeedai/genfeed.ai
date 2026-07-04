'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { APP_ROUTES } from '@genfeedai/constants';
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
