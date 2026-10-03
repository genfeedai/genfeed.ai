'use client';

import BrandTopVideosSection from '@app-components/analytics/top-videos/brand-top-videos-section';
import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import AnalyticsOutliers from '@pages/analytics/outliers/analytics-outliers';
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
