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
import SoundsList from './sounds-list';

const mocks = vi.hoisted(() => ({
  deleteSound: vi.fn(),
  findAll: vi.fn(),
  getSoundsService: vi.fn(),
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
  useAuthedService: () => mocks.getSoundsService,
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
  notificationsService: {
    error: mocks.notificationsError,
    success: mocks.notificationsSuccess,
  },
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@services/elements/sounds.service', () => ({
  SoundsService: {
    getInstance: () => ({
      delete: mocks.deleteSound,
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
      <button type="button" onClick={() => onBrandChange('')}>
        Clear Brand
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
      return <div>Loading sounds</div>;
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
  LazyModalSound: ({
    onConfirm,
    sound,
  }: {
    onConfirm: () => void;
    sound?: { label?: string } | null;
  }) => (
    <div data-testid="sound-modal">
      Modal sound: {sound?.label ?? 'none'}
      <button type="button" onClick={onConfirm}>
        Confirm Sound Modal
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
  usePathname: () => '/admin/configuration/elements/sounds',
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

function makeSound(overrides: Record<string, unknown> = {}) {
  return {
    category: 'music',
    description: 'Sound description',
    id: 'sound-1',
    isActive: true,
    isDefault: false,
    key: 'launch_sound',
    label: 'Launch Sound',
    ...overrides,
  };
}

function mockSounds(
  data = [
    makeSound(),
    makeSound({ id: 'sound-2', isActive: false, label: 'Inactive Sound' }),
  ],
) {
  mocks.findAll.mockResolvedValue(data);
}

describe('SoundsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteSound.mockResolvedValue({ ok: true });
    mocks.getSoundsService.mockResolvedValue({
      delete: mocks.deleteSound,
      findAll: mocks.findAll,
      patch: mocks.patch,
    });
    mocks.patch.mockResolvedValue({});
    mockSounds();
  });

  it('loads superadmin sounds and syncs admin filters to the URL', async () => {
    render(<SoundsList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Loading sounds')).toBeInTheDocument();
    expect(await screen.findByText('Launch Sound')).toBeInTheDocument();
    expect(screen.getByText('Inactive Sound')).toBeInTheDocument();
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
      '/admin/configuration/elements/sounds?organization=org-2',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick Brand' }));
    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/configuration/elements/sounds?organization=org-1&brand=brand-2',
      { scroll: false },
    );
  });

  it('toggles active and default sound flags, then refreshes the list', async () => {
    render(<SoundsList scope={PageScope.SUPERADMIN} />);

    await screen.findByText('Launch Sound');
    fireEvent.click(
      screen.getByRole('button', { name: 'isActive-sound-1 checked' }),
    );

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('sound-1', {
        isActive: false,
      });
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Sound updated');
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'isDefault-sound-1 unchecked' }),
    );

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('sound-1', {
        isDefault: true,
      });
      expect(mocks.findAll).toHaveBeenCalledTimes(3);
    });
  });

  it('opens edit and delete flows with the clicked sound', async () => {
    render(<SoundsList scope={PageScope.SUPERADMIN} />);

    await screen.findByText('Inactive Sound');
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Inactive Sound' }),
    );
    expect(mocks.openModal).toHaveBeenCalled();
    expect(screen.getByTestId('sound-modal')).toHaveTextContent(
      'Inactive Sound',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Inactive Sound' }),
    );
    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Delete',
        label: 'Delete Sound',
        message: expect.stringContaining('Inactive Sound'),
      }),
    );

    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.deleteSound).toHaveBeenCalledWith('sound-2');
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Sound deleted');
  });

  it('reports load, update, and delete failures', async () => {
    const onLoadingChange = vi.fn();
    const onRefreshingChange = vi.fn();

    mocks.findAll.mockRejectedValueOnce(new Error('load failed'));
    render(
      <SoundsList
        scope={PageScope.SUPERADMIN}
        onLoadingChange={onLoadingChange}
        onRefreshingChange={onRefreshingChange}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /sounds failed',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to load sounds',
      );
      expect(onLoadingChange).toHaveBeenCalledWith(false);
      expect(onRefreshingChange).toHaveBeenCalledWith(false);
    });

    vi.clearAllMocks();
    mocks.getSoundsService.mockResolvedValue({
      delete: mocks.deleteSound,
      findAll: mocks.findAll,
      patch: mocks.patch,
    });
    mockSounds();
    mocks.patch.mockRejectedValueOnce(new Error('patch failed'));
    render(<SoundsList scope={PageScope.SUPERADMIN} />);
    await screen.findByText('Launch Sound');
    fireEvent.click(
      screen.getByRole('button', { name: 'isActive-sound-1 checked' }),
    );

    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to update sound',
      );
    });

    mocks.deleteSound.mockRejectedValueOnce(new Error('delete failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Launch Sound' }),
    );
    await act(async () => {
      await mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete sound',
      expect.any(Error),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to delete sound',
    );
  });

  it('hides superadmin controls and disables checkboxes outside superadmin scope', async () => {
    render(<SoundsList scope={PageScope.BRAND} />);

    await screen.findByText('Launch Sound');
    expect(screen.queryByText('Admin org: org-1')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit Launch Sound' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'isActive-sound-1 checked' }),
    ).toBeDisabled();
  });
});
