import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BotsPage from './bots-page';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  error: vi.fn(),
  findAll: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  success: vi.fn(),
}));

// The real hook returns a referentially stable callback; the mock must too,
// or every render re-fires the load effect and drains the *Once mocks.
const getBotsServiceStable = vi.hoisted(() => async () => ({
  findAll: mocks.findAll,
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
    mocks.findAll.mockResolvedValueOnce([]);

    render(<BotsPage />);

    await waitFor(() => {
      expect(mocks.findAll).toHaveBeenCalledWith(
        { limit: ITEMS_PER_PAGE, page: 3, sort: 'createdAt: -1' },
        expect.any(AbortSignal),
      );
    });
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });

  it('renders the container chrome and refresh action while bots are loading', async () => {
    let resolveBots: (value: unknown[]) => void = () => undefined;
    mocks.findAll.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBots = resolve;
      }),
    );

    render(<BotsPage />);

    expect(screen.getByRole('heading', { name: 'Bots' })).toBeVisible();
    expect(screen.getByTestId('automation-bots-surface')).toBeVisible();
    expect(screen.queryByText('No bots yet')).not.toBeInTheDocument();

    resolveBots([
      {
        category: 'engagement',
        id: 'bot-1',
        label: 'Sample bot',
        status: 'ACTIVE',
      },
    ]);

    expect(await screen.findByText('Sample bot')).toBeVisible();
  });

  it('shows the empty state inside the surface once loading resolves with no bots', async () => {
    mocks.findAll.mockResolvedValueOnce([]);

    render(<BotsPage />);

    await waitFor(() => {
      expect(screen.getByText('No bots yet')).toBeVisible();
    });
    expect(screen.getByTestId('automation-bots-surface')).toBeVisible();
  });
});
