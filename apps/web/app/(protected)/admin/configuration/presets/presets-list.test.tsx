import { paginatedResponse } from '@app-tests/paginated-response';
import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { PageScope } from '@genfeedai/contracts';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PresetsList from './presets-list';

const mocks = vi.hoisted(() => ({
  deletePreset: vi.fn(),
  findAllPage: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  openModal: vi.fn(),
  patch: vi.fn(),
  urlSort: null as string | null,
  replace: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => {
  const { TEST_VIEWER } = await import('@app-tests/query-client.harness');
  return { useAuthIdentity: () => ({ ...TEST_VIEWER, isSignedIn: true }) };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
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

vi.mock('@services/elements/presets.service', () => ({
  PresetsService: {
    getInstance: () => ({
      delete: mocks.deletePreset,
      findAllPage: mocks.findAllPage,
      patch: mocks.patch,
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
      {isRefreshing ? 'Refreshing presets' : 'Refresh presets'}
    </button>
  ),
}));

vi.mock('@/components/content/admin-filters/AdminScopeFilter', () => ({
  default: () => <div>Admin scope in the Filters menu</div>,
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
      return <div>Loading presets</div>;
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
    label,
    leading,
    refresh,
    right,
  }: {
    children: ReactNode;
    label?: ReactNode;
    leading?: ReactNode;
    refresh?: ReactNode;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      <div>{leading}</div>
      <div data-testid="container-refresh">{refresh}</div>
      <div>{right}</div>
      {children}
    </section>
  ),
}));

vi.mock('@/components/lazy/modal/LazyModal', () => ({
  LazyModalPreset: ({ onConfirm }: { onConfirm: () => void }) => (
    <div data-testid="preset-modal">
      <button type="button" onClick={onConfirm}>
        Confirm Preset Modal
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
    isDisabled,
    onChange,
  }: {
    isChecked: boolean;
    isDisabled?: boolean;
    onChange: () => void;
  }) => (
    <button type="button" disabled={isDisabled} onClick={onChange}>
      {isChecked ? 'Active' : 'Inactive'}
    </button>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/configuration/presets',
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

function makePreset(overrides: Record<string, unknown> = {}) {
  return {
    category: 'video',
    aspectRatio: '9:16',
    duration: 5,
    style: 'cinematic',
    description: 'Preset description',
    id: 'preset-1',
    isActive: true,
    key: 'launch_video',
    label: 'Launch Video',
    organization: { id: 'org-1', label: 'Acme Org' },
    organizationId: 'org-1',
    ...overrides,
  };
}

const PRESETS = [
  makePreset(),
  makePreset({
    aspectRatio: '',
    duration: undefined,
    style: '',
    id: 'preset-2',
    isActive: false,
    label: 'Image Preset',
    organization: {},
    organizationId: null,
  }),
];

function renderList(
  props: Parameters<typeof PresetsList>[0],
  client = createTestQueryClient(),
) {
  return render(<PresetsList {...props} />, {
    wrapper: queryClientWrapper(client),
  });
}

describe('PresetsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.urlSort = null;
    mocks.deletePreset.mockResolvedValue({ ok: true });
    mocks.findAllPage.mockResolvedValue(paginatedResponse(PRESETS));
    mocks.patch.mockResolvedValue({});
  });

  it('renders superadmin presets and queries by the organization and brand in the URL', async () => {
    renderList({ scope: PageScope.SUPERADMIN });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Presets' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Launch Video')).toBeInTheDocument();
    expect(screen.getByText('Image Preset')).toBeInTheDocument();
    expect(screen.getByText('Aspect: 9:16')).toBeInTheDocument();
    expect(screen.getByText('Duration: 5s')).toBeInTheDocument();
    expect(screen.getByText('Style: cinematic')).toBeInTheDocument();
    expect(
      screen.getByText('Admin scope in the Filters menu'),
    ).toBeInTheDocument();
    expect(mocks.findAllPage).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-1',
        organization: 'org-1',
        page: 2,
      }),
      expect.any(AbortSignal),
    );

    const refreshSlot = screen.getByTestId('container-refresh');
    const refreshButton = screen.getByRole('button', {
      name: 'Refresh presets',
    });
    expect(refreshSlot).toContainElement(refreshButton);
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([makePreset({ label: 'Refreshed Preset' })]),
    );
    fireEvent.click(refreshButton);
    expect(await screen.findByText('Refreshed Preset')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Preset' }));
    expect(mocks.openModal).toHaveBeenCalled();
  });

  it.each([
    ['category', 'category: 1'],
    ['-category', 'category: -1'],
    ['-isActive', 'isActive: -1'],
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

  it.each(['-label', '-key'])(
    'ignores a URL sort on %s, which the API cannot order by',
    async (urlSort) => {
      mocks.urlSort = urlSort;
      renderList({ scope: PageScope.SUPERADMIN });

      await waitFor(() => {
        expect(mocks.findAllPage).toHaveBeenCalled();
      });
      expect(mocks.findAllPage).not.toHaveBeenCalledWith(
        expect.objectContaining({ sort: expect.anything() }),
        expect.any(AbortSignal),
      );
    },
  );

  it('renders a platform default as System when a preset has no organization', async () => {
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([
        makePreset({
          id: 'preset-platform',
          label: 'Platform Default',
          organization: undefined,
          organizationId: null,
        }),
      ]),
    );

    renderList({ scope: PageScope.SUPERADMIN });

    expect(await screen.findByText('Platform Default')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.queryByText('Genfeed.ai')).not.toBeInTheDocument();
  });

  it('marks an organization preset with its organization, not System', async () => {
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([
        makePreset({ organization: undefined, organizationId: 'org-1' }),
      ]),
    );

    renderList({ scope: PageScope.SUPERADMIN });

    expect(await screen.findByText('Organization')).toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
  });

  it('shows a dash instead of "undefined" for a preset with no key or category', async () => {
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([
        makePreset({
          category: undefined,
          id: 'preset-blank',
          key: undefined,
          label: undefined,
          organizationId: null,
        }),
      ]),
    );

    renderList({ scope: PageScope.SUPERADMIN });

    await waitFor(() => expect(mocks.findAllPage).toHaveBeenCalled());
    await screen.findByRole('button', { name: 'Active' });
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('toggles active presets and reports update failures', async () => {
    renderList({ scope: PageScope.SUPERADMIN });
    const activeSwitch = await screen.findByRole('button', { name: 'Active' });

    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([makePreset({ isActive: false }), PRESETS[1]]),
    );
    fireEvent.click(activeSwitch);

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('preset-1', {
        isActive: false,
      });
      expect(screen.getAllByRole('button', { name: 'Inactive' })).toHaveLength(
        2,
      );
    });
    expect(mocks.notificationsSuccess).not.toHaveBeenCalled();

    mocks.patch.mockRejectedValueOnce(new Error('patch failed'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Inactive' })[1]);

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'PATCH /presets/preset-2 failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to update preset',
      );
    });
  });

  it('has no Edit action: presets are edited in the context sidebar', async () => {
    renderList({ scope: PageScope.SUPERADMIN });

    expect(await screen.findByText('Launch Video')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
  });

  it('opens the delete flow with the clicked preset', async () => {
    renderList({ scope: PageScope.SUPERADMIN });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Image Preset' }),
    );
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Preset',
        message: expect.stringContaining('Image Preset'),
      }),
    );

    mocks.findAllPage.mockResolvedValue(paginatedResponse([PRESETS[0]]));
    await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();

    expect(mocks.deletePreset).toHaveBeenCalledWith('preset-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Preset deleted');
    await waitFor(() =>
      expect(screen.queryByText('Image Preset')).not.toBeInTheDocument(),
    );
  });

  it('reports a failed read once while notifying parent loading state', async () => {
    const onLoadingChange = vi.fn();
    mocks.findAllPage.mockRejectedValueOnce(new Error('load failed'));

    renderList({ onLoadingChange, scope: PageScope.SUPERADMIN });

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /presets failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load presets',
      );
      expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    });
    expect(mocks.notificationsError).toHaveBeenCalledTimes(1);
  });

  it('reports a failed delete', async () => {
    mocks.deletePreset.mockRejectedValueOnce(new Error('delete failed'));
    renderList({ scope: PageScope.SUPERADMIN });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Launch Video' }),
    );
    await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete preset',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete preset',
    );
  });

  it('hides superadmin actions and disables active switches for brand scope', async () => {
    renderList({ scope: PageScope.BRAND });

    expect(
      await screen.findByRole('button', { name: 'Active' }),
    ).toBeDisabled();
    expect(
      screen.queryByText('Admin scope in the Filters menu'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Preset' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Edit Launch Video' }),
    ).toBeNull();
  });

  it('paints the cached presets and their own footer total when coming back', async () => {
    mocks.findAllPage.mockImplementation(async () => {
      return paginatedResponse(PRESETS, { totalDocs: 23, totalPages: 2 });
    });
    const client = createTestQueryClient();
    const firstVisit = renderList({ scope: PageScope.SUPERADMIN }, client);
    expect(
      await screen.findByText('Pagination: 23 presets'),
    ).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    renderList({ scope: PageScope.SUPERADMIN }, client);

    expect(screen.getByText('Launch Video')).toBeInTheDocument();
    expect(screen.getByText('Pagination: 23 presets')).toBeInTheDocument();
  });
});
