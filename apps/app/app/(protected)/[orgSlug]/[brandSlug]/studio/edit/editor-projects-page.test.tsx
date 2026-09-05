import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from '@/lib/analytics';
import EditorProjectsPage from './editor-projects-page';

const mocks = vi.hoisted(() => ({
  captureAnalyticsEvent: vi.fn(),
  deleteProject: vi.fn(),
  findAll: vi.fn(),
  getEditorService: vi.fn(),
  loggerError: vi.fn(),
  notificationError: vi.fn(),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mocks.notificationError }),
  },
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

vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  captureAnalyticsEvent: mocks.captureAnalyticsEvent,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: {
    children?: ReactNode;
    'aria-label'?: string;
    href: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a {...props} href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
    description,
    label,
  }: {
    children?: ReactNode;
    className?: string;
    description?: ReactNode;
    label?: ReactNode;
  }) => (
    <section className={className}>
      {label ? <h4>{label}</h4> : null}
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    label,
    right,
  }: {
    children?: ReactNode;
    label?: string;
    right?: ReactNode;
  }) => (
    <main>
      <h1>{label}</h1>
      {right}
      {children}
    </main>
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

    expect(mocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.STUDIO_EDITOR_OPENED,
      { surface: 'index' },
    );
    expect(await screen.findByText('Your Projects (2)')).toBeVisible();
    expect(screen.getByText('Launch cut')).toBeVisible();
    expect(
      screen
        .getByRole('link', { name: 'Open Launch cut' })
        .querySelector('button'),
    ).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Delete project' })[0].closest('a'),
    ).toBeNull();
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
      '/acme/~/studio/edit/new',
    );
    expect(screen.getByText('Timeline Editor')).toBeVisible();
    expect(screen.getByText('Effects & Transitions')).toBeVisible();

    unmount();
    mocks.findAll.mockRejectedValueOnce(new Error('offline'));
    render(<EditorProjectsPage />);
    expect(await screen.findByText('Failed to load projects')).toBeVisible();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to load editor projects',
      expect.any(Error),
    );

    mocks.findAll.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByText('Create Your First Project')).toBeVisible();
  });

  it('keeps the project and reports a failed deletion', async () => {
    const deleteError = new Error('offline');
    mocks.findAll.mockResolvedValue([
      {
        id: 'project-1',
        name: 'Launch cut',
        status: 'draft',
        tracks: [],
        updatedAt: new Date().toISOString(),
      },
    ]);
    mocks.deleteProject.mockRejectedValue(deleteError);

    render(<EditorProjectsPage />);
    expect(await screen.findByText('Launch cut')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to delete editor project',
        { error: deleteError, projectId: 'project-1' },
      );
      expect(mocks.notificationError).toHaveBeenCalledWith(
        'Failed to delete project',
      );
    });
    expect(screen.getByText('Launch cut')).toBeVisible();
  });
});
