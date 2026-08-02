'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import PublishLayoutContent from './publish-layout-content';

export default function PublishLayout({ children }: LayoutProps) {
  return (
    // PostHog flag key stays `posts` — the route rename must not repoint the
    // gate at a flag that does not exist in the dashboard.
    <FeatureGate flagKey="posts">
      <PublishLayoutContent>{children}</PublishLayoutContent>
    </FeatureGate>
  );
}
