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
import MoodsList from './moods-list';

const mocks = vi.hoisted(() => ({
  deleteMood: vi.fn(),
  findAll: vi.fn(),
  getMoodsService: vi.fn(),
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
  useAuthedService: () => mocks.getMoodsService,
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

vi.mock('@services/elements/moods.service', () => ({
  MoodsService: {
    getInstance: () => ({
      delete: mocks.deleteMood,
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
      return <div>Loading moods</div>;
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
  LazyModalMood: ({
    item,
    onClose,
    onConfirm,
  }: {
    item?: { label?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="mood-modal">
      Modal mood: {item?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Mood Modal
      </button>
      <button type="button" onClick={onClose}>
        Close Mood Modal
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
  usePathname: () => '/admin/configuration/elements/moods',
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

function makeMood(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Mood description',
    id: 'mood-1',
    key: 'calm',
    label: 'Calm',
    ...overrides,
  };
}

function mockMoods(
  data = [makeMood(), makeMood({ id: 'mood-2', label: 'Urgent' })],
) {
  mocks.findAll.mockResolvedValue(data);
}

describe('MoodsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteMood.mockResolvedValue({ ok: true });
    mocks.getMoodsService.mockResolvedValue({
      delete: mocks.deleteMood,
      findAll: mocks.findAll,
    });
    mockMoods();
  });

  it('loads superadmin moods and syncs admin filters to the URL', async () => {
    render(<MoodsList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Loading moods')).toBeInTheDocument();
    expect(await screen.findByText('Calm')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
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
      '/admin/configuration/elements/moods?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/moods?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('opens edit and delete flows with the clicked mood', async () => {
    render(<MoodsList scope={PageScope.SUPERADMIN} />);

    await screen.findByText('Urgent');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Urgent' }));
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('mood-modal')).toHaveTextContent('Urgent');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Urgent' }));
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Mood',
        message: expect.stringContaining('Urgent'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteMood).toHaveBeenCalledWith('mood-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Mood deleted');
  });

  it('reports load and delete failures while notifying parent state', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(
      <MoodsList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /moods failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load moods',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(false);
    });
    unmount();

    vi.clearAllMocks();
    mocks.getMoodsService.mockResolvedValue({
      delete: mocks.deleteMood,
      findAll: mocks.findAll,
    });
    mockMoods();
    mocks.deleteMood.mockRejectedValueOnce(new Error('delete failed'));
    render(<MoodsList scope={PageScope.SUPERADMIN} />);
    await screen.findByText('Calm');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Calm' }));

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete mood',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete mood',
    );
  });

  it('supports empty and brand scoped states', async () => {
    mockMoods([]);
    const registerRefresh = vi.fn();
    render(<MoodsList scope={PageScope.BRAND} onRefresh={registerRefresh} />);

    expect(await screen.findByText('No moods found')).toBeInTheDocument();
    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Calm' })).toBeNull();
    expect(registerRefresh).toHaveBeenCalled();

    await act(async () => {
      await registerRefresh.mock.calls[0][0]();
    });
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Moods refreshed');
  });
});
