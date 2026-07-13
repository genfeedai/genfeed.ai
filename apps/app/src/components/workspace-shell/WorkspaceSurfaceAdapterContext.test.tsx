import { render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it } from 'vitest';
import {
  useRegisterWorkspaceSurfaceAdapter,
  useWorkspaceSurfaceAdapter,
  WorkspaceSurfaceAdapterProvider,
} from './WorkspaceSurfaceAdapterContext';

function Registration() {
  const registration = useMemo(
    () => ({
      contextLabel: 'Studio · Image · v3',
      references: [],
      renderInspector: () => <p>Studio inspector</p>,
      scope: {
        brandId: 'brand-1',
        organizationId: 'organization-1',
      },
      surfaceKey: 'studio',
    }),
    [],
  );
  useRegisterWorkspaceSurfaceAdapter(registration);
  return null;
}

function Consumer() {
  const registration = useWorkspaceSurfaceAdapter();
  return (
    <div>
      <span>{registration?.contextLabel ?? 'No adapter'}</span>
      {registration?.renderInspector()}
    </div>
  );
}

describe('WorkspaceSurfaceAdapterContext', () => {
  it('exposes one product-owned adapter to the shell and clears it on unmount', () => {
    const { rerender } = render(
      <WorkspaceSurfaceAdapterProvider>
        <Registration />
        <Consumer />
      </WorkspaceSurfaceAdapterProvider>,
    );

    expect(screen.getByText('Studio · Image · v3')).toBeInTheDocument();
    expect(screen.getByText('Studio inspector')).toBeInTheDocument();

    rerender(
      <WorkspaceSurfaceAdapterProvider>
        <Consumer />
      </WorkspaceSurfaceAdapterProvider>,
    );

    expect(screen.getByText('No adapter')).toBeInTheDocument();
  });

  it('remains safe in the legacy route tree without a shell provider', () => {
    render(<Registration />);
    expect(screen.queryByText('Studio inspector')).toBeNull();
  });
});
