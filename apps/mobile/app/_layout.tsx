import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  Slot,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { MobileAuthProvider, useMobileAuth } from '@/contexts/auth-context';
import { MobileThemeProvider, useMobileTheme } from '@/contexts/theme-context';
import { notificationsService } from '@/services/notifications.service';
import { sentryService } from '@/services/sentry.service';

sentryService.init();
void SplashScreen.preventAutoHideAsync();

function AppInitializer() {
  const { getToken, isSignedIn, user } = useMobileAuth();

  useEffect(() => {
    if (isSignedIn && user) {
      sentryService.setUser({
        email: user.email ?? undefined,
        id: user.id,
        organizationId: user.organizationId ?? undefined,
      });
    } else {
      sentryService.setUser(null);
    }
  }, [isSignedIn, user]);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const abortController = new AbortController();

    const initNotifications = async () => {
      try {
        const pushToken =
          await notificationsService.registerForPushNotifications();
        if (pushToken && !abortController.signal.aborted) {
          const authToken = await getToken();

          if (authToken && !abortController.signal.aborted) {
            await notificationsService.registerTokenWithServer(
              authToken,
              pushToken,
            );
          }
        }
      } catch (error) {
        sentryService.captureException(error as Error, {
          context: 'notification_registration',
        });
      }
    };

    initNotifications();

    return () => {
      abortController.abort();
    };
  }, [isSignedIn, getToken]);

  return null;
}

function ThemedApplication() {
  const { colors, resolvedTheme } = useMobileTheme();
  const navigationTheme = useMemo(() => {
    const baseTheme = resolvedTheme === 'dark' ? DarkTheme : DefaultTheme;

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: colors.bgPrimary,
        border: colors.bgBorder,
        card: colors.bgSecondary,
        notification: colors.error,
        primary: colors.primary,
        text: colors.textPrimary,
      },
    };
  }, [colors, resolvedTheme]);

  useEffect(() => {
    const abortController = new AbortController();

    const presentApplication = async () => {
      try {
        await SystemUI.setBackgroundColorAsync(colors.bgPrimary);
      } finally {
        // A newer run (the color changed) hides the splash after its own paint.
        if (!abortController.signal.aborted) {
          await SplashScreen.hideAsync().catch(() => undefined);
        }
      }
    };

    void presentApplication();

    return () => {
      abortController.abort();
    };
  }, [colors.bgPrimary]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      <AppInitializer />
      <Slot />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <MobileAuthProvider>
      <MobileThemeProvider>
        <ThemedApplication />
      </MobileThemeProvider>
    </MobileAuthProvider>
  );
}
