'use client';

import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import ResearchWorkspaceSurfaceAdapter from '@app-components/research/work-surface/ResearchWorkspaceSurfaceAdapter';
import { DiscoveryRemixProvider } from '@pages/research/remix/DiscoveryRemixProvider';
import { ResearchWorkSurfaceProvider } from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { DiscoveryOrgBrandGate } from './discovery-org-brand-gate';

export default function OrganizationDiscoverLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="discover">
      <ResearchWorkSurfaceProvider>
        <DiscoveryRemixProvider>
          <ResearchWorkspaceSurfaceAdapter />
          <RemixBriefInspector />
          <DiscoveryOrgBrandGate>{children}</DiscoveryOrgBrandGate>
        </DiscoveryRemixProvider>
      </ResearchWorkSurfaceProvider>
    </FeatureGate>
  );
}
