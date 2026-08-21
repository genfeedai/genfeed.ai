'use client';

import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import ResearchWorkspaceSurfaceAdapter from '@app-components/research/work-surface/ResearchWorkspaceSurfaceAdapter';
import { DiscoverRemixProvider } from '@pages/research/remix/DiscoverRemixProvider';
import { ResearchWorkSurfaceProvider } from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

export default function DiscoverLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="discover">
      <ResearchWorkSurfaceProvider>
        <DiscoverRemixProvider>
          <ResearchWorkspaceSurfaceAdapter />
          <RemixBriefInspector />
          {children}
        </DiscoverRemixProvider>
      </ResearchWorkSurfaceProvider>
    </FeatureGate>
  );
}
