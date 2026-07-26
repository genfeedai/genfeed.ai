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

interface AdapterInspectorProps {
  readonly description: string;
  readonly title: string;
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

// Mirrors the shell's own fallback inspector block so a registered adapter does
// not read as unstyled body text next to the surrounding context cards.
function AdapterInspector({
  description,
  title,
}: AdapterInspectorProps): ReactElement {
  return (
    <div
      className="gen-shell-empty-state p-4"
      data-testid="workspace-surface-adapter-inspector"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function OrganizationWorkspaceOverviewSurfaceAdapter({
  children,
}: WorkspaceOverviewSurfaceAdapterProps): ReactElement {
  const presentation = useMemo(
    () => ({
      contextLabel: ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER.title,
      inspector: (
        <AdapterInspector
          description={ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER.description}
          title={ORGANIZATION_WORKSPACE_OVERVIEW_ADAPTER.title}
        />
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
        <AdapterInspector
          description={BRAND_WORKSPACE_OVERVIEW_ADAPTER.description}
          title={BRAND_WORKSPACE_OVERVIEW_ADAPTER.title}
        />
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
