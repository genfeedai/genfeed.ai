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
import ScenesList from './scenes-list';

const mocks = vi.hoisted(() => ({
  deleteScene: vi.fn(),
  findAll: vi.fn(),
  getScenesService: vi.fn(),
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
  useAuthedService: () => mocks.getScenesService,
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

vi.mock('@services/elements/scenes.service', () => ({
  ScenesService: {
    getInstance: () => ({
      delete: mocks.deleteScene,
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
      return <div>Loading scenes</div>;
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
  LazyModalScene: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="scene-modal">
      Modal scene: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Scene Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Scene Modal
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
  usePathname: () => '/admin/configuration/elements/scenes',
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

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Scene description',
    id: 'scene-1',
    key: 'studio',
    label: 'Studio',
    ...overrides,
  };
}

function mockScenes(
  data = [makeScene(), makeScene({ id: 'scene-2', label: 'Kitchen' })],
) {
  mocks.findAll.mockResolvedValue(data);
}

describe('ScenesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteScene.mockResolvedValue({ ok: true });
    mocks.getScenesService.mockResolvedValue({
      delete: mocks.deleteScene,
      findAll: mocks.findAll,
    });
    mockScenes();
  });

  it('loads superadmin scenes and syncs admin filters to the URL', async () => {
    render(<ScenesList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Loading scenes')).toBeInTheDocument();
    expect(await screen.findByText('Studio')).toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
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
      '/admin/configuration/elements/scenes?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/scenes?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('opens edit and delete flows with the clicked scene', async () => {
    render(<ScenesList scope={PageScope.SUPERADMIN} />);

    await screen.findByText('Kitchen');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Kitchen' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('scene-modal')).toHaveTextContent('Kitchen');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Kitchen' }));
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Scene',
        message: expect.stringContaining('Kitchen'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteScene).toHaveBeenCalledWith('scene-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Scene deleted');
  });

  it('reports load and delete failures while notifying parent state', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(
      <ScenesList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /scenes failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load scenes',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(false);
    });
    unmount();

    vi.clearAllMocks();
    mocks.getScenesService.mockResolvedValue({
      delete: mocks.deleteScene,
      findAll: mocks.findAll,
    });
    mockScenes();
    mocks.deleteScene.mockRejectedValueOnce(new Error('delete failed'));
    render(<ScenesList scope={PageScope.SUPERADMIN} />);
    await screen.findByText('Studio');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Studio' }));

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete scene',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete scene',
    );
  });

  it('supports empty and brand scoped states', async () => {
    mockScenes([]);
    render(<ScenesList scope={PageScope.BRAND} />);

    expect(await screen.findByText('No scenes found')).toBeInTheDocument();
    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Studio' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Studio' })).toBeNull();
  });
});
