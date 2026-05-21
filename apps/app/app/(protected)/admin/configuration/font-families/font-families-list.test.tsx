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
import FontFamiliesList from './font-families-list';

const mocks = vi.hoisted(() => ({
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

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: mocks.openModal,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getFontFamiliesService,
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

vi.mock('@ui/lazy/modal/LazyModal', () => ({
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
      return null;
    },
    toString: () => 'organization=org-1&brand=brand-1&page=2',
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
    mocks.deleteFontFamily.mockResolvedValue({ ok: true });
    mocks.getFontFamiliesService.mockResolvedValue({
      delete: mocks.deleteFontFamily,
      findAll: mocks.findAll,
    });
    mockFontFamilies();
  });

  it('loads superadmin font families and syncs admin filters to the URL', async () => {
    render(<FontFamiliesList scope={PageScope.SUPERADMIN} />);

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

  it('opens create/edit/delete flows and refreshes font families', async () => {
    const onRefresh = vi.fn();

    render(
      <FontFamiliesList scope={PageScope.SUPERADMIN} onRefresh={onRefresh} />,
    );

    await screen.findByText('Geist');
    expect(onRefresh).toHaveBeenCalledWith(expect.any(Function));

    await act(async () => {
      await onRefresh.mock.calls[0][0]();
    });
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
      'Font families refreshed',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Font Family' }));
    expect(mocks.openModal).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Geist' }));
    expect(screen.getByTestId('font-family-modal')).toHaveTextContent('Geist');

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

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Font Family Modal' }),
    );
    expect(mocks.findAll).toHaveBeenCalled();
  });

  it('reports load and delete failures while notifying parent loading state', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(
      <FontFamiliesList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /font-families failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load font families',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(false);
    });
    unmount();

    vi.clearAllMocks();
    mocks.getFontFamiliesService.mockResolvedValue({
      delete: mocks.deleteFontFamily,
      findAll: mocks.findAll,
    });
    mockFontFamilies();
    mocks.deleteFontFamily.mockRejectedValueOnce(new Error('delete failed'));
    render(<FontFamiliesList scope={PageScope.SUPERADMIN} />);
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
    render(<FontFamiliesList scope={PageScope.BRAND} />);

    await screen.findByText('Inter');
    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Font Family' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Inter' })).toBeNull();
  });
});
