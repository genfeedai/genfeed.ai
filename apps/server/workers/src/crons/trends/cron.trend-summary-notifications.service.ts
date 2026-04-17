import { TrendsService } from '@api/collections/trends/services/trends.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ParseMode } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Setting } from '@prisma/client';

interface TrendSummary {
  platform: string;
  topic: string;
  viralScore: number;
  type: 'video' | 'hashtag' | 'sound' | 'topic';
  url?: string;
  usageCount?: number;
}

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

    const trends: TrendSummary[] = [
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

    // Build summary message
    const summaryMessage = this.buildSummaryMessage(trends, minViralScore);
    const summaryHtml = this.buildSummaryHtml(trends, minViralScore);

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
        },
        type: 'discord', // Uses general notification channel
        userId: setting.userId,
      });
    }
  }

  private async getViralVideos(minViralScore: number): Promise<TrendSummary[]> {
    try {
      const videos = await this.trendsService.getViralVideos({
        limit: 10,
        minViralScore,
      });

      return videos.map((video: unknown) => ({
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
  ): Promise<TrendSummary[]> {
    try {
      const hashtags = await this.trendsService.getTrendingHashtags({
        limit: 10,
      });

      return hashtags
        .filter(
          (hashtag: unknown) => (hashtag.viralityScore || 0) >= minViralScore,
        )
        .map((hashtag: unknown) => ({
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

  private async getTrendingSounds(): Promise<TrendSummary[]> {
    try {
      const sounds = await this.trendsService.getTrendingSounds({
        limit: 10,
      });

      // Filter by minimum usage count after fetching
      const filteredSounds = sounds.filter(
        (sound: unknown) => (sound.usageCount || 0) >= 10000,
      );

      return filteredSounds.slice(0, 5).map((sound: unknown) => ({
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

  private buildSummaryMessage(
    trends: TrendSummary[],
    minViralScore: number,
  ): string {
    const lines: string[] = [
      `*Your Trend Summary*`,
      `_Filtered for viral score >= ${minViralScore}_`,
      ``,
    ];

    // Group by type
    const videos = trends.filter((t) => t.type === 'video');
    const hashtags = trends.filter((t) => t.type === 'hashtag');
    const sounds = trends.filter((t) => t.type === 'sound');

    if (videos.length > 0) {
      lines.push(`*Viral Videos:*`);
      videos.slice(0, 5).forEach((v, i) => {
        lines.push(
          `${i + 1}. ${v.topic} (${v.platform}, score: ${v.viralScore})`,
        );
      });
      lines.push(``);
    }

    if (hashtags.length > 0) {
      lines.push(`*Trending Hashtags:*`);
      hashtags.slice(0, 5).forEach((h, i) => {
        const count = h.usageCount
          ? ` - ${this.formatNumber(h.usageCount)} posts`
          : '';
        lines.push(`${i + 1}. ${h.topic}${count}`);
      });
      lines.push(``);
    }

    if (sounds.length > 0) {
      lines.push(`*Trending Sounds:*`);
      sounds.slice(0, 5).forEach((s, i) => {
        const count = s.usageCount
          ? ` - ${this.formatNumber(s.usageCount)} uses`
          : '';
        lines.push(`${i + 1}. ${s.topic}${count}`);
      });
    }

    lines.push(``);
    lines.push(`_Use these trends to create viral content!_`);

    return lines.join('\n');
  }

  private buildSummaryHtml(
    trends: TrendSummary[],
    minViralScore: number,
  ): string {
    const videos = trends.filter((t) => t.type === 'video');
    const hashtags = trends.filter((t) => t.type === 'hashtag');
    const sounds = trends.filter((t) => t.type === 'sound');

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; }
          h1 { color: #1a1a1a; margin-bottom: 8px; }
          .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 16px; font-weight: 600; color: #333; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #eee; }
          .trend-item { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
          .trend-item:last-child { border-bottom: none; }
          .trend-name { font-weight: 500; color: #1a1a1a; }
          .trend-meta { font-size: 12px; color: #888; margin-top: 4px; }
          .viral-score { display: inline-block; background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
          .platform { display: inline-block; background: #e5e7eb; color: #374151; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 4px; }
          .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Your Trend Summary</h1>
          <p class="subtitle">Filtered for viral score >= ${minViralScore}</p>
    `;

    if (videos.length > 0) {
      html += `<div class="section"><div class="section-title">Viral Videos</div>`;
      videos.slice(0, 5).forEach((v) => {
        html += `
          <div class="trend-item">
            <div class="trend-name">${this.escapeHtml(v.topic)}</div>
            <div class="trend-meta">
              <span class="viral-score">Score: ${v.viralScore}</span>
              <span class="platform">${v.platform}</span>
              ${v.usageCount ? `<span> • ${this.formatNumber(v.usageCount)} views</span>` : ''}
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    if (hashtags.length > 0) {
      html += `<div class="section"><div class="section-title">Trending Hashtags</div>`;
      hashtags.slice(0, 5).forEach((h) => {
        html += `
          <div class="trend-item">
            <div class="trend-name">${this.escapeHtml(h.topic)}</div>
            <div class="trend-meta">
              <span class="platform">${h.platform}</span>
              ${h.usageCount ? `<span> • ${this.formatNumber(h.usageCount)} posts</span>` : ''}
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    if (sounds.length > 0) {
      html += `<div class="section"><div class="section-title">Trending Sounds</div>`;
      sounds.slice(0, 5).forEach((s) => {
        html += `
          <div class="trend-item">
            <div class="trend-name">${this.escapeHtml(s.topic)}</div>
            <div class="trend-meta">
              ${s.usageCount ? `<span>${this.formatNumber(s.usageCount)} uses</span>` : ''}
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `
          <div class="footer">
            Use these trends to create viral content!<br>
            <a href="${process.env.GENFEEDAI_APP_URL ?? ''}">Open Genfeed</a>
          </div>
        </div>
      </body>
      </html>
    `;

    return html;
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
