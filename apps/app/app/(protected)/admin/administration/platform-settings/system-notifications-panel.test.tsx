import * as domMatchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';
import type { ISystemNotificationOverview } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemNotificationsPanel from './system-notifications-panel';

expect.extend(domMatchers);
const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
  retry: vi.fn(),
  configure: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
const getService = vi.hoisted(() => vi.fn(async () => mocks));
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
    '../../../../../tests/next-intl.stub'
  );
  const t = translateFromCatalog('pages.platformSettings.notifications');
  return { useTranslations: () => t };
});
const overview: ISystemNotificationOverview = {
  id: 'system-notifications',
  configuration: {
    enabled: true,
    eventTypes: ['user.created'],
    recordingEnabled: true,
    transportConfigured: true,
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
});
describe('admin notification destinations', () => {
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
});
