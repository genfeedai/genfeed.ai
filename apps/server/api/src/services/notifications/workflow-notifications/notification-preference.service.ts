import {
  EMAIL_NOTIFICATION_CHANNEL,
  WORKFLOW_STATUS_NOTIFICATION_TOPIC,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  defaultProductEmailPreference,
  type INotificationPreference,
  type NotificationChannel,
  type NotificationTopic,
} from '@genfeedai/contracts/interfaces';
import type { NotificationPreference } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

function toNotificationPreference(
  preference: NotificationPreference,
): INotificationPreference {
  return {
    channel: preference.channel as NotificationChannel,
    createdAt: preference.createdAt.toISOString(),
    id: preference.id,
    isDeleted: preference.isDeleted,
    isEnabled: preference.isEnabled,
    topic: preference.topic as NotificationTopic,
    updatedAt: preference.updatedAt.toISOString(),
    userId: preference.userId,
  };
}

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(
    userId: string,
    topic: NotificationTopic = WORKFLOW_STATUS_NOTIFICATION_TOPIC,
    channel: NotificationChannel = EMAIL_NOTIFICATION_CHANNEL,
  ): Promise<INotificationPreference> {
    const preference = await this.prisma.notificationPreference.findFirst({
      where: { channel, isDeleted: false, topic, userId },
    });

    const marketingPreference =
      topic === 'lifecycle.onboarding'
        ? await this.prisma.lifecycleEmailPreference.findUnique({
            where: { userId },
            select: { marketingUnsubscribedAt: true },
          })
        : null;
    const unsubscribed = Boolean(marketingPreference?.marketingUnsubscribedAt);
    if (preference) {
      return {
        ...toNotificationPreference(preference),
        isEnabled: preference.isEnabled && !unsubscribed,
      };
    }
    const legacy =
      topic === 'generation.status'
        ? await this.prisma.setting.findFirst({
            where: { userId, isDeleted: false },
            select: { isVideoNotificationsEmail: true },
          })
        : null;

    const now = new Date().toISOString();
    return {
      channel,
      createdAt: now,
      id: `default-${userId}-${topic}-${channel}`,
      isDeleted: false,
      isEnabled:
        !unsubscribed &&
        (legacy?.isVideoNotificationsEmail ??
          defaultProductEmailPreference(topic)),
      topic,
      updatedAt: now,
      userId,
    };
  }

  async setForUser(
    userId: string,
    isEnabled: boolean,
    topic: NotificationTopic = WORKFLOW_STATUS_NOTIFICATION_TOPIC,
    channel: NotificationChannel = EMAIL_NOTIFICATION_CHANNEL,
  ): Promise<INotificationPreference> {
    if (topic === 'lifecycle.onboarding' && isEnabled) {
      await this.prisma.lifecycleEmailPreference.updateMany({
        where: { userId },
        data: { marketingUnsubscribedAt: null },
      });
    }
    const preference = await this.prisma.notificationPreference.upsert({
      create: { channel, isEnabled, topic, userId },
      update: { isDeleted: false, isEnabled },
      where: { userId_topic_channel: { channel, topic, userId } },
    });

    return toNotificationPreference(preference);
  }
}
