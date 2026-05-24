import '@testing-library/jest-dom';
import { PageScope } from '@genfeedai/enums';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LensesList from './lenses-list';

const mocks = vi.hoisted(() => ({
  deleteLens: vi.fn(),
  findAll: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  openModal: vi.fn(),
  refetch: vi.fn(),
  replace: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
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

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({
    openConfirm: mocks.openConfirm,
  }),
}));

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
      findAll: mocks.findAll,
    }),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: {
    queryFn: () => Promise<unknown>;
    queryKey: unknown[];
  }) => mocks.useQuery(options),
}));

vi.mock('@ui/content/admin-filters/AdminOrgBrandFilter', () => ({
  default: ({
    brand,
    onBrandChange,
    onOrganizationChange,
    organization,
  }: {
    brand: string;
    onBrandChange: (value: string) => void;
    onOrganizationChange: (value: string) => void;
    organization: string;
  }) => (
    <section>
      <div>Admin org: {organization || 'none'}</div>
      <div>Admin brand: {brand || 'none'}</div>
      <button type="button" onClick={() => onOrganizationChange('org-2')}>
        Pick Org
      </button>
      <button type="button" onClick={() => onBrandChange('brand-2')}>
        Pick Brand
      </button>
    </section>
  ),
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    actions,
    columns,
    emptyLabel,
    getRowKey,
    isLoading,
    items,
  }: {
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
    );
  },
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
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
  default: ({ totalLabel }: { totalLabel: string }) => (
    <nav>Pagination: {totalLabel}</nav>
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
      return null;
    },
    toString: () => 'organization=org-1&brand=brand-1&page=2',
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

function mockLenses(
  data = [makeLens(), makeLens({ id: 'lens-2', label: 'Macro Lens' })],
) {
  mocks.useQuery.mockImplementation(
    (options: { queryFn: () => Promise<unknown> }) => {
      void options.queryFn();
      return {
        data,
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: mocks.refetch,
      };
    },
  );
}

describe('LensesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteLens.mockResolvedValue({ ok: true });
    mocks.findAll.mockResolvedValue([]);
    mocks.refetch.mockResolvedValue(undefined);
    mockLenses();
  });

  it('renders superadmin lenses and syncs admin filters to the URL', async () => {
    render(<LensesList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Wide Lens')).toBeInTheDocument();
    expect(screen.getByText('Macro Lens')).toBeInTheDocument();
    expect(screen.getByText('Admin org: org-1')).toBeInTheDocument();
    expect(screen.getByText('Admin brand: brand-1')).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          organization: 'org-1',
          page: 2,
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pick Org' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/lenses?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/lenses?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('registers external refresh and opens edit/delete flows with the selected lens', async () => {
    const onRefresh = vi.fn();

    render(<LensesList scope={PageScope.SUPERADMIN} onRefresh={onRefresh} />);

    expect(onRefresh).toHaveBeenCalledWith(expect.any(Function));
    await act(async () => {
      await onRefresh.mock.calls[0][0]();
    });
    expect(mocks.refetch).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Macro Lens' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('lens-modal')).toHaveTextContent('Macro Lens');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Macro Lens' }));
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Lens',
        message: expect.stringContaining('Macro Lens'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteLens).toHaveBeenCalledWith('lens-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Lens deleted');
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('reports load and delete failures while notifying parent loading state', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.useQuery.mockReturnValue({
      data: [makeLens()],
      error: new Error('load failed'),
      isFetching: true,
      isLoading: false,
      refetch: mocks.refetch,
    });

    render(
      <LensesList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /lenses failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load lenses',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(true);
    });

    mocks.deleteLens.mockRejectedValueOnce(new Error('delete failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Wide Lens' }));
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

  it('hides superadmin filters and actions outside superadmin scope', () => {
    render(<LensesList scope={PageScope.BRAND} />);

    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Wide Lens' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete Wide Lens' }),
    ).toBeNull();
  });
});
