// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeBootRecord } from '@/lib/boot-record/boot-record';
import { createBootRecord } from '@/lib/boot-record/boot-record.fixture';
import WorkspaceFrameSkeleton from './WorkspaceFrameSkeleton';

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/main/workspace/overview',
}));

// The session has not answered yet: the moment this frame stands in for.
vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isLoaded: false, isSignedIn: false, userId: null }),
}));
vi.mock('@genfeedai/helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: () => null,
}));
vi.mock('./BootRecordRail', () => ({
  default: ({ record }: { record: { organizationSlug: string } }) => (
    <nav data-testid="boot-record-rail">{record.organizationSlug}</nav>
  ),
}));

function storeRecord(organizationSlug: string): void {
  writeBootRecord(createBootRecord({ organizationSlug }));
}

describe('WorkspaceFrameSkeleton', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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

  it('draws placeholders in the rail when nothing is stored', () => {
    render(<WorkspaceFrameSkeleton label="Loading your workspace" />);

    expect(screen.queryByTestId('boot-record-rail')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-frame-skeleton-rail')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it("draws the stored rail of this route's organization, reachable by assistive tech", async () => {
    storeRecord('acme');
    render(<WorkspaceFrameSkeleton label="Loading your workspace" />);

    expect(await screen.findByTestId('boot-record-rail')).toHaveTextContent(
      'acme',
    );
    expect(
      screen.getByTestId('workspace-frame-skeleton-rail'),
    ).not.toHaveAttribute('aria-hidden');
  });

  it("draws placeholders when the stored rail is another organization's", () => {
    storeRecord('other');
    render(<WorkspaceFrameSkeleton label="Loading your workspace" />);

    expect(screen.queryByTestId('boot-record-rail')).not.toBeInTheDocument();
  });
});
