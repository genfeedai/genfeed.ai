import { render, screen, waitFor } from '@testing-library/react';
import { type ReactElement, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useActiveWorkspaceSurfaceAdapter,
  useWorkspaceSurfaceSelection,
  WorkspaceSurfaceAdapterProvider,
  WorkspaceSurfaceAdapterRegistration,
  type WorkspaceSurfaceAdapterRegistration as WorkspaceSurfaceAdapterRegistrationContract,
} from './WorkspaceSurfaceAdapterContext';

const scope = vi.hoisted(() => ({
  brandId: 'brand-1',
  organizationId: 'org-1',
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => scope,
}));

const REGISTRATION = Object.freeze({
  canonicalFallback: 'same-route',
  description: 'Existing dashboard',
  key: 'brand-workspace-overview',
  managementMode: 'canonical-route',
  scope: 'brand',
  supportedReferenceKinds: Object.freeze(['post']),
  title: 'Brand Workspace overview',
} as const satisfies WorkspaceSurfaceAdapterRegistrationContract);

function AdapterProbe(): ReactElement {
  const adapter = useActiveWorkspaceSurfaceAdapter();
  return (
    <output data-testid="active-adapter">
      {adapter
        ? `${adapter.registration.key}:${adapter.organizationId}:${adapter.brandId}:${adapter.artifactReferences.length}`
        : 'none'}
    </output>
  );
}

function SelectionProbe(): null {
  const selection = useWorkspaceSurfaceSelection();

  useEffect(() => {
    selection?.setArtifactReferences([
      {
        brandId: 'brand-1',
        kind: 'post',
        organizationId: 'org-1',
        recordId: 'post-1',
        serializer: 'post',
      },
      {
        brandId: 'brand-forged',
        kind: 'post',
        organizationId: 'org-1',
        recordId: 'post-forged',
        serializer: 'post',
      },
      {
        brandId: 'brand-1',
        kind: 'asset',
        organizationId: 'org-1',
        recordId: 'asset-not-supported',
        serializer: 'asset',
      },
    ]);
  }, [selection]);

  return null;
}

describe('WorkspaceSurfaceAdapterContext', () => {
  beforeEach(() => {
    scope.brandId = 'brand-1';
    scope.organizationId = 'org-1';
  });

  it('registers a route-owned adapter and keeps only in-scope supported references', async () => {
    render(
      <WorkspaceSurfaceAdapterProvider>
        <AdapterProbe />
        <WorkspaceSurfaceAdapterRegistration registration={REGISTRATION}>
          <SelectionProbe />
        </WorkspaceSurfaceAdapterRegistration>
      </WorkspaceSurfaceAdapterProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-adapter')).toHaveTextContent(
        'brand-workspace-overview:org-1:brand-1:1',
      );
    });
  });

  it('does not activate a brand adapter without canonical brand scope', () => {
    scope.brandId = '';

    render(
      <WorkspaceSurfaceAdapterProvider>
        <AdapterProbe />
        <WorkspaceSurfaceAdapterRegistration registration={REGISTRATION}>
          <div>Canonical dashboard remains rendered</div>
        </WorkspaceSurfaceAdapterRegistration>
      </WorkspaceSurfaceAdapterProvider>,
    );

    expect(screen.getByTestId('active-adapter')).toHaveTextContent('none');
    expect(
      screen.getByText('Canonical dashboard remains rendered'),
    ).toBeInTheDocument();
  });
});
