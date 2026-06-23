import { Slot } from 'expo-router';
import { useEffect } from 'react';
import { MobileAuthProvider, useMobileAuth } from '@/contexts/auth-context';
import { notificationsService } from '@/services/notifications.service';
import { sentryService } from '@/services/sentry.service';

sentryService.init();

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

    const initNotifications = async () => {
      try {
        const pushToken =
          await notificationsService.registerForPushNotifications();
        if (pushToken) {
          const authToken = await getToken();

          if (authToken) {
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
  }, [isSignedIn, getToken]);

  return null;
}

export default function RootLayout() {
  return (
    <MobileAuthProvider>
      <AppInitializer />
      <Slot />
    </MobileAuthProvider>
  );
}
