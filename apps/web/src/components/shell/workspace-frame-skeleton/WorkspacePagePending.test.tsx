// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WorkspacePagePending from './WorkspacePagePending';

describe('WorkspacePagePending', () => {
  it('draws no placeholder blocks, so the page brings the only ones', () => {
    const { container } = render(<WorkspacePagePending label="Loading" />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      0,
    );
  });

  it('announces the wait once when it has a label', () => {
    render(<WorkspacePagePending label="Loading your workspace" />);

    expect(
      screen.getByRole('status', { name: 'Loading your workspace' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('announces nothing without a label, inside a frame that already does', () => {
    render(<WorkspacePagePending />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
