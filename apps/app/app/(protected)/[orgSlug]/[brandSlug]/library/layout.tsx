'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import { createPortal } from 'react-dom';
import { useWorkspaceNavPanel } from '@/components/workspace-shell/WorkspaceNavPanelContext';
import LibrarySidebarNav from './library-sidebar-nav';

export default function LibraryLayout({ children }: LayoutProps) {
  const workspaceNavPanel = useWorkspaceNavPanel();

  return (
    <FeatureGate flagKey="library">
      {workspaceNavPanel?.portalTarget
        ? createPortal(<LibrarySidebarNav />, workspaceNavPanel.portalTarget)
        : null}
      {children}
    </FeatureGate>
  );
}
