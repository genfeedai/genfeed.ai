'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/contracts';
import type { LayoutProps } from '@props/layout/layout.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { ErrorBoundary } from '@ui/error';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import Container from '@ui/layout/container/Container';
import FormDateRangePicker from '@ui/primitives/date-range-picker';
import { ChartColumn } from 'lucide-react';

import AnalyticsWorkSurfaceAdapter from './_surface/analytics-work-surface-adapter';

function AnalyticsLayoutContent({ children }: LayoutProps) {
  const { dateRange, setDateRange, triggerRefresh, isRefreshing } =
    useAnalyticsContext();

  return (
    <Container
      label="Analytics"
      description="Track your brand performance, content analytics, and growth metrics"
      icon={ChartColumn}
      right={
        <div className="flex items-center gap-2">
          <FormDateRangePicker
            onChange={setDateRange}
            defaultPreset={Timeframe.D7}
            value={dateRange}
          />
          <ButtonRefresh onClick={triggerRefresh} isRefreshing={isRefreshing} />
        </div>
      }
    >
      <ErrorBoundary
        title="Analytics Error"
        description="Failed to load analytics."
      >
        {children}
      </ErrorBoundary>
    </Container>
  );
}

export default function AnalyticsLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="analytics">
      <AnalyticsWorkSurfaceAdapter>
        <AnalyticsLayoutContent>{children}</AnalyticsLayoutContent>
      </AnalyticsWorkSurfaceAdapter>
    </FeatureGate>
  );
}
