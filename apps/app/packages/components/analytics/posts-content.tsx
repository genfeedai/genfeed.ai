'use client';

import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import AnalyticsPostsList from '@pages/analytics/posts-list/analytics-posts-list';
import { DiscoveryRemixProvider } from '@pages/research/remix/DiscoveryRemixProvider';

export default function PostsContent() {
  return (
    <DiscoveryRemixProvider>
      <RemixBriefInspector />
      <AnalyticsPostsList />
    </DiscoveryRemixProvider>
  );
}
