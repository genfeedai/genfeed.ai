'use client';

import ResearchWorkspaceSurfaceAdapter from '@app-components/research/work-surface/ResearchWorkspaceSurfaceAdapter';
import { ResearchWorkSurfaceProvider } from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';

export default function ResearchLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="research">
      <ResearchWorkSurfaceProvider>
        <ResearchWorkspaceSurfaceAdapter />
        {children}
      </ResearchWorkSurfaceProvider>
    </FeatureGate>
  );
}
