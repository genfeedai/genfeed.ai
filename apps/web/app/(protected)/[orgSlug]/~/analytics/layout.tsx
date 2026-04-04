'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/enums';
import type { LayoutProps } from '@props/layout/layout.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { ErrorBoundary } from '@ui/error';
import FormDateRangePicker from '@ui/forms/pickers/date-range-picker/form-date-range-picker/FormDateRangePicker';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import Container from '@ui/layout/container/Container';
import { HiOutlineChartBar } from 'react-icons/hi2';

function OrgAnalyticsLayoutContent({ children }: LayoutProps) {
  const { setDateRange, triggerRefresh, isRefreshing } = useAnalyticsContext();

  return (
    <Container
      label="Organization Analytics"
      description="Aggregate analytics across all brands"
      icon={HiOutlineChartBar}
      right={
        <div className="flex items-center gap-2">
          <FormDateRangePicker
            onChange={setDateRange}
            defaultPreset={Timeframe.D7}
          />
          <ButtonRefresh onClick={triggerRefresh} isRefreshing={isRefreshing} />
        </div>
      }
    >
      <ErrorBoundary
        title="Analytics Error"
        description="Failed to load organization analytics."
      >
        {children}
      </ErrorBoundary>
    </Container>
  );
}

export default function OrgAnalyticsLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="analytics">
      <AnalyticsProvider>
        <OrgAnalyticsLayoutContent>{children}</OrgAnalyticsLayoutContent>
      </AnalyticsProvider>
    </FeatureGate>
  );
}
