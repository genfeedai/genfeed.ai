'use client';

import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import ResearchWorkspaceSurfaceAdapter from '@app-components/research/work-surface/ResearchWorkspaceSurfaceAdapter';
import type { LayoutProps } from '@props/layout/layout.props';
import { DiscoveryRemixProvider } from '@/features/research/remix/DiscoveryRemixProvider';
import { ResearchWorkSurfaceProvider } from '@/features/research/work-surface/ResearchWorkSurfaceProvider';

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
