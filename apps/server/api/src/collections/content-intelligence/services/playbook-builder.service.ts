import {
  CreatePlaybookDto,
  UpdatePlaybookDto,
} from '@api/collections/content-intelligence/dto/create-playbook.dto';
import type { ContentPatternDocument } from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import type { PatternPlaybookDocument } from '@api/collections/content-intelligence/schemas/pattern-playbook.schema';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { readRecordOrEmpty as readJsonRecord } from '@api/shared/utils/object/read-record-or-empty.util';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.length > 0,
      )
    : [];
}

@Injectable()
export class PlaybookBuilderService extends BaseService<
  PatternPlaybookDocument,
  Prisma.PatternPlaybookCreateInput,
  Prisma.PatternPlaybookUpdateInput
> {
  protected override normalizeDocument(
    document: unknown,
  ): PatternPlaybookDocument {
    const record = super.normalizeDocument(document) as unknown as Record<
      string,
      unknown
    >;
    const data = readJsonRecord(record.data);
    const sourceCreators = Array.isArray(record.sourceCreators)
      ? record.sourceCreators
          .map((creator) =>
            typeof creator === 'object' && creator !== null && 'id' in creator
              ? (creator as { id?: unknown }).id
              : creator,
          )
          .filter((id): id is string => typeof id === 'string')
      : [];

    return {
      ...data,
      ...record,
      data,
      sourceCreators,
    } as unknown as PatternPlaybookDocument;
  }

  private getEngagementRate(pattern: ContentPatternDocument): number {
    return pattern.sourceMetrics?.engagementRate ?? 0;
  }

  constructor(
    public readonly prisma: PrismaService,
    private readonly patternStoreService: PatternStoreService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'patternPlaybook', logger);
  }

  createPlaybook(
    organizationId: string,
    userId: string,
    dto: CreatePlaybookDto,
  ): Promise<PatternPlaybookDocument> {
    const data = {
      ...(dto.description === undefined
        ? {}
        : { description: dto.description }),
      insights: {
        benchmarks: {},
        contentMix: {},
        hashtagStrategy: {},
        postingSchedule: {},
        topHooks: [],
      },
      isActive: true,
      name: dto.name,
      ...(dto.niche === undefined ? {} : { niche: dto.niche }),
      patternsCount: 0,
      platform: dto.platform,
    } satisfies Prisma.InputJsonObject;
    const sourceCreatorIds = readStringArray(dto.sourceCreators);

    return this.create(
      {
        createdById: userId,
        data,
        organization: { connect: { id: organizationId } },
        ...(sourceCreatorIds.length > 0
          ? {
              sourceCreators: {
                connect: sourceCreatorIds.map((id) => ({ id })),
              },
            }
          : {}),
      },
      ['sourceCreators'],
    );
  }

  async buildInsights(
    playbookId: string,
    organizationId: string,
  ): Promise<PatternPlaybookDocument> {
    const playbook = await this.findOne(
      scopedWhere(organizationId, { id: playbookId }),
      ['sourceCreators'],
    );
    if (!playbook) {
      throw new Error('Playbook not found');
    }

    const playbookData = readJsonRecord(playbook.data);
    const sourceCreatorIds = readStringArray(playbook.sourceCreators);
    const patterns = await this.patternStoreService.findByOrganization(
      playbook.organizationId,
      {
        platform:
          playbook.platform === 'all'
            ? undefined
            : (playbook.platform as ContentIntelligencePlatform),
        sourceCreator:
          sourceCreatorIds.length > 0 ? sourceCreatorIds[0] : undefined,
      },
    );

    // Calculate top hooks
    const hookPatterns = patterns.filter(
      (p) => p.patternType === ContentPatternType.HOOK,
    );
    const topHooks = hookPatterns
      .sort((a, b) => this.getEngagementRate(b) - this.getEngagementRate(a))
      .slice(0, 10)
      .map((p) => ({
        avgEngagement: this.getEngagementRate(p),
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

    return this.patch(
      playbookId,
      {
        data: {
          ...playbookData,
          insights,
          lastUpdatedAt: new Date().toISOString(),
          patternsCount: patterns.length,
        } as Prisma.InputJsonObject,
      },
      ['sourceCreators'],
    );
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
    organizationId: string,
  ): Promise<PatternPlaybookDocument[]> {
    return this.find(scopedWhere(organizationId), ['sourceCreators']);
  }

  updatePlaybook(
    playbook: PatternPlaybookDocument,
    dto: UpdatePlaybookDto,
  ): Promise<PatternPlaybookDocument> {
    const data = readJsonRecord(playbook.data);

    return this.patch(
      playbook.id,
      {
        data: {
          ...data,
          ...(dto.description === undefined
            ? {}
            : { description: dto.description }),
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.niche === undefined ? {} : { niche: dto.niche }),
        } as Prisma.InputJsonObject,
        ...(dto.sourceCreators === undefined
          ? {}
          : {
              sourceCreators: {
                set: readStringArray(dto.sourceCreators).map((id) => ({ id })),
              },
            }),
      },
      ['sourceCreators'],
    );
  }

  async addCreatorToPlaybook(
    playbookId: string,
    creatorId: string,
    organizationId: string,
  ): Promise<PatternPlaybookDocument> {
    const playbook = await this.findOne(
      scopedWhere(organizationId, { id: playbookId }),
      ['sourceCreators'],
    );
    if (!playbook) {
      throw new Error('Playbook not found');
    }

    const sourceCreators = [
      ...new Set([...readStringArray(playbook.sourceCreators), creatorId]),
    ];
    return this.patch(
      playbookId,
      {
        sourceCreators: {
          set: sourceCreators.map((id) => ({ id })),
        },
      },
      ['sourceCreators'],
    );
  }

  async removeCreatorFromPlaybook(
    playbookId: string,
    creatorId: string,
    organizationId: string,
  ): Promise<PatternPlaybookDocument> {
    const playbook = await this.findOne(
      scopedWhere(organizationId, { id: playbookId }),
      ['sourceCreators'],
    );
    if (!playbook) {
      throw new Error('Playbook not found');
    }

    const sourceCreators = readStringArray(playbook.sourceCreators).filter(
      (id) => id !== creatorId,
    );
    return this.patch(
      playbookId,
      {
        sourceCreators: {
          set: sourceCreators.map((id) => ({ id })),
        },
      },
      ['sourceCreators'],
    );
  }
}
