import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RolesList from './roles-list';

const mocks = vi.hoisted(() => {
  const findAll = vi.fn();
  return {
    findAll,
    // A stable reference, as the real hook returns, so the list loads once.
    getService: async () => ({ findAll }),
    openModal: vi.fn(),
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: mocks.openModal,
}));

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
  LazyModalRole: ({ role }: { role: { label: string } | null }) => (
    <div data-testid="role-modal">Modal role: {role?.label ?? 'none'}</div>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

vi.mock('@ui/layout/admin-page-shell/AdminPageShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));

describe('RolesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAll.mockResolvedValue([
      { id: 'role-1', key: 'editor', label: 'Editor', primaryColor: '#f00' },
    ]);
  });

  it('opens a role summary in the sidebar whose Edit opens the role form', async () => {
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

    fireEvent.click(rail.getByRole('button', { name: 'Edit' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('role-modal')).toHaveTextContent('Editor');
  });

  it('requests the page size and renders pagination', async () => {
    render(
      <ContextSidebarProvider>
        <RolesList />
      </ContextSidebarProvider>,
      { wrapper: queryClientWrapper() },
    );

    await screen.findByText('editor');
    expect(mocks.findAll).toHaveBeenCalledWith(
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
    mocks.findAll.mockReturnValue(new Promise(() => {}));

    render(
      <ContextSidebarProvider>
        <RolesList />
      </ContextSidebarProvider>,
      { wrapper: queryClientWrapper(client) },
    );

    expect(screen.getByText('editor')).toBeInTheDocument();
  });
});
