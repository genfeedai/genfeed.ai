'use client';

import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import ResearchWorkspaceSurfaceAdapter from '@app-components/research/work-surface/ResearchWorkspaceSurfaceAdapter';
import type { LayoutProps } from '@props/layout/layout.props';
import { DiscoveryRemixProvider } from '@/features/research/remix/DiscoveryRemixProvider';
import { ResearchWorkSurfaceProvider } from '@/features/research/work-surface/ResearchWorkSurfaceProvider';
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
