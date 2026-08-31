'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import PublishingLayoutContent from './publishing-layout-content';

export default function PublishingLayout({ children }: LayoutProps) {
  return (
    // PostHog flag key stays `posts` — the route rename must not repoint the
    // gate at a flag that does not exist in the dashboard.
    <FeatureGate flagKey="posts">
      <PublishingLayoutContent>{children}</PublishingLayoutContent>
    </FeatureGate>
  );
}
