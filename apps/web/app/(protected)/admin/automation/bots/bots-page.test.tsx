import { paginatedResponse } from '@app-tests/paginated-response';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BotsPage from './bots-page';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  error: vi.fn(),
  findAllPage: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  success: vi.fn(),
}));

const getBotsServiceStable = vi.hoisted(() => async () => ({
  findAllPage: mocks.findAllPage,
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
  useAuthedService: () => getBotsServiceStable,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/automation/bots',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

const notificationsServiceInstance = vi.hoisted(() => ({
  error: mocks.error,
  success: mocks.success,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => notificationsServiceInstance,
  },
}));

describe('BotsPage shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
  });

  it('requests the page from the URL with the page size and renders pagination', async () => {
    mocks.searchParams = new URLSearchParams('page=3');
    mocks.findAllPage.mockResolvedValueOnce(paginatedResponse([]));

    render(<BotsPage />, { wrapper: queryClientWrapper() });

    await waitFor(() => {
      expect(mocks.findAllPage).toHaveBeenCalledWith(
        { limit: ITEMS_PER_PAGE, page: 3, sort: 'createdAt: -1' },
        expect.any(AbortSignal),
      );
    });
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });

  it('searches bots server-side with the term in the URL', async () => {
    mocks.searchParams = new URLSearchParams('q=livestream');
    mocks.findAllPage.mockResolvedValueOnce(paginatedResponse([]));

    render(<BotsPage />, { wrapper: queryClientWrapper() });

    await waitFor(() => {
      expect(mocks.findAllPage).toHaveBeenCalledWith(
        {
          limit: ITEMS_PER_PAGE,
          page: 1,
          search: 'livestream',
          sort: 'createdAt: -1',
        },
        expect.any(AbortSignal),
      );
    });
    expect(await screen.findByText('No bots found')).toBeVisible();
  });

  it('renders the container chrome and refresh action while bots are loading', async () => {
    let resolveBots: (value: ReturnType<typeof paginatedResponse>) => void =
      () => undefined;
    mocks.findAllPage.mockReturnValueOnce(
      new Promise<ReturnType<typeof paginatedResponse>>((resolve) => {
        resolveBots = resolve;
      }),
    );

    render(<BotsPage />, { wrapper: queryClientWrapper() });

    expect(screen.getByRole('heading', { name: 'Bots' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();
    expect(screen.queryByText('No bots found')).not.toBeInTheDocument();

    resolveBots(
      paginatedResponse([
        {
          category: 'engagement',
          id: 'bot-1',
          label: 'Sample bot',
          status: 'ACTIVE',
        },
      ]),
    );

    expect(await screen.findByText('Sample bot')).toBeVisible();
  });

  it('shows the shared empty state once loading resolves with no bots', async () => {
    mocks.findAllPage.mockResolvedValueOnce(paginatedResponse([]));

    render(<BotsPage />, { wrapper: queryClientWrapper() });

    expect(await screen.findByText('No bots found')).toBeVisible();
  });

  it('lists bots as table rows with their status and counts', async () => {
    mocks.findAllPage.mockResolvedValueOnce(
      paginatedResponse([
        {
          category: 'ENGAGEMENT',
          engagementsCount: 12,
          id: 'bot-1',
          label: 'Sample bot',
          messagesCount: 7,
          status: 'PAUSED',
          targets: [
            {
              channelId: 'c-1',
              channelLabel: 'Launch room',
              platform: 'discord',
            },
          ],
        },
      ]),
    );

    render(<BotsPage />, { wrapper: queryClientWrapper() });

    const row = (await screen.findByText('Sample bot')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText('Paused')).toBeVisible();
    expect(cells.getByText('Launch room')).toBeVisible();
    expect(cells.getByText('7')).toBeVisible();
    expect(cells.getByText('12')).toBeVisible();
    expect(cells.getByText('Never')).toBeVisible();
  });

  it.each([
    ['organization=org-7', { organizationId: 'org-7', sort: 'createdAt: -1' }],
    [
      'organization=org-7&brand=brand-3',
      { brandId: 'brand-3', organizationId: 'org-7', sort: 'createdAt: -1' },
    ],
    ['sort=-label', { sort: 'label: -1' }],
    ['sort=-messagesCount', { sort: 'createdAt: -1' }],
  ])('requests bots for the URL %s', async (query, expected) => {
    mocks.searchParams = new URLSearchParams(query);
    mocks.findAllPage.mockResolvedValueOnce(paginatedResponse([]));

    render(<BotsPage />, { wrapper: queryClientWrapper() });

    await waitFor(() => {
      expect(mocks.findAllPage).toHaveBeenCalledWith(
        { limit: ITEMS_PER_PAGE, page: 1, ...expected },
        expect.any(AbortSignal),
      );
    });
  });

  it('paints the cached bots on a return visit, with no skeleton', async () => {
    mocks.findAllPage.mockResolvedValueOnce(
      paginatedResponse([
        {
          category: 'engagement',
          id: 'bot-1',
          label: 'Sample bot',
          status: 'ACTIVE',
        },
      ]),
    );
    const client = createTestQueryClient();
    const first = render(<BotsPage />, { wrapper: queryClientWrapper(client) });
    await screen.findByText('Sample bot');
    first.unmount();
    mocks.findAllPage.mockReturnValueOnce(new Promise(() => {}));

    render(<BotsPage />, { wrapper: queryClientWrapper(client) });

    expect(screen.getByText('Sample bot')).toBeVisible();
  });

  it('toasts once when the bots fail to load', async () => {
    mocks.findAllPage.mockRejectedValueOnce(new Error('boom'));

    render(<BotsPage />, { wrapper: queryClientWrapper() });

    await waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith('Failed to load bots');
    });
    expect(mocks.error).toHaveBeenCalledTimes(1);
  });
});
