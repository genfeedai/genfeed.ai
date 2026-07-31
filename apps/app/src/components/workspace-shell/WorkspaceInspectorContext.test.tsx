import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useRegisterWorkspaceInspector,
  useWorkspaceInspector,
  WORKSPACE_INSPECTOR_OPEN_STORAGE_KEY,
  WorkspaceInspectorProvider,
} from './WorkspaceInspectorContext';

function InspectorProbe(): ReactElement {
  const inspector = useWorkspaceInspector();

  return (
    <>
      <output data-testid="inspector-state">
        {inspector
          ? `${inspector.isRegistered ? 'registered' : 'unregistered'}:${inspector.isOpen ? 'open' : 'closed'}`
          : 'missing'}
      </output>
      <button type="button" onClick={inspector?.toggle}>
        Toggle inspector
      </button>
    </>
  );
}

function InspectorRegistration(): null {
  useRegisterWorkspaceInspector();
  return null;
}

describe('WorkspaceInspectorContext', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('tracks mounted inspector registrations and shared collapse state', async () => {
    const view = render(
      <WorkspaceInspectorProvider>
        <InspectorProbe />
        <InspectorRegistration />
      </WorkspaceInspectorProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('inspector-state')).toHaveTextContent(
        'registered:open',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Toggle inspector' }));
    expect(screen.getByTestId('inspector-state')).toHaveTextContent(
      'registered:closed',
    );
    expect(
      window.localStorage.getItem(WORKSPACE_INSPECTOR_OPEN_STORAGE_KEY),
    ).toBe('false');

    view.rerender(
      <WorkspaceInspectorProvider>
        <InspectorProbe />
      </WorkspaceInspectorProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('inspector-state')).toHaveTextContent(
        'unregistered:closed',
      );
    });
  });

  it('restores a closed inspector preference after remount', async () => {
    window.localStorage.setItem(WORKSPACE_INSPECTOR_OPEN_STORAGE_KEY, 'false');

    render(
      <WorkspaceInspectorProvider>
        <InspectorProbe />
        <InspectorRegistration />
      </WorkspaceInspectorProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('inspector-state')).toHaveTextContent(
        'registered:closed',
      );
    });
  });

  it('stays optional outside the protected shell provider', () => {
    render(<InspectorProbe />);

    expect(screen.getByTestId('inspector-state')).toHaveTextContent('missing');
  });
});
