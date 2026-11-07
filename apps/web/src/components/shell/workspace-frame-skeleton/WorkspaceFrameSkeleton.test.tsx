// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceFrameSkeleton from './WorkspaceFrameSkeleton';

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/main/workspace/overview',
}));

describe('WorkspaceFrameSkeleton', () => {
  it('announces the load once, as one status with the given label', () => {
    render(<WorkspaceFrameSkeleton label="Loading your workspace" />);

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(
      screen.getByRole('status', { name: 'Loading your workspace' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('prints no loading copy on screen', () => {
    render(<WorkspaceFrameSkeleton label="Loading your workspace" />);

    expect(
      screen.queryByText('Loading your workspace'),
    ).not.toBeInTheDocument();
  });
});
