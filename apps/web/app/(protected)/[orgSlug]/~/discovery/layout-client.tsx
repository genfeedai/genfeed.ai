'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import { DiscoveryRemixProvider } from '@/features/research/remix/DiscoveryRemixProvider';
import RemixBriefInspector from '@/features/research/remix/RemixBriefInspector';
import { ResearchWorkSurfaceProvider } from '@/features/research/work-surface/ResearchWorkSurfaceProvider';
import ResearchWorkspaceSurfaceAdapter from '@/features/research/work-surface/ResearchWorkspaceSurfaceAdapter';
import { DiscoveryOrgBrandGate } from './discovery-org-brand-gate';

export default function OrganizationDiscoverLayout({ children }: LayoutProps) {
  return (
    <ResearchWorkSurfaceProvider>
      <DiscoveryRemixProvider>
        <ResearchWorkspaceSurfaceAdapter />
        <RemixBriefInspector />
        <DiscoveryOrgBrandGate>{children}</DiscoveryOrgBrandGate>
      </DiscoveryRemixProvider>
    </ResearchWorkSurfaceProvider>
  );
}
