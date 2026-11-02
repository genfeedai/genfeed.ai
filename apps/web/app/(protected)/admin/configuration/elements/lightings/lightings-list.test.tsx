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
import LightingsList from './lightings-list';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  urlSort: null as string | null,
  deleteLighting: vi.fn(),
  findAll: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  openModal: vi.fn(),
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

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: mocks.openModal,
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

vi.mock('@services/elements/lightings.service', () => ({
  LightingsService: {
    getInstance: () => ({
      delete: mocks.deleteLighting,
      findAll: mocks.findAll,
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
      return <div>Loading lightings</div>;
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
  LazyModalLighting: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="lighting-modal">
      Modal lighting: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Lighting Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Lighting Modal
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
  usePathname: () => '/admin/configuration/elements/lightings',
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

function makeLighting(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Lighting description',
    id: 'lighting-1',
    key: 'wide_lighting',
    label: 'Wide Lighting',
    ...overrides,
  };
}

const LIGHTINGS = [
  makeLighting(),
  makeLighting({ id: 'lighting-2', label: 'Macro Lighting' }),
];

function renderList(
  props: Parameters<typeof LightingsList>[0],
  client = createTestQueryClient(),
) {
  return render(<LightingsList {...props} />, {
    wrapper: queryClientWrapper(client),
  });
}

describe('LightingsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.urlSort = null;
    mocks.deleteLighting.mockResolvedValue({ ok: true });
    mocks.findAll.mockResolvedValue(LIGHTINGS);
  });

  it('renders superadmin lightings and reads the admin filters from the URL', async () => {
    renderList({ scope: PageScope.SUPERADMIN });

    expect(await screen.findByText('Wide Lighting')).toBeInTheDocument();
    expect(screen.getByText('Macro Lighting')).toBeInTheDocument();
    expect(mocks.findAll).toHaveBeenCalledWith(
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
        expect(mocks.findAll).toHaveBeenCalledWith(
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
      expect(mocks.findAll).toHaveBeenCalled();
    });
    expect(mocks.findAll).not.toHaveBeenCalledWith(
      expect.objectContaining({ sort: expect.anything() }),
      expect.any(AbortSignal),
    );
  });

  it('opens the lighting summary in the sidebar with Edit for superadmins', async () => {
    renderList({ scope: PageScope.SUPERADMIN });

    const sidebar = within(await screen.findByTestId('row-sidebar'));
    expect(sidebar.getByText('wide_lighting')).toBeInTheDocument();
    expect(sidebar.getByText('Lighting description')).toBeInTheDocument();

    fireEvent.click(sidebar.getByRole('button', { name: 'Edit' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('lighting-modal')).toHaveTextContent(
      'Wide Lighting',
    );
  });

  it('shows a read-only lighting summary outside superadmin scope', async () => {
    renderList({ scope: PageScope.BRAND });

    expect(
      within(await screen.findByTestId('row-sidebar')).queryByRole('button', {
        name: 'Edit',
      }),
    ).not.toBeInTheDocument();
  });

  it('registers external refresh and opens edit/delete flows with the selected lighting', async () => {
    const onRefresh = vi.fn();

    renderList({ onRefresh, scope: PageScope.SUPERADMIN });
    await screen.findByText('Macro Lighting');

    expect(onRefresh).toHaveBeenCalledWith(expect.any(Function));
    mocks.findAll.mockResolvedValue([
      makeLighting({ label: 'Refreshed Lighting' }),
    ]);
    await act(async () => {
      await onRefresh.mock.calls.at(-1)?.[0]();
    });
    expect(await screen.findByText('Refreshed Lighting')).toBeInTheDocument();

    mocks.findAll.mockResolvedValue(LIGHTINGS);
    await act(async () => {
      await onRefresh.mock.calls.at(-1)?.[0]();
    });
    await screen.findByText('Macro Lighting');

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Macro Lighting' }),
    );
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('lighting-modal')).toHaveTextContent(
      'Macro Lighting',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Macro Lighting' }),
    );
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Lighting',
        message: expect.stringContaining('Macro Lighting'),
      }),
    );

    mocks.findAll.mockResolvedValue([makeLighting()]);
    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteLighting).toHaveBeenCalledWith('lighting-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Lighting deleted');
    await waitFor(() =>
      expect(screen.queryByText('Macro Lighting')).not.toBeInTheDocument(),
    );
  });

  it('reports load and delete failures while notifying parent loading state', async () => {
    const onLoadingChange = vi.fn();
    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));

    renderList({ onLoadingChange, scope: PageScope.SUPERADMIN });

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /lightings failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load lightings',
      );
      expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    });
    expect(mocks.notificationsError).toHaveBeenCalledTimes(1);
  });

  it('reports a failed delete', async () => {
    mocks.deleteLighting.mockRejectedValueOnce(new Error('delete failed'));
    renderList({ scope: PageScope.SUPERADMIN });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Wide Lighting' }),
    );
    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete lighting',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete lighting',
    );
  });

  it('hides superadmin filters and actions outside superadmin scope', async () => {
    renderList({ scope: PageScope.BRAND });

    await screen.findByText('Wide Lighting');
    expect(
      screen.queryByRole('button', { name: 'Edit Wide Lighting' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete Wide Lighting' }),
    ).toBeNull();
  });

  it('paints the cached lightings and their own footer total when coming back', async () => {
    mocks.findAll.mockImplementation(async () => {
      PagesService.recordTotals({ page: 2, pages: 2, total: 14 });
      return LIGHTINGS;
    });
    const client = createTestQueryClient();
    const firstVisit = renderList({ scope: PageScope.SUPERADMIN }, client);
    expect(
      await screen.findByText('Pagination: 14 lightings'),
    ).toBeInTheDocument();
    firstVisit.unmount();

    PagesService.recordTotals({ page: 1, pages: 9, total: 200 });
    mocks.findAll.mockReturnValue(new Promise(() => {}));
    renderList({ scope: PageScope.SUPERADMIN }, client);

    expect(screen.getByText('Wide Lighting')).toBeInTheDocument();
    expect(screen.getByText('Pagination: 14 lightings')).toBeInTheDocument();
    expect(screen.queryByText('Loading lightings')).not.toBeInTheDocument();
  });

  it('shows the empty label in brand scope when there are no lightings', async () => {
    mocks.findAll.mockResolvedValue([]);
    renderList({ scope: PageScope.BRAND });

    expect(await screen.findByText('No lightings found')).toBeInTheDocument();
  });
});
