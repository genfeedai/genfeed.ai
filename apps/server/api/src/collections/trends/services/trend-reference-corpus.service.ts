import { createHash } from 'node:crypto';
import type {
  TrendPromptReferenceBrandSuitability,
  TrendPromptReferenceFreshnessStatus,
  TrendPromptReferencePack,
  TrendPromptReferencePackFreshness,
  TrendPromptReferencePackResult,
  TrendPromptReferencePackSource,
  TrendPromptReferencePackType,
  TrendSourceAccountResult,
  TrendSourceAccountSummary,
  TrendSourceClassification,
  TrendSourceConfidence,
  TrendSourceItem,
  TrendSourceKind,
  TrendSourceReferenceRecord,
  TrendSourceReferenceResult,
} from '@api/collections/trends/interfaces/trend.interfaces';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

interface SyncTrendInput {
  id: string;
  topic: string;
  platform: string;
  mentions: number;
  viralityScore: number;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  sourcePreview: TrendSourceItem[];
}

interface RemixLineagePayload {
  organizationId: string;
  brandId: string;
  contentDraftId?: string;
  postId?: string;
  generatedBy: string;
  platforms: string[];
  draftType?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
}

interface ReferenceQueryOptions {
  authorHandle?: string;
  limit?: number;
  platform?: string;
  trendId?: string;
}

interface PromptReferencePackQueryOptions {
  intent?: TrendSourceClassification['intendedUse'];
  limit?: number;
  platform?: string;
  types?: TrendPromptReferencePackType[];
}

interface ReferenceRecordData {
  authorHandle?: string;
  canonicalUrl: string;
  contentType: TrendSourceItem['contentType'];
  currentEngagementTotal: number;
  currentMetrics?: TrendSourceItem['metrics'];
  firstSeenAt: string;
  lastSeenAt: string;
  latestTrendMentions: number;
  latestTrendViralityScore: number;
  matchedTrendTopics: string[];
  mediaUrl?: string;
  platform: string;
  publishedAt?: string;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  sourceClassification?: TrendSourceClassification;
  text?: string;
  thumbnailUrl?: string;
  title?: string;
}

const DEFAULT_REFERENCE_CORPUS_LIMIT = 30;
const DEFAULT_REFERENCE_ACCOUNT_LIMIT = 20;
const DEFAULT_PROMPT_REFERENCE_PACK_LIMIT = 12;
const DEFAULT_PROMPT_REFERENCE_FRESHNESS_DAYS = 7;
const MAX_REFERENCE_QUERY_LIMIT = 100;
const PROMPT_REFERENCE_PACK_TYPES: TrendPromptReferencePackType[] = [
  'hooks',
  'formats',
  'references',
  'constraints',
];

