import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiRequest } from '@/services/api/base-http.service';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationToken {
  token: string;
  platform: 'ios' | 'android';
}

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

class NotificationsService {
  private expoPushToken: string | null = null;

  async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      return null;
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // Configure Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        importance: Notifications.AndroidImportance.MAX,
        lightColor: '#6366f1',
        name: 'Default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    this.expoPushToken = tokenData.data;
    return this.expoPushToken;
  }

  async registerTokenWithServer(
    authToken: string,
    pushToken: string,
  ): Promise<void> {
    const platform = Platform.OS as 'ios' | 'android';

    await apiRequest(authToken, 'notifications/register', {
      body: { platform, token: pushToken },
      method: 'POST',
    });
  }

  async unregisterToken(authToken: string): Promise<void> {
    if (!this.expoPushToken) {
      return;
    }

    await apiRequest(authToken, 'notifications/unregister', {
      body: { token: this.expoPushToken },
      method: 'POST',
    });

    this.expoPushToken = null;
  }

  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void,
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
  }

  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void,
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  getBadgeCount(): Promise<number> {
    return Notifications.getBadgeCountAsync();
  }

  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }

  scheduleLocalNotification(
    payload: NotificationPayload,
    trigger?: Notifications.NotificationTriggerInput,
  ): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content: {
        body: payload.body,
        data: payload.data,
        title: payload.title,
      },
      trigger: trigger || null,
    });
  }

  cancelNotification(notificationId: string): Promise<void> {
    return Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  cancelAllNotifications(): Promise<void> {
    return Notifications.cancelAllScheduledNotificationsAsync();
  }

  getExpoPushToken(): string | null {
    return this.expoPushToken;
  }
}

export const notificationsService = new NotificationsService();
