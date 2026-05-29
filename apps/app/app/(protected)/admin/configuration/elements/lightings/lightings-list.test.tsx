import '@testing-library/jest-dom/vitest';
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
import LightingsList from './lightings-list';

const mocks = vi.hoisted(() => ({
  deleteLighting: vi.fn(),
  findAll: vi.fn(),
  getLightingsService: vi.fn(),
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
  useAuthedService: () => mocks.getLightingsService,
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

vi.mock('@services/elements/lightings.service', () => ({
  LightingsService: {
    getInstance: () => ({
      delete: mocks.deleteLighting,
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
      return <div>Loading lightings</div>;
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
  LazyModalLighting: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="lighting-modal">
      Modal lighting: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Lighting Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Lighting Modal
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
  usePathname: () => '/admin/configuration/elements/lightings',
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

function makeLighting(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Lighting description',
    id: 'lighting-1',
    key: 'softbox',
    label: 'Softbox',
    ...overrides,
  };
}

function mockLightings(
  data = [
    makeLighting(),
    makeLighting({ id: 'lighting-2', label: 'Golden Hour' }),
  ],
) {
  mocks.findAll.mockResolvedValue(data);
}

describe('LightingsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteLighting.mockResolvedValue({ ok: true });
    mocks.getLightingsService.mockResolvedValue({
      delete: mocks.deleteLighting,
      findAll: mocks.findAll,
    });
    mockLightings();
  });

  it('loads superadmin lightings and syncs admin filters to the URL', async () => {
    render(<LightingsList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Loading lightings')).toBeInTheDocument();
    expect(await screen.findByText('Softbox')).toBeInTheDocument();
    expect(screen.getByText('Golden Hour')).toBeInTheDocument();
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
      '/admin/configuration/elements/lightings?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/lightings?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('opens edit and delete flows with the clicked lighting', async () => {
    render(<LightingsList scope={PageScope.SUPERADMIN} />);

    await screen.findByText('Golden Hour');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Golden Hour' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('lighting-modal')).toHaveTextContent(
      'Golden Hour',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Golden Hour' }));
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Lighting',
        message: expect.stringContaining('Golden Hour'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteLighting).toHaveBeenCalledWith('lighting-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Lighting deleted');
  });

  it('reports load and delete failures while notifying parent state', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(
      <LightingsList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /lightings failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load lightings',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(false);
    });
    unmount();

    vi.clearAllMocks();
    mocks.getLightingsService.mockResolvedValue({
      delete: mocks.deleteLighting,
      findAll: mocks.findAll,
    });
    mockLightings();
    mocks.deleteLighting.mockRejectedValueOnce(new Error('delete failed'));
    render(<LightingsList scope={PageScope.SUPERADMIN} />);
    await screen.findByText('Softbox');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Softbox' }));

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete lighting',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete lighting',
    );
  });

  it('supports empty and brand scoped states', async () => {
    mockLightings([]);
    const registerRefresh = vi.fn();
    render(
      <LightingsList scope={PageScope.BRAND} onRefresh={registerRefresh} />,
    );

    expect(await screen.findByText('No lightings found')).toBeInTheDocument();
    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Softbox' })).toBeNull();
    expect(registerRefresh).toHaveBeenCalled();

    await act(async () => {
      await registerRefresh.mock.calls[0][0]();
    });
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
      'Lightings refreshed',
    );
  });
});
