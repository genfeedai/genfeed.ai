import type { IBaseEntity } from '../core/base.interface';

export const PRODUCT_EMAIL_TOPICS = [
  'lifecycle.onboarding',
  'content.weekly',
  'content.daily',
  'content.digest',
  'publishing.connection',
  'billing.credits',
  'generation.status',
] as const;
export type ProductEmailTopic = (typeof PRODUCT_EMAIL_TOPICS)[number];
export const NOTIFICATION_TOPICS = [
  'workflow.status',
  'agent.status',
  ...PRODUCT_EMAIL_TOPICS,
] as const;
export const PRODUCT_EMAIL_PREFERENCES = [
  {
    topic: 'lifecycle.onboarding',
    label: 'Getting started',
    description: 'Help with setup, creating content and completing a purchase.',
    isDefaultEnabled: true,
  },
  {
    topic: 'content.weekly',
    label: 'Weekly recap',
    description:
      'A recap when you create at least five pieces in the previous week (Monday–Sunday, UTC).',
    isDefaultEnabled: true,
  },
  {
    topic: 'content.daily',
    label: 'Daily recap',
    description: 'A summary of your completed content on active days (UTC).',
    isDefaultEnabled: false,
  },
  {
    topic: 'content.digest',
    label: 'Brand performance digest',
    description:
      'The publishing performance report for a brand, sent when someone requests it.',
    isDefaultEnabled: true,
  },
  {
    topic: 'publishing.connection',
    label: 'Publishing reminders',
    description:
      'Reminders when your content is ready but needs a connected account.',
    isDefaultEnabled: true,
  },
  {
    topic: 'billing.credits',
    label: 'Credit balance alerts',
    description: 'An alert when your available credits are low or exhausted.',
    isDefaultEnabled: true,
  },
  {
    topic: 'generation.status',
    label: 'Generation updates',
    description:
      'Email when a generation taking at least two minutes completes or fails. You can leave the studio while it runs.',
    isDefaultEnabled: false,
  },
] as const;

export function defaultProductEmailPreference(topic: string): boolean {
  return (
    PRODUCT_EMAIL_PREFERENCES.find((entry) => entry.topic === topic)
      ?.isDefaultEnabled ?? false
  );
}
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export const NOTIFICATION_CHANNELS = ['email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface INotificationPreference extends IBaseEntity {
  userId: string;
  topic: NotificationTopic;
  channel: NotificationChannel;
  isEnabled: boolean;
}
