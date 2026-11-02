import { paginatedResponse } from '@app-tests/paginated-response';
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
import EditorProjectsList from './EditorProjectsList';

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
  publishContext: vi.fn(),
  searchParams: new URLSearchParams(),
  deleteProject: vi.fn(),
  findAll: vi.fn(),
  getEditorService: vi.fn(),
  hasUnstableTranslator: false,
  loggerError: vi.fn(),
  notificationError: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock(
  '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context',
  () => ({ useCreativeAppAgentContext: mocks.publishContext }),
);

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/~/editor',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({
    totals,
  }: {
    totals?: { totalDocs: number; totalPages: number };
  }) => (
    <nav
      aria-label="pagination"
      data-total-docs={totals?.totalDocs}
      data-total-pages={totals?.totalPages}
    />
  ),
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
    'data-testid': testId,
    description,
    label,
  }: {
    children?: ReactNode;
    className?: string;
    'data-testid'?: string;
    description?: ReactNode;
    label?: ReactNode;
  }) => (
    <section className={className} data-testid={testId}>
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
    refresh,
  }: {
    children?: ReactNode;
    label?: string;
    leading?: ReactNode;
    refresh?: ReactNode;
  }) => (
    <main>
      <h1>{label}</h1>
      {leading}
      {refresh}
      {children}
    </main>
  ),
}));

