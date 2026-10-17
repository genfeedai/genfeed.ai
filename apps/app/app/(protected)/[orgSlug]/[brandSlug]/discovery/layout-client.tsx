'use client';

import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import ResearchWorkspaceSurfaceAdapter from '@app-components/research/work-surface/ResearchWorkspaceSurfaceAdapter';
import { DiscoveryRemixProvider } from '@pages/research/remix/DiscoveryRemixProvider';
import { ResearchWorkSurfaceProvider } from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import type { LayoutProps } from '@props/layout/layout.props';

export default function DiscoveryLayout({ children }: LayoutProps) {
  return (
    <ResearchWorkSurfaceProvider>
      <DiscoveryRemixProvider>
        <ResearchWorkspaceSurfaceAdapter />
        <RemixBriefInspector />
        {children}
      </DiscoveryRemixProvider>
    </ResearchWorkSurfaceProvider>
  );
}
