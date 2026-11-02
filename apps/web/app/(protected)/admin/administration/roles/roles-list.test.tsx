import { paginatedResponse } from '@app-tests/paginated-response';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import '@testing-library/jest-dom/vitest';
import { PagesService } from '@services/content/pages.service';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RolesList from './roles-list';

const mocks = vi.hoisted(() => {
  const findAllPage = vi.fn();
  const patch = vi.fn();
  return {
    findAllPage,
    patch,
    // A stable reference, as the real hook returns, so the list loads once.
    getService: async () => ({ findAllPage, patch }),
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: () => ({ openConfirm: vi.fn() }),
  }),
);

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/organization/roles.service', () => ({
  RolesService: { getInstance: vi.fn() },
}));

vi.mock('@/features/admin/lazy/lazy-modal.admin', () => ({
  LazyModalRole: () => <div data-testid="role-modal" />,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({ totals }: { totals?: { totalDocs: number } }) => (
    <nav aria-label="pagination">
      {totals ? `${totals.totalDocs} roles` : null}
    </nav>
  ),
}));

vi.mock('@ui/layout/admin-page-shell/AdminPageShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));

describe('RolesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.patch.mockResolvedValue({});
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([
        { id: 'role-1', key: 'editor', label: 'Editor', primaryColor: '#f00' },
      ]),
    );
  });

  it('owns an empty footer while its first response is still pending', () => {
    PagesService.recordTotals({ page: 1, pages: 9, total: 200 });
    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    render(
      <ContextSidebarProvider>
        <RolesList />
      </ContextSidebarProvider>,
      { wrapper: queryClientWrapper() },
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('0 roles');
  });

  it('edits a role in the sidebar without opening a form', async () => {
    render(
      <ContextSidebarProvider>
        <RolesList />
        <ContextSidebarOutlet testId="rail" />
      </ContextSidebarProvider>,
      { wrapper: queryClientWrapper() },
    );

    fireEvent.click(
      (await screen.findByText('editor')).closest('tr') as HTMLElement,
    );

    const rail = within(screen.getByTestId('rail'));
    expect(rail.getByText('Color')).toBeInTheDocument();

    expect(rail.queryByRole('button', { name: 'Edit' })).toBeNull();

    fireEvent.click(rail.getByRole('button', { name: 'Label' }));
    const input = rail.getByRole('textbox', { name: 'Label' });
    fireEvent.change(input, { target: { value: 'Senior Editor' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('role-1', {
        label: 'Senior Editor',
      });
    });
    await waitFor(() => {
      expect(mocks.findAllPage).toHaveBeenCalledTimes(2);
    });
  });

  it('requests the page size and renders pagination', async () => {
    render(
      <ContextSidebarProvider>
        <RolesList />
      </ContextSidebarProvider>,
      { wrapper: queryClientWrapper() },
    );

    await screen.findByText('editor');
    expect(mocks.findAllPage).toHaveBeenCalledWith(
      { limit: 15, page: 1 },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeInTheDocument();
  });

  it('paints the cached roles on a return visit, with no skeleton', async () => {
    const client = createTestQueryClient();
    const first = render(
      <ContextSidebarProvider>
        <RolesList />
      </ContextSidebarProvider>,
      { wrapper: queryClientWrapper(client) },
    );
    await screen.findByText('editor');
    first.unmount();
    mocks.findAllPage.mockReturnValue(new Promise(() => {}));

    render(
      <ContextSidebarProvider>
        <RolesList />
      </ContextSidebarProvider>,
      { wrapper: queryClientWrapper(client) },
    );

    expect(screen.getByText('editor')).toBeInTheDocument();
  });

  it('keeps its own footer total on a return visit after another list was read', async () => {
    mocks.findAllPage.mockImplementation(async () => {
      return paginatedResponse(
        [{ id: 'role-1', key: 'editor', label: 'editor' }],
        { totalDocs: 61, totalPages: 3 },
      );
    });
    const client = createTestQueryClient();
    const first = render(
      <ContextSidebarProvider>
        <RolesList />
      </ContextSidebarProvider>,
      { wrapper: queryClientWrapper(client) },
    );
    expect(await screen.findByText('61 roles')).toBeInTheDocument();
    first.unmount();
    // Another list (say, bots) is read in between and records its totals.
    PagesService.recordTotals({ page: 1, pages: 9, total: 200 });
    mocks.findAllPage.mockReturnValue(new Promise(() => {}));

    render(
      <ContextSidebarProvider>
        <RolesList />
      </ContextSidebarProvider>,
      { wrapper: queryClientWrapper(client) },
    );

    expect(screen.getByText('61 roles')).toBeInTheDocument();
  });
});
