import { paginatedResponse } from '@app-tests/paginated-response';
import type { IPageTotals } from '@genfeedai/contracts/interfaces';

import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { PageScope } from '@genfeedai/contracts';
import type { QueryClient } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render as renderWithoutClient,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BlacklistsList from './blacklists-list';

const mocks = vi.hoisted(() => ({
  urlOrganization: 'org-1',
  deleteBlacklist: vi.fn(),
  findAllPage: vi.fn(),
  getBlacklistsService: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  patch: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getBlacklistsService,
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

vi.mock('@services/elements/blacklists.service', () => ({
  BlacklistsService: {
    getInstance: () => ({
      delete: mocks.deleteBlacklist,
      findAllPage: mocks.findAllPage,
      patch: mocks.patch,
    }),
  },
}));

vi.mock('@ui/primitives/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
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

vi.mock('@/components/lazy/modal/LazyModal', () => ({
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
  default: ({
    totalLabel,
    totals,
  }: {
    totalLabel: string;
    totals?: IPageTotals;
  }) => (
    <nav aria-label="pagination">
      Pagination: {totalLabel} {totals?.totalDocs}
    </nav>
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
      if (key === 'organization') return mocks.urlOrganization;
      if (key === 'brand') return 'brand-1';
      return null;
    },
    toString: () =>
      `organization=${mocks.urlOrganization}&brand=brand-1&page=2`,
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
  mocks.findAllPage.mockResolvedValue(paginatedResponse(data));
}

function render(ui: ReactElement, client?: QueryClient) {
  return renderWithoutClient(ui, { wrapper: queryClientWrapper(client) });
}

describe('BlacklistsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.urlOrganization = 'org-1';
    mocks.deleteBlacklist.mockResolvedValue({ ok: true });
    mocks.getBlacklistsService.mockResolvedValue({
      delete: mocks.deleteBlacklist,
      findAllPage: mocks.findAllPage,
      patch: mocks.patch,
    });
    mocks.patch.mockResolvedValue({});
    mockBlacklists();
  });

  it('owns empty totals before its first response', () => {
    mocks.findAllPage.mockReturnValueOnce(new Promise(() => {}));
    render(<BlacklistsList scope={PageScope.SUPERADMIN} />);
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('Pagination: blacklists 0');
  });

  it('keeps the server total with its rows instead of another list total', async () => {
    mocks.findAllPage.mockResolvedValueOnce(
      paginatedResponse([makeBlacklist()], { totalDocs: 61, totalPages: 5 }),
    );
    render(<BlacklistsList scope={PageScope.SUPERADMIN} />);
    await waitFor(() => {
      expect(
        screen.getByRole('navigation', { name: 'pagination' }),
      ).toHaveTextContent('Pagination: blacklists 61');
    });
    expect(
      screen.queryByText('Pagination: blacklists 200'),
    ).not.toBeInTheDocument();
  });

  it('loads superadmin blacklists and reads the admin filters from the URL', async () => {
    render(<BlacklistsList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Loading blacklists')).toBeInTheDocument();
    expect(await screen.findByText('Low Quality')).toBeInTheDocument();
    expect(screen.getByText('Inactive Blacklist')).toBeInTheDocument();

    expect(mocks.findAllPage).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-1',
        organization: 'org-1',
        page: 2,
      }),
      expect.any(AbortSignal),
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

    expect(mocks.notificationsSuccess).not.toHaveBeenCalled();

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

  it('opens the delete flow with the clicked blacklist', async () => {
    render(<BlacklistsList scope={PageScope.SUPERADMIN} />);

    await screen.findByText('Inactive Blacklist');

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

    mocks.findAllPage.mockRejectedValueOnce(new Error('load failed'));
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
      findAllPage: mocks.findAllPage,
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
    expect(
      screen.queryByRole('button', { name: 'Edit Low Quality' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'isDefault-blacklist-1 unchecked' }),
    ).toBeDisabled();
  });

  it('paints the cached blacklists and their own footer total when coming back', async () => {
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([makeBlacklist()], { totalDocs: 14, totalPages: 2 }),
    );
    const client = createTestQueryClient();
    const firstVisit = render(
      <BlacklistsList scope={PageScope.SUPERADMIN} />,
      client,
    );
    expect(await screen.findByText('Low Quality')).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    render(<BlacklistsList scope={PageScope.SUPERADMIN} />, client);

    expect(screen.getByText('Low Quality')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('14');
    expect(screen.queryByText('Loading blacklists')).not.toBeInTheDocument();
  });

  it("never paints one organization's cached blacklists for another", async () => {
    const client = createTestQueryClient();
    const firstVisit = render(
      <BlacklistsList scope={PageScope.SUPERADMIN} />,
      client,
    );
    expect(await screen.findByText('Low Quality')).toBeInTheDocument();
    firstVisit.unmount();

    mocks.urlOrganization = 'org-2';
    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    render(<BlacklistsList scope={PageScope.SUPERADMIN} />, client);

    expect(screen.getByText('Loading blacklists')).toBeInTheDocument();
    expect(screen.queryByText('Low Quality')).not.toBeInTheDocument();
  });
});
