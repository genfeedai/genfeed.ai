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
import BlacklistsList from './blacklists-list';

const mocks = vi.hoisted(() => ({
  deleteBlacklist: vi.fn(),
  findAll: vi.fn(),
  getBlacklistsService: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  openModal: vi.fn(),
  patch: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: mocks.openModal,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getBlacklistsService,
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

vi.mock('@services/elements/blacklists.service', () => ({
  BlacklistsService: {
    getInstance: () => ({
      delete: mocks.deleteBlacklist,
      findAll: mocks.findAll,
      patch: mocks.patch,
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
      return <div>Loading blacklists</div>;
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
  LazyModalBlacklist: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="blacklist-modal">
      Modal blacklist: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Blacklist Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Blacklist Modal
      </button>
    </div>
  ),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({ totalLabel }: { totalLabel: string }) => (
    <nav>Pagination: {totalLabel}</nav>
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    isChecked,
    isDisabled,
    name,
    onChange,
  }: {
    isChecked: boolean;
    isDisabled?: boolean;
    name: string;
    onChange: () => void;
  }) => (
    <button type="button" disabled={isDisabled} onClick={onChange}>
      {name} {isChecked ? 'checked' : 'unchecked'}
    </button>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/configuration/elements/blacklists',
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

function makeBlacklist(overrides: Record<string, unknown> = {}) {
  return {
    category: 'negative',
    description: 'Blacklist description',
    id: 'blacklist-1',
    isActive: true,
    isDefault: false,
    key: 'low_quality',
    label: 'Low Quality',
    ...overrides,
  };
}

function mockBlacklists(
  data = [
    makeBlacklist(),
    makeBlacklist({
      id: 'blacklist-2',
      isActive: false,
      label: 'Inactive Blacklist',
    }),
  ],
) {
  mocks.findAll.mockResolvedValue(data);
}

describe('BlacklistsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteBlacklist.mockResolvedValue({ ok: true });
    mocks.getBlacklistsService.mockResolvedValue({
      delete: mocks.deleteBlacklist,
      findAll: mocks.findAll,
      patch: mocks.patch,
    });
    mocks.patch.mockResolvedValue({});
    mockBlacklists();
  });

  it('loads superadmin blacklists and syncs admin filters to the URL', async () => {
    render(<BlacklistsList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Loading blacklists')).toBeInTheDocument();
    expect(await screen.findByText('Low Quality')).toBeInTheDocument();
    expect(screen.getByText('Inactive Blacklist')).toBeInTheDocument();
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
      '/admin/configuration/elements/blacklists?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/blacklists?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('registers external refresh and toggles default blacklists', async () => {
    const onRefresh = vi.fn();

    render(
      <BlacklistsList scope={PageScope.SUPERADMIN} onRefresh={onRefresh} />,
    );

    await screen.findByText('Low Quality');
    expect(onRefresh).toHaveBeenCalledWith(expect.any(Function));

    await act(async () => {
      await onRefresh.mock.calls[0][0]();
    });

    expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
      'Blacklists refreshed',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'isDefault-blacklist-1 unchecked' }),
    );

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('blacklist-1', {
        isDefault: true,
      });
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Blacklist updated',
      );
    });
  });

  it('opens edit and delete flows with the clicked blacklist', async () => {
    render(<BlacklistsList scope={PageScope.SUPERADMIN} />);

    await screen.findByText('Inactive Blacklist');
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Inactive Blacklist' }),
    );
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('blacklist-modal')).toHaveTextContent(
      'Inactive Blacklist',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Inactive Blacklist' }),
    );
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Blacklist',
        message: expect.stringContaining('Inactive Blacklist'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteBlacklist).toHaveBeenCalledWith('blacklist-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
      'Blacklist deleted',
    );
  });

  it('reports load, update, and delete failures', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(
      <BlacklistsList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /blacklists failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load blacklists',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(false);
    });
    unmount();

    vi.clearAllMocks();
    mocks.getBlacklistsService.mockResolvedValue({
      delete: mocks.deleteBlacklist,
      findAll: mocks.findAll,
      patch: mocks.patch,
    });
    mockBlacklists();
    mocks.patch.mockRejectedValueOnce(new Error('patch failed'));
    render(<BlacklistsList scope={PageScope.SUPERADMIN} />);
    await screen.findByText('Low Quality');
    fireEvent.click(
      screen.getByRole('button', { name: 'isDefault-blacklist-1 unchecked' }),
    );

    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to update blacklist',
      );
    });

    mocks.deleteBlacklist.mockRejectedValueOnce(new Error('delete failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Low Quality' }));
    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete blacklist',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete blacklist',
    );
  });

  it('hides superadmin controls and disables checkboxes outside superadmin scope', async () => {
    render(<BlacklistsList scope={PageScope.BRAND} />);

    await screen.findByText('Low Quality');
    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit Low Quality' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'isDefault-blacklist-1 unchecked' }),
    ).toBeDisabled();
  });
});
