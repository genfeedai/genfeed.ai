'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/contracts';
import type { LayoutProps } from '@props/layout/layout.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { ErrorBoundary } from '@ui/display/error-boundary/ErrorBoundary';
import Container from '@ui/layout/container/Container';
import FormDateRangePicker from '@ui/primitives/date-range-picker';
import { ChartColumn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AnalyticsWorkSurfaceAdapter, {
  AnalyticsScopedExportButton,
} from '@/../app/(protected)/[orgSlug]/[brandSlug]/analytics/_surface/analytics-work-surface-adapter';

function OrgAnalyticsLayoutContent({ children }: LayoutProps) {
  const {
    dateRange,
    isRefreshing,
    searchNode,
    setDateRange,
    toolbarNode,
    triggerRefresh,
  } = useAnalyticsContext();
  const translate = useTranslations('pages.analytics.layout');

  return (
    <Container
      label={translate('organization.title')}
      icon={ChartColumn}
      leading={searchNode}
      refresh={
        <ButtonRefresh onClick={triggerRefresh} isRefreshing={isRefreshing} />
      }
      iconActions={<AnalyticsScopedExportButton />}
      right={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {toolbarNode}
          <FormDateRangePicker
            onChange={setDateRange}
            defaultPreset={Timeframe.D7}
            value={dateRange}
          />
        </div>
      }
    >
      <ErrorBoundary
        presentation="inline"
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
    <AnalyticsWorkSurfaceAdapter>
      <OrgAnalyticsLayoutContent>{children}</OrgAnalyticsLayoutContent>
    </AnalyticsWorkSurfaceAdapter>
  );
}
