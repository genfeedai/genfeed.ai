'use client';

import { type ReactElement, type ReactNode, useMemo } from 'react';
import {
  useRegisterWorkspaceSurfacePresentationAdapter,
  WorkspaceSurfaceAdapterRegistration,
  type WorkspaceSurfaceAdapterRegistration as WorkspaceSurfaceAdapterRegistrationContract,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';

interface WorkspaceOverviewSurfaceAdapterProps {
  readonly children: ReactNode;
}

export const ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER = Object.freeze({
  canonicalFallback: 'same-route',
  description:
    'Organization metrics and brand performance from the existing overview dashboard.',
  key: 'organization-workspace-overview',
  managementMode: 'canonical-route',
  scope: 'organization',
  supportedReferenceKinds: Object.freeze([]),
  title: 'Organization Workspace overview',
} as const satisfies WorkspaceSurfaceAdapterRegistrationContract);

export const BRAND_WORKSPACE_OVERVIEW_ADAPTER = Object.freeze({
  canonicalFallback: 'same-route',
  description:
    'Brand tasks, runs, inbox, trends, and persisted OpenUI dashboard blocks.',
  key: 'brand-workspace-overview',
  managementMode: 'canonical-route',
  scope: 'brand',
  supportedReferenceKinds: Object.freeze(['article', 'ingredient', 'post']),
  title: 'Brand Workspace overview',
} as const satisfies WorkspaceSurfaceAdapterRegistrationContract);

export function OrganizationWorkspaceOverviewSurfaceAdapter({
  children,
}: WorkspaceOverviewSurfaceAdapterProps): ReactElement {
  const presentation = useMemo(
    () => ({
      contextLabel: ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER.title,
      inspector: (
        <div data-testid="workspace-surface-adapter-inspector">
          <p>{ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER.title}</p>
          <p>{ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER.description}</p>
        </div>
      ),
      surfaceKey: 'organization-overview',
    }),
    [],
  );
  useRegisterWorkspaceSurfacePresentationAdapter(presentation);

  return (
    <WorkspaceSurfaceAdapterRegistration
      registration={ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER}
    >
      {children}
    </WorkspaceSurfaceAdapterRegistration>
  );
}

export function BrandWorkspaceOverviewSurfaceAdapter({
  children,
}: WorkspaceOverviewSurfaceAdapterProps): ReactElement {
  const presentation = useMemo(
    () => ({
      contextLabel: BRAND_WORKSPACE_OVERVIEW_ADAPTER.title,
      inspector: (
        <div data-testid="workspace-surface-adapter-inspector">
          <p>{BRAND_WORKSPACE_OVERVIEW_ADAPTER.title}</p>
          <p>{BRAND_WORKSPACE_OVERVIEW_ADAPTER.description}</p>
        </div>
      ),
      surfaceKey: 'workspace-overview',
    }),
    [],
  );
  useRegisterWorkspaceSurfacePresentationAdapter(presentation);

  return (
    <WorkspaceSurfaceAdapterRegistration
      registration={BRAND_WORKSPACE_OVERVIEW_ADAPTER}
    >
      {children}
    </WorkspaceSurfaceAdapterRegistration>
  );
}
