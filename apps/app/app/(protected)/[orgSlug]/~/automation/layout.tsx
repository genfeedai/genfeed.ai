'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

// `orchestration` is the remote feature-flag key, not a route reference — see the
// brand-scoped Automation layout for why it is not renamed alongside the route.
export default function OrganizationAutomationLayout({
  children,
}: LayoutProps) {
  return <FeatureGate flagKey="orchestration">{children}</FeatureGate>;
}
