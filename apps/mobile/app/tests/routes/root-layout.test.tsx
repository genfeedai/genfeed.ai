import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notificationsServiceMock, sentryServiceMock } = vi.hoisted(() => ({
  notificationsServiceMock: {
    registerForPushNotifications: vi.fn(),
    registerTokenWithServer: vi.fn(),
  },
  sentryServiceMock: {
    captureException: vi.fn(),
    init: vi.fn(),
    setUser: vi.fn(),
  },
}));

vi.mock('@/services/notifications.service', () => ({
  notificationsService: notificationsServiceMock,
}));

vi.mock('@/services/sentry.service', () => ({
  sentryService: sentryServiceMock,
}));

import { useAuth, useUser } from '@clerk/clerk-expo';
import RootLayout from '@/app/_layout';

describe('RootLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationsServiceMock.registerForPushNotifications.mockResolvedValue(
      null,
    );
  });

  it('clears Sentry user state for signed-out sessions', async () => {
    vi.mocked(useAuth).mockReturnValue({
      getToken: vi.fn(),
      isSignedIn: false,
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(useUser).mockReturnValue({
      user: null,
    } as unknown as ReturnType<typeof useUser>);

    render(<RootLayout />);

    await waitFor(() => {
      expect(sentryServiceMock.setUser).toHaveBeenCalledWith(null);
    });
    expect(
      notificationsServiceMock.registerForPushNotifications,
    ).not.toHaveBeenCalled();
  });

  it('registers push notifications and enriches Sentry for signed-in users', async () => {
    const getToken = vi.fn().mockResolvedValue('auth-token');

    notificationsServiceMock.registerForPushNotifications.mockResolvedValue(
      'expo-token',
    );
    vi.mocked(useAuth).mockReturnValue({
      getToken,
      isSignedIn: true,
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(useUser).mockReturnValue({
      user: {
        id: 'clerk-user-id',
        organizationMemberships: [
          {
            organization: {
              id: 'org_123',
            },
          },
        ],
        primaryEmailAddress: {
          emailAddress: 'qa@genfeed.ai',
        },
      },
    } as unknown as ReturnType<typeof useUser>);

    render(<RootLayout />);

    await waitFor(() => {
      expect(
        notificationsServiceMock.registerForPushNotifications,
      ).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        notificationsServiceMock.registerTokenWithServer,
      ).toHaveBeenCalledWith('auth-token', 'expo-token');
    });
    expect(sentryServiceMock.setUser).toHaveBeenCalledWith({
      email: 'qa@genfeed.ai',
      id: 'clerk-user-id',
      organizationId: 'org_123',
    });
  });
});
