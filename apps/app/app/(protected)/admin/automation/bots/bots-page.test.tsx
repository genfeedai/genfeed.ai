import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BotsPage from './bots-page';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  findAllPages: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  success: vi.fn(),
}));

// The real hook returns a referentially stable callback; the mock must too,
// or every render re-fires the load effect and drains the *Once mocks.
const getBotsServiceStable = vi.hoisted(() => async () => ({
  findAllPages: mocks.findAllPages,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getBotsServiceStable,
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
  });

  it('renders the container chrome and refresh action while bots are loading', async () => {
    let resolveBots: (value: unknown[]) => void = () => undefined;
    mocks.findAllPages.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBots = resolve;
      }),
    );

    render(<BotsPage />);

    expect(screen.getByRole('heading', { name: 'Bots' })).toBeVisible();
    expect(
      screen.getByText(
        'Manage automation bots for X/Twitter, Twitch, and YouTube',
      ),
    ).toBeVisible();
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
    mocks.findAllPages.mockResolvedValueOnce([]);

    render(<BotsPage />);

    await waitFor(() => {
      expect(screen.getByText('No bots yet')).toBeVisible();
    });
    expect(screen.getByTestId('automation-bots-surface')).toBeVisible();
  });
});
