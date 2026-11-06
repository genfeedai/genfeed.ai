import * as domMatchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { ISystemNotificationOverview } from '@genfeedai/contracts/interfaces';
import type { QueryClient } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render as renderWithoutClient,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemNotificationsPanel from './system-notifications-panel';

expect.extend(domMatchers);
const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
  testDiscordChannel: vi.fn(),
  retry: vi.fn(),
  configure: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
const getService = vi.hoisted(() => vi.fn(async () => mocks));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mocks.error, success: mocks.success }),
  },
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  const t = translateFromCatalog('pages.platformSettings.notifications');
  return { useTranslations: () => t };
});
function render(ui: ReactElement, client?: QueryClient) {
  return renderWithoutClient(ui, { wrapper: queryClientWrapper(client) });
}
const overview: ISystemNotificationOverview = {
  id: 'system-notifications',
  configuration: {
    enabled: true,
    eventTypes: ['user.created'],
    recordingEnabled: true,
    transportConfigured: true,
    discord: null,
  },
  observedSignups: 1,
  signupObservationStart: null,
  destinations: [
    {
      id: 'd1',
      label: 'Signup alerts',
      provider: 'discord',
      address: null,
      hasCredentials: true,
      isEnabled: true,
      eventTypes: ['user.created'],
    },
  ],
  deliveries: [
    {
      id: 'delivery1',
      eventId: 'user.created/u1',
      destinationId: 'd1',
      type: 'user.created',
      occurredAt: '2026-10-02T00:00:00Z',
      status: 'failed',
      attempts: 1,
      deliveredAt: null,
    },
  ],
};
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.clearAllMocks();
  mocks.overview.mockResolvedValue(overview);
  mocks.save.mockResolvedValue(overview);
  mocks.retry.mockResolvedValue(overview);
  mocks.test.mockResolvedValue(overview);
  mocks.testDiscordChannel.mockResolvedValue(overview);
});
describe('admin notification destinations', () => {
  it('warns when Discord channels are not set', async () => {
    mocks.overview.mockResolvedValue({
      ...overview,
      configuration: {
        ...overview.configuration,
        discord: {
          isBotConfigured: true,
          isBotReady: true,
          missingChannels: ['users', 'studio'],
        },
      },
    });
    render(<SystemNotificationsPanel />);
    expect(
      await screen.findByText(/channel ID is set.*users, studio/),
    ).toBeTruthy();
  });
  it('posts a test message to a Discord channel and reports a failure reason', async () => {
    const discordOverview = {
      ...overview,
      configuration: {
        ...overview.configuration,
        discord: {
          isBotConfigured: true,
          isBotReady: true,
          missingChannels: [],
        },
      },
    };
    mocks.overview.mockResolvedValue(discordOverview);
    // A channel test returns the refreshed overview, Discord still configured.
    mocks.testDiscordChannel.mockResolvedValue(discordOverview);
    render(<SystemNotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test Models' }));
    await waitFor(() =>
      expect(mocks.testDiscordChannel).toHaveBeenCalledWith('models'),
    );
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());

    mocks.testDiscordChannel.mockRejectedValueOnce(new Error('rejected'));
    fireEvent.click(screen.getByRole('button', { name: 'Test Studio' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  });
  it('preserves the encrypted webhook when changing only a destination name', async () => {
    render(<SystemNotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'New channel name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save destination' }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'New channel name',
          address: undefined,
          eventTypes: ['user.created'],
        }),
        'd1',
      ),
    );
  });
  it('preserves the configured event filters when delivery is toggled', async () => {
    mocks.configure.mockResolvedValue(overview);
    render(<SystemNotificationsPanel />);
    fireEvent.click(
      await screen.findByRole('switch', {
        name: 'Deliver system notifications',
      }),
    );
    await waitFor(() =>
      expect(mocks.configure).toHaveBeenCalledWith(false, ['user.created']),
    );
  });
  it('tests a saved destination and retries only the selected failed delivery', async () => {
    render(<SystemNotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send test' }));
    await waitFor(() => expect(mocks.test).toHaveBeenCalledWith('d1'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith('delivery1'));
  });
  it('shows a recording warning until signup recording is enabled', async () => {
    mocks.overview.mockResolvedValue({
      ...overview,
      configuration: { ...overview.configuration, recordingEnabled: false },
    });
    render(<SystemNotificationsPanel />);
    expect(
      await screen.findByText(/Recording is disabled/),
    ).toBeInTheDocument();
  });
  it('paints the cached destinations at once when the page is revisited', async () => {
    const client = createTestQueryClient();
    const first = render(<SystemNotificationsPanel />, client);
    expect(
      await screen.findByText('Signup alerts · discord'),
    ).toBeInTheDocument();
    first.unmount();

    mocks.overview.mockReturnValue(new Promise(() => {}));
    render(<SystemNotificationsPanel />, client);

    expect(screen.getByText('Signup alerts · discord')).toBeInTheDocument();
    expect(
      screen.queryByText('Loading notifications…'),
    ).not.toBeInTheDocument();
  });
  it('keeps a saved destination when the page is revisited', async () => {
    mocks.save.mockResolvedValue({
      ...overview,
      destinations: [{ ...overview.destinations[0], label: 'Renamed alerts' }],
    });
    const client = createTestQueryClient();
    const first = render(<SystemNotificationsPanel />, client);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Renamed alerts' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save destination' }));
    expect(
      await screen.findByText('Renamed alerts · discord'),
    ).toBeInTheDocument();
    first.unmount();

    mocks.overview.mockReturnValue(new Promise(() => {}));
    render(<SystemNotificationsPanel />, client);

    expect(screen.getByText('Renamed alerts · discord')).toBeInTheDocument();
    expect(
      screen.queryByText('Signup alerts · discord'),
    ).not.toBeInTheDocument();
  });
  it('keeps a saved destination when an older refresh answers after the save', async () => {
    mocks.save.mockResolvedValue({
      ...overview,
      destinations: [{ ...overview.destinations[0], label: 'Renamed alerts' }],
    });
    const client = createTestQueryClient();
    render(<SystemNotificationsPanel />, client);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    // A refresh starts before the save and answers after it, with the old name.
    let answerRefresh: (value: ISystemNotificationOverview) => void = () => {};
    mocks.overview.mockReturnValue(
      new Promise<ISystemNotificationOverview>((resolve) => {
        answerRefresh = resolve;
      }),
    );
    void client.refetchQueries();
    await waitFor(() => expect(mocks.overview).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Renamed alerts' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save destination' }));
    expect(
      await screen.findByText('Renamed alerts · discord'),
    ).toBeInTheDocument();
    await act(async () => {
      answerRefresh(overview);
      // React Query tells the panel on the next tick.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText('Renamed alerts · discord')).toBeInTheDocument();
    expect(
      screen.queryByText('Signup alerts · discord'),
    ).not.toBeInTheDocument();
  });
});
