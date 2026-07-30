'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

/**
 * Library surface layout. Navigation (Overview / Assets / Mood board / …)
 * is owned by the shell nav panel in app-protected-layout — not portaled
 * from here — so the sidebar never mounts empty.
 */
export default function LibraryLayout({ children }: LayoutProps) {
  return <FeatureGate flagKey="library">{children}</FeatureGate>;
}
