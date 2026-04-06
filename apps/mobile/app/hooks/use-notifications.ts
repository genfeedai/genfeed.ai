import { useAuth } from '@clerk/clerk-expo';
import type * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsService } from '@/services/notifications.service';

interface NotificationData {
  type?: string;
  contentId?: string;
  approvalId?: string;
}

type NotificationRoute =
  | { path: `/ingredient/${string}` }
  | { path: '/analytics' }
  | { path: `/approval/${string}` }
  | { path: '/approvals' }
  | null;

function getNotificationRoute(data: NotificationData): NotificationRoute {
  switch (data.type) {
    case 'content_ready':
      return data.contentId ? { path: `/ingredient/${data.contentId}` } : null;
    case 'analytics_update':
      return { path: '/analytics' };
    case 'approval_request':
    case 'approval_reminder':
      return data.approvalId ? { path: `/approval/${data.approvalId}` } : null;
    case 'approval_decision':
      return { path: '/approvals' };
    default:
      return null;
  }
}

export function useNotifications() {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();

  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] =
    useState<Notifications.Notification | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const notificationListener = useRef<Notifications.Subscription | undefined>(
    undefined,
  );
  const responseListener = useRef<Notifications.Subscription | undefined>(
    undefined,
  );

  const registerForNotifications = useCallback(async () => {
    if (!isSignedIn) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pushToken =
        await notificationsService.registerForPushNotifications();

      if (pushToken) {
        setExpoPushToken(pushToken);

        const authToken = await getToken();
        if (authToken) {
          await notificationsService.registerTokenWithServer(
            authToken,
            pushToken,
          );
          setIsRegistered(true);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error('Failed to register for notifications'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [getToken, isSignedIn]);

  const clearBadge = useCallback(async () => {
    await notificationsService.clearBadge();
  }, []);

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content
        .data as NotificationData;
      const route = getNotificationRoute(data);
      if (route) {
        router.push(route.path);
      }
    },
    [router],
  );

  useEffect(() => {
    if (isSignedIn) {
      registerForNotifications();
    }
  }, [isSignedIn, registerForNotifications]);

  useEffect(() => {
    notificationListener.current =
      notificationsService.addNotificationReceivedListener(setNotification);

    responseListener.current =
      notificationsService.addNotificationResponseListener(
        handleNotificationResponse,
      );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [handleNotificationResponse]);

  return {
    clearBadge,
    error,
    expoPushToken,
    isLoading,
    isRegistered,
    notification,
    registerForNotifications,
  };
}
