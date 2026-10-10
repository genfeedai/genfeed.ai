import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { PostCreateInput } from '@api/collections/posts/services/posts.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { runIdempotent } from '@api/helpers/utils/idempotency/idempotency.util';
import { scopedWhere } from '@api/index';
import {
  type TurboRunConfig,
  type TurboRunItemFull,
  type TurboRunWithConfig,
  toTurboRunWithConfig,
} from '@api/services/turbo-run/turbo-run.types';
import { TurboRunSummaryService } from '@api/services/turbo-run/turbo-run-summary.service';
import {
  turboRunItemRowsInclude,
  persistTurboRunItemRows,
  withTurboRunWriteTransaction,
  writeTurboRunJsonAndItemRows,
} from '@api/services/turbo-run/turbo-run-item-rows';
import { toPrismaTurboRunStatus } from '@api/services/turbo-run/turbo-run-status-prisma.mapper';
import { CreateTurboRunDto } from '@api/services/turbo-run/dto/create-turbo-run.dto';
import { CreateManualReviewTurboRunDto } from '@api/services/turbo-run/dto/create-manual-review-turbo-run.dto';
import type { ContentMixConfig } from '@api/services/turbo-run/schemas/turbo-run.schema';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  TurboRunItemStatus,
  TurboRunStatus,
  ContentFormat,
  PostVisibility,
  parsePlatform,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class TurboRunCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly postsService: PostsService,
    private readonly cacheService: CacheService,
    private readonly summaryService: TurboRunSummaryService,
  ) {}

  async createTurboRun(
    dto: CreateTurboRunDto,
    userId: string,
    orgId: string,
    idempotencyKey?: string,
    strategyId?: string,
  ): Promise<ITurboRunSummary> {
    if (idempotencyKey) {
      return runIdempotent(this.cacheService, idempotencyKey, () =>
        this.doCreateTurboRun(dto, userId, orgId, strategyId),
      );
    }

    return this.doCreateTurboRun(dto, userId, orgId, strategyId);
  }

  private async doCreateTurboRun(
    dto: CreateTurboRunDto,
    userId: string,
    orgId: string,
    strategyId?: string,
  ): Promise<ITurboRunSummary> {
    // Verify brand exists and belongs to org
    const brand = await this.brandsService.findOne({
      id: dto.brandId,
      organizationId: orgId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', dto.brandId);
    }

    if (strategyId) {
      const strategy = await this.prisma.agentStrategy.findFirst({
        where: {
          id: strategyId,
          organizationId: orgId,
          brandId: dto.brandId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!strategy) throw new NotFoundException('Agent strategy', strategyId);
    }

    const platforms = this.normalizeTurboRunPlatforms(dto.platforms);

    const contentMix: ContentMixConfig = dto.contentMix ?? {
      carouselPercent: 10,
      imagePercent: 60,
      reelPercent: 5,
      storyPercent: 0,
      videoPercent: 25,
    };

    const dateRangeStart = new Date(dto.dateRange.start);
    const dateRangeEnd = new Date(dto.dateRange.end);

    const items = this.generateContentPlan(
      dto.count,
      contentMix,
      platforms,
      dto.topics ?? [],
      dateRangeStart,
      dateRangeEnd,
    );

    const config: TurboRunConfig = {
      completedCount: 0,
      contentMix,
      dateRangeEnd: dateRangeEnd.toISOString(),
      dateRangeStart: dateRangeStart.toISOString(),
      failedCount: 0,
      platforms,
      style: dto.style,
      topics: dto.topics ?? [],
      totalCount: dto.count,
    };

    const turboRun = await withTurboRunWriteTransaction(this.prisma, async (tx) => {
      const created = (await tx.turboRun.create({
        data: {
          agentStrategyId: strategyId ?? null,
          brandId: dto.brandId,
          config: config as Prisma.InputJsonValue,
          isDeleted: false,
          items: toPrismaJson(items),
          organizationId: orgId,
          status: toPrismaTurboRunStatus(TurboRunStatus.PENDING),
          userId,
        },
      })) as TurboRunWithConfig;
      await persistTurboRunItemRows(tx, {
        turboRunId: created.id,
        brandId: dto.brandId,
        items,
        organizationId: orgId,
      });
      return created;
    });

    this.logger.log(`Batch created: ${turboRun.id}`, {
      turboRunId: turboRun.id,
      count: dto.count,
      orgId,
    });

    return this.summaryService.toTurboRunSummary(turboRun);
  }

  async createManualReviewTurboRun(
    dto: CreateManualReviewTurboRunDto,
    userId: string,
    orgId: string,
    idempotencyKey?: string,
  ): Promise<ITurboRunSummary> {
    if (idempotencyKey) {
      return runIdempotent(this.cacheService, idempotencyKey, () =>
        this.doCreateManualReviewTurboRun(dto, userId, orgId),
      );
    }

    return this.doCreateManualReviewTurboRun(dto, userId, orgId);
  }

  private async doCreateManualReviewTurboRun(
    dto: CreateManualReviewTurboRunDto,
    userId: string,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    const brand = await this.brandsService.findOne({
      id: dto.brandId,
      organizationId: orgId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', dto.brandId);
    }

    if (dto.agentStrategyId) {
      const strategy = await this.prisma.agentStrategy.findFirst({
        where: scopedWhere(orgId, {
          id: dto.agentStrategyId,
          brandId: dto.brandId,
        }),
      });
      if (!strategy)
        throw new BadRequestException(
          'Agent strategy does not belong to this brand',
        );
    }
    await this.validateIngredientOwnership(dto, orgId);
    const { createdPostIds, items: turboRunItems } =
      await this.createManualReviewItems(dto, userId, orgId);

    const config: TurboRunConfig = {
      completedAt: new Date().toISOString(),
      completedCount: turboRunItems.length,
      contentMix: {
        carouselPercent: 0,
        imagePercent: 0,
        reelPercent: 0,
        storyPercent: 0,
        videoPercent: 0,
      },
      failedCount: 0,
      platforms: Array.from(
        new Set(
          dto.items.flatMap((item) => (item.platform ? [item.platform] : [])),
        ),
      ),
      source: 'manual',
      topics: [],
      totalCount: turboRunItems.length,
    };

    let turboRun: TurboRunWithConfig;
    let createdTurboRunId: string | undefined;
    try {
      turboRun = await withTurboRunWriteTransaction(this.prisma, async (tx) => {
        const created = (await tx.turboRun.create({
          data: {
            agentStrategyId: dto.agentStrategyId,
            brandId: dto.brandId,
            config: config as Prisma.InputJsonValue,
            isDeleted: false,
            items: toPrismaJson(turboRunItems),
            organizationId: orgId,
            status: toPrismaTurboRunStatus(TurboRunStatus.COMPLETED),
            userId,
          },
        })) as TurboRunWithConfig;
        createdTurboRunId = created.id;
        await persistTurboRunItemRows(tx, {
          turboRunId: created.id,
          brandId: dto.brandId,
          items: turboRunItems,
          organizationId: orgId,
        });
        return created;
      });

      await this.linkManualReviewPosts(
        turboRun.id,
        turboRunItems,
        orgId,
        dto.brandId,
      );
    } catch (error: unknown) {
      await this.compensateManualReviewCreation(
        createdTurboRunId,
        createdPostIds,
        orgId,
      );
      throw error;
    }

    this.logger.log(`Manual review batch created: ${turboRun.id}`, {
      turboRunId: turboRun.id,
      itemCount: turboRunItems.length,
      orgId,
    });

    return this.summaryService.toTurboRunSummary(turboRun);
  }

  /**
   * Append items to an existing manual-review batch so outputs that finish at
   * different times land in the same review inbox batch (#5463). Each item
   * gets its draft Post exactly as `createManualReviewTurboRun` creates them; the
   * created Posts are soft-deleted again if the append does not commit.
   */
  async appendManualReviewItems(
    turboRunId: string,
    dto: CreateManualReviewTurboRunDto,
    userId: string,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    await this.validateIngredientOwnership(dto, orgId);
    const { createdPostIds, items: appendedItems } =
      await this.createManualReviewItems(dto, userId, orgId);

    const duplicatePostIds: string[] = [];
    let turboRun: TurboRunWithConfig;
    try {
      turboRun = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "turbo-runs" WHERE "id" = ${turboRunId} AND "organizationId" = ${orgId} AND "isDeleted" = false FOR UPDATE`,
        );
        const current = await tx.turboRun.findFirst({
          include: turboRunItemRowsInclude(orgId),
          where: scopedWhere(orgId, { brandId: dto.brandId, id: turboRunId }),
        });
        if (!current) {
          throw new NotFoundException('TurboRun', turboRunId);
        }
        const existing = toTurboRunWithConfig(current);
        const existingConfig: TurboRunConfig = existing.config;
        // A retried hand-off must not add a second review item for the same
        // source: the existing item (and its decision) stays authoritative.
        const existingSources = new Set(
          existing.items.flatMap((item) =>
            item.sourceActionId ? [item.sourceActionId] : [],
          ),
        );
        const freshItems = appendedItems.filter(
          (item) =>
            !item.sourceActionId || !existingSources.has(item.sourceActionId),
        );
        duplicatePostIds.push(
          ...appendedItems
            .filter((item) => !freshItems.includes(item))
            .flatMap((item) =>
              item.postId && createdPostIds.includes(item.postId)
                ? [item.postId]
                : [],
            ),
        );
        const items = [...existing.items, ...freshItems];
        const config: TurboRunConfig = {
          ...existingConfig,
          completedCount: items.length,
          platforms: Array.from(
            new Set([
              ...(existingConfig.platforms ?? []),
              ...dto.items.flatMap((item) =>
                item.platform ? [item.platform] : [],
              ),
            ]),
          ),
          totalCount: items.length,
        };
        const result = await writeTurboRunJsonAndItemRows(tx, {
          turboRunId,
          brandId: dto.brandId,
          extraTurboRunData: { config: config as Prisma.InputJsonValue },
          items,
          organizationId: orgId,
        });
        if (result.count !== 1) {
          throw new NotFoundException('TurboRun', turboRunId);
        }
        await this.linkManualReviewPosts(
          turboRunId,
          freshItems,
          orgId,
          dto.brandId,
          tx,
        );
        const updated = await tx.turboRun.findFirst({
          include: turboRunItemRowsInclude(orgId),
          where: scopedWhere(orgId, { id: turboRunId }),
        });
        if (!updated) {
          throw new NotFoundException('TurboRun', turboRunId);
        }
        return toTurboRunWithConfig(updated);
      });
    } catch (error: unknown) {
      await this.compensateManualReviewCreation(
        undefined,
        createdPostIds,
        orgId,
      );
      throw error;
    }

    if (duplicatePostIds.length > 0) {
      await this.compensateManualReviewCreation(
        undefined,
        duplicatePostIds,
        orgId,
      );
    }

    this.logger.log(`Manual review items appended: ${turboRunId}`, {
      turboRunId,
      itemCount: appendedItems.length,
      orgId,
    });

    return this.summaryService.toTurboRunSummary(turboRun);
  }

  private async validateIngredientOwnership(
    dto: CreateManualReviewTurboRunDto,
    orgId: string,
  ): Promise<void> {
    const ingredientIds = [
      ...new Set(
        dto.items
          .map((item) => item.ingredientId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ingredientIds.length > 0) {
      const ownedIngredients = await this.prisma.ingredient.findMany({
        select: { id: true },
        where: scopedWhere(orgId, { id: { in: ingredientIds } }),
      });
      if (ownedIngredients.length !== ingredientIds.length) {
        throw new BadRequestException(
          'One or more ingredient IDs do not belong to this organization',
        );
      }
    }

    const suppliedPostIds = dto.items
      .map((item) => item.postId)
      .filter((id): id is string => Boolean(id));
    const existingPostIds = [...new Set(suppliedPostIds)];
    if (existingPostIds.length === 0) return;
    if (existingPostIds.length !== suppliedPostIds.length) {
      throw new BadRequestException(
        'A Post can appear only once in a manual review batch',
      );
    }
    const ownedPosts = await this.prisma.post.findMany({
      select: { id: true },
      where: scopedWhere(orgId, {
        brandId: dto.brandId,
        id: { in: existingPostIds },
      }),
    });
    if (ownedPosts.length !== existingPostIds.length) {
      throw new BadRequestException(
        'One or more post IDs do not belong to this organization and brand',
      );
    }
  }

  private async createManualReviewItems(
    dto: CreateManualReviewTurboRunDto,
    userId: string,
    orgId: string,
  ): Promise<{ createdPostIds: string[]; items: TurboRunItemFull[] }> {
    const turboRunItems: TurboRunItemFull[] = [];
    const createdPostIds: string[] = [];
    try {
      for (const reviewItem of dto.items) {
        const contentRunId = reviewItem.contentRunId
          ? String(reviewItem.contentRunId)
          : undefined;
        let postId = reviewItem.postId;
        if (!postId && reviewItem.targetIdempotencyKey) {
          // tenant-scope-ignore: organizationId and brandId are pinned; isDeleted is omitted so the unique key can restore a tombstone
          const existing = await this.prisma.post.findFirst({
            select: { id: true, isDeleted: true },
            where: {
              brandId: dto.brandId,
              organizationId: orgId,
              targetIdempotencyKey: reviewItem.targetIdempotencyKey,
            },
          });
          postId = existing?.id;
          if (existing?.isDeleted) {
            const restored = await this.prisma.post.updateMany({
              data: { isDeleted: false },
              where: {
                brandId: dto.brandId,
                id: existing.id,
                isDeleted: true,
                organizationId: orgId,
              },
            });
            if (restored.count !== 1) {
              throw new BadRequestException(
                'The idempotent Review Post changed while it was being restored',
              );
            }
          }
        }
        if (!postId) {
          const post = await this.postsService.create({
            agentStrategyId: dto.agentStrategyId,
            scheduledDate: reviewItem.scheduledDate
              ? new Date(reviewItem.scheduledDate)
              : undefined,
            brandId: dto.brandId,
            contentRunId,
            creativeVersion: reviewItem.creativeVersion,
            description:
              reviewItem.caption ??
              reviewItem.prompt ??
              'Review this asset before publishing',
            hookVersion: reviewItem.hookVersion,
            ingredients: reviewItem.ingredientId
              ? [reviewItem.ingredientId]
              : [],
            label: reviewItem.label ?? `Review ${reviewItem.format} draft`,
            organizationId: orgId,
            platform: reviewItem.platform,
            publishIntent: reviewItem.publishIntent,
            promptUsed: reviewItem.prompt,
            scheduleSlot: reviewItem.scheduleSlot,
            sourceActionId: reviewItem.sourceActionId,
            sourceWorkflowId: reviewItem.sourceWorkflowId,
            sourceWorkflowName: reviewItem.sourceWorkflowName,
            targetExecutionState: TargetExecutionState.DRAFT,
            targetIdempotencyKey: reviewItem.targetIdempotencyKey,
            userId: userId,
            variantId: reviewItem.variantId,
            visibility: PostVisibility.PUBLIC,
            workflowExecutionId: reviewItem.workflowExecutionId,
          } as PostCreateInput);

          postId = String((post as Record<string, unknown>).id ?? post.id);
          createdPostIds.push(postId);
        }

        turboRunItems.push({
          id: crypto.randomUUID(),
          caption: reviewItem.caption,
          contentRunId,
          creativeVersion: reviewItem.creativeVersion,
          format: reviewItem.format as ContentFormat,
          gateOverallScore: reviewItem.gateOverallScore,
          gateReasons: reviewItem.gateReasons ?? [],
          hookVersion: reviewItem.hookVersion,
          ingredientId: reviewItem.ingredientId,
          mediaUrl: reviewItem.mediaUrl,
          opportunitySourceType: reviewItem.opportunitySourceType,
          opportunityTopic: reviewItem.opportunityTopic,
          platform: reviewItem.platform,
          postId,
          publishIntent: reviewItem.publishIntent,
          prompt: reviewItem.prompt,
          reviewDecision: ReviewDecision.UNSET,
          reviewEvents: [],
          scheduledDate: reviewItem.scheduledDate,
          scheduleSlot: reviewItem.scheduleSlot,
          sourceActionId: reviewItem.sourceActionId,
          sourceWorkflowId: reviewItem.sourceWorkflowId,
          sourceWorkflowName: reviewItem.sourceWorkflowName,
          status: TurboRunItemStatus.COMPLETED,
          engagementAction: reviewItem.engagementAction,
          targetAuthor: reviewItem.targetAuthor,
          targetPostContent: reviewItem.targetPostContent,
          targetPostId: reviewItem.targetPostId,
          targetPostUrl: reviewItem.targetPostUrl,
          type: reviewItem.type,
          variantId: reviewItem.variantId,
          workflowExecutionId: reviewItem.workflowExecutionId,
        });
      }
    } catch (error: unknown) {
      await this.compensateManualReviewCreation(
        undefined,
        createdPostIds,
        orgId,
      );
      throw error;
    }
    return { createdPostIds, items: turboRunItems };
  }

  private async linkManualReviewPosts(
    turboRunId: string,
    turboRunItems: TurboRunItemFull[],
    orgId: string,
    brandId: string,
    client: Pick<Prisma.TransactionClient, 'post'> = this.prisma,
  ): Promise<void> {
    const results = await Promise.all(
      turboRunItems.map(async (item) => {
        if (!item.postId) return { count: 0 };

        return client.post.updateMany({
          data: {
            reviewTurboRunId: turboRunId,
            reviewItemId: item.id,
          },
          where: scopedWhere(orgId, { brandId, id: item.postId }),
        });
      }),
    );

    if (results.some((result) => result.count !== 1)) {
      throw new NotFoundException({
        message:
          'A manual review post disappeared before batch linking completed',
      });
    }
  }

  private async compensateManualReviewCreation(
    turboRunId: string | undefined,
    createdPostIds: string[],
    orgId: string,
  ): Promise<void> {
    try {
      if (turboRunId) {
        await this.prisma.post.updateMany({
          data: { reviewTurboRunId: null, reviewItemId: null },
          where: scopedWhere(orgId, { reviewTurboRunId: turboRunId }),
        });
      }
      if (createdPostIds.length > 0) {
        await this.prisma.post.updateMany({
          data: { isDeleted: true },
          where: scopedWhere(orgId, { id: { in: createdPostIds } }),
        });
      }
      if (turboRunId) {
        await this.prisma.turboRun.updateMany({
          data: { isDeleted: true },
          where: scopedWhere(orgId, { id: turboRunId }),
        });
      }
    } catch (cleanupError: unknown) {
      this.logger.error('Manual review batch compensation failed', {
        turboRunId,
        cleanupError,
        orgId,
      });
    }
  }

  /**
   * Map free-text platform inputs onto domain Platform values. Reject the
   * whole request when any entry is unmappable so we never persist malformed
   * platform strings into batch items (#2696).
   */
  private normalizeTurboRunPlatforms(platforms: string[]): string[] {
    if (!Array.isArray(platforms) || platforms.length === 0) {
      throw new BadRequestException(
        'At least one platform is required for batch generation',
      );
    }

    const normalized: string[] = [];
    const invalid: string[] = [];

    for (const raw of platforms) {
      const parsed = parsePlatform(raw);
      if (!parsed) {
        invalid.push(String(raw ?? ''));
        continue;
      }
      if (!normalized.includes(parsed)) {
        normalized.push(parsed);
      }
    }

    if (invalid.length > 0 || normalized.length === 0) {
      throw new BadRequestException(
        `Invalid batch platform(s): ${invalid.join(', ') || '(empty)'}. Use a supported platform id.`,
      );
    }

    return normalized;
  }

  private generateContentPlan(
    count: number,
    contentMix: ContentMixConfig,
    platforms: string[],
    _topics: string[],
    dateRangeStart: Date,
    dateRangeEnd: Date,
  ): TurboRunItemFull[] {
    const items: TurboRunItemFull[] = [];
    const formatCounts = this.calculateFormatCounts(count, contentMix);
    const timeSlots = this.distributeTimeSlots(
      count,
      dateRangeStart,
      dateRangeEnd,
    );

    let index = 0;
    const now = new Date().toISOString();
    for (const [format, formatCount] of Object.entries(formatCounts)) {
      for (let i = 0; i < formatCount; i++) {
        items.push({
          id: crypto.randomUUID(),
          createdAt: now,
          format: format as ContentFormat,
          platform: platforms[index % platforms.length],
          reviewDecision: ReviewDecision.UNSET,
          scheduledDate: timeSlots[index]?.toISOString(),
          status: TurboRunItemStatus.PENDING,
        });
        index++;
      }
    }

    return items;
  }

  private calculateFormatCounts(
    total: number,
    contentMix: ContentMixConfig,
  ): Record<string, number> {
    const formats: Array<{ key: ContentFormat; percent: number }> = [
      { key: ContentFormat.IMAGE, percent: contentMix.imagePercent },
      { key: ContentFormat.VIDEO, percent: contentMix.videoPercent },
      { key: ContentFormat.CAROUSEL, percent: contentMix.carouselPercent },
      { key: ContentFormat.REEL, percent: contentMix.reelPercent },
      { key: ContentFormat.STORY, percent: contentMix.storyPercent },
    ];

    const safeTotal = Math.max(0, Math.floor(total));
    const percentTotal = formats.reduce(
      (sum, format) => sum + Math.max(0, format.percent),
      0,
    );
    if (percentTotal === 0) {
      return Object.fromEntries(
        formats.map((format, index) => [
          format.key,
          index === 0 ? safeTotal : 0,
        ]),
      );
    }

    const allocations = formats.map((format, index) => {
      const exact = (Math.max(0, format.percent) / percentTotal) * safeTotal;
      return { count: Math.floor(exact), fraction: exact % 1, format, index };
    });
    let remaining =
      safeTotal - allocations.reduce((sum, item) => sum + item.count, 0);
    const byRemainder = [...allocations].sort(
      (a, b) => b.fraction - a.fraction || a.index - b.index,
    );
    for (let index = 0; remaining > 0; index++, remaining--) {
      byRemainder[index % byRemainder.length].count++;
    }

    const counts: Record<string, number> = {};
    for (const allocation of allocations) {
      counts[allocation.format.key] = allocation.count;
    }

    return counts;
  }

  private distributeTimeSlots(count: number, start: Date, end: Date): Date[] {
    const slots: Date[] = [];
    const totalMs = end.getTime() - start.getTime();
    const interval = count > 1 ? totalMs / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      slots.push(new Date(start.getTime() + interval * i));
    }

    return slots;
  }
}
