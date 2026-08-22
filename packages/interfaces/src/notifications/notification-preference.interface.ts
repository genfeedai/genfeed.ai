import type { IBaseEntity } from '../core/base.interface';

export const NOTIFICATION_TOPICS = ['workflow.status'] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export const NOTIFICATION_CHANNELS = ['email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface INotificationPreference extends IBaseEntity {
  userId: string;
  topic: NotificationTopic;
  channel: NotificationChannel;
  isEnabled: boolean;
}
