'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/contracts';
import type { LayoutProps } from '@props/layout/layout.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { ErrorBoundary } from '@ui/error';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import Container from '@ui/layout/container/Container';
import FormDateRangePicker from '@ui/primitives/date-range-picker';
import { ChartColumn } from 'lucide-react';

function OrgAnalyticsLayoutContent({ children }: LayoutProps) {
  const { setDateRange, toolbarNode, triggerRefresh, isRefreshing } =
    useAnalyticsContext();

  return (
    <Container
      label="Organization Analytics"
      description="Aggregate analytics across all brands"
      icon={ChartColumn}
      right={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {toolbarNode}
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
