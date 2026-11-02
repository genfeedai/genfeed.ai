import '@testing-library/jest-dom/vitest';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from '@/lib/analytics';
import EditorProjectsPane from './EditorProjectsPane';

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
  searchParams: new URLSearchParams(),
  captureAnalyticsEvent: vi.fn(),
  deleteProject: vi.fn(),
  findAll: vi.fn(),
  getEditorService: vi.fn(),
  hasUnstableTranslator: false,
  loggerError: vi.fn(),
  notificationError: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/~/editor',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
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
    'data-testid': dataTestId,
    label,
  }: {
    children?: ReactNode;
    className?: string;
    'data-testid'?: string;
    description?: ReactNode;
    label?: ReactNode;
  }) => (
    <section className={className} data-testid={dataTestId}>
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
    leading,
    right,
  }: {
    children?: ReactNode;
    label?: string;
    leading?: ReactNode;
    right?: ReactNode;
  }) => (
    <main>
      <h1>{label}</h1>
      {leading}
      {right}
      {children}
    </main>
  ),
}));

describe('EditorProjectsPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );
    mocks.hasUnstableTranslator = false;
    mocks.searchParams = new URLSearchParams();
    localStorage.clear();
    mocks.getEditorService.mockResolvedValue({
      delete: mocks.deleteProject,
      findAll: mocks.findAll,
      update: mocks.updateProject,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists every project as a row that opens it, without previews', async () => {
    mocks.findAll.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        id: `project-${index}`,
        name: `Cut ${index}`,
        status: 'draft',
        tracks: [],
        thumbnailUrl: `https://cdn.example.com/cut-${index}.jpg`,
        updatedAt: `2026-10-0${index + 1}T12:00:00Z`,
      })),
    );
    render(<EditorProjectsPane />);

    const rows = within(
      await screen.findByTestId('editor-projects-all-collection'),
    );
    expect(rows.getAllByRole('link', { name: /^Open Cut/ })).toHaveLength(6);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('requests the server page from the URL and renders pagination', async () => {
    mocks.searchParams = new URLSearchParams('page=2');
    mocks.findAll.mockResolvedValue([
      {
        id: 'project-9',
        name: 'Older cut',
        status: 'draft',
        tracks: [],
        updatedAt: '2026-09-01T12:00:00Z',
      },
    ]);
    render(<EditorProjectsPane />);

    const all = within(
      await screen.findByTestId('editor-projects-all-collection'),
    );
    expect(all.getByRole('link', { name: 'Open Older cut' })).toBeVisible();
    expect(mocks.findAll).toHaveBeenCalledWith(
      { limit: ITEMS_PER_PAGE, page: 2 },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });

  it('searches projects on the server with the term in the URL', async () => {
    mocks.searchParams = new URLSearchParams('q=launch');
    mocks.findAll.mockResolvedValue([
      {
        id: 'project-1',
        name: 'Launch cut',
        status: 'draft',
        tracks: [],
        updatedAt: '2026-10-01T12:00:00Z',
      },
    ]);
    render(<EditorProjectsPane />);

    expect(await screen.findAllByText('Launch cut')).not.toHaveLength(0);
    expect(mocks.findAll).toHaveBeenCalledWith(
      { limit: ITEMS_PER_PAGE, page: 1, search: 'launch' },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('textbox', { name: 'Search projects' }),
    ).toHaveValue('launch');
  });

  it('says nothing matched instead of offering a first project', async () => {
    mocks.searchParams = new URLSearchParams('q=zzz');
    mocks.findAll.mockResolvedValue([]);
    render(<EditorProjectsPane />);

    expect(
      await screen.findByText('No projects match your search.'),
    ).toBeVisible();
    expect(screen.queryByText('No Editor projects yet')).toBeNull();
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

    render(<EditorProjectsPane />);

    expect(mocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.STUDIO_EDITOR_OPENED,
      { surface: 'index' },
    );
    expect(await screen.findByText('Your Projects (2)')).toBeVisible();
    const all = within(screen.getByTestId('editor-projects-all-collection'));
    expect(all.getByText('Launch cut')).toBeVisible();
    expect(
      all
        .getByRole('link', { name: 'Open Launch cut' })
        .querySelector('button'),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
    expect(all.getByText('30m ago')).toBeVisible();
    expect(all.getByText('2d ago')).toBeVisible();
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
    expect(screen.getByText('Teaser edit')).toBeVisible();
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
    render(<EditorProjectsPane />);
    await screen.findByText('Launch cut');
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for Launch cut' }),
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
    expect(await screen.findByText('Revised cut')).toBeVisible();
  });

  it('renders empty and error states with retry', async () => {
    mocks.findAll.mockResolvedValueOnce([]);

    const { unmount } = render(<EditorProjectsPane />);
    expect(await screen.findByText('No Editor projects yet')).toBeVisible();
    expect(
      screen.getByText('Start one on the left and it shows up here.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /new project/i }),
    ).not.toBeInTheDocument();

    unmount();
    mocks.findAll.mockRejectedValueOnce(new Error('offline'));
    render(<EditorProjectsPane />);
    expect(await screen.findByText('Failed to load projects')).toBeVisible();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to load editor projects',
      expect.any(Error),
    );

    mocks.findAll.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByText('No Editor projects yet')).toBeVisible();
  });

  it('loads projects once even when the translator identity changes', async () => {
    mocks.hasUnstableTranslator = true;
    mocks.findAll.mockRejectedValueOnce(new Error('offline'));

    const { rerender } = render(<EditorProjectsPane />);
    expect(await screen.findByText('Failed to load projects')).toBeVisible();
    rerender(<EditorProjectsPane />);

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

    render(<EditorProjectsPane />);
    expect(await screen.findByText('Launch cut')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'More actions for Launch cut' }),
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
    expect(screen.getByText('Launch cut')).toBeVisible();
  });
});
