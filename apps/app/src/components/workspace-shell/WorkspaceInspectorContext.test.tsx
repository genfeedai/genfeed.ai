import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  useRegisterWorkspaceInspector,
  useWorkspaceInspector,
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

  it('stays optional outside the protected shell provider', () => {
    render(<InspectorProbe />);

    expect(screen.getByTestId('inspector-state')).toHaveTextContent('missing');
  });
});
