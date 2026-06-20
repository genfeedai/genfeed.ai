import process from 'node:process';
import { TrendsService } from '@api/collections/trends/services/trends.service';
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
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

type TrendRecord = {
  description?: string;
  hashtag?: string;
  platform?: string;
  playCount?: number;
  playUrl?: string;
  postCount?: number;
  soundName?: string;
  title?: string;
  usageCount?: number;
  url?: string;
  viralScore?: number;
  viralityScore?: number;
  viewCount?: number;
  views?: number;
};

@Injectable()
export class CronTrendSummaryNotificationsService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly LOCK_KEY_HOURLY = 'cron:trend-summary:hourly';
  private readonly LOCK_KEY_DAILY = 'cron:trend-summary:daily';
  private readonly LOCK_KEY_WEEKLY = 'cron:trend-summary:weekly';
  private readonly LOCK_TTL_SECONDS = 300; // 5 minute lock

  constructor(
    private readonly prisma: PrismaService,
    private readonly trendsService: TrendsService,
    private readonly cacheService: CacheService,
    private readonly notificationsService: NotificationsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Hourly trend summary notifications
   * Runs every hour for users with 'hourly' frequency
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendHourlyTrendSummaries() {
    await this.sendTrendSummariesByFrequency('hourly', this.LOCK_KEY_HOURLY);
  }

  /**
   * Daily trend summary notifications
   * Runs every day at 9 AM for users with 'daily' frequency
   */
  @Cron('0 9 * * *')
  async sendDailyTrendSummaries() {
    await this.sendTrendSummariesByFrequency('daily', this.LOCK_KEY_DAILY);
  }

  /**
   * Weekly trend summary notifications
   * Runs every Monday at 9 AM for users with 'weekly' frequency
   */
  @Cron('0 9 * * 1')
  async sendWeeklyTrendSummaries() {
    await this.sendTrendSummariesByFrequency('weekly', this.LOCK_KEY_WEEKLY);
  }

  private async sendTrendSummariesByFrequency(
    frequency: string,
    lockKey: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const result = await this.cacheService.withLock(
      lockKey,
      async () => {
        this.loggerService.log(`${url} started for frequency: ${frequency}`);

        try {
          // Find all users with this notification frequency who have notifications enabled
          const usersWithSettings = await this.prisma.setting.findMany({
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  clerkId: true,
                },
              },
            },
            where: {
              isDeleted: false,
              OR: [
                { isTrendNotificationsInApp: true },
                { isTrendNotificationsTelegram: true },
                { isTrendNotificationsEmail: true },
              ],
              trendNotificationsFrequency: frequency.toUpperCase() as never,
            },
          });

          this.loggerService.log(
            `${url} found ${usersWithSettings.length} users with ${frequency} notifications`,
          );

          let successCount = 0;
          let errorCount = 0;

          for (const setting of usersWithSettings) {
            try {
              await this.sendTrendSummaryToUser(setting as Setting);
              successCount++;
            } catch (error) {
              errorCount++;
              this.loggerService.error(
                `${url} failed to send to user ${setting.userId}`,
                error,
              );
            }
          }

          this.loggerService.log(`${url} completed`, {
            errorCount,
            frequency,
            successCount,
            totalUsers: usersWithSettings.length,
          });

          return { errorCount, success: true, successCount };
        } catch (error: unknown) {
          this.loggerService.error(`${url} failed`, error);
          return { error, success: false };
        }
      },
      this.LOCK_TTL_SECONDS,
    );

    if (result === null) {
      this.loggerService.log(
        `${url} skipped - lock already held by another instance`,
      );
    }
  }

  private async sendTrendSummaryToUser(setting: Setting) {
    const minViralScore = setting.trendNotificationsMinViralScore || 70;

    // Fetch trending content above user's threshold
    const [viralVideos, trendingHashtags, trendingSounds] = await Promise.all([
      this.getViralVideos(minViralScore),
      this.getTrendingHashtags(minViralScore),
      this.getTrendingSounds(),
    ]);

    const trends: TrendDigestItem[] = [
      ...viralVideos,
      ...trendingHashtags,
      ...trendingSounds,
    ];

    if (trends.length === 0) {
      this.loggerService.debug(
        `No trends above threshold ${minViralScore} for user ${setting.userId}`,
      );
      return;
    }

    // Build summary message via the shared digest builder
    const summaryMessage = buildTrendDigestMessage(trends, { minViralScore });
    const summaryHtml = buildTrendDigestHtml(trends, {
      appUrl: process.env.GENFEEDAI_APP_URL ?? '',
      minViralScore,
    });

    // Send via configured channels
    if (
      setting.isTrendNotificationsTelegram &&
      setting.trendNotificationsTelegramChatId
    ) {
      await this.notificationsService.sendTelegramMessage(
        setting.trendNotificationsTelegramChatId,
        summaryMessage,
        { parse_mode: ParseMode.MARKDOWN },
      );
    }

    if (
      setting.isTrendNotificationsEmail &&
      setting.trendNotificationsEmailAddress
    ) {
      await this.notificationsService.sendEmail(
        setting.trendNotificationsEmailAddress,
        `Your Trend Summary - ${trends.length} Trending Topics`,
        summaryHtml,
      );
    }

    // In-app notifications are handled via WebSocket/events system
    if (setting.isTrendNotificationsInApp) {
      await this.notificationsService.sendNotification({
        action: 'trend_summary',
        payload: {
          minViralScore,
          trends: trends.slice(0, 10), // Top 10 for in-app
        } as never,
        type: 'discord', // Uses general notification channel
        userId: setting.userId,
      });
    }
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
      this.loggerService.error('Failed to get viral videos', error);
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

      return hashtags
        .filter(
          (hashtag: TrendRecord) =>
            (hashtag.viralityScore || 0) >= minViralScore,
        )
        .map((hashtag: TrendRecord) => ({
          platform: hashtag.platform || 'tiktok',
          topic: `#${hashtag.hashtag}`,
          type: 'hashtag' as const,
          usageCount: hashtag.postCount || hashtag.viewCount,
          viralScore: hashtag.viralityScore || 0,
        }));
    } catch (error) {
      this.loggerService.error('Failed to get trending hashtags', error);
      return [];
    }
  }

  private async getTrendingSounds(): Promise<TrendDigestItem[]> {
    try {
      const sounds = await this.trendsService.getTrendingSounds({
        limit: 10,
      });

      // Filter by minimum usage count after fetching
      const filteredSounds = (sounds as TrendRecord[]).filter(
        (sound) => (sound.usageCount || 0) >= 10000,
      );

      return filteredSounds.slice(0, 5).map((sound) => ({
        platform: 'tiktok',
        topic: sound.soundName || 'Trending Sound',
        type: 'sound' as const,
        url: sound.playUrl,
        usageCount: sound.usageCount,
        viralScore: sound.viralityScore || 80,
      }));
    } catch (error) {
      this.loggerService.error('Failed to get trending sounds', error);
      return [];
    }
  }
}
