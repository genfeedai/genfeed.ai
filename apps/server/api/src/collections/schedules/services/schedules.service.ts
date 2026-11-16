import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import {
  buildPostingTimeRecommendation,
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
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const DAY_MS = 24 * 60 * 60 * 1000;

@Traced()
@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

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

  private static readonly POSTING_LOOKBACK_DAYS = 90;
  private static readonly POSTING_SAMPLE_LIMIT = 500;
}