describe('EditorProjectsList', () => {
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
      findAllPage: mocks.findAll,
      update: mocks.updateProject,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists every project as one row that opens it', async () => {
    mocks.findAll.mockResolvedValue(
      paginatedResponse(
        Array.from({ length: 4 }, (_, index) => ({
          id: `project-${index}`,
          name: `Cut ${index}`,
          status: 'draft',
          tracks: [],
          updatedAt: `2026-10-0${index + 1}T12:00:00Z`,
        })),
        { totalDocs: 61, totalPages: 5 },
      ),
    );
    render(<EditorProjectsList />);

    const all = within(await screen.findByTestId('editor-projects-all'));
    expect(
      all.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual([
      '/acme/~/editor/project-0',
      '/acme/~/editor/project-1',
      '/acme/~/editor/project-2',
      '/acme/~/editor/project-3',
    ]);
    expect(all.getByRole('link', { name: /Cut 3/ })).toBeVisible();
  });

  it('tells the agent which projects are on screen once they have loaded', async () => {
    mocks.findAll.mockResolvedValue(
      paginatedResponse(
        [
          {
            id: 'project-1',
            name: 'Cut 1',
            status: 'draft',
            tracks: [],
            updatedAt: '2026-10-01T12:00:00Z',
          },
        ],
        { totalDocs: 61, totalPages: 5 },
      ),
    );
    render(<EditorProjectsList />);

    await screen.findByTestId('editor-projects-all');
    expect(mocks.publishContext).toHaveBeenLastCalledWith({
      app: 'editor',
      projects: [{ id: 'project-1', title: 'Cut 1' }],
    });
  });

  it('tells the agent nothing while the projects are still loading', () => {
    mocks.findAll.mockReturnValue(new Promise(() => undefined));
    render(<EditorProjectsList />);

    expect(mocks.publishContext).toHaveBeenLastCalledWith(null);
  });

  it('requests the server page from the URL and renders pagination', async () => {
    mocks.searchParams = new URLSearchParams('page=2');
    mocks.findAll.mockResolvedValue(
      paginatedResponse(
        [
          {
            id: 'project-9',
            name: 'Older cut',
            status: 'draft',
            tracks: [],
            updatedAt: '2026-09-01T12:00:00Z',
          },
        ],
        { totalDocs: 61, totalPages: 5 },
      ),
    );
    render(<EditorProjectsList />);

    const all = within(await screen.findByTestId('editor-projects-all'));
    expect(all.getByRole('link', { name: /Older cut/ })).toBeVisible();
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
    mocks.findAll.mockResolvedValue(
      paginatedResponse(
        [
          {
            id: 'project-1',
            name: 'Launch cut',
            status: 'draft',
            tracks: [],
            updatedAt: '2026-10-01T12:00:00Z',
          },
        ],
        { totalDocs: 61, totalPages: 5 },
      ),
    );
    render(<EditorProjectsList />);

    expect(await screen.findByText('Launch cut')).toBeVisible();
    expect(mocks.findAll).toHaveBeenCalledWith(
      { limit: ITEMS_PER_PAGE, page: 1, search: 'launch' },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('textbox', { name: 'Search projects' }),
    ).toHaveValue('launch');
  });

  it('says nothing matched instead of pointing at the prompt', async () => {
    mocks.searchParams = new URLSearchParams('q=zzz');
    mocks.findAll.mockResolvedValue(
      paginatedResponse([], { totalDocs: 61, totalPages: 5 }),
    );
    render(<EditorProjectsList />);

    expect(
      await screen.findByText('No projects match your search.'),
    ).toBeVisible();
    expect(screen.queryByText('No projects yet')).toBeNull();
  });

  it('shows the age and status of each project and deletes one from its menu', async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60_000).toISOString();

    mocks.findAll.mockResolvedValue(
      paginatedResponse(
        [
          {
            id: 'project-1',
            name: 'Launch cut',
            status: 'draft',
            tracks: [],
            updatedAt: thirtyMinutesAgo,
          },
          {
            id: 'project-2',
            name: 'Teaser edit',
            status: 'ready',
            tracks: [],
            updatedAt: twoDaysAgo,
          },
        ],
        { totalDocs: 61, totalPages: 5 },
      ),
    );
    mocks.deleteProject.mockResolvedValue(undefined);

    render(<EditorProjectsList />);

    const all = within(await screen.findByTestId('editor-projects-all'));
    expect(all.getByText('30m ago')).toBeVisible();
    expect(all.getByText('2d ago')).toBeVisible();
    expect(all.getByText('Draft')).toBeVisible();
    expect(all.getByText('Ready')).toBeVisible();
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

  it('renames from the row menu and updates the list', async () => {
    mocks.findAll.mockResolvedValue(
      paginatedResponse(
        [
          {
            id: 'project-1',
            name: 'Launch cut',
            status: 'draft',
            tracks: [],
            updatedAt: new Date().toISOString(),
          },
        ],
        { totalDocs: 61, totalPages: 5 },
      ),
    );
    mocks.updateProject.mockResolvedValue(undefined);
    render(<EditorProjectsList />);
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
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveAttribute('data-total-docs', '61');
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveAttribute('data-total-pages', '5');
  });

  it('renders empty and error states with retry', async () => {
    mocks.findAll.mockResolvedValueOnce(
      paginatedResponse([], { totalDocs: 61, totalPages: 5 }),
    );

    const { unmount } = render(<EditorProjectsList />);
    expect(await screen.findByText('No projects yet')).toBeVisible();
    expect(
      screen.getByText('Name one on the left and it shows up here.'),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: /new project/i })).toBeNull();

    unmount();
    mocks.findAll.mockRejectedValueOnce(new Error('offline'));
    render(<EditorProjectsList />);
    expect(await screen.findByText('Failed to load projects')).toBeVisible();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to load editor projects',
      expect.any(Error),
    );

    mocks.findAll.mockResolvedValueOnce(
      paginatedResponse([], { totalDocs: 61, totalPages: 5 }),
    );
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByText('No projects yet')).toBeVisible();
  });

  it('loads projects once even when the translator identity changes', async () => {
    mocks.hasUnstableTranslator = true;
    mocks.findAll.mockRejectedValueOnce(new Error('offline'));

    const { rerender } = render(<EditorProjectsList />);
    expect(await screen.findByText('Failed to load projects')).toBeVisible();
    rerender(<EditorProjectsList />);
    expect(screen.getByText('Failed to load projects')).toBeVisible();
    expect(mocks.findAll).toHaveBeenCalledTimes(1);
  });

  it('keeps the project and reports a failed deletion', async () => {
    const deleteError = new Error('offline');
    mocks.findAll.mockResolvedValue(
      paginatedResponse(
        [
          {
            id: 'project-1',
            name: 'Launch cut',
            status: 'draft',
            tracks: [],
            updatedAt: new Date().toISOString(),
          },
        ],
        { totalDocs: 61, totalPages: 5 },
      ),
    );
    mocks.deleteProject.mockRejectedValue(deleteError);

    render(<EditorProjectsList />);
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
