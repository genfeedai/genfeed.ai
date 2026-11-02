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
import CamerasList from './cameras-list';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  urlSort: null as string | null,
  deleteCamera: vi.fn(),
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

vi.mock('@services/elements/cameras.service', () => ({
  CamerasService: {
    getInstance: () => ({
      delete: mocks.deleteCamera,
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
      return <div>Loading cameras</div>;
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
  LazyModalCamera: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="camera-modal">
      Modal camera: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Camera Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Camera Modal
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
  usePathname: () => '/admin/configuration/elements/cameras',
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

function makeCamera(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Camera description',
    id: 'camera-1',
    key: 'wide_camera',
    label: 'Wide Camera',
    ...overrides,
  };
}

const CAMERAS = [
  makeCamera(),
  makeCamera({ id: 'camera-2', label: 'Macro Camera' }),
];

function renderList(
  props: Parameters<typeof CamerasList>[0],
  client = createTestQueryClient(),
) {
  return render(<CamerasList {...props} />, {
    wrapper: queryClientWrapper(client),
  });
}

describe('CamerasList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.urlSort = null;
    mocks.deleteCamera.mockResolvedValue({ ok: true });
    mocks.findAll.mockResolvedValue(CAMERAS);
  });

  it('renders superadmin cameras and reads the admin filters from the URL', async () => {
    renderList({ scope: PageScope.SUPERADMIN });

    expect(await screen.findByText('Wide Camera')).toBeInTheDocument();
    expect(screen.getByText('Macro Camera')).toBeInTheDocument();
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

  it('opens the camera summary in the sidebar with Edit for superadmins', async () => {
    renderList({ scope: PageScope.SUPERADMIN });

    const sidebar = within(await screen.findByTestId('row-sidebar'));
    expect(sidebar.getByText('wide_camera')).toBeInTheDocument();
    expect(sidebar.getByText('Camera description')).toBeInTheDocument();

    fireEvent.click(sidebar.getByRole('button', { name: 'Edit' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('camera-modal')).toHaveTextContent('Wide Camera');
  });

  it('shows a read-only camera summary outside superadmin scope', async () => {
    renderList({ scope: PageScope.BRAND });

    expect(
      within(await screen.findByTestId('row-sidebar')).queryByRole('button', {
        name: 'Edit',
      }),
    ).not.toBeInTheDocument();
  });

  it('registers external refresh and opens edit/delete flows with the selected camera', async () => {
    const onRefresh = vi.fn();

    renderList({ onRefresh, scope: PageScope.SUPERADMIN });
    await screen.findByText('Macro Camera');

    expect(onRefresh).toHaveBeenCalledWith(expect.any(Function));
    mocks.findAll.mockResolvedValue([
      makeCamera({ label: 'Refreshed Camera' }),
    ]);
    await act(async () => {
      await onRefresh.mock.calls.at(-1)?.[0]();
    });
    expect(await screen.findByText('Refreshed Camera')).toBeInTheDocument();

    mocks.findAll.mockResolvedValue(CAMERAS);
    await act(async () => {
      await onRefresh.mock.calls.at(-1)?.[0]();
    });
    await screen.findByText('Macro Camera');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Macro Camera' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('camera-modal')).toHaveTextContent(
      'Macro Camera',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Macro Camera' }),
    );
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Camera',
        message: expect.stringContaining('Macro Camera'),
      }),
    );

    mocks.findAll.mockResolvedValue([makeCamera()]);
    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteCamera).toHaveBeenCalledWith('camera-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Camera deleted');
    await waitFor(() =>
      expect(screen.queryByText('Macro Camera')).not.toBeInTheDocument(),
    );
  });

  it('reports load and delete failures while notifying parent loading state', async () => {
    const onLoadingChange = vi.fn();
    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));

    renderList({ onLoadingChange, scope: PageScope.SUPERADMIN });

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /cameras failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load cameras',
      );
      expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    });
    expect(mocks.notificationsError).toHaveBeenCalledTimes(1);
  });

  it('reports a failed delete', async () => {
    mocks.deleteCamera.mockRejectedValueOnce(new Error('delete failed'));
    renderList({ scope: PageScope.SUPERADMIN });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Wide Camera' }),
    );
    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete camera',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete camera',
    );
  });

  it('hides superadmin filters and actions outside superadmin scope', async () => {
    renderList({ scope: PageScope.BRAND });

    await screen.findByText('Wide Camera');
    expect(
      screen.queryByRole('button', { name: 'Edit Wide Camera' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete Wide Camera' }),
    ).toBeNull();
  });

  it('paints the cached cameras and their own footer total when coming back', async () => {
    mocks.findAll.mockImplementation(async () => {
      PagesService.recordTotals({ page: 2, pages: 2, total: 14 });
      return CAMERAS;
    });
    const client = createTestQueryClient();
    const firstVisit = renderList({ scope: PageScope.SUPERADMIN }, client);
    expect(
      await screen.findByText('Pagination: 14 cameras'),
    ).toBeInTheDocument();
    firstVisit.unmount();

    PagesService.recordTotals({ page: 1, pages: 9, total: 200 });
    mocks.findAll.mockReturnValue(new Promise(() => {}));
    renderList({ scope: PageScope.SUPERADMIN }, client);

    expect(screen.getByText('Wide Camera')).toBeInTheDocument();
    expect(screen.getByText('Pagination: 14 cameras')).toBeInTheDocument();
    expect(screen.queryByText('Loading cameras')).not.toBeInTheDocument();
  });
});
