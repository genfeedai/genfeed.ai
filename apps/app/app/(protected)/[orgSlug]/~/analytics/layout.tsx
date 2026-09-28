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
import { useTranslations } from 'next-intl';
import AnalyticsWorkSurfaceAdapter, {
  AnalyticsScopedExportButton,
} from '@/../app/(protected)/[orgSlug]/[brandSlug]/analytics/_surface/analytics-work-surface-adapter';

function OrgAnalyticsLayoutContent({ children }: LayoutProps) {
  const { dateRange, setDateRange, toolbarNode, triggerRefresh, isRefreshing } =
    useAnalyticsContext();
  const translate = useTranslations('pages.analytics.layout');

  return (
    <Container
      label={translate('organization.title')}
      description={translate('organization.description')}
      icon={ChartColumn}
      right={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {toolbarNode}
          <AnalyticsScopedExportButton />
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
        title={translate('errorTitle')}
        description={translate('organization.errorDescription')}
      >
        {children}
      </ErrorBoundary>
    </Container>
  );
}

export default function OrgAnalyticsLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="analytics">
      <AnalyticsWorkSurfaceAdapter>
        <OrgAnalyticsLayoutContent>{children}</OrgAnalyticsLayoutContent>
      </AnalyticsWorkSurfaceAdapter>
    </FeatureGate>
  );
}
