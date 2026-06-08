'use client';

import { AnalyticsProvider } from '@contexts/analytics/analytics-context';
import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import Container from '@ui/layout/container/Container';

export default function OrgOverviewLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="analytics">
      <AnalyticsProvider>
        <Container>{children}</Container>
      </AnalyticsProvider>
    </FeatureGate>
  );
}
