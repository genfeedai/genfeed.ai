'use client';

import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import ResearchWorkspaceSurfaceAdapter from '@app-components/research/work-surface/ResearchWorkspaceSurfaceAdapter';
import { DiscoveryRemixProvider } from '@pages/research/remix/DiscoveryRemixProvider';
import { ResearchWorkSurfaceProvider } from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

export default function DiscoveryLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="discover">
      <ResearchWorkSurfaceProvider>
        <DiscoveryRemixProvider>
          <ResearchWorkspaceSurfaceAdapter />
          <RemixBriefInspector />
          {children}
        </DiscoveryRemixProvider>
      </ResearchWorkSurfaceProvider>
    </FeatureGate>
  );
}
