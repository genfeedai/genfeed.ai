import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { BulkScheduleDto } from '@api/collections/schedules/dto/bulk-schedule.dto';
import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import { RepurposeContentDto } from '@api/collections/schedules/dto/repurpose.dto';
import type { RepurposingJobDocument } from '@api/collections/schedules/schemas/repurposing-job.schema';
import type { ScheduleDocument } from '@api/collections/schedules/schemas/schedule.schema';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { JsonParserUtil } from '@api/helpers/utils/json-parser.util';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

type Schedule = ScheduleDocument;
type RepurposingJob = RepurposingJobDocument;

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {}

  /**
   * Get optimal posting time
   */
  @HandleErrors('get optimal posting time', 'schedules')
  async getOptimalTime(
    dto: GetOptimalTimeDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    recommendedTime: string;
    alternativeTimes: string[];
    confidence: number;
    expectedPerformance: {
      estimatedEngagement: number;
      estimatedReach: number;
    };
    reasoning: string[];
  }> {
    this.logger.debug('Getting optimal posting time', {
      contentType: dto.contentType,
      goal: dto.goal,
      organizationId,
      platform: dto.platform,
    });

    const goal = dto.goal || 'engagement';
    const timezone = dto.timezone || 'UTC';

    const prompt = `Determine the optimal posting time for ${dto.contentType} on ${dto.platform} to maximize ${goal} in ${timezone} timezone.

Return ONLY valid JSON with this exact structure. Do not include any text before or after the JSON:
{
  "recommendedTime": "2025-10-09T14:00:00Z",
  "alternativeTimes": ["2025-10-09T18:00:00Z", "2025-10-10T09:00:00Z"],
  "confidence": 85,
  "expectedPerformance": {
    "estimatedEngagement": 250,
    "estimatedReach": 5000
  },
  "reasoning": [
    "Peak engagement hours for target audience",
    "Lower competition during this time slot",
    "Historical data shows 2x higher reach"
  ]
}`;

    const input = {
      max_completion_tokens: 1024,
      prompt,
    };
    const response = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, response));

    const result = JsonParserUtil.parseAIResponse<Record<string, unknown>>(
      response,
      {},
    ) as {
      recommendedTime: string;
      alternativeTimes: string[];
      confidence: number;
      expectedPerformance: {
        estimatedEngagement: number;
        estimatedReach: number;
      };
    };

    return {
      alternativeTimes: result.alternativeTimes || [],
      confidence: result.confidence || 70,
      expectedPerformance: result.expectedPerformance || {
        estimatedEngagement: 0,
        estimatedReach: 0,
      },
      reasoning:
        ((result as unknown as Record<string, unknown>)
          .reasoning as string[]) || [],
      recommendedTime: result.recommendedTime || new Date().toISOString(),
    };
  }

  /**
   * Bulk schedule content
   */
  async bulkSchedule(
    dto: BulkScheduleDto,
    organizationId: string,
    userId?: string,
  ): Promise<{
    scheduled: Schedule[];
    failed: Array<{ contentId: string; reason: string }>;
  }> {
    try {
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
            } as never,
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
      where: {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        isDeleted: false,
        organizationId,
      } as never,
    });

    return results as unknown as Schedule[];
  }

  /**
   * Repurpose content
   */
  async repurposeContent(
    dto: RepurposeContentDto,
    organizationId: string,
    userId?: string,
  ): Promise<RepurposingJob> {
    try {
      this.logger.debug('Starting content repurposing', {
        contentId: dto.contentId,
        organizationId,
        targetFormats: dto.targetFormats,
      });

      const job = await this.prisma.repurposingJob.create({
        data: {
          organizationId,
          results: dto.targetFormats.map((format) => ({
            format,
            status: 'pending',
          })),
          settings: dto.settings,
          sourceContentId: dto.contentId,
          sourceContentType: 'video',
          status: 'pending',
          targetFormats: dto.targetFormats,
          userId,
        } as never,
      });

      this.logger.debug('Repurposing job created', {
        jobId: job.id,
      });

      return job as unknown as RepurposingJob;
    } catch (error: unknown) {
      this.logger.error('Failed to create repurposing job', { error });
      throw error;
    }
  }

  /**
   * Get repurposing status
   */
  async getRepurposingStatus(
    jobId: string,
    organizationId: string,
  ): Promise<RepurposingJob> {
    const job = await this.prisma.repurposingJob.findFirst({
      where: { id: jobId, isDeleted: false, organizationId },
    });

    if (!job) {
      throw new NotFoundException('Repurposing job not found');
    }

    return job as unknown as RepurposingJob;
  }

  /**
   * Platform-specific optimal posting windows (hours in 24h format).
   */
  private static readonly OPTIMAL_HOURS: Record<string, number[][]> = {
    facebook: [[13, 16]],
    general: [
      [9, 11],
      [12, 14],
      [17, 19],
    ],
    instagram: [
      [11, 13],
      [19, 21],
    ],
    linkedin: [
      [7, 8],
      [12, 13],
      [17, 18],
    ],
    tiktok: [
      [7, 9],
      [12, 15],
      [19, 23],
    ],
    twitter: [
      [8, 10],
      [12, 13],
      [17, 18],
    ],
    youtube: [
      [14, 16],
      [18, 20],
    ],
  };

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
      SchedulesService.OPTIMAL_HOURS[normalizedPlatform] ??
      SchedulesService.OPTIMAL_HOURS.general;

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

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return calculateEstimatedTextCredits(model, input, output);
  }
}
