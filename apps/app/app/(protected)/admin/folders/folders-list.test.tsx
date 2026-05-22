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
import FoldersList from './folders-list';

const mocks = vi.hoisted(() => ({
  deleteFolder: vi.fn(),
  findAll: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  openModal: vi.fn(),
  patch: vi.fn(),
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

vi.mock('@services/content/folders.service', () => ({
  FoldersService: {
    getInstance: () => ({
      delete: mocks.deleteFolder,
      findAll: mocks.findAll,
      patch: mocks.patch,
    }),
  },
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

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: {
    queryFn: () => Promise<unknown>;
    queryKey: unknown[];
  }) => mocks.useQuery(options),
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({
    isRefreshing,
    onClick,
  }: {
    isRefreshing?: boolean;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {isRefreshing ? 'Refreshing folders' : 'Refresh folders'}
    </button>
  ),
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

vi.mock('@ui/content/filters-button/FiltersButton', () => ({
  default: ({
    onFiltersChange,
  }: {
    onFiltersChange: (
      filters: Record<string, string>,
      query: Record<string, string>,
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onFiltersChange(
          {
            format: '',
            provider: '',
            search: 'launch',
            sort: 'createdAt: -1',
            status: '',
            type: '',
          },
          { search: 'launch' },
        )
      }
    >
      Apply Filters
    </button>
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
      return <div>Loading folders</div>;
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

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    right,
  }: {
    children: ReactNode;
    right?: ReactNode;
  }) => (
    <section>
      <div>{right}</div>
      {children}
    </section>
  ),
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyModalFolder: ({
    item,
    onConfirm,
    scope,
  }: {
    item?: { label?: string } | null;
    onConfirm: () => void;
    scope?: PageScope;
  }) => (
    <div data-scope={scope} data-testid="folder-modal">
      Modal folder: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Folder Modal
      </button>
    </div>
  ),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({ totalLabel }: { totalLabel: string }) => (
    <nav>Pagination: {totalLabel}</nav>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Add {label}
    </button>
  ),
}));

vi.mock('@ui/primitives/switch', () => ({
  Switch: ({
    isChecked,
    onChange,
  }: {
    isChecked: boolean;
    onChange: () => void;
  }) => (
    <button type="button" onClick={onChange}>
      {isChecked ? 'Active' : 'Inactive'}
    </button>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/folders',
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

function makeFolder(overrides: Record<string, unknown> = {}) {
  return {
    brand: { id: 'brand-1', label: 'Primary Brand' },
    description: 'Folder description',
    id: 'folder-1',
    isActive: true,
    label: 'Launch Folder',
    ...overrides,
  };
}

function mockFolders(
  data = [
    makeFolder(),
    makeFolder({ id: 'folder-2', isActive: false, label: 'Archive Folder' }),
  ],
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

describe('FoldersList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteFolder.mockResolvedValue({ ok: true });
    mocks.findAll.mockResolvedValue([]);
    mocks.patch.mockResolvedValue({});
    mocks.refetch.mockResolvedValue(undefined);
    mockFolders();
  });

  it('renders folders, applies filters, and syncs superadmin filters to the URL', async () => {
    render(<FoldersList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Launch Folder')).toBeInTheDocument();
    expect(screen.getByText('Archive Folder')).toBeInTheDocument();
    expect(screen.getAllByText('Primary Brand')[0]).toBeInTheDocument();
    expect(screen.getByText('Admin org: org-1')).toBeInTheDocument();
    expect(screen.getByText('Admin brand: brand-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Folder' })).toBeNull();

    await waitFor(() => {
      expect(mocks.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          organization: 'org-1',
          page: 2,
          sort: 'label: 1',
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    await waitFor(() => {
      expect(mocks.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'launch',
          sort: 'createdAt: -1',
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pick Org' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/folders?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/folders?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('opens create/edit modals, toggles active state, and refreshes folders', async () => {
    render(<FoldersList scope={PageScope.BRAND} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Folder' }));
    expect(mocks.openModal).toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Archive Folder' }),
    );
    expect(screen.getByTestId('folder-modal')).toHaveTextContent(
      'Archive Folder',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh folders' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));

    await waitFor(() => {
      expect(mocks.refetch).toHaveBeenCalled();
      expect(mocks.patch).toHaveBeenCalledWith('folder-2', {
        isActive: true,
      });
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Folder Modal' }),
    );
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('deletes the clicked folder and reports delete/update failures', async () => {
    render(<FoldersList scope={PageScope.BRAND} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Archive Folder' }),
    );
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Folder',
        message: expect.stringContaining('Archive Folder'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteFolder).toHaveBeenCalledWith('folder-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Folder deleted');

    mocks.patch.mockRejectedValueOnce(new Error('patch failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to update folder status',
      );
    });

    mocks.deleteFolder.mockRejectedValueOnce(new Error('delete failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Launch Folder' }),
    );
    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete folder',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete folder',
    );
  });

  it('reports load failures and renders the loading and empty states', async () => {
    mocks.useQuery.mockReturnValue({
      data: [],
      error: new Error('load failed'),
      isFetching: false,
      isLoading: false,
      refetch: mocks.refetch,
    });

    const { rerender } = render(<FoldersList scope={PageScope.BRAND} />);

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /folders failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load folders',
      );
    });
    expect(screen.getByText('No folders found')).toBeInTheDocument();

    mocks.useQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: mocks.refetch,
    });
    rerender(<FoldersList scope={PageScope.BRAND} />);
    expect(screen.getByText('Loading folders')).toBeInTheDocument();
  });
});
