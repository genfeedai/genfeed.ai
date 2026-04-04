import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-expo';
import { Slot } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { notificationsService } from '@/services/notifications.service';
import { sentryService } from '@/services/sentry.service';

sentryService.init();

const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value),
};

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function AppInitializer() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (isSignedIn && user) {
      sentryService.setUser({
        email: user.primaryEmailAddress?.emailAddress,
        id: user.id,
        organizationId: user.organizationMemberships?.[0]?.organization?.id,
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
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AppInitializer />
      <Slot />
    </ClerkProvider>
  );
}
