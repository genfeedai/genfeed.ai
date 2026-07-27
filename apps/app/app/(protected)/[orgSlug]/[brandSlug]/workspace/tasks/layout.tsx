'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

export default function TasksLayout({ children }: LayoutProps) {
  return <FeatureGate flagKey="tasks">{children}</FeatureGate>;
}
