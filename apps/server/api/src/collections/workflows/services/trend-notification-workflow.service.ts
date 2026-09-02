import { createHash } from 'node:crypto';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import type { TrendNotificationCadence } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import { CacheService } from '@api/services/cache/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ParseMode, TrendNotificationFrequency } from '@genfeedai/contracts';
import type { ITrendSummaryPayload } from '@genfeedai/contracts/interfaces';
import {
  buildTrendDigestHtml,
  buildTrendDigestItems,
  buildTrendDigestMessage,
  type RawTrendHashtag,
  type RawTrendSound,
  type RawTrendVideo,
  type TrendDigestItem,
} from '@genfeedai/helpers';
import type { Setting } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type TrendNotificationAction =
  typeof AUTOMATION_WORKFLOW_IDS.TREND_NOTIFICATIONS;

/**
 * Workflow templates speak lowercase cadence (`daily`), the
 * `settings.trendNotificationsFrequency` column speaks Prisma labels (`DAILY`).
 * Exhaustive map — the two vocabularies stay separate on purpose.
 */
const CADENCE_TO_FREQUENCY: Record<
  TrendNotificationCadence,
  TrendNotificationFrequency
> = {
  daily: TrendNotificationFrequency.DAILY,
  hourly: TrendNotificationFrequency.HOURLY,
  weekly: TrendNotificationFrequency.WEEKLY,
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

  async prepareTrendSummaryNotifications(
    organizationId: string,
    cadence: TrendNotificationCadence,
  ): Promise<Record<string, unknown>> {
    const owner = await this.findOrganizationOwner(organizationId);
    if (!owner) {
      return {
        cadence,
        organizationId,
        reason: 'organization_owner_missing',
        status: 'skipped',
      };
    }

    const setting = await this.findOwnerSetting(owner.userId, cadence);
    if (!setting) {
      return {
        cadence,
        organizationId,
        reason: 'settings_missing',
        status: 'skipped',
      };
    }

    const recipients = this.resolveRecipients(setting);
    if (!recipients.email && !recipients.inApp && !recipients.telegram) {
      return {
        cadence,
        organizationId,
        reason: 'recipients_missing',
        status: 'skipped',
      };
    }

    const minViralScore = setting.trendNotificationsMinViralScore || 70;
    return {
      cadence,
      channels: recipients,
      emailAddress: setting.trendNotificationsEmailAddress,
      markerKey: this.idempotencyKey(
        organizationId,
        cadence,
        owner.userId,
        setting,
      ),
      markerTtlSeconds: this.markerTtlSeconds(cadence),
      minViralScore,
      organizationId,
      ownerUserId: owner.userId,
      status: 'prepared',
      telegramChatId: setting.trendNotificationsTelegramChatId,
    };
  }

  async readTrendSummaryVideos(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    return {
      trends:
        state.status === 'prepared'
          ? await this.getViralVideos(
              typeof state.minViralScore === 'number'
                ? state.minViralScore
                : 70,
            )
          : [],
    };
  }

  async readTrendSummaryHashtags(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    return {
      trends:
        state.status === 'prepared'
          ? await this.getTrendingHashtags(
              typeof state.minViralScore === 'number'
                ? state.minViralScore
                : 70,
            )
          : [],
    };
  }

  async readTrendSummarySounds(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    return {
      trends:
        state.status === 'prepared'
          ? await this.getTrendingSounds(
              typeof state.minViralScore === 'number'
                ? state.minViralScore
                : 70,
            )
          : [],
    };
  }

  async renderTrendSummaryNotifications(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    if (state.status !== 'prepared') return state;
    const trends = ['videos', 'hashtags', 'sounds'].flatMap((key) => {
      const result = this.readRecord(input[key]);
      return Array.isArray(result.trends)
        ? (result.trends as TrendDigestItem[])
        : [];
    });
    const minViralScore =
      typeof state.minViralScore === 'number' ? state.minViralScore : 70;
    if (trends.length === 0) {
      return { ...state, reason: 'no_trends', status: 'skipped', trends };
    }
    const acquired = await this.cacheService.acquireLock(
      this.requiredString(state.markerKey, 'markerKey'),
      typeof state.markerTtlSeconds === 'number'
        ? state.markerTtlSeconds
        : this.markerTtlSeconds(this.requiredCadence(state.cadence)),
    );
    if (!acquired) {
      return {
        ...state,
        reason: 'notification_window_already_sent',
        status: 'skipped',
        trends,
      };
    }
    return {
      ...state,
      trends,
      summaryMessage: buildTrendDigestMessage(trends, { minViralScore }),
      summaryHtml: buildTrendDigestHtml(trends, {
        appUrl: String(this.configService.get('GENFEEDAI_APP_URL') ?? ''),
        minViralScore,
      }),
      status: 'rendered',
    };
  }

  async deliverTrendSummaryChannel(
    channel: 'email' | 'inApp' | 'telegram',
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    if (state.status !== 'rendered') return { channel, sent: 0, skipped: true };
    const channels = this.readRecord(state.channels);
    if (channels[channel] !== true) return { channel, sent: 0, skipped: true };
    const cadence = this.requiredCadence(state.cadence);
    const organizationId = this.requiredString(
      state.organizationId,
      'organizationId',
    );
    try {
      if (channel === 'telegram') {
        await this.notificationsService.sendTelegramMessage(
          this.requiredString(state.telegramChatId, 'telegramChatId'),
          this.requiredString(state.summaryMessage, 'summaryMessage'),
          { parse_mode: ParseMode.MARKDOWN },
        );
      } else if (channel === 'email') {
        const trends = Array.isArray(state.trends) ? state.trends : [];
        await this.notificationsService.sendEmail(
          this.requiredString(state.emailAddress, 'emailAddress'),
          `Your Trend Summary - ${trends.length} Trending Topics`,
          this.requiredString(state.summaryHtml, 'summaryHtml'),
        );
      } else {
        const trends = Array.isArray(state.trends)
          ? (state.trends as TrendDigestItem[])
          : [];
        await this.notificationsService.sendNotification({
          action: 'trend_summary',
          payload: {
            cadence,
            minViralScore:
              typeof state.minViralScore === 'number'
                ? state.minViralScore
                : 70,
            organizationId,
            trends: trends.slice(0, 10),
          } satisfies ITrendSummaryPayload,
          type: 'discord',
          userId: this.requiredString(state.ownerUserId, 'ownerUserId'),
        });
      }
      return { channel, sent: 1 };
    } catch (error) {
      this.logDeliveryError(channel, error, cadence, organizationId);
      return { channel, errors: 1, sent: 0 };
    }
  }

  finalizeTrendSummaryNotifications(
    organizationId: string,
    input: Record<string, unknown>,
  ): TrendNotificationWorkflowResult {
    const prepared = this.readRecord(input.prepared);
    const cadence = this.requiredCadence(prepared.cadence);
    if (prepared.status === 'skipped') {
      return this.skipped(
        cadence,
        organizationId,
        this.requiredString(prepared.reason, 'reason'),
      );
    }
    const deliveries = ['telegram', 'email', 'inApp'].map((key) =>
      this.readRecord(input[key]),
    );
    const sent = deliveries.reduce(
      (sum, delivery) => sum + (delivery.sent === 1 ? 1 : 0),
      0,
    );
    return {
      action: AUTOMATION_WORKFLOW_IDS.TREND_NOTIFICATIONS,
      cadence,
      channels: this.readRecord(prepared.channels) as DeliveryChannels,
      errors: deliveries.reduce(
        (sum, delivery) => sum + (delivery.errors === 1 ? 1 : 0),
        0,
      ),
      organizationId,
      sent,
      skipped: sent === 0 ? 1 : 0,
      status: 'completed',
      trends: Array.isArray(prepared.trends) ? prepared.trends.length : 0,
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
        trendNotificationsFrequency: CADENCE_TO_FREQUENCY[cadence],
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

  private async getViralVideos(
    minViralScore: number,
  ): Promise<TrendDigestItem[]> {
    const videos = await this.safeFetch<RawTrendVideo>(
      () => this.trendsService.getViralVideos({ limit: 10, minViralScore }),
      'viral videos',
    );

    return buildTrendDigestItems(
      { hashtags: [], sounds: [], videos },
      { minViralScore },
    );
  }

  private async getTrendingHashtags(
    minViralScore: number,
  ): Promise<TrendDigestItem[]> {
    const hashtags = await this.safeFetch<RawTrendHashtag>(
      () => this.trendsService.getTrendingHashtags({ limit: 10 }),
      'trending hashtags',
    );

    return buildTrendDigestItems(
      { hashtags, sounds: [], videos: [] },
      { minViralScore },
    );
  }

  private async getTrendingSounds(
    minViralScore: number,
  ): Promise<TrendDigestItem[]> {
    const sounds = await this.safeFetch<RawTrendSound>(
      () => this.trendsService.getTrendingSounds({ limit: 10 }),
      'trending sounds',
    );

    return buildTrendDigestItems(
      { hashtags: [], sounds, videos: [] },
      { minViralScore },
    );
  }

  /** One dead source must not cost the digest the other two. */
  private async safeFetch<T>(
    fetcher: () => Promise<unknown>,
    label: string,
  ): Promise<T[]> {
    try {
      return ((await fetcher()) as T[]) ?? [];
    } catch (error) {
      this.logger.error(`${this.logContext} failed to get ${label}`, error);
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
      action: AUTOMATION_WORKFLOW_IDS.TREND_NOTIFICATIONS,
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

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredCadence(value: unknown): TrendNotificationCadence {
    if (value === 'hourly' || value === 'daily' || value === 'weekly')
      return value;
    throw new Error('cadence must be hourly, daily, or weekly');
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error(`${field} is required`);
    return value;
  }
}
