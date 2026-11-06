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
import SoundsList from './sounds-list';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  urlOrganization: 'org-1',
  deleteSound: vi.fn(),
  findAllPage: vi.fn(),
  getSoundsService: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  patch: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getSoundsService,
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

vi.mock('@/components/lazy/modal/LazyModal', () => ({
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
  usePathname: () => '/admin/configuration/elements/sounds',
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
  mocks.findAllPage.mockResolvedValue(paginatedResponse(data));
}

function render(ui: ReactElement, client?: QueryClient) {
  return renderWithoutClient(ui, { wrapper: queryClientWrapper(client) });
}

describe('SoundsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.urlOrganization = 'org-1';
    mocks.deleteSound.mockResolvedValue({ ok: true });
    mocks.getSoundsService.mockResolvedValue({
      delete: mocks.deleteSound,
      findAllPage: mocks.findAllPage,
      patch: mocks.patch,
    });
    mocks.patch.mockResolvedValue({});
    mockSounds();
  });

  it('owns empty totals before its first response', () => {
    mocks.findAllPage.mockReturnValueOnce(new Promise(() => {}));
    render(<SoundsList scope={PageScope.SUPERADMIN} />);
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('Pagination: sounds 0');
  });

  it('keeps the server total with its rows instead of another list total', async () => {
    mocks.findAllPage.mockResolvedValueOnce(
      paginatedResponse([makeSound()], { totalDocs: 61, totalPages: 5 }),
    );
    render(<SoundsList scope={PageScope.SUPERADMIN} />);
    await waitFor(() => {
      expect(
        screen.getByRole('navigation', { name: 'pagination' }),
      ).toHaveTextContent('Pagination: sounds 61');
    });
    expect(
      screen.queryByText('Pagination: sounds 200'),
    ).not.toBeInTheDocument();
  });

  it('loads superadmin sounds and reads the admin filters from the URL', async () => {
    render(<SoundsList scope={PageScope.SUPERADMIN} />);

    expect(screen.getByText('Loading sounds')).toBeInTheDocument();
    expect(await screen.findByText('Launch Sound')).toBeInTheDocument();
    expect(screen.getByText('Inactive Sound')).toBeInTheDocument();

    expect(mocks.findAllPage).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-1',
        organization: 'org-1',
        page: 2,
      }),
      expect.any(AbortSignal),
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
      expect(mocks.findAllPage).toHaveBeenCalledTimes(3);
    });
  });

  it('opens the delete flow with the clicked sound', async () => {
    render(<SoundsList scope={PageScope.SUPERADMIN} />);

    await screen.findByText('Inactive Sound');

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

    mocks.findAllPage.mockRejectedValueOnce(new Error('load failed'));
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
      findAllPage: mocks.findAllPage,
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
    expect(
      screen.queryByRole('button', { name: 'Edit Launch Sound' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'isActive-sound-1 checked' }),
    ).toBeDisabled();
  });

  it('paints the cached sounds and their own footer total when coming back', async () => {
    mocks.findAllPage.mockResolvedValue(
      paginatedResponse([makeSound()], { totalDocs: 14, totalPages: 2 }),
    );
    const client = createTestQueryClient();
    const firstVisit = render(
      <SoundsList scope={PageScope.SUPERADMIN} />,
      client,
    );
    expect(await screen.findByText('Launch Sound')).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    render(<SoundsList scope={PageScope.SUPERADMIN} />, client);

    expect(screen.getByText('Launch Sound')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('14');
    expect(screen.queryByText('Loading sounds')).not.toBeInTheDocument();
  });

  it("never paints one organization's cached sounds for another", async () => {
    const client = createTestQueryClient();
    const firstVisit = render(
      <SoundsList scope={PageScope.SUPERADMIN} />,
      client,
    );
    expect(await screen.findByText('Launch Sound')).toBeInTheDocument();
    firstVisit.unmount();

    mocks.urlOrganization = 'org-2';
    mocks.findAllPage.mockReturnValue(new Promise(() => {}));
    render(<SoundsList scope={PageScope.SUPERADMIN} />, client);

    expect(screen.getByText('Loading sounds')).toBeInTheDocument();
    expect(screen.queryByText('Launch Sound')).not.toBeInTheDocument();
  });
});
