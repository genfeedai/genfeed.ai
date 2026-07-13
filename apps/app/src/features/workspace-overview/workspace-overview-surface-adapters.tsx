'use client';

import type { ReactElement, ReactNode } from 'react';
import {
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
  return (
    <WorkspaceSurfaceAdapterRegistration
      registration={BRAND_WORKSPACE_OVERVIEW_ADAPTER}
    >
      {children}
    </WorkspaceSurfaceAdapterRegistration>
  );
}
