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
import { Injectable } from '@nestjs/common';

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

    return (preference ?? {
      channel,
      id: `default-${userId}-${topic}-${channel}`,
      isDeleted: false,
      isEnabled: false,
      topic,
      userId,
    }) as INotificationPreference;
  }

  async setForUser(
    userId: string,
    isEnabled: boolean,
    topic: NotificationTopic = WORKFLOW_STATUS_NOTIFICATION_TOPIC,
    channel: NotificationChannel = EMAIL_NOTIFICATION_CHANNEL,
  ): Promise<INotificationPreference> {
    return (await this.prisma.notificationPreference.upsert({
      create: { channel, isEnabled, topic, userId },
      update: { isDeleted: false, isEnabled },
      where: { userId_topic_channel: { channel, topic, userId } },
    })) as INotificationPreference;
  }
}
