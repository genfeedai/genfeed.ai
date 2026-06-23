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

import RootLayout from '@/app/_layout';
import { useMobileAuth } from '@/contexts/auth-context';

describe('RootLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationsServiceMock.registerForPushNotifications.mockResolvedValue(
      null,
    );
  });

  it('clears Sentry user state for signed-out sessions', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: false,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);

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
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken,
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: {
        email: 'qa@genfeed.ai',
        id: 'user_123',
        image: null,
        name: null,
        organizationId: 'org_123',
      },
    } as unknown as ReturnType<typeof useMobileAuth>);

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
      id: 'user_123',
      organizationId: 'org_123',
    });
  });
});
