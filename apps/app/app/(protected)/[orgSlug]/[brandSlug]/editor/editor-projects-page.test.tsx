import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorProjectsPage from './editor-projects-page';

const mocks = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  findAll: vi.fn(),
  getEditorService: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => 'brand-1',
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getEditorService,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/~${path}`,
  }),
}));

vi.mock('@services/editor/editor-projects.service', () => ({
  EditorProjectsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
  }: {
    children?: ReactNode;
    href: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <main className={className}>{children}</main>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    label,
    onClick,
    type = 'button',
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    label?: ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    type?: 'button' | 'submit';
  }) => (
    <button aria-label={ariaLabel} type={type} onClick={onClick}>
      {label ?? children}
    </button>
  ),
}));

describe('EditorProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEditorService.mockResolvedValue({
      delete: mocks.deleteProject,
      findAll: mocks.findAll,
    });
  });

  it('loads video editor projects and deletes a project from the list', async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60_000).toISOString();

    mocks.findAll.mockResolvedValue([
      {
        id: 'project-1',
        name: 'Launch cut',
        settings: { format: 'portrait' },
        status: 'draft',
        tracks: [{ id: 'track-1' }, { id: 'track-2' }],
        updatedAt: thirtyMinutesAgo,
      },
      {
        id: 'project-2',
        name: 'Teaser edit',
        status: 'ready',
        tracks: [],
        updatedAt: twoDaysAgo,
      },
    ]);
    mocks.deleteProject.mockResolvedValue(undefined);

    render(<EditorProjectsPage />);

    expect(await screen.findByText('Your Projects (2)')).toBeVisible();
    expect(screen.getByText('Launch cut')).toBeVisible();
    expect(screen.getByText('30m ago')).toBeVisible();
    expect(screen.getByText('2d ago')).toBeVisible();
    expect(screen.getByText('2 tracks')).toBeVisible();
    expect(screen.getByText('portrait')).toBeVisible();
    expect(screen.getByText('landscape')).toBeVisible();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Delete project' })[0],
    );
    await waitFor(() => {
      expect(mocks.deleteProject).toHaveBeenCalledWith('project-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Launch cut')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Teaser edit')).toBeVisible();
  });

  it('renders empty and error states with retry', async () => {
    mocks.findAll.mockResolvedValueOnce([]);

    const { unmount } = render(<EditorProjectsPage />);
    expect(await screen.findByText('Create Your First Project')).toBeVisible();
    expect(screen.getByText('Start New Project')).toHaveAttribute(
      'href',
      '/acme/~/editor/new',
    );
    expect(screen.getByText('Timeline Editor')).toBeVisible();
    expect(screen.getByText('Effects & Transitions')).toBeVisible();

    unmount();
    mocks.findAll.mockRejectedValueOnce(new Error('offline'));
    render(<EditorProjectsPage />);
    expect(await screen.findByText('Failed to load projects')).toBeVisible();

    mocks.findAll.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByText('Create Your First Project')).toBeVisible();
  });
});
