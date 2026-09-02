import {
  EMAIL_NOTIFICATION_CHANNEL,
  WORKFLOW_STATUS_NOTIFICATION_TOPIC,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  INotificationPreference,
  NotificationChannel,
  NotificationTopic,
} from '@genfeedai/interfaces';
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

    if (preference) {
      return toNotificationPreference(preference);
    }

    const now = new Date().toISOString();
    return {
      channel,
      createdAt: now,
      id: `default-${userId}-${topic}-${channel}`,
      isDeleted: false,
      isEnabled: false,
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
    const preference = await this.prisma.notificationPreference.upsert({
      create: { channel, isEnabled, topic, userId },
      update: { isDeleted: false, isEnabled },
      where: { userId_topic_channel: { channel, topic, userId } },
    });

    return toNotificationPreference(preference);
  }
}
