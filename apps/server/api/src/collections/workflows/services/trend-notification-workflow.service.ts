import { createHash } from 'node:crypto';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import type { TrendNotificationCadence } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ParseMode } from '@genfeedai/enums';
import {
  buildTrendDigestHtml,
  buildTrendDigestMessage,
  type TrendDigestItem,
} from '@genfeedai/helpers';
import type { Setting } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type TrendNotificationAction = 'trendSummaryNotifications';

type TrendRecord = {
  description?: string;
  hashtag?: string;
  platform?: string;
  playCount?: number;
  playUrl?: string;
  postCount?: number;
  soundName?: string;
  usageCount?: number;
  url?: string;
  viralScore?: number;
  viralityScore?: number;
  viewCount?: number;
  views?: number;
  title?: string;
};

type DeliveryChannels = {
  email: boolean;
  inApp: boolean;
  telegram: boolean;
};

export interface TrendNotificationWorkflowResult {
  action: TrendNotificationAction;
  cadence: TrendNotificationCadence;
  channels: DeliveryChannels;
  errors: number;
  organizationId: string;
  reason?: string;
  sent: number;
  skipped: number;
  status: 'completed' | 'skipped';
  trends: number;
}

@Injectable()
export class TrendNotificationWorkflowService {
  private readonly logContext = 'TrendNotificationWorkflowService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly trendsService: TrendsService,
    private readonly cacheService: CacheService,
    private readonly notificationsService: NotificationsService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {}

  async runTrendSummaryNotifications(
    organizationId: string,
    cadence: TrendNotificationCadence,
  ): Promise<TrendNotificationWorkflowResult> {
    const action: TrendNotificationAction = 'trendSummaryNotifications';
    const owner = await this.findOrganizationOwner(organizationId);
    if (!owner) {
      return this.skipped(
        cadence,
        organizationId,
        'organization_owner_missing',
      );
    }

    const setting = await this.findOwnerSetting(owner.userId, cadence);
    if (!setting) {
      return this.skipped(cadence, organizationId, 'settings_missing');
    }

    const recipients = this.resolveRecipients(setting);
    if (!recipients.email && !recipients.inApp && !recipients.telegram) {
      return this.skipped(cadence, organizationId, 'recipients_missing');
    }

    const minViralScore = setting.trendNotificationsMinViralScore || 70;
    const trends = await this.buildTrends(minViralScore);
    if (trends.length === 0) {
      this.logger.debug(
        `${this.logContext} no trends above threshold for workflow notification`,
        { cadence, minViralScore, organizationId, userId: owner.userId },
      );
      return this.skipped(cadence, organizationId, 'no_trends');
    }

    const markerKey = this.idempotencyKey(
      organizationId,
      cadence,
      owner.userId,
      setting,
    );
    const acquired = await this.cacheService.acquireLock(
      markerKey,
      this.markerTtlSeconds(cadence),
    );
    if (!acquired) {
      return this.skipped(
        cadence,
        organizationId,
        'notification_window_already_sent',
      );
    }

    const summaryMessage = buildTrendDigestMessage(trends, { minViralScore });
    const summaryHtml = buildTrendDigestHtml(trends, {
      appUrl: String(this.configService.get('GENFEEDAI_APP_URL') ?? ''),
      minViralScore,
    });

    let sent = 0;
    let errors = 0;

    if (recipients.telegram && setting.trendNotificationsTelegramChatId) {
      try {
        await this.notificationsService.sendTelegramMessage(
          setting.trendNotificationsTelegramChatId,
          summaryMessage,
          { parse_mode: ParseMode.MARKDOWN },
        );
        sent += 1;
      } catch (error) {
        errors += 1;
        this.logDeliveryError('telegram', error, cadence, organizationId);
      }
    }

    if (recipients.email && setting.trendNotificationsEmailAddress) {
      try {
        await this.notificationsService.sendEmail(
          setting.trendNotificationsEmailAddress,
          `Your Trend Summary - ${trends.length} Trending Topics`,
          summaryHtml,
        );
        sent += 1;
      } catch (error) {
        errors += 1;
        this.logDeliveryError('email', error, cadence, organizationId);
      }
    }

    if (recipients.inApp) {
      try {
        await this.notificationsService.sendNotification({
          action: 'trend_summary',
          payload: {
            cadence,
            minViralScore,
            organizationId,
            trends: trends.slice(0, 10),
          } as never,
          type: 'discord',
          userId: owner.userId,
        });
        sent += 1;
      } catch (error) {
        errors += 1;
        this.logDeliveryError('in_app', error, cadence, organizationId);
      }
    }

    return {
      action,
      cadence,
      channels: recipients,
      errors,
      organizationId,
      sent,
      skipped: sent === 0 ? 1 : 0,
      status: 'completed',
      trends: trends.length,
    };
  }

  private async findOrganizationOwner(
    organizationId: string,
  ): Promise<{ email: string | null; userId: string } | null> {
    const organization = await this.prisma.organization.findFirst({
      select: {
        user: { select: { email: true } },
        userId: true,
      },
      where: { id: organizationId, isDeleted: false },
    });

    if (!organization?.userId) {
      return null;
    }

    return {
      email: organization.user?.email ?? null,
      userId: organization.userId,
    };
  }

