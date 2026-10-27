import {
  BulkScheduleDto,
  MAX_BULK_SCHEDULE_CONTENT_IDS,
} from '@api/collections/schedules/dto/bulk-schedule.dto';
import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import type { ScheduleDocument } from '@api/collections/schedules/schemas/schedule.schema';
import {
  buildPostingTimeRecommendation,
  DEFAULT_POSTING_HOURS,
  toPostingWindowPosts,
} from '@api/collections/schedules/utils/posting-time-recommendation.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ChannelCapability,
  ChannelCapabilityListOptions,
  ChannelTargetValidationResult,
  ValidateChannelTargetSettingsInput,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import {
  listChannelCapabilities as resolveChannelCapabilities,
  getChannelCapability as resolveChannelCapability,
  validateChannelTargetSettings as resolveChannelTargetValidation,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import type { PostingTimeRecommendation } from '@genfeedai/contracts/interfaces';
import { computePostingWindows } from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type Schedule = ScheduleDocument;

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  listChannelCapabilities(
    options: ChannelCapabilityListOptions = {},
  ): ChannelCapability[] {
    return resolveChannelCapabilities(options);
  }

  getChannelCapability(platform: string): ChannelCapability {
    const capability = resolveChannelCapability(platform);

    if (!capability) {
      throw new NotFoundException('Channel capability', platform);
    }

    return capability;
  }

  validateChannelTargetSettings(
    input: ValidateChannelTargetSettingsInput,
  ): ChannelTargetValidationResult {
    return resolveChannelTargetValidation(input);
  }

  /**
   * Best posting time for one platform, learned from the organization's own
   * measured posts (median engagement rate per local slot) or, when there is
   * not enough data, the platform default times labelled as defaults. No model
   * is asked, so no numbers are invented and no credits are spent.
   */
  @HandleErrors('get optimal posting time', 'schedules')
  async getOptimalTime(
    dto: GetOptimalTimeDto,
    organizationId: string,
  ): Promise<PostingTimeRecommendation> {
    const platform = dto.platform.toLowerCase();
    const timezone = dto.timezone || 'UTC';
    const nowMs = Date.now();
    const since = new Date(
      nowMs - SchedulesService.POSTING_LOOKBACK_DAYS * DAY_MS,
    );

    const posts = await this.prisma.post.findMany({
      orderBy: { publishedAt: 'desc' },
      select: { id: true, publishedAt: true },
      take: SchedulesService.POSTING_SAMPLE_LIMIT,
      where: scopedWhere(organizationId, {
        platform,
        publishedAt: { gte: since, lte: new Date(nowMs) },
        ...(dto.brandId ? { brandId: dto.brandId } : {}),
        ...(dto.credentialId ? { credentialId: dto.credentialId } : {}),
      }),
    });

    const measurements =
      posts.length === 0
        ? []
        : await this.prisma.contentPerformance.findMany({
            select: { engagementRate: true, measuredAt: true, postId: true },
            where: scopedWhere(organizationId, {
              engagementRate: { not: null },
              measuredAt: { not: null },
              postId: { in: posts.map((post) => post.id) },
            }),
          });

    try {
      return buildPostingTimeRecommendation(
        platform,
        computePostingWindows({
          nowMs,
          posts: toPostingWindowPosts(posts, measurements),
          timezone,
        }),
      );
    } catch (error) {
      if (error instanceof RangeError) {
        throw new ValidationException(error.message);
      }
      throw error;
    }
  }

  /**
   * Bulk schedule content
   */
  async bulkSchedule(
    dto: BulkScheduleDto,
    organizationId: string,
    userId: string,
  ): Promise<{
    scheduled: Schedule[];
    failed: Array<{ contentId: string; reason: string }>;
  }> {
    try {
      // `@ArrayMaxSize` on the DTO only runs for requests that pass through the
      // validation pipe. Re-assert the bound here so an internal caller cannot
      // drive the loop below — and the schedule-time generation before it —
      // with an unbounded, caller-supplied length.
      if (dto.contentIds.length > MAX_BULK_SCHEDULE_CONTENT_IDS) {
        throw new ValidationException(
          `Cannot bulk schedule more than ${MAX_BULK_SCHEDULE_CONTENT_IDS} items at once.`,
          'contentIds',
          dto.contentIds.length,
        );
      }

      this.logger.debug('Bulk scheduling content', {
        contentCount: dto.contentIds.length,
        organizationId,
        strategy: dto.schedulingStrategy,
      });

      const scheduled: Schedule[] = [];
      const failed: Array<{ contentId: string; reason: string }> = [];

      const staggerMinutes = dto.staggerMinutes || 60;

      const scheduleTimes = this.generateScheduleTimes(
        dto.contentIds.length,
        dto.schedulingStrategy,
        staggerMinutes,
        dto.customTimes,
        dto.platforms?.[0],
      );

      for (let i = 0; i < dto.contentIds.length; i++) {
        const contentId = dto.contentIds[i];

        try {
          const platform = dto.platforms[0];
          const brandId = dto.brandIds[0];

          const schedule = await this.prisma.schedule.create({
            data: {
              brandId,
              contentId,
              contentType: 'video',
              organizationId,
              platform,
              scheduledAt: scheduleTimes[i],
              schedulingMethod: dto.schedulingStrategy,
              userId,
            },
          });

          scheduled.push(schedule as unknown as Schedule);
        } catch (error: unknown) {
          failed.push({
            contentId,
            reason: (error as Error)?.message || 'Unknown error',
          });
        }
      }

      this.logger.debug('Bulk schedule complete', {
        failed: failed.length,
        scheduled: scheduled.length,
      });

      return { failed, scheduled };
    } catch (error: unknown) {
      this.logger.error('Failed to bulk schedule', { error });
      throw error;
    }
  }

  /**
   * Get schedule calendar
   */
  async getCalendar(
    organizationId: string,
    startDate: string,
    endDate: string,
  ): Promise<Schedule[]> {
    const results = await this.prisma.schedule.findMany({
      orderBy: { createdAt: 'asc' },
      where: scopedWhere(organizationId, {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    });

    return results as unknown as Schedule[];
  }

  private static readonly POSTING_LOOKBACK_DAYS = 90;
  private static readonly POSTING_SAMPLE_LIMIT = 500;

  /**
   * Private: Generate schedule times
   */
  private generateScheduleTimes(
    count: number,
    strategy: string,
    staggerMinutes: number,
    customTimes?: Record<string, string>,
    platform?: string,
  ): Date[] {
    if (strategy === 'custom' && customTimes) {
      return Object.values(customTimes).map((t) => new Date(t));
    }

    if (strategy === 'ai-optimal') {
      return this.generateOptimalTimes(count, platform);
    }

    const times: Date[] = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const time = new Date(now.getTime() + i * staggerMinutes * 60 * 1000);
      times.push(time);
    }
    return times;
  }

  /**
   * Generate optimal posting times based on platform-specific windows.
   */
  private generateOptimalTimes(count: number, platform?: string): Date[] {
    const normalizedPlatform = platform?.toLowerCase() ?? 'general';
    const windows =
      DEFAULT_POSTING_HOURS[normalizedPlatform] ??
      DEFAULT_POSTING_HOURS.general;

    const optimalHours: number[] = [];
    for (const [start, end] of windows) {
      for (let h = start; h < end; h++) {
        optimalHours.push(h);
      }
    }

    const times: Date[] = [];
    const now = new Date();
    let dayOffset = 1;
    let hourIndex = 0;

    for (let i = 0; i < count; i++) {
      const scheduleDate = new Date(now);
      scheduleDate.setDate(scheduleDate.getDate() + dayOffset);
      scheduleDate.setHours(optimalHours[hourIndex], 0, 0, 0);
      scheduleDate.setMilliseconds(0);

      times.push(scheduleDate);

      hourIndex++;
      if (hourIndex >= optimalHours.length) {
        hourIndex = 0;
        dayOffset++;
      }
    }

    return times;
  }
}
