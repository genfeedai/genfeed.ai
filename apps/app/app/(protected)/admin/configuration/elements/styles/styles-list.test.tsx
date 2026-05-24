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
import StylesList from './styles-list';

const mocks = vi.hoisted(() => ({
  deleteStyle: vi.fn(),
  findAll: vi.fn(),
  getStylesService: vi.fn(),
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
  useAuthedService: () => mocks.getStylesService,
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

vi.mock('@services/elements/styles.service', () => ({
  StylesService: {
    getInstance: () => ({
      delete: mocks.deleteStyle,
      findAll: mocks.findAll,
    }),
  },
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

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
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
      return <div>Loading styles</div>;
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
  LazyModalStyle: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="style-modal">
      Modal style: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Style Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Style Modal
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
  usePathname: () => '/admin/configuration/elements/styles',
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

function makeStyle(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Style description',
    id: 'style-1',
    key: 'cinematic',
    label: 'Cinematic',
    models: ['flux', 'seedream'],
    ...overrides,
  };
}

function mockStyles(
  data = [
    makeStyle(),
    makeStyle({ id: 'style-2', label: 'Editorial', models: [] }),
  ],
) {
  mocks.findAll.mockResolvedValue(data);
}

describe('StylesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteStyle.mockResolvedValue({ ok: true });
    mocks.getStylesService.mockResolvedValue({
      delete: mocks.deleteStyle,
      findAll: mocks.findAll,
    });
    mockStyles();
  });

  it('loads superadmin styles and syncs admin filters to the URL', async () => {
    render(<StylesList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Loading styles')).toBeInTheDocument();
    expect(await screen.findByText('Cinematic')).toBeInTheDocument();
    expect(screen.getByText('Editorial')).toBeInTheDocument();
    expect(screen.getByText('flux')).toBeInTheDocument();
    expect(screen.getByText('seedream')).toBeInTheDocument();
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
      '/admin/configuration/elements/styles?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/styles?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('registers external refresh and opens edit/delete flows with the clicked style', async () => {
    const onRefresh = vi.fn();

    render(<StylesList scope={PageScope.SUPERADMIN} onRefresh={onRefresh} />);

    await screen.findByText('Editorial');
    expect(onRefresh).toHaveBeenCalledWith(expect.any(Function));

    await act(async () => {
      await onRefresh.mock.calls[0][0]();
    });
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Styles refreshed');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Editorial' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('style-modal')).toHaveTextContent('Editorial');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Editorial' }));
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Style',
        message: expect.stringContaining('Editorial'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteStyle).toHaveBeenCalledWith('style-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Style deleted');
  });

  it('reports load and delete failures while notifying parent loading state', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(
      <StylesList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /styles failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load styles',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(false);
    });
    unmount();

    vi.clearAllMocks();
    mocks.getStylesService.mockResolvedValue({
      delete: mocks.deleteStyle,
      findAll: mocks.findAll,
    });
    mockStyles();
    mocks.deleteStyle.mockRejectedValueOnce(new Error('delete failed'));
    render(<StylesList scope={PageScope.SUPERADMIN} />);
    await screen.findByText('Cinematic');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Cinematic' }));

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete style',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete style',
    );
  });

  it('hides superadmin filters and actions outside superadmin scope', async () => {
    render(<StylesList scope={PageScope.BRAND} />);

    await screen.findByText('Cinematic');
    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Cinematic' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete Cinematic' }),
    ).toBeNull();
  });
});
