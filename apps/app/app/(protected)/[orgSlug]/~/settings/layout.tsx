'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

export default function SettingsRootLayout({ children }: LayoutProps) {
  return <FeatureGate flagKey="settings">{children}</FeatureGate>;
}
