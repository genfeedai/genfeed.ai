import { paginatedResponse } from '@app-tests/paginated-response';
import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { PageScope } from '@genfeedai/contracts';
import { PagesService } from '@services/content/pages.service';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LensesList from './lenses-list';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  urlSort: null as string | null,
  deleteLens: vi.fn(),
  findAllPage: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => {
  const { TEST_VIEWER } = await import('@app-tests/query-client.harness');
  return { useAuthIdentity: () => ({ ...TEST_VIEWER, isSignedIn: true }) };
});

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    isSignedIn: true,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token-1'),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: () => ({
      openConfirm: mocks.openConfirm,
    }),
  }),
);

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@services/elements/lenses.service', () => ({
  LensesService: {
    getInstance: () => ({
      delete: mocks.deleteLens,
      findAllPage: mocks.findAllPage,
    }),
  },
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    actions,
    columns,
    emptyLabel,
    getRowKey,
    isLoading,
    items,
    rowSidebar,
  }: {
    rowSidebar?: {
      render: (item: Record<string, unknown>) => ReactNode;
    };
    actions: Array<{
      onClick: (item: Record<string, unknown>) => void;
      tooltip: string;
    }>;
    columns: Array<{
      key: string;
      render?: (item: Record<string, unknown>) => ReactNode;
    }>;
    emptyLabel: string;
    getRowKey: (item: Record<string, unknown>) => string;
    isLoading?: boolean;
    items: Array<Record<string, unknown>>;
  }) => {
    if (isLoading) {
      return <div>Loading lenses</div>;
    }

    if (items.length === 0) {
      return <div>{emptyLabel}</div>;
    }

    return (
      <>
        {rowSidebar ? (
          <aside data-testid="row-sidebar">{rowSidebar.render(items[0])}</aside>
        ) : null}
        <table>
          <tbody>
            {items.map((item) => (
              <tr key={getRowKey(item)}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render
                      ? column.render(item)
                      : String(item[column.key])}
                  </td>
                ))}
                <td>
                  {actions.map((action) => (
                    <button
                      key={`${getRowKey(item)}-${action.tooltip}`}
                      type="button"
                      onClick={() => action.onClick(item)}
                    >
                      {action.tooltip} {String(item.label)}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  },
}));

vi.mock('@/components/lazy/modal/LazyModal', () => ({
  LazyModalLens: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="lens-modal">
      Modal lens: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Lens Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Lens Modal
      </button>
    </div>
  ),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({
    totalLabel,
    totals,
  }: {
    totalLabel: string;
    totals?: { totalDocs: number };
  }) => (
    <nav>
      Pagination: {totals?.totalDocs ?? '?'} {totalLabel}
    </nav>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/configuration/elements/lenses',
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === 'page') return '2';
      if (key === 'organization') return 'org-1';
      if (key === 'brand') return 'brand-1';
      if (key === 'sort') return mocks.urlSort;
      return null;
    },
    toString: () =>
      `organization=org-1&brand=brand-1&page=2${
        mocks.urlSort ? `&sort=${mocks.urlSort}` : ''
      }`,
  }),
}));

function makeLens(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Lens description',
    id: 'lens-1',
    key: 'wide_lens',
    label: 'Wide Lens',
    ...overrides,
  };
}

const LENSS = [makeLens(), makeLens({ id: 'lens-2', label: 'Macro Lens' })];

function renderList(
  props: Parameters<typeof LensesList>[0],
  client = createTestQueryClient(),
) {
  return render(<LensesList {...props} />, {
    wrapper: queryClientWrapper(client),
  });
}

