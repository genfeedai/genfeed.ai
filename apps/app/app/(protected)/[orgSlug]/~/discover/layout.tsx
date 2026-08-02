'use client';

import ResearchWorkspaceSurfaceAdapter from '@app-components/research/work-surface/ResearchWorkspaceSurfaceAdapter';
import { ResearchWorkSurfaceProvider } from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { DiscoverOrgBrandGate } from './discover-org-brand-gate';

export default function OrganizationDiscoverLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="discover">
      <ResearchWorkSurfaceProvider>
        <ResearchWorkspaceSurfaceAdapter />
        <DiscoverOrgBrandGate>{children}</DiscoverOrgBrandGate>
      </ResearchWorkSurfaceProvider>
    </FeatureGate>
  );
}
