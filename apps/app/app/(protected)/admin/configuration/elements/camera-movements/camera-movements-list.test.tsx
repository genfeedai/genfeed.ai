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
import CameraMovementsList from './camera-movements-list';

const mocks = vi.hoisted(() => ({
  deleteMovement: vi.fn(),
  findAll: vi.fn(),
  getCameraMovementsService: vi.fn(),
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
  useAuthedService: () => mocks.getCameraMovementsService,
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

vi.mock('@services/elements/camera-movements.service', () => ({
  CameraMovementsService: {
    getInstance: () => ({
      delete: mocks.deleteMovement,
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
      return <div>Loading camera movements</div>;
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
  LazyModalCameraMovement: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="camera-movement-modal">
      Modal movement: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Movement Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Movement Modal
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
  usePathname: () => '/admin/configuration/elements/camera-movements',
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

function makeMovement(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Movement description',
    id: 'movement-1',
    key: 'slow_push',
    label: 'Slow Push',
    ...overrides,
  };
}

function mockMovements(
  data = [
    makeMovement(),
    makeMovement({ id: 'movement-2', label: 'Crane Up' }),
  ],
) {
  mocks.findAll.mockResolvedValue(data);
}

describe('CameraMovementsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteMovement.mockResolvedValue({ ok: true });
    mocks.getCameraMovementsService.mockResolvedValue({
      delete: mocks.deleteMovement,
      findAll: mocks.findAll,
    });
    mockMovements();
  });

  it('loads superadmin camera movements and syncs admin filters to the URL', async () => {
    render(<CameraMovementsList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Loading camera movements')).toBeInTheDocument();
    expect(await screen.findByText('Slow Push')).toBeInTheDocument();
    expect(screen.getByText('Crane Up')).toBeInTheDocument();
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
      '/admin/configuration/elements/camera-movements?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/camera-movements?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('opens edit and delete flows with the clicked movement', async () => {
    render(<CameraMovementsList scope={PageScope.SUPERADMIN} />);

    await screen.findByText('Crane Up');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Crane Up' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('camera-movement-modal')).toHaveTextContent(
      'Crane Up',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Crane Up' }));
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Camera Movement',
        message: expect.stringContaining('Crane Up'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteMovement).toHaveBeenCalledWith('movement-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
      'Camera movement deleted',
    );
  });

  it('reports load and delete failures while notifying parent loading state', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(
      <CameraMovementsList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /camera-movements failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load camera movements',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(false);
    });
    unmount();

    vi.clearAllMocks();
    mocks.getCameraMovementsService.mockResolvedValue({
      delete: mocks.deleteMovement,
      findAll: mocks.findAll,
    });
    mockMovements();
    mocks.deleteMovement.mockRejectedValueOnce(new Error('delete failed'));
    render(<CameraMovementsList scope={PageScope.SUPERADMIN} />);
    await screen.findByText('Slow Push');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Slow Push' }));

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete camera movement',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete camera movement',
    );
  });

  it('hides superadmin filters and actions outside superadmin scope', async () => {
    render(<CameraMovementsList scope={PageScope.BRAND} />);

    await screen.findByText('Slow Push');
    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Slow Push' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Delete Slow Push' }),
    ).toBeNull();
  });
});
