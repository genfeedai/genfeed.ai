import {
  CreatePlaybookDto,
  UpdatePlaybookDto,
} from '@api/collections/content-intelligence/dto/create-playbook.dto';
import type { ContentPatternDocument } from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import {
  PatternPlaybook,
  type PatternPlaybookDocument,
} from '@api/collections/content-intelligence/schemas/pattern-playbook.schema';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class PlaybookBuilderService extends BaseService<
  PatternPlaybookDocument,
  CreatePlaybookDto,
  UpdatePlaybookDto
> {
  constructor(
    @InjectModel(PatternPlaybook.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<PatternPlaybookDocument>,
    private readonly patternStoreService: PatternStoreService,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  createPlaybook(
    organizationId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: CreatePlaybookDto,
  ): Promise<PatternPlaybookDocument> {
    const playbookData = {
      createdBy: userId,
      description: dto.description,
      insights: {
        benchmarks: {},
        contentMix: {},
        hashtagStrategy: {},
        postingSchedule: {},
        topHooks: [],
      },
      isActive: true,
      name: dto.name,
      niche: dto.niche,
      organization: organizationId,
      patternsCount: 0,
      platform: dto.platform,
      sourceCreators: dto.sourceCreators ?? [],
    };

    return this.create(playbookData as CreatePlaybookDto);
  }

  async buildInsights(
    playbookId: Types.ObjectId | string,
    organizationId: Types.ObjectId,
  ): Promise<PatternPlaybookDocument> {
    const playbook = await this.findOne({
      _id: new Types.ObjectId(playbookId.toString()),
      isDeleted: false,
      organization: organizationId,
    });
    if (!playbook) {
      throw new Error('Playbook not found');
    }

    const patterns = await this.patternStoreService.findByOrganization(
      playbook.organization,
      {
        platform:
          playbook.platform === 'all'
            ? undefined
            : (playbook.platform as ContentIntelligencePlatform),
        sourceCreator:
          playbook.sourceCreators.length > 0
            ? playbook.sourceCreators[0]
            : undefined,
      },
    );

    // Calculate top hooks
    const hookPatterns = patterns.filter(
      (p) => p.patternType === ContentPatternType.HOOK,
    );
    const topHooks = hookPatterns
      .sort(
        (a, b) =>
          b.sourceMetrics.engagementRate - a.sourceMetrics.engagementRate,
      )
      .slice(0, 10)
      .map((p) => ({
        avgEngagement: p.sourceMetrics.engagementRate,
        count: 1,
        formula: p.extractedFormula,
      }));

    // Calculate content mix
    const contentMix = this.calculateContentMix(patterns);

    // Calculate benchmarks
    const benchmarks = this.calculateBenchmarks(patterns);

    // Calculate hashtag strategy
    const hashtagStrategy = this.extractHashtagStrategy(patterns);

    const insights = {
      benchmarks,
      contentMix,
      hashtagStrategy,
      postingSchedule: {
        bestDays: ['Monday', 'Tuesday', 'Wednesday'],
        bestTimes: ['09:00', '12:00', '17:00'],
        frequency: patterns.length > 0 ? Math.ceil(patterns.length / 30) : 0,
      },
      topHooks,
    };

    return this.patch(playbookId, {
      insights,
      lastUpdatedAt: new Date(),
      patternsCount: patterns.length,
    } as unknown as Partial<UpdatePlaybookDto>);
  }

  private calculateContentMix(
    patterns: ContentPatternDocument[],
  ): Record<string, number> {
    const categories: Record<string, number> = {
      caseStudy: 0,
      contrarian: 0,
      curation: 0,
      giveaway: 0,
      list: 0,
      question: 0,
      story: 0,
      thread: 0,
    };

    for (const pattern of patterns) {
      if (
        pattern.templateCategory &&
        categories[pattern.templateCategory] !== undefined
      ) {
        categories[pattern.templateCategory]++;
      }
    }

    const total = patterns.length || 1;
    return Object.fromEntries(
      Object.entries(categories).map(([key, value]) => [
        key,
        Math.round((value / total) * 100) / 100,
      ]),
    );
  }

  private calculateBenchmarks(
    patterns: ContentPatternDocument[],
  ): Record<string, number> {
    if (patterns.length === 0) {
      return {
        avgComments: 0,
        avgEngagementRate: 0,
        avgLikes: 0,
        avgShares: 0,
        avgViews: 0,
        topPerformerThreshold: 0,
      };
    }

    const totals = patterns.reduce(
      (acc, p) => {
        acc.likes += p.sourceMetrics?.likes ?? 0;
        acc.comments += p.sourceMetrics?.comments ?? 0;
        acc.shares += p.sourceMetrics?.shares ?? 0;
        acc.views += p.sourceMetrics?.views ?? 0;
        acc.engagementRate += p.sourceMetrics?.engagementRate ?? 0;
        return acc;
      },
      { comments: 0, engagementRate: 0, likes: 0, shares: 0, views: 0 },
    );

    const count = patterns.length;
    const avgEngagementRate = totals.engagementRate / count;

    // Top performer threshold is the 90th percentile
    const sortedEngagement = patterns
      .map((p) => p.sourceMetrics?.engagementRate ?? 0)
      .sort((a, b) => a - b);
    const topPerformerThreshold =
      sortedEngagement[Math.floor(sortedEngagement.length * 0.9)] ?? 0;

    return {
      avgComments: Math.round(totals.comments / count),
      avgEngagementRate: Math.round(avgEngagementRate * 100) / 100,
      avgLikes: Math.round(totals.likes / count),
      avgShares: Math.round(totals.shares / count),
      avgViews: Math.round(totals.views / count),
      topPerformerThreshold: Math.round(topPerformerThreshold * 100) / 100,
    };
  }

  private extractHashtagStrategy(
    patterns: ContentPatternDocument[],
  ): Record<string, string[] | number> {
    const allTags = patterns.flatMap((p) => p.tags ?? []);
    const tagCounts = allTags.reduce(
      (acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const sortedTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([tag]) => tag);

    return {
      branded: [],
      niche: sortedTags.slice(0, 10),
      optimalCount: 5,
      trending: sortedTags.slice(0, 5),
    };
  }

  findByOrganization(
    organizationId: Types.ObjectId,
  ): Promise<PatternPlaybookDocument[]> {
    return this.findAllByOrganization(organizationId.toString());
  }

  async addCreatorToPlaybook(
    playbookId: Types.ObjectId | string,
    creatorId: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<PatternPlaybookDocument> {
    const playbook = await this.findOne({
      _id: new Types.ObjectId(playbookId.toString()),
      isDeleted: false,
      organization: organizationId,
    });
    if (!playbook) {
      throw new Error('Playbook not found');
    }

    const sourceCreators = [...playbook.sourceCreators, creatorId];
    return this.patch(playbookId, {
      sourceCreators,
    } as Partial<UpdatePlaybookDto>);
  }

  async removeCreatorFromPlaybook(
    playbookId: Types.ObjectId | string,
    creatorId: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<PatternPlaybookDocument> {
    const playbook = await this.findOne({
      _id: new Types.ObjectId(playbookId.toString()),
      isDeleted: false,
      organization: organizationId,
    });
    if (!playbook) {
      throw new Error('Playbook not found');
    }

    const sourceCreators = playbook.sourceCreators.filter(
      (id) => id.toString() !== creatorId.toString(),
    );
    return this.patch(playbookId, {
      sourceCreators,
    } as Partial<UpdatePlaybookDto>);
  }
}
