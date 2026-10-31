import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Appearance, Text, useColorScheme } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getThemeMock, updateThemeMock } = vi.hoisted(() => ({
  getThemeMock: vi.fn(),
  updateThemeMock: vi.fn(),
}));

vi.mock('@/services/api/settings.service', () => ({
  mobileSettingsService: {
    getTheme: getThemeMock,
    updateTheme: updateThemeMock,
  },
}));

import { useMobileAuth } from '@/contexts/auth-context';
import { MobileThemeProvider, useMobileTheme } from '@/contexts/theme-context';

function ThemeProbe() {
  const { preference, resolvedTheme, setPreference } = useMobileTheme();

  return (
    <>
      <Text>{`${preference}:${resolvedTheme}`}</Text>
      <button type="button" onClick={() => setPreference('light')}>
        Choose light
      </button>
    </>
  );
}

describe('MobileThemeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useColorScheme).mockReturnValue('dark');
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    vi.mocked(AsyncStorage.setItem).mockResolvedValue();
    getThemeMock.mockResolvedValue('system');
    updateThemeMock.mockResolvedValue(undefined);
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue(null),
      isLoaded: true,
      isSignedIn: false,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signInWithGoogleIdToken: vi.fn(),
      signOut: vi.fn(),
      user: null,
    });
  });

  it('does not render or apply a fallback scheme before local preference hydration', async () => {
    let resolveStoredPreference: (preference: 'dark') => void = () => undefined;
    vi.mocked(useColorScheme).mockReturnValue('light');
    vi.mocked(AsyncStorage.getItem).mockReturnValue(
      new Promise<'dark'>((resolve) => {
        resolveStoredPreference = resolve;
      }),
    );

    render(
      <MobileThemeProvider>
        <ThemeProbe />
      </MobileThemeProvider>,
    );

    expect(screen.queryByText('system:light')).toBeNull();
    expect(Appearance.setColorScheme).not.toHaveBeenCalled();

    await act(async () => {
      resolveStoredPreference('dark');
    });

    await waitFor(() => {
      expect(screen.getByText('dark:dark')).toBeTruthy();
      expect(Appearance.setColorScheme).toHaveBeenCalledWith('dark');
    });
  });

  it('defaults invalid local storage to System and follows the device scheme', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('sepia');

    render(
      <MobileThemeProvider>
        <ThemeProbe />
      </MobileThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('system:dark')).toBeTruthy();
    });
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('unspecified');
  });

  it('restores a valid local preference without contacting account settings', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('light');

    render(
      <MobileThemeProvider>
        <ThemeProbe />
      </MobileThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('light:light')).toBeTruthy();
    });
    expect(getThemeMock).not.toHaveBeenCalled();
  });

  it('hydrates from the signed-in account and persists that preference locally', async () => {
    const getToken = vi.fn().mockResolvedValue('auth-token');
    getThemeMock.mockResolvedValue('dark');
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken,
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signInWithGoogleIdToken: vi.fn(),
      signOut: vi.fn(),
      user: {
        email: 'qa@genfeed.ai',
        id: 'user-1',
        image: null,
        name: null,
        organizationId: null,
      },
    });

    render(
      <MobileThemeProvider>
        <ThemeProbe />
      </MobileThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('dark:dark')).toBeTruthy();
    });
    expect(getThemeMock).toHaveBeenCalledWith('auth-token');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
  });

  it('persists a choice locally but only account-syncs while authenticated', async () => {
    render(
      <MobileThemeProvider>
        <ThemeProbe />
      </MobileThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose light' })).toBeTruthy();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Choose light' }).click();
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('theme', 'light');
    expect(updateThemeMock).not.toHaveBeenCalled();
  });

  it('syncs an explicit choice to the authenticated account', async () => {
    const getToken = vi.fn().mockResolvedValue('auth-token');
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken,
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signInWithGoogleIdToken: vi.fn(),
      signOut: vi.fn(),
      user: {
        email: 'qa@genfeed.ai',
        id: 'user-1',
        image: null,
        name: null,
        organizationId: null,
      },
    });

    render(
      <MobileThemeProvider>
        <ThemeProbe />
      </MobileThemeProvider>,
    );

    await waitFor(() => {
      expect(getThemeMock).toHaveBeenCalledWith('auth-token');
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Choose light' }).click();
    });

    expect(updateThemeMock).toHaveBeenCalledWith('auth-token', 'light');
  });

  it('does not let a slower account read overwrite a newer local choice', async () => {
    let resolveAccountTheme: (theme: 'dark') => void = () => undefined;
    getThemeMock.mockReturnValue(
      new Promise<'dark'>((resolve) => {
        resolveAccountTheme = resolve;
      }),
    );
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('auth-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signInWithGoogleIdToken: vi.fn(),
      signOut: vi.fn(),
      user: {
        email: 'qa@genfeed.ai',
        id: 'user-1',
        image: null,
        name: null,
        organizationId: null,
      },
    });

    render(
      <MobileThemeProvider>
        <ThemeProbe />
      </MobileThemeProvider>,
    );

    await waitFor(() => {
      expect(getThemeMock).toHaveBeenCalled();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Choose light' }).click();
    });
    await act(async () => {
      resolveAccountTheme('dark');
    });

    expect(screen.getByText('light:light')).toBeTruthy();
  });
});
