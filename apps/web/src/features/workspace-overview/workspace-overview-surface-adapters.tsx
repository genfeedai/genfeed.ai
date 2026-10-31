'use client';

import { type ReactElement, type ReactNode, useMemo } from 'react';
import {
  useRegisterWorkspaceSurfacePresentationAdapter,
  WorkspaceSurfaceAdapterRegistration,
  type WorkspaceSurfaceAdapterRegistration as WorkspaceSurfaceAdapterRegistrationContract,
  type WorkspaceSurfacePresentationAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';

interface WorkspaceOverviewSurfaceAdapterProps {
  readonly children: ReactNode;
}

export const ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER = Object.freeze({
  canonicalFallback: 'same-route',
  description: 'Metrics and performance across every brand in this workspace.',
  key: 'organization-workspace-overview',
  managementMode: 'canonical-route',
  scope: 'organization',
  supportedReferenceKinds: Object.freeze([]),
  title: 'Organization Workspace overview',
} as const satisfies WorkspaceSurfaceAdapterRegistrationContract);

export const BRAND_WORKSPACE_OVERVIEW_ADAPTER = Object.freeze({
  canonicalFallback: 'same-route',
  description: 'Tasks, activity, inbox, and trends for this brand.',
  key: 'brand-workspace-overview',
  managementMode: 'canonical-route',
  scope: 'brand',
  supportedReferenceKinds: Object.freeze(['article', 'ingredient', 'post']),
  title: 'Brand Workspace overview',
} as const satisfies WorkspaceSurfaceAdapterRegistrationContract);

export function OrganizationWorkspaceOverviewSurfaceAdapter({
  children,
}: WorkspaceOverviewSurfaceAdapterProps): ReactElement {
  const presentation = useMemo<WorkspaceSurfacePresentationAdapter>(
    () => ({
      contextLabel: ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER.title,
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
  const presentation = useMemo<WorkspaceSurfacePresentationAdapter>(
    () => ({
      contextLabel: BRAND_WORKSPACE_OVERVIEW_ADAPTER.title,
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
