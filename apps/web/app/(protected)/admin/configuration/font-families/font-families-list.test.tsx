import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import '@testing-library/jest-dom/vitest';
import { PageScope } from '@genfeedai/contracts';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FontFamiliesList from './font-families-list';

const mocks = vi.hoisted(() => ({
  urlSort: null as string | null,
  deleteFontFamily: vi.fn(),
  findAll: vi.fn(),
  getFontFamiliesService: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  openModal: vi.fn(),
  replace: vi.fn(),
}));

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
  useAuthedService: () => mocks.getFontFamiliesService,
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

vi.mock('@services/elements/font-families.service', () => ({
  FontFamiliesService: {
    getInstance: () => ({
      delete: mocks.deleteFontFamily,
      findAll: mocks.findAll,
    }),
  },
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
      {isRefreshing ? 'Refreshing font families' : 'Refresh font families'}
    </button>
  ),
}));

vi.mock('@/components/content/admin-filters/AdminOrgBrandFilter', () => ({
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
      return <div>Loading font families</div>;
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

vi.mock('@/components/lazy/modal/LazyModal', () => ({
  LazyModalFontFamily: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="font-family-modal">
      Modal font family: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Font Family Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Font Family Modal
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/configuration/font-families',
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

function makeFontFamily(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Font family description',
    id: 'font-1',
    key: 'inter',
    label: 'Inter',
    ...overrides,
  };
}

function mockFontFamilies(
  data = [makeFontFamily(), makeFontFamily({ id: 'font-2', label: 'Geist' })],
) {
  mocks.findAll.mockResolvedValue(data);
}

describe('FontFamiliesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.urlSort = null;
    mocks.deleteFontFamily.mockResolvedValue({ ok: true });
    mocks.getFontFamiliesService.mockResolvedValue({
      delete: mocks.deleteFontFamily,
      findAll: mocks.findAll,
    });
    mockFontFamilies();
  });

  it('loads superadmin font families and syncs admin filters to the URL', async () => {
    render(<FontFamiliesList scope={PageScope.SUPERADMIN} />, {
      wrapper: queryClientWrapper(),
    });

    expect(screen.getByText('Loading font families')).toBeInTheDocument();
    expect(await screen.findByText('Inter')).toBeInTheDocument();
    expect(screen.getByText('Geist')).toBeInTheDocument();
    expect(screen.getByText('Admin org: org-1')).toBeInTheDocument();
    expect(screen.getByText('Admin brand: brand-1')).toBeInTheDocument();

    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-1',
        organization: 'org-1',
        page: 2,
      }),
      expect.any(AbortSignal),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Org' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/font-families?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/font-families?organization=org-1&brand=brand-2',
      { scroll: false },
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
      render(<FontFamiliesList scope={PageScope.SUPERADMIN} />, {
        wrapper: queryClientWrapper(),
      });

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
    render(<FontFamiliesList scope={PageScope.SUPERADMIN} />, {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => {
      expect(mocks.findAll).toHaveBeenCalled();
    });
    expect(mocks.findAll).not.toHaveBeenCalledWith(
      expect.objectContaining({ sort: expect.anything() }),
      expect.any(AbortSignal),
    );
  });

  it('opens the create and delete flows and refreshes font families', async () => {
    render(<FontFamiliesList scope={PageScope.SUPERADMIN} />, {
      wrapper: queryClientWrapper(),
    });

    await screen.findByText('Geist');
    expect(mocks.notificationsSuccess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Font Family' }));
    expect(mocks.openModal).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Geist' }));
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Font Family',
        message: expect.stringContaining('Geist'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteFontFamily).toHaveBeenCalledWith('font-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
      'Font family deleted',
    );

    const readsBeforeConfirm = mocks.findAll.mock.calls.length;
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Font Family Modal' }),
    );
    await waitFor(() =>
      expect(mocks.findAll.mock.calls.length).toBeGreaterThan(
        readsBeforeConfirm,
      ),
    );
    expect(screen.getByText('Geist')).toBeInTheDocument();
  });

  it('reports load and delete failures', async () => {
    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(
      <FontFamiliesList scope={PageScope.SUPERADMIN} />,
      { wrapper: queryClientWrapper() },
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /font-families failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load font families',
      );
    });
    unmount();

    vi.clearAllMocks();
    mocks.getFontFamiliesService.mockResolvedValue({
      delete: mocks.deleteFontFamily,
      findAll: mocks.findAll,
    });
    mockFontFamilies();
    mocks.deleteFontFamily.mockRejectedValueOnce(new Error('delete failed'));
    render(<FontFamiliesList scope={PageScope.SUPERADMIN} />, {
      wrapper: queryClientWrapper(),
    });
    await screen.findByText('Inter');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Inter' }));

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete font family',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete font family',
    );
  });

  it('hides superadmin filters and actions outside superadmin scope', async () => {
    render(<FontFamiliesList scope={PageScope.BRAND} />, {
      wrapper: queryClientWrapper(),
    });

    await screen.findByText('Inter');
    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Font Family' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Inter' })).toBeNull();
  });

  it('paints the cached font families on a return visit, with no skeleton', async () => {
    const client = createTestQueryClient();
    const first = render(<FontFamiliesList scope={PageScope.SUPERADMIN} />, {
      wrapper: queryClientWrapper(client),
    });
    await screen.findByText('Inter');
    first.unmount();
    mocks.findAll.mockReturnValue(new Promise(() => {}));

    render(<FontFamiliesList scope={PageScope.SUPERADMIN} />, {
      wrapper: queryClientWrapper(client),
    });

    expect(screen.getByText('Inter')).toBeInTheDocument();
    expect(screen.queryByText('Loading font families')).not.toBeInTheDocument();
  });
});