@Injectable()
export class TrendReferenceCorpusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  async syncTrendReferences(
    trends: SyncTrendInput[],
  ): Promise<{ links: number; references: number; snapshots: number }> {
    let references = 0;
    let snapshots = 0;
    let links = 0;

    for (const trend of trends) {
      for (const sourceItem of trend.sourcePreview) {
        if (!sourceItem.sourceUrl) {
          continue;
        }

        const canonicalUrl = this.normalizeSourceUrl(sourceItem.sourceUrl);

        const matchedRef = await this.prisma.trendSourceReference.findFirst({
          where: {
            canonicalUrl,
            isDeleted: false,
            platform: sourceItem.platform,
          },
        });

        const engagementTotal = this.getEngagementTotal(sourceItem.metrics);
        const now = new Date();

        let referenceId: string;

        if (matchedRef) {
          const existingData =
            matchedRef.data as unknown as ReferenceRecordData;
          const matchedTopics = Array.isArray(existingData.matchedTrendTopics)
            ? existingData.matchedTrendTopics
            : [];
          const updatedTopics = matchedTopics.includes(trend.topic)
            ? matchedTopics
            : [...matchedTopics, trend.topic];

          await this.prisma.trendSourceReference.update({
            data: {
              authorHandle: sourceItem.authorHandle,
              canonicalUrl,
              currentEngagementTotal: engagementTotal,
              data: {
                ...existingData,
                authorHandle: sourceItem.authorHandle,
                canonicalUrl,
                contentType: sourceItem.contentType,
                currentEngagementTotal: engagementTotal,
                currentMetrics: sourceItem.metrics || {},
                externalId: sourceItem.id,
                lastSeenAt: now.toISOString(),
                latestTrendMentions: trend.mentions,
                latestTrendViralityScore: trend.viralityScore,
                matchedTrendTopics: updatedTopics,
                mediaUrl: sourceItem.mediaUrl,
                publishedAt: sourceItem.publishedAt
                  ? new Date(sourceItem.publishedAt).toISOString()
                  : undefined,
                sourceClassification:
                  sourceItem.sourceClassification ??
                  existingData.sourceClassification,
                sourcePreviewState: trend.sourcePreviewState,
                text: sourceItem.text,
                thumbnailUrl: sourceItem.thumbnailUrl,
                title: sourceItem.title,
              } as never,
              lastSeenAt: now,
              latestTrendViralityScore: trend.viralityScore,
              platform: sourceItem.platform,
            },
            where: { id: matchedRef.id },
          });
          referenceId = matchedRef.id;
        } else {
          const created = await this.prisma.trendSourceReference.create({
            data: {
              authorHandle: sourceItem.authorHandle,
              canonicalUrl,
              currentEngagementTotal: engagementTotal,
              data: {
                authorHandle: sourceItem.authorHandle,
                canonicalUrl,
                contentType: sourceItem.contentType,
                currentEngagementTotal: engagementTotal,
                currentMetrics: sourceItem.metrics || {},
                externalId: sourceItem.id,
                firstSeenAt: now.toISOString(),
                lastSeenAt: now.toISOString(),
                latestTrendMentions: trend.mentions,
                latestTrendViralityScore: trend.viralityScore,
                matchedTrendTopics: [trend.topic],
                mediaUrl: sourceItem.mediaUrl,
                platform: sourceItem.platform,
                publishedAt: sourceItem.publishedAt
                  ? new Date(sourceItem.publishedAt).toISOString()
                  : undefined,
                sourceClassification: sourceItem.sourceClassification,
                sourcePreviewState: trend.sourcePreviewState,
                text: sourceItem.text,
                thumbnailUrl: sourceItem.thumbnailUrl,
                title: sourceItem.title,
              } as never,
              isDeleted: false,
              lastSeenAt: now,
              latestTrendViralityScore: trend.viralityScore,
              platform: sourceItem.platform,
            },
          });
          referenceId = created.id;
        }
        references += 1;

        // Upsert snapshot for today
        const snapshotDate = this.toSnapshotDate();
        const matchedSnapshot =
          await this.prisma.trendSourceReferenceSnapshot.findFirst({
            where: {
              isDeleted: false,
              snapshotDate,
              sourceReferenceId: referenceId,
            },
          });

        if (!matchedSnapshot) {
          await this.prisma.trendSourceReferenceSnapshot.create({
            data: {
              data: {
                engagementTotal,
                metrics: sourceItem.metrics || {},
                snapshotDate: snapshotDate.toISOString(),
                trendMentions: trend.mentions,
                trendViralityScore: trend.viralityScore,
              } as never,
              isDeleted: false,
              snapshotDate,
              sourceReferenceId: referenceId,
            },
          });
          snapshots += 1;
        } else {
          await this.prisma.trendSourceReferenceSnapshot.update({
            data: {
              data: {
                engagementTotal,
                metrics: sourceItem.metrics || {},
                snapshotDate: snapshotDate.toISOString(),
                trendMentions: trend.mentions,
                trendViralityScore: trend.viralityScore,
              } as never,
              snapshotDate,
            },
            where: { id: matchedSnapshot.id },
          });
        }

        // Upsert link between trend and source reference
        const existingLink =
          await this.prisma.trendSourceReferenceLink.findFirst({
            where: {
              isDeleted: false,
              sourceReferenceId: referenceId,
              trendId: trend.id,
            },
          });

        if (!existingLink) {
          await this.prisma.trendSourceReferenceLink.create({
            data: {
              isDeleted: false,
              sourceReferenceId: referenceId,
              trendId: trend.id,
            },
          });
          links += 1;
        } else {
          // Update matchReason/rankAtCapture in a data-like field if needed
          // TrendSourceReferenceLink has no data blob — nothing to update
        }
      }
    }

    return { links, references, snapshots };
  }

  async countGlobalReferences(): Promise<number> {
    return this.prisma.trendSourceReference.count({
      where: { isDeleted: false },
    });
  }

  async recordDraftRemixLineage(payload: RemixLineagePayload): Promise<void> {
    const hasContentDraftId =
      typeof payload.contentDraftId === 'string' &&
      payload.contentDraftId.length > 0;
    const hasPostId =
      typeof payload.postId === 'string' && payload.postId.length > 0;

    if (!hasContentDraftId && !hasPostId) {
      return;
    }

    const sourceReferenceIds = await this.resolveSourceReferenceIds(
      payload.metadata,
    );
    const trendIds = [
      ...this.parseStringArray(payload.metadata?.trendIds),
      ...this.parseOptionalString(payload.metadata?.trendId),
    ];
    const sourceUrls = [
      ...this.parseStringArray(payload.metadata?.sourceUrls),
      ...this.parseOptionalString(payload.metadata?.sourceUrl),
    ];

    if (sourceReferenceIds.length === 0 && trendIds.length === 0) {
      return;
    }

    // Validate that all trendIds belong to the caller's organization before
    // connecting them to remix lineage records.
    if (trendIds.length > 0) {
      const ownedTrends = await this.prisma.trend.findMany({
        select: { id: true },
        where: {
          id: { in: trendIds },
          isDeleted: false,
          organizationId: payload.organizationId,
        },
      });

      if (ownedTrends.length !== trendIds.length) {
        throw new BadRequestException(
          'One or more trend IDs do not belong to this organization',
        );
      }
    }

    // Find existing lineage record
    const where = hasContentDraftId
      ? { contentDraftId: payload.contentDraftId }
      : { postId: payload.postId };

    const existing = await this.prisma.trendRemixLineage.findFirst({
      where: { ...where, isDeleted: false } as never,
    });

    const dataPayload = {
      draftType: payload.draftType,
      generatedBy: payload.generatedBy,
      platforms: payload.platforms,
      prompt: payload.prompt,
      sourceUrls,
    };

    if (existing) {
      await this.prisma.trendRemixLineage.update({
        data: {
          data: dataPayload as never,
          // Update relations via Prisma connect
          sourceReferences: {
            set: sourceReferenceIds.map((id) => ({ id })),
          },
          trends: {
            set: trendIds.map((id) => ({ id })),
          },
        } as never,
        where: { id: existing.id },
      });
    } else {
      await this.prisma.trendRemixLineage.create({
        data: {
          brandId: payload.brandId,
          contentDraftId: hasContentDraftId
            ? payload.contentDraftId
            : undefined,
          data: dataPayload as never,
          isDeleted: false,
          organizationId: payload.organizationId,
          postId: hasPostId ? payload.postId : undefined,
          sourceReferences: {
            connect: sourceReferenceIds.map((id) => ({ id })),
          },
          trends: {
            connect: trendIds.map((id) => ({ id })),
          },
        } as never,
      });
    }
  }

  async annotateSourceItemsWithReferenceIds<T extends TrendSourceItem>(
    items: T[],
  ): Promise<T[]> {
    if (items.length === 0) {
      return items;
    }

    const sourceUrls = items
      .map((item) => item.sourceUrl)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );

    if (sourceUrls.length === 0) {
      return items;
    }

    const canonicalUrls = Array.from(
      new Set(
        sourceUrls.map((sourceUrl) => this.normalizeSourceUrl(sourceUrl)),
      ),
    );

    const matchedRefs = await this.prisma.trendSourceReference.findMany({
      orderBy: { createdAt: 'desc' },
      take: canonicalUrls.length,
      where: {
        canonicalUrl: { in: canonicalUrls },
        isDeleted: false,
      },
    });

    if (matchedRefs.length === 0) {
      return items;
    }

    const referenceMap = new Map(
      matchedRefs.map((doc) => {
        const d = doc.data as unknown as ReferenceRecordData;
        return [doc.canonicalUrl ?? d.canonicalUrl, doc.id];
      }),
    );

    return items.map((item) => ({
      ...item,
      sourceReferenceId:
        referenceMap.get(this.normalizeSourceUrl(item.sourceUrl)) ??
        item.sourceReferenceId,
    }));
  }

  async getReferenceCorpus(
    organizationId: string | undefined,
    brandId: string | undefined,
    options: ReferenceQueryOptions = {},
  ): Promise<TrendSourceReferenceResult> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_REFERENCE_CORPUS_LIMIT,
    );

    let sourceReferenceIds: string[] | undefined;
    if (options.trendId) {
      // Verify the trend is visible to the caller before fetching its references.
      // Trends with a matching organizationId are org-owned; if organizationId is
      // undefined the caller is in an unauthenticated/internal path (allow all).
      if (organizationId) {
        const trend = await this.prisma.trend.findFirst({
          select: { id: true },
          where: {
            id: options.trendId,
            isDeleted: false,
            organizationId,
          },
        });

        if (!trend) {
          // Return empty corpus rather than leaking references linked to another
          // org's trend.
          return { items: [], totalReferences: 0 };
        }
      }

      const links = await this.prisma.trendSourceReferenceLink.findMany({
        select: { sourceReferenceId: true },
        take: Math.max(limit * 10, 100),
        where: {
          isDeleted: false,
          trendId: options.trendId,
        },
      });
      sourceReferenceIds = links
        .map((l) => l.sourceReferenceId)
        .filter((id): id is string => id != null);
    }

    const docs = await this.prisma.trendSourceReference.findMany({
      orderBy: [
        { currentEngagementTotal: 'desc' },
        { latestTrendViralityScore: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      take: limit,
      where: {
        ...(options.authorHandle ? { authorHandle: options.authorHandle } : {}),
        ...(options.platform ? { platform: options.platform } : {}),
        ...(sourceReferenceIds != null
          ? { id: { in: sourceReferenceIds } }
          : {}),
        isDeleted: false,
      },
    });

    const remixCounts = await this.getRemixCounts(
      docs.map((doc) => doc.id),
      organizationId,
      brandId,
    );

    return {
      items: docs.map((doc) =>
        this.toReferenceRecord(
          doc.id,
          doc.data as unknown as ReferenceRecordData,
          doc.createdAt,
          remixCounts,
        ),
      ),
      totalReferences: docs.length,
    };
  }

  async getPromptReferencePacks(
    organizationId: string | undefined,
    brandId: string | undefined,
    options: PromptReferencePackQueryOptions = {},
  ): Promise<TrendPromptReferencePackResult> {
    const generatedAt = new Date();
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_PROMPT_REFERENCE_PACK_LIMIT,
    );
    const targetPlatform = options.platform ?? 'multi_platform';
    const contentIntent = options.intent ?? 'organic_trend_discovery';
    const requestedTypes = this.normalizePromptReferencePackTypes(
      options.types,
    );

    const docs = await this.prisma.trendSourceReference.findMany({
      orderBy: [
        { currentEngagementTotal: 'desc' },
        { latestTrendViralityScore: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      take: Math.min(limit * 4, MAX_REFERENCE_QUERY_LIMIT),
      where: {
        ...(options.platform ? { platform: options.platform } : {}),
        isDeleted: false,
      },
    });

    const remixCounts = await this.getRemixCounts(
      docs.map((doc) => doc.id),
      organizationId,
      brandId,
    );

    const promptReadyReferences = docs
      .map((doc) =>
        this.toReferenceRecord(
          doc.id,
          doc.data as unknown as ReferenceRecordData,
          doc.createdAt,
          remixCounts,
        ),
      )
      .filter((reference) =>
        this.isPromptReadyReference(reference, contentIntent),
      );
    const selectedReferences = promptReadyReferences.slice(0, limit);

    const packs = requestedTypes
      .map((type) =>
        this.toPromptReferencePack({
          contentIntent,
          generatedAt,
          references: selectedReferences,
          targetPlatform,
          type,
        }),
      )
      .filter((pack): pack is TrendPromptReferencePack => pack != null);

    return {
      packs,
      summary: {
        availableTypes: packs.map((pack) => pack.type),
        contentIntent,
        generatedAt: generatedAt.toISOString(),
        skippedSources: docs.length - promptReadyReferences.length,
        targetPlatform,
        totalPacks: packs.length,
        totalSources: selectedReferences.length,
      },
    };
  }

  async getTopReferenceAccounts(
    organizationId?: string,
    brandId?: string,
    options: {
      limit?: number;
      platform?: string;
    } = {},
  ): Promise<TrendSourceAccountResult> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_REFERENCE_ACCOUNT_LIMIT,
    );

    type AccountKey = string; // `${platform}:${authorHandle}`
    const accountRows = await this.prisma.trendSourceReference.groupBy({
      _avg: { latestTrendViralityScore: true },
      _count: { _all: true },
      _max: { lastSeenAt: true },
      _sum: { currentEngagementTotal: true },
      by: ['platform', 'authorHandle'],
      orderBy: [
        { _avg: { latestTrendViralityScore: 'desc' } },
        { _count: { authorHandle: 'desc' } },
        { _sum: { currentEngagementTotal: 'desc' } },
      ],
      take: limit,
      where: {
        authorHandle: { not: null },
        isDeleted: false,
        platform: options.platform ? options.platform : { not: null },
      },
    } as never);

    const brandRemixCounts = await this.getBrandRemixCountsByAccount(
      organizationId,
      brandId,
      options.platform,
    );

    const accounts: TrendSourceAccountSummary[] = (
      accountRows as Array<{
        _avg?: { latestTrendViralityScore?: unknown };
        _count?: { _all?: unknown };
        _max?: { lastSeenAt?: Date | null };
        _sum?: { currentEngagementTotal?: unknown };
        authorHandle?: string | null;
        platform?: string | null;
      }>
    )
      .filter((row) => row.platform && row.authorHandle)
      .map((row) => {
        const key: AccountKey = `${row.platform}:${row.authorHandle}`;
        return {
          authorHandle: String(row.authorHandle),
          avgTrendViralityScore: Math.round(
            Number(row._avg?.latestTrendViralityScore ?? 0),
          ),
          brandRemixCount: brandRemixCounts.get(key) || 0,
          lastSeenAt: row._max?.lastSeenAt?.toISOString(),
          platform: String(row.platform),
          referenceCount: Number(row._count?._all ?? 0),
          totalEngagement: Number(row._sum?.currentEngagementTotal ?? 0),
        };
      });

    return {
      accounts,
      totalAccounts: accounts.length,
    };
  }

  private async resolveSourceReferenceIds(
    metadata?: Record<string, unknown>,
  ): Promise<string[]> {
    const explicitIds = [
      ...this.parseStringArray(metadata?.sourceReferenceIds),
      ...this.parseOptionalString(metadata?.sourceReferenceId),
    ];
    if (explicitIds.length > 0) {
      return Array.from(new Set(explicitIds));
    }

    const sourceUrls = [
      ...this.parseStringArray(metadata?.sourceUrls),
      ...this.parseOptionalString(metadata?.sourceUrl),
    ];
    if (sourceUrls.length === 0) {
      return [];
    }

    const normalizedUrls = sourceUrls.map((url) =>
      this.normalizeSourceUrl(url),
    );

    const refs = await this.prisma.trendSourceReference.findMany({
      select: { id: true },
      take: normalizedUrls.length,
      where: {
        canonicalUrl: { in: normalizedUrls },
        isDeleted: false,
      },
    });

    return refs.map((doc) => doc.id);
  }

  private parseOptionalString(value: unknown): string[] {
    if (typeof value !== 'string' || value.length === 0) {
      return [];
    }

    return [value];
  }

  private parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    );
  }

  private normalizeSourceUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      parsed.search = '';
      return parsed.toString().replace(/\/$/, '');
    } catch (error) {
      this.loggerService.warn('Failed to normalize source URL', {
        error: error instanceof Error ? error.message : String(error),
        url,
      });
      return url.replace(/[?#].*$/, '').replace(/\/$/, '');
    }
  }

  private normalizeLimit(
    value: number | undefined,
    defaultLimit: number,
  ): number {
    if (!Number.isFinite(value) || value == null || value <= 0) {
      return defaultLimit;
    }

    return Math.min(Math.floor(value), MAX_REFERENCE_QUERY_LIMIT);
  }

  private normalizePromptReferencePackTypes(
    types: TrendPromptReferencePackType[] | undefined,
  ): TrendPromptReferencePackType[] {
    if (!types || types.length === 0) {
      return PROMPT_REFERENCE_PACK_TYPES;
    }

    return PROMPT_REFERENCE_PACK_TYPES.filter((type) => types.includes(type));
  }

  private isPromptReadyReference(
    reference: TrendSourceReferenceRecord,
    contentIntent: TrendSourceClassification['intendedUse'],
  ): boolean {
    return (
      reference.sourceClassification?.intendedUse === contentIntent &&
      reference.canonicalUrl.length > 0 &&
      reference.platform.length > 0 &&
      reference.contentType.length > 0 &&
      Number.isFinite(reference.currentEngagementTotal) &&
      this.getReferenceLabel(reference).length > 0
    );
  }

  private toPromptReferencePack(input: {
    contentIntent: TrendSourceClassification['intendedUse'];
    generatedAt: Date;
    references: TrendSourceReferenceRecord[];
    targetPlatform: string;
    type: TrendPromptReferencePackType;
  }): TrendPromptReferencePack | undefined {
    if (input.references.length === 0) {
      return undefined;
    }

    const topReferences = input.references.slice(0, 6);
    const sourceReferenceIds = topReferences.map((reference) => reference.id);
    const freshness = this.buildPromptPackFreshness(topReferences);
    const sourceFingerprint =
      this.buildPromptPackSourceFingerprint(topReferences);
    const cacheKey = this.hashPromptPackKey([
      input.type,
      input.targetPlatform,
      input.contentIntent,
      sourceFingerprint,
    ]);
    const confidence = this.aggregateConfidence(topReferences);
    const sourceKinds = this.getUniqueSourceKinds(topReferences);
    const contentTypes = this.getUniqueContentTypes(topReferences);
    const matchedTopics = this.getUniqueMatchedTopics(topReferences);
    const sourceLabel = this.describePromptPackSources(topReferences);
    const promptContent = this.buildPromptPackContent(
      input.type,
      topReferences,
    );

    return {
      brandSuitability: this.getBrandSuitability(topReferences),
      confidence,
      constraints: promptContent.constraints,
      contentIntent: input.contentIntent,
      examples: promptContent.examples,
      freshness,
      id: `prompt-pack:${input.type}:${input.targetPlatform}:${cacheKey}`,
      instructions: promptContent.instructions,
      metadata: {
        contentTypes,
        generatedAt: input.generatedAt.toISOString(),
        matchedTopics,
        sourceCount: topReferences.length,
        sourceKinds,
      },
      regeneration: {
        cacheKey,
        regenerateAfter: freshness.regenerateAfter,
        sourceFingerprint,
        trigger: this.getRegenerationTrigger(freshness),
      },
      sourceReferenceIds,
      sources: topReferences.map((reference) =>
        this.toPromptReferencePackSource(reference),
      ),
      summary: promptContent.summary,
      targetPlatform: input.targetPlatform,
      title: `${this.toTitleCase(input.type)} pack from ${sourceLabel}`,
      type: input.type,
    };
  }

  private buildPromptPackContent(
    type: TrendPromptReferencePackType,
    references: TrendSourceReferenceRecord[],
  ): {
    constraints: string[];
    examples: string[];
    instructions: string[];
    summary: string;
  } {
    switch (type) {
      case 'hooks':
        return {
          constraints: [
            'Keep the opening claim grounded in the cited source references.',
            'Do not copy creator wording verbatim when adapting the hook.',
          ],
          examples: references.map(
            (reference) => `Hook angle: ${this.deriveHook(reference)}`,
          ),
          instructions: [
            'Start with the concrete tension, result, or surprising detail visible in the source.',
            'Adapt the hook structure to the target brand voice before generation.',
          ],
          summary: `Reusable hook patterns from ${references.length} prompt-ready corpus references.`,
        };
      case 'formats':
        return {
          constraints: [
            'Use the observed format as structure, not as a copied creative.',
            'Match the target platform constraints before publishing.',
          ],
          examples: this.deriveFormatExamples(references),
          instructions: [
            'Choose the format that matches the requested platform and creative intent.',
            'Preserve the source-backed sequence of setup, proof, and payoff when present.',
          ],
          summary: `Observed content formats across ${this.getUniqueContentTypes(references).join(', ')} references.`,
        };
      case 'references':
        return {
          constraints: [
            'Keep reference URLs available for audit and remix lineage.',
            'Treat sources as inspiration and evidence, not generated output.',
          ],
          examples: references.map(
            (reference) =>
              `${this.getReferenceLabel(reference)} (${reference.canonicalUrl})`,
          ),
          instructions: [
            'Use these references to ground examples, claims, and creative direction.',
            'Prefer newer or higher-confidence sources when the pack contains conflicts.',
          ],
          summary: `Traceable source-reference set with ${references.length} canonical corpus records.`,
        };
      case 'constraints':
        return {
          constraints: this.deriveSourceBackedConstraints(references),
          examples: references.map(
            (reference) =>
              `${reference.platform}: ${this.getReferenceLabel(reference)}`,
          ),
          instructions: [
            'Apply these constraints before drafting generation prompts.',
            'Regenerate the pack when freshness metadata marks the source set stale or expired.',
          ],
          summary: `Source-backed generation constraints from ${references.length} classified references.`,
        };
      default: {
        const exhaustive: never = type;
        return exhaustive;
      }
    }
  }

  private deriveHook(reference: TrendSourceReferenceRecord): string {
    const label = this.getReferenceLabel(reference);
    const firstSentence = label.split(/[.!?]/)[0]?.trim();
    return SecurityUtil.sanitizePromptInput(firstSentence || label, 160);
  }

  private deriveFormatExamples(
    references: TrendSourceReferenceRecord[],
  ): string[] {
    const examples = references.map((reference) => {
      const topic = reference.matchedTrendTopics[0] ?? 'source-backed topic';
      return `${reference.platform} ${reference.contentType}: lead with ${SecurityUtil.sanitizePromptInput(topic, 80)}, then adapt "${this.getReferenceLabel(reference)}".`;
    });

    return this.uniqueStrings(examples).slice(0, 6);
  }

  private deriveSourceBackedConstraints(
    references: TrendSourceReferenceRecord[],
  ): string[] {
    const sourceLabels = this.uniqueStrings(
      references
        .map((reference) => reference.sourceClassification?.sourceLabel)
        .filter((value): value is string => Boolean(value)),
    );
    const topics = this.getUniqueMatchedTopics(references);
    const platforms = this.uniqueStrings(
      references.map((reference) => reference.platform),
    );

    return [
      `Use only references classified for ${references[0]?.sourceClassification?.intendedUse ?? 'prompt context'}.`,
      `Target platform evidence comes from ${platforms.join(', ')}.`,
      sourceLabels.length > 0
        ? `Source labels represented: ${sourceLabels.join(', ')}.`
        : 'Source labels are unavailable; keep claims generic.',
      topics.length > 0
        ? `Ground angles in matched topics: ${topics.slice(0, 6).join(', ')}.`
        : 'No matched trend topics are available; avoid trend-specific claims.',
    ];
  }

  private buildPromptPackFreshness(
    references: TrendSourceReferenceRecord[],
  ): TrendPromptReferencePackFreshness {
    const sourceFreshness = references.map((reference) => ({
      id: reference.id,
      status: this.getReferenceFreshnessStatus(reference),
    }));
    const freshnessWindowDays = Math.max(
      ...references.map(
        (reference) =>
          reference.sourceClassification?.freshnessWindowDays ??
          DEFAULT_PROMPT_REFERENCE_FRESHNESS_DAYS,
      ),
    );
    const lastSourceSeenAt = references
      .map((reference) => reference.lastSeenAt)
      .sort()
      .at(-1);
    const regenerateAfter = references
      .map((reference) => this.getRegenerateAfter(reference))
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    const expiredSourceIds = sourceFreshness
      .filter((source) => source.status === 'expired')
      .map((source) => source.id);
    const staleSourceIds = sourceFreshness
      .filter((source) => source.status === 'stale')
      .map((source) => source.id);

    return {
      expiredSourceIds,
      freshnessWindowDays,
      lastSourceSeenAt,
      regenerateAfter,
      staleSourceIds,
      status:
        expiredSourceIds.length > 0
          ? 'expired'
          : staleSourceIds.length > 0
            ? 'stale'
            : 'fresh',
    };
  }

  private getReferenceFreshnessStatus(
    reference: TrendSourceReferenceRecord,
  ): TrendPromptReferenceFreshnessStatus {
    const freshnessWindowDays =
      reference.sourceClassification?.freshnessWindowDays ??
      DEFAULT_PROMPT_REFERENCE_FRESHNESS_DAYS;
    const lastSeenAt = new Date(reference.lastSeenAt).getTime();
    if (!Number.isFinite(lastSeenAt)) {
      return 'expired';
    }

    const ageMs = Date.now() - lastSeenAt;
    const freshnessWindowMs = freshnessWindowDays * 24 * 60 * 60 * 1000;

    if (ageMs <= freshnessWindowMs) {
      return 'fresh';
    }

    return ageMs <= freshnessWindowMs * 2 ? 'stale' : 'expired';
  }

  private getRegenerateAfter(
    reference: TrendSourceReferenceRecord,
  ): string | undefined {
    const lastSeenAt = new Date(reference.lastSeenAt).getTime();
    if (!Number.isFinite(lastSeenAt)) {
      return undefined;
    }

    const freshnessWindowDays =
      reference.sourceClassification?.freshnessWindowDays ??
      DEFAULT_PROMPT_REFERENCE_FRESHNESS_DAYS;
    return new Date(
      lastSeenAt + freshnessWindowDays * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  private getRegenerationTrigger(
    freshness: TrendPromptReferencePackFreshness,
  ): TrendPromptReferencePack['regeneration']['trigger'] {
    if (freshness.expiredSourceIds.length > 0) {
      return 'source_expired';
    }
    if (freshness.staleSourceIds.length > 0) {
      return 'source_stale';
    }
    return 'cache_key_changed';
  }

  private toPromptReferencePackSource(
    reference: TrendSourceReferenceRecord,
  ): TrendPromptReferencePackSource {
    const source: TrendPromptReferencePackSource = {
      authorHandle: reference.authorHandle,
      canonicalUrl: reference.canonicalUrl,
      confidence: reference.sourceClassification?.confidence ?? 'low',
      contentType: reference.contentType,
      freshnessStatus: this.getReferenceFreshnessStatus(reference),
      id: reference.id,
      lastSeenAt: reference.lastSeenAt,
      platform: reference.platform,
      sourceClassification: reference.sourceClassification,
    };

    if (reference.text) {
      source.text = reference.text;
    }
    if (reference.title) {
      source.title = reference.title;
    }

    return source;
  }

  private buildPromptPackSourceFingerprint(
    references: TrendSourceReferenceRecord[],
  ): string {
    return references
      .map(
        (reference) =>
          `${reference.id}:${reference.lastSeenAt}:${reference.latestTrendViralityScore}:${reference.currentEngagementTotal}`,
      )
      .sort()
      .join('|');
  }

  private hashPromptPackKey(parts: string[]): string {
    return createHash('sha256')
      .update(parts.join('|'))
      .digest('hex')
      .slice(0, 16);
  }

  private aggregateConfidence(
    references: TrendSourceReferenceRecord[],
  ): TrendSourceConfidence {
    const confidences = references.map(
      (reference) => reference.sourceClassification?.confidence ?? 'low',
    );

    if (confidences.every((confidence) => confidence === 'high')) {
      return 'high';
    }
    if (confidences.some((confidence) => confidence !== 'low')) {
      return 'medium';
    }
    return 'low';
  }

  private getBrandSuitability(
    references: TrendSourceReferenceRecord[],
  ): TrendPromptReferenceBrandSuitability {
    if (
      references.some(
        (reference) =>
          reference.sourceClassification?.sourceKind ===
            'paid_creative_reference' ||
          reference.sourceClassification?.confidence === 'low',
      )
    ) {
      return 'requires_review';
    }

    return references.every((reference) => reference.sourceClassification)
      ? 'brand_safe'
      : 'unknown';
  }

  private getUniqueSourceKinds(
    references: TrendSourceReferenceRecord[],
  ): TrendSourceKind[] {
    return this.uniqueStrings(
      references
        .map((reference) => reference.sourceClassification?.sourceKind)
        .filter((value): value is TrendSourceKind => Boolean(value)),
    ) as TrendSourceKind[];
  }

  private getUniqueContentTypes(
    references: TrendSourceReferenceRecord[],
  ): TrendSourceItem['contentType'][] {
    return this.uniqueStrings(
      references.map((reference) => reference.contentType),
    ) as TrendSourceItem['contentType'][];
  }

  private getUniqueMatchedTopics(
    references: TrendSourceReferenceRecord[],
  ): string[] {
    return this.uniqueStrings(
      references.flatMap((reference) => reference.matchedTrendTopics),
    ).slice(0, 12);
  }

  private describePromptPackSources(
    references: TrendSourceReferenceRecord[],
  ): string {
    const platforms = this.uniqueStrings(
      references.map((reference) => reference.platform),
    );
    return platforms.length === 1
      ? platforms[0]
      : `${platforms.length} platforms`;
  }

  private getReferenceLabel(reference: TrendSourceReferenceRecord): string {
    return SecurityUtil.sanitizePromptInput(
      reference.title || reference.text || reference.canonicalUrl,
      180,
    );
  }

  private toTitleCase(value: string): string {
    return value
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' ');
  }

  private uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => value.length > 0)));
  }

  private getEngagementTotal(metrics?: TrendSourceItem['metrics']): number {
    return (
      (metrics?.comments || 0) +
      (metrics?.likes || 0) +
      (metrics?.shares || 0) +
      (metrics?.views || 0)
    );
  }

  private toSnapshotDate(): Date {
    const snapshotDate = new Date();
    snapshotDate.setUTCHours(0, 0, 0, 0);
    return snapshotDate;
  }

  private async getRemixCounts(
    sourceReferenceIds: string[],
    organizationId?: string,
    brandId?: string,
  ): Promise<Map<string, number>> {
    if (sourceReferenceIds.length === 0 || !organizationId || !brandId) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        remix_count: bigint | number | string;
        source_reference_id: string;
      }>
    >(
      Prisma.sql`
        SELECT
          refs."B" AS source_reference_id,
          COUNT(*) AS remix_count
        FROM "_remix_lineage_source_refs" refs
        INNER JOIN "trend_remix_lineages" lineage ON lineage."id" = refs."A"
        WHERE refs."B" = ANY(${sourceReferenceIds}::text[])
          AND lineage."organizationId" = ${organizationId}
          AND lineage."brandId" = ${brandId}
          AND lineage."isDeleted" = false
        GROUP BY refs."B"
      `,
    );

    return new Map(
      rows.map((row) => [
        row.source_reference_id,
        Number(row.remix_count ?? 0),
      ]),
    );
  }

  private async getBrandRemixCountsByAccount(
    organizationId?: string,
    brandId?: string,
    platform?: string,
  ): Promise<Map<string, number>> {
    if (!organizationId || !brandId) {
      return new Map();
    }

    const platformFilter = platform
      ? Prisma.sql`AND source_ref."platform" = ${platform}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{
        author_handle: string;
        platform: string;
        remix_count: bigint | number | string;
      }>
    >(
      Prisma.sql`
        SELECT
          source_ref."platform" AS platform,
          source_ref."authorHandle" AS author_handle,
          COUNT(*) AS remix_count
        FROM "_remix_lineage_source_refs" refs
        INNER JOIN "trend_remix_lineages" lineage ON lineage."id" = refs."A"
        INNER JOIN "trend_source_references" source_ref ON source_ref."id" = refs."B"
        WHERE lineage."organizationId" = ${organizationId}
          AND lineage."brandId" = ${brandId}
          AND lineage."isDeleted" = false
          AND source_ref."isDeleted" = false
          AND source_ref."platform" IS NOT NULL
          AND source_ref."authorHandle" IS NOT NULL
          ${platformFilter}
        GROUP BY source_ref."platform", source_ref."authorHandle"
      `,
    );

    return new Map(
      rows.map((row) => [
        `${row.platform}:${row.author_handle}`,
        Number(row.remix_count ?? 0),
      ]),
    );
  }

  private toReferenceRecord(
    id: string,
    data: ReferenceRecordData,
    createdAt: Date,
    remixCounts: Map<string, number>,
  ): TrendSourceReferenceRecord {
    return {
      authorHandle: data.authorHandle,
      canonicalUrl: data.canonicalUrl,
      contentType: data.contentType,
      currentEngagementTotal: data.currentEngagementTotal,
      currentMetrics: data.currentMetrics,
      firstSeenAt: data.firstSeenAt ?? createdAt.toISOString(),
      id,
      lastSeenAt: data.lastSeenAt,
      latestTrendMentions: data.latestTrendMentions,
      latestTrendViralityScore: data.latestTrendViralityScore,
      matchedTrendTopics: data.matchedTrendTopics,
      mediaUrl: data.mediaUrl,
      platform: data.platform,
      publishedAt: data.publishedAt,
      remixCount: remixCounts.get(id) || 0,
      sourcePreviewState: data.sourcePreviewState,
      sourceClassification: data.sourceClassification,
      text: data.text,
      thumbnailUrl: data.thumbnailUrl,
      title: data.title,
    };
  }
}