describe('LensesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.urlSort = null;
    mocks.deleteLens.mockResolvedValue({ ok: true });
    mocks.findAllPage.mockResolvedValue(paginatedResponse(LENSS));
  });

  it('renders superadmin lenses and reads the admin filters from the URL', async () => {
    renderList({ scope: PageScope.SUPERADMIN });

    expect((await screen.findAllByText('Wide Lens')).length).toBeGreaterThan(0);
    expect(screen.getByText('Macro Lens')).toBeInTheDocument();
    expect(mocks.findAllPage).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-1',
        organization: 'org-1',
        page: 2,
      }),
      expect.any(AbortSignal),
    );
  });

  it.each([
    ['label', 'label: 1'],
    ['-label', 'label: -1'],
    ['-key', 'key: -1'],
  ])(
    'asks the API for the order named in the URL (sort=%s)',
    async (urlSort, sort) => {
      mocks.urlSort = urlSort;
      renderList({ scope: PageScope.SUPERADMIN });

      await waitFor(() => {
        expect(mocks.findAllPage).toHaveBeenCalledWith(
          expect.objectContaining({ page: 2, sort }),
          expect.any(AbortSignal),
        );
      });
    },
  );

  it('ignores a URL sort on a column it cannot order by', async () => {
    mocks.urlSort = '-password';
    renderList({ scope: PageScope.SUPERADMIN });

    await waitFor(() => {
      expect(mocks.findAllPage).toHaveBeenCalled();
    });
    expect(mocks.findAllPage).not.toHaveBeenCalledWith(
      expect.objectContaining({ sort: expect.anything() }),
      expect.any(AbortSignal),
    );
  });

  it('shows the lens in the sidebar with fields editable in place for superadmins', async () => {
    renderList({ scope: PageScope.SUPERADMIN });

    const sidebar = within(await screen.findByTestId('row-sidebar'));
    expect(sidebar.getByRole('button', { name: 'Key' })).toHaveTextContent(
      'wide_lens',
    );
    expect(
      sidebar.getByRole('button', { name: 'Description' }),
    ).toHaveTextContent('Lens description');
    expect(
      sidebar.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
  });

  it('shows a read-only lens summary outside superadmin scope', async () => {
    renderList({ scope: PageScope.BRAND });

    const sidebar = within(await screen.findByTestId('row-sidebar'));
    expect(sidebar.getByText('wide_lens')).toBeInTheDocument();
    expect(
      sidebar.queryByRole('button', { name: 'Label' }),
    ).not.toBeInTheDocument();
  });

  it('registers external refresh and opens the delete flow with the selected lens', async () => {
    const onRefresh = vi.fn();

    renderList({ onRefresh, scope: PageScope.SUPERADMIN });
    await screen.findAllByText('Macro Lens');

    expect(onRefresh).toHaveBeenCalledWith(expect.any(Function));
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([makeLens({ label: 'Refreshed Lens' })]),
    );
    await act(async () => {
      await onRefresh.mock.calls.at(-1)?.[0]();
    });
    expect(
      (await screen.findAllByText('Refreshed Lens')).length,
    ).toBeGreaterThan(0);

    mocks.findAllPage.mockResolvedValue(paginatedResponse(LENSS));
    await act(async () => {
      await onRefresh.mock.calls.at(-1)?.[0]();
    });
    await screen.findAllByText('Macro Lens');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Macro Lens' }));
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Lens',
        message: expect.stringContaining('Macro Lens'),
      }),
    );

    mocks.findAllPage.mockResolvedValue(paginatedResponse([makeLens()]));
    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteLens).toHaveBeenCalledWith('lens-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Lens deleted');
    await waitFor(() =>
      expect(screen.queryByText('Macro Lens')).not.toBeInTheDocument(),
    );
  });

  it('reports load and delete failures while notifying parent loading state', async () => {
    const onLoadingChange = vi.fn();
    mocks.findAllPage.mockRejectedValueOnce(new Error('load failed'));

    renderList({ onLoadingChange, scope: PageScope.SUPERADMIN });

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /lenses failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load lenses',
      );
      expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    });
    expect(mocks.notificationsError).toHaveBeenCalledTimes(1);
  });

  it('reports a failed delete', async () => {
    mocks.deleteLens.mockRejectedValueOnce(new Error('delete failed'));
    renderList({ scope: PageScope.SUPERADMIN });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Wide Lens' }),
    );
    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete lens',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete lens',
    );
  });

  it('hides superadmin filters and actions outside superadmin scope', async () => {
    renderList({ scope: PageScope.BRAND });

    await screen.findAllByText('Wide Lens');
    expect(screen.queryByRole('button', { name: 'Edit Wide Lens' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete Wide Lens' }),
    ).toBeNull();
  });

  it('paints the cached lenses and their own footer total when coming back', async () => {
    mocks.findAllPage.mockImplementation(async () => {
      return paginatedResponse(LENSS, { totalDocs: 14, totalPages: 2 });
    });
    const client = createTestQueryClient();
    const firstVisit = renderList({ scope: PageScope.SUPERADMIN }, client);
    expect(
      await screen.findByText('Pagination: 14 lenses'),
    ).toBeInTheDocument();
    firstVisit.unmount();

    PagesService.recordTotals({ page: 1, pages: 9, total: 200 });
    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    renderList({ scope: PageScope.SUPERADMIN }, client);

    expect(screen.getAllByText('Wide Lens').length).toBeGreaterThan(0);
    expect(screen.getByText('Pagination: 14 lenses')).toBeInTheDocument();
    expect(screen.queryByText('Loading lenses')).not.toBeInTheDocument();
  });
});