  private async findOwnerSetting(
    userId: string,
    cadence: TrendNotificationCadence,
  ): Promise<Setting | null> {
    return this.prisma.setting.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { isTrendNotificationsEmail: true },
          { isTrendNotificationsInApp: true },
          { isTrendNotificationsTelegram: true },
        ],
        trendNotificationsFrequency: cadence.toUpperCase() as never,
        userId,
      },
    });
  }

  private resolveRecipients(setting: Setting): DeliveryChannels {
    return {
      email:
        setting.isTrendNotificationsEmail &&
        Boolean(setting.trendNotificationsEmailAddress),
      inApp: setting.isTrendNotificationsInApp,
      telegram:
        setting.isTrendNotificationsTelegram &&
        Boolean(setting.trendNotificationsTelegramChatId),
    };
  }

  private async buildTrends(minViralScore: number): Promise<TrendDigestItem[]> {
    const [viralVideos, trendingHashtags, trendingSounds] = await Promise.all([
      this.getViralVideos(minViralScore),
      this.getTrendingHashtags(minViralScore),
      this.getTrendingSounds(),
    ]);

    return [...viralVideos, ...trendingHashtags, ...trendingSounds];
  }

  private async getViralVideos(
    minViralScore: number,
  ): Promise<TrendDigestItem[]> {
    try {
      const videos = await this.trendsService.getViralVideos({
        limit: 10,
        minViralScore,
      });

      return (videos as TrendRecord[]).map((video) => ({
        platform: video.platform || 'tiktok',
        topic: video.title || video.description || 'Trending Video',
        type: 'video' as const,
        url: video.url,
        usageCount: video.views || video.playCount,
        viralScore: video.viralScore || 0,
      }));
    } catch (error) {
      this.logger.error(`${this.logContext} failed to get viral videos`, error);
      return [];
    }
  }

  private async getTrendingHashtags(
    minViralScore: number,
  ): Promise<TrendDigestItem[]> {
    try {
      const hashtags = await this.trendsService.getTrendingHashtags({
        limit: 10,
      });

      return (hashtags as TrendRecord[])
        .filter((hashtag) => (hashtag.viralityScore || 0) >= minViralScore)
        .map((hashtag) => ({
          platform: hashtag.platform || 'tiktok',
          topic: `#${hashtag.hashtag}`,
          type: 'hashtag' as const,
          usageCount: hashtag.postCount || hashtag.viewCount,
          viralScore: hashtag.viralityScore || 0,
        }));
    } catch (error) {
      this.logger.error(
        `${this.logContext} failed to get trending hashtags`,
        error,
      );
      return [];
    }
  }

  private async getTrendingSounds(): Promise<TrendDigestItem[]> {
    try {
      const sounds = await this.trendsService.getTrendingSounds({ limit: 10 });

      return (sounds as TrendRecord[])
        .filter((sound) => (sound.usageCount || 0) >= 10000)
        .slice(0, 5)
        .map((sound) => ({
          platform: 'tiktok',
          topic: sound.soundName || 'Trending Sound',
          type: 'sound' as const,
          url: sound.playUrl,
          usageCount: sound.usageCount,
          viralScore: sound.viralityScore || 80,
        }));
    } catch (error) {
      this.logger.error(
        `${this.logContext} failed to get trending sounds`,
        error,
      );
      return [];
    }
  }

  private idempotencyKey(
    organizationId: string,
    cadence: TrendNotificationCadence,
    userId: string,
    setting: Setting,
  ): string {
    const recipientFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          email: setting.trendNotificationsEmailAddress ?? null,
          emailEnabled: setting.isTrendNotificationsEmail,
          inAppEnabled: setting.isTrendNotificationsInApp,
          telegram: setting.trendNotificationsTelegramChatId ?? null,
          telegramEnabled: setting.isTrendNotificationsTelegram,
        }),
      )
      .digest('hex')
      .slice(0, 16);

    return [
      'workflow-trend-summary',
      organizationId,
      cadence,
      userId,
      recipientFingerprint,
      this.windowKey(cadence),
    ].join(':');
  }

  private windowKey(cadence: TrendNotificationCadence): string {
    const now = new Date();
    if (cadence === 'hourly') {
      return now.toISOString().slice(0, 13);
    }
    if (cadence === 'weekly') {
      return this.isoWeekKey(now);
    }
    return now.toISOString().slice(0, 10);
  }

  private isoWeekKey(date: Date): string {
    const utc = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil(
      ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
    );
    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  private markerTtlSeconds(cadence: TrendNotificationCadence): number {
    if (cadence === 'hourly') {
      return 7200;
    }
    if (cadence === 'weekly') {
      return 691_200;
    }
    return 93_600;
  }

  private skipped(
    cadence: TrendNotificationCadence,
    organizationId: string,
    reason: string,
  ): TrendNotificationWorkflowResult {
    return {
      action: 'trendSummaryNotifications',
      cadence,
      channels: { email: false, inApp: false, telegram: false },
      errors: 0,
      organizationId,
      reason,
      sent: 0,
      skipped: 1,
      status: 'skipped',
      trends: 0,
    };
  }

  private logDeliveryError(
    channel: string,
    error: unknown,
    cadence: TrendNotificationCadence,
    organizationId: string,
  ): void {
    this.logger.error(`${this.logContext} delivery failed`, {
      cadence,
      channel,
      error: error instanceof Error ? error.message : String(error),
      organizationId,
    });
  }
}
