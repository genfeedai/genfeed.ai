'use client';

import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import AnalyticsOutliers from '@pages/analytics/outliers/analytics-outliers';
import { DiscoveryRemixProvider } from '@pages/research/remix/DiscoveryRemixProvider';

export default function OutliersContent() {
  return (
    <DiscoveryRemixProvider>
      <RemixBriefInspector />
      <AnalyticsOutliers />
    </DiscoveryRemixProvider>
  );
}
