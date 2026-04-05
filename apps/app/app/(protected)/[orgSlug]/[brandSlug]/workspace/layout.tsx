'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

export default function WorkspaceLayout({ children }: LayoutProps) {
  return <FeatureGate flagKey="workspace">{children}</FeatureGate>;
}
