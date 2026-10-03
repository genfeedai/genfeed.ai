'use client';

import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import AnalyticsOutliers from '@pages/analytics/outliers/analytics-outliers';
import BrandTopVideosSection from '@pages/analytics/outliers/brand-top-videos-section';
import { DiscoveryRemixProvider } from '@pages/research/remix/DiscoveryRemixProvider';

export default function OutliersContent() {
  return (
    <DiscoveryRemixProvider>
      <RemixBriefInspector />
      <div className="space-y-8">
        <BrandTopVideosSection />
        <AnalyticsOutliers />
      </div>
    </DiscoveryRemixProvider>
  );
}
