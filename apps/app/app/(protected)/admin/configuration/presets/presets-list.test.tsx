import '@testing-library/jest-dom/vitest';
import { PageScope } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PresetsList from './presets-list';

const mocks = vi.hoisted(() => ({
  deletePreset: vi.fn(),
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
      findAll: mocks.findAll,
      patch: mocks.patch,
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
      {isRefreshing ? 'Refreshing presets' : 'Refresh presets'}
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
      <button type="button" onClick={() => onOrganizationChange('')}>
        Clear Org
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
  LazyModalPreset: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="preset-modal">
      Modal item: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Preset Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Preset Modal
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
      return null;
    },
    toString: () => 'organization=org-1&brand=brand-1&page=2',
  }),
}));

function makePreset(overrides: Record<string, unknown> = {}) {
  return {
    category: 'video',
    defaultBlacklists: ['low quality'],
    defaultCamera: 'wide',
    defaultMoods: ['bright'],
    defaultScene: 'studio',
    defaultStyle: 'cinematic',
    description: 'Preset description',
    id: 'preset-1',
    isActive: true,
    key: 'launch_video',
    label: 'Launch Video',
    organization: { id: 'org-1', label: 'Acme Org' },
    ...overrides,
  };
}

function mockPresetsQuery(
  data = [
    makePreset(),
    makePreset({
      defaultBlacklists: [],
      defaultCamera: '',
      defaultMoods: [],
      defaultScene: '',
      defaultStyle: '',
      id: 'preset-2',
      isActive: false,
      label: 'Image Preset',
      organization: {},
    }),
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

describe('PresetsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deletePreset.mockResolvedValue({ ok: true });
    mocks.findAll.mockResolvedValue([]);
    mocks.patch.mockResolvedValue({});
    mocks.refetch.mockResolvedValue(undefined);
    mockPresetsQuery();
  });

  it('renders superadmin presets, query filters, and admin URL sync controls', async () => {
    render(<PresetsList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Launch Video')).toBeInTheDocument();
    expect(screen.getByText('Image Preset')).toBeInTheDocument();
    expect(screen.getByText('Camera: wide')).toBeInTheDocument();
    expect(screen.getByText('Blacklists: low quality')).toBeInTheDocument();
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
      '/admin/configuration/presets?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/presets?organization=org-1&brand=brand-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh presets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Preset' }));
    expect(mocks.refetch).toHaveBeenCalled();
    expect(mocks.openModal).toHaveBeenCalled();
  });

  it('toggles active presets and reports update failures', async () => {
    render(<PresetsList scope={PageScope.SUPERADMIN} />);

    fireEvent.click(screen.getByRole('button', { name: 'Active' }));

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith(
        'preset-1',
        expect.objectContaining({
          isActive: false,
          label: 'Launch Video',
        }),
      );
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Preset deactivated',
      );
    });

    mocks.patch.mockRejectedValueOnce(new Error('patch failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));

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

  it('opens edit and delete flows with the clicked preset', async () => {
    render(<PresetsList scope={PageScope.SUPERADMIN} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Image Preset' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('preset-modal')).toHaveTextContent(
      'Image Preset',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Image Preset' }),
    );
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Preset',
        message: expect.stringContaining('Image Preset'),
      }),
    );

    await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();

    expect(mocks.deletePreset).toHaveBeenCalledWith('preset-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Preset deleted');
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('reports load and delete failures while notifying parent loading state', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.useQuery.mockReturnValue({
      data: [makePreset()],
      error: new Error('load failed'),
      isFetching: true,
      isLoading: false,
      refetch: mocks.refetch,
    });

    render(
      <PresetsList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /presets failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load presets',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(true);
    });

    mocks.deletePreset.mockRejectedValueOnce(new Error('delete failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Launch Video' }),
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

  it('hides superadmin actions and disables active switches for brand scope', () => {
    render(<PresetsList scope={PageScope.BRAND} />);

    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Preset' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Edit Launch Video' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Active' })).toBeDisabled();
  });
});
