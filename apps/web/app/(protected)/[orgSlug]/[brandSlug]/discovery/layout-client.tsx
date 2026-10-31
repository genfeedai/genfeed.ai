'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import { DiscoveryRemixProvider } from '@/features/research/remix/DiscoveryRemixProvider';
import RemixBriefInspector from '@/features/research/remix/RemixBriefInspector';
import { ResearchWorkSurfaceProvider } from '@/features/research/work-surface/ResearchWorkSurfaceProvider';
import ResearchWorkspaceSurfaceAdapter from '@/features/research/work-surface/ResearchWorkspaceSurfaceAdapter';

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
