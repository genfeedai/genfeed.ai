'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

// `orchestration` is the remote feature-flag key, not a route reference. It stays
// spelled that way until the flag is renamed in the provider; renaming it here
// first would gate every cloud user out of Automation.
export default function AutomationLayout({ children }: LayoutProps) {
  return <FeatureGate flagKey="orchestration">{children}</FeatureGate>;
}
