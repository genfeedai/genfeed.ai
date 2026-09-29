import '@testing-library/jest-dom/vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from '@/lib/analytics';
import EditorProjectsPage from './editor-projects-page';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => {
      const translate = translateFromCatalog(namespace);
      // Real next-intl hands back a new translator when messages resolve
      // after mount; the flag reproduces that identity change.
      return mocks.hasUnstableTranslator
        ? (((...args: Parameters<typeof translate>) =>
            translate(...args)) as typeof translate)
        : translate;
    },
  };
});

const mocks = vi.hoisted(() => ({
  captureAnalyticsEvent: vi.fn(),
  deleteProject: vi.fn(),
  findAll: vi.fn(),
  getEditorService: vi.fn(),
  hasUnstableTranslator: false,
  loggerError: vi.fn(),
  notificationError: vi.fn(),
  updateProject: vi.fn(),
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
    mocks.hasUnstableTranslator = false;
    localStorage.clear();
    mocks.getEditorService.mockResolvedValue({
      delete: mocks.deleteProject,
      findAll: mocks.findAll,
      update: mocks.updateProject,
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
    const all = within(screen.getByTestId('editor-projects-all'));
    expect(all.getByText('Launch cut')).toBeVisible();
    expect(
      all
        .getByRole('link', { name: 'Open Launch cut' })
        .querySelector('button'),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('editor-project-thumbnail-project-1'),
    ).not.toBeInTheDocument();
    expect(all.getByText('30m ago')).toBeVisible();
    expect(all.getByText('2d ago')).toBeVisible();
    await userEvent.click(all.getByRole('radio', { name: 'Grid' }));
    expect(
      screen.getByTestId('editor-project-thumbnail-project-1'),
    ).toBeVisible();
    expect(
      within(screen.getByTestId('editor-projects-recent')).queryByTestId(
        'editor-project-thumbnail-project-1',
      ),
    ).toBeNull();
    await userEvent.click(
      all.getByRole('button', { name: 'More actions for Launch cut' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete' }),
    );
    await waitFor(() => {
      expect(mocks.deleteProject).toHaveBeenCalledWith('project-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Launch cut')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Teaser edit')).toHaveLength(2);
  });

  it('renames from overflow and updates both collections', async () => {
    mocks.findAll.mockResolvedValue([
      {
        id: 'project-1',
        name: 'Launch cut',
        status: 'draft',
        tracks: [],
        updatedAt: new Date().toISOString(),
      },
    ]);
    mocks.updateProject.mockResolvedValue(undefined);
    render(<EditorProjectsPage />);
    await screen.findAllByText('Launch cut');
    fireEvent.pointerDown(
      screen.getAllByRole('button', { name: 'More actions for Launch cut' })[0],
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Rename' }),
    );
    await userEvent.clear(
      screen.getByRole('textbox', { name: 'Project name' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Project name' }),
      'Revised cut',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mocks.updateProject).toHaveBeenCalledWith('project-1', {
        name: 'Revised cut',
      }),
    );
    expect(await screen.findAllByText('Revised cut')).toHaveLength(2);
  });

  it('renders empty and error states with retry', async () => {
    mocks.findAll.mockResolvedValueOnce([]);

    const { unmount } = render(<EditorProjectsPage />);
    expect(await screen.findByText('Create Your First Project')).toBeVisible();
    expect(screen.getByText('Start New Project')).toHaveAttribute(
      'href',
      '/acme/~/studio/editor/new',
    );
    expect(
      screen.getAllByRole('link', { name: /new project/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Timeline Editor')).not.toBeInTheDocument();
    expect(screen.queryByText('Features')).not.toBeInTheDocument();

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

  it('loads projects once even when the translator identity changes', async () => {
    mocks.hasUnstableTranslator = true;
    mocks.findAll.mockRejectedValueOnce(new Error('offline'));

    const { rerender } = render(<EditorProjectsPage />);
    expect(await screen.findByText('Failed to load projects')).toBeVisible();
    rerender(<EditorProjectsPage />);

    expect(screen.getByText('Failed to load projects')).toBeVisible();
    expect(mocks.findAll).toHaveBeenCalledTimes(1);
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
    expect(await screen.findAllByText('Launch cut')).toHaveLength(2);
    await userEvent.click(
      screen.getAllByRole('button', { name: 'More actions for Launch cut' })[0],
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete' }),
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to delete editor project',
        { error: deleteError, projectId: 'project-1' },
      );
      expect(mocks.notificationError).toHaveBeenCalledWith(
        'Failed to delete project',
      );
    });
    expect(screen.getAllByText('Launch cut')).toHaveLength(2);
  });
});
