import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useActiveWorkspaceSurfacePresentationAdapter,
  WorkspaceSurfaceAdapterProvider,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import {
  BrandWorkspaceOverviewSurfaceAdapter,
  OrganizationWorkspaceOverviewSurfaceAdapter,
} from './workspace-overview-surface-adapters';

const scope = vi.hoisted(() => ({
  brandId: 'brand-1',
  organizationId: 'organization-1',
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => scope,
}));

function PresentationProbe(): ReactElement {
  const adapter = useActiveWorkspaceSurfacePresentationAdapter();
  return (
    <output data-testid="presentation-adapter">
      {adapter ? `${adapter.surfaceKey}:${adapter.contextLabel}` : 'none'}
    </output>
  );
}

describe('Workspace overview surface adapters', () => {
  beforeEach(() => {
    scope.brandId = 'brand-1';
    scope.organizationId = 'organization-1';
  });

  it('registers the organization inspector under its independent route key', async () => {
    render(
      <WorkspaceSurfaceAdapterProvider>
        <PresentationProbe />
        <OrganizationWorkspaceOverviewSurfaceAdapter>
          <div>Organization dashboard</div>
        </OrganizationWorkspaceOverviewSurfaceAdapter>
      </WorkspaceSurfaceAdapterProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('presentation-adapter')).toHaveTextContent(
        'organization-overview:Organization Workspace overview',
      );
    });
  });

  it('keeps the brand inspector registered under the brand overview key', async () => {
    render(
      <WorkspaceSurfaceAdapterProvider>
        <PresentationProbe />
        <BrandWorkspaceOverviewSurfaceAdapter>
          <div>Brand dashboard</div>
        </BrandWorkspaceOverviewSurfaceAdapter>
      </WorkspaceSurfaceAdapterProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('presentation-adapter')).toHaveTextContent(
        'workspace-overview:Brand Workspace overview',
      );
    });
  });
});
