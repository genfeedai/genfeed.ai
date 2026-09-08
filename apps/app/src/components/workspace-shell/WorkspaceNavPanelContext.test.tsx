import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';
import {
  useWorkspaceNavPanel,
  WorkspaceNavPanelProvider,
  WorkspaceNavPanelTarget,
} from './WorkspaceNavPanelContext';

function ConversationList() {
  const panel = useWorkspaceNavPanel();
  return (
    <>
      {panel?.portalTargets.map((target, index) =>
        createPortal(
          <nav aria-label="Conversations">Selected customer</nav>,
          target,
          String(index),
        ),
      )}
    </>
  );
}

function Shell({ mobile }: { mobile: boolean }) {
  return (
    <StrictMode>
      <WorkspaceNavPanelProvider>
        <div data-testid="desktop">
          <WorkspaceNavPanelTarget />
        </div>
        {mobile ? (
          <div data-testid="mobile" hidden>
            <WorkspaceNavPanelTarget />
          </div>
        ) : null}
        <ConversationList />
      </WorkspaceNavPanelProvider>
    </StrictMode>
  );
}

describe('workspace navigation portals', () => {
  it('keeps desktop content visible when a hidden mobile target mounts or unmounts', () => {
    const { rerender } = render(<Shell mobile />);
    expect(
      within(screen.getByTestId('desktop')).getByRole('navigation', {
        name: 'Conversations',
      }),
    ).toHaveTextContent('Selected customer');
    expect(
      within(screen.getByTestId('mobile')).getByRole('navigation', {
        hidden: true,
      }),
    ).toHaveTextContent('Selected customer');
    rerender(<Shell mobile={false} />);
    expect(
      screen.getAllByRole('navigation', { name: 'Conversations' }),
    ).toHaveLength(1);
    rerender(<Shell mobile />);
    expect(
      within(screen.getByTestId('desktop')).getByRole('navigation', {
        name: 'Conversations',
      }),
    ).toBeVisible();
  });
});
