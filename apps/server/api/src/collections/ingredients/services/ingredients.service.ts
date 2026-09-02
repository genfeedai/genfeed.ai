import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import {
  toIngredientCreateData,
  toIngredientUpdateData,
} from '@api/collections/ingredients/utils/ingredient-create-data.util';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { LibraryShelfUtil } from '@api/helpers/utils/library-shelf/library-shelf.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  type IngredientCategory,
  IngredientStatus,
  LibraryShelf,
  MetadataExtension,
} from '@genfeedai/enums';
import type { ILibrarySummary, PopulateOption } from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class IngredientsService extends BaseService<
  IngredientDocument,
  CreateIngredientDto,
  UpdateIngredientDto
> {
  private readonly constructorName = this.constructor.name;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    // Resolved lazily (strict:false) to fire the first-asset unlock gate on
    // GENERATED transitions without adding a module-import edge to this
    // widely-used base service. See fireAssetGateForOrganizations().
    protected readonly moduleRef: ModuleRef,
  ) {
    super(prisma, 'ingredient', logger);
  }

  /**
   * First-asset unlock gate hook. When an Ingredient enters `GENERATED` (via
   * create/patch/patchAll — the only three write paths, covering every
   * generation pipeline: webhooks, inline ComfyUI/Fal, ElevenLabs voice), mark
   * the owning org(s) as having generated their first asset.
   *
   * Best-effort and fully error-isolated so it can never break generation, but
   * intentionally `await`ed by callers so the unlocked bootstrap is ready before
   * generation-success reaches the client. Idempotent + monotonic in the gate
   * service, so repeated GENERATED writes are cheap no-ops.
   */
  protected async fireAssetGateForOrganizations(
    organizationIds: Array<string | null | undefined>,
  ): Promise<void> {
    const uniqueOrgIds = Array.from(
      new Set(organizationIds.filter((id): id is string => Boolean(id))),
    );

    if (uniqueOrgIds.length === 0) {
      return;
    }

    try {
      const assetGateService = this.moduleRef.get(AssetGateService, {
        strict: false,
      });

      await Promise.all(
        uniqueOrgIds.map((organizationId) =>
          assetGateService.markFirstAssetGenerated(organizationId),
        ),
      );
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} asset-gate hook failed`, {
        error,
        organizationIds: uniqueOrgIds,
      });
    }
  }

  /**
   * Get context-aware population options to prevent over-fetching
   * @param context - The context determining which fields to populate
   */
  protected getPopulationForContext(
    context: 'list' | 'detail' | 'minimal' | 'create' = 'minimal',
  ): PopulateOption[] {
    // User details are omitted from list projections unless a caller explicitly
    // needs them; this keeps ingredient payloads and relation queries bounded.
    switch (context) {
      case 'list':
        return [
          PopulatePatterns.brandMinimal,
          PopulatePatterns.metadataBasic,
          PopulatePatterns.promptMinimal,
          { path: 'tags', select: ['id', 'label'] },
        ];
      case 'detail':
        return [
          PopulatePatterns.organizationMinimal,
          PopulatePatterns.brandMinimal,
          PopulatePatterns.metadataFull,
          PopulatePatterns.promptFull,
          { path: 'parent', select: ['id', 'category', 'status'] },
          { path: 'references', select: ['id', 'category', 'status'] },
          { path: 'tags', select: ['id', 'label'] },
        ];
      case 'create':
        return [
          PopulatePatterns.brandMinimal,
          PopulatePatterns.metadataBasic,
          PopulatePatterns.promptMinimal,
        ];
      default:
        return [PopulatePatterns.brandId, { path: 'metadata', select: ['id'] }];
    }
  }

  @HandleErrors('create ingredient', 'ingredients')
  async create(
    createDto: CreateIngredientDto,
    populate: PopulateInput = this.getPopulationForContext('create'),
  ): Promise<IngredientDocument> {
    this.logger.debug(`${this.constructorName} create`, { createDto });

    const result = await super.create(
      toIngredientCreateData(
        createDto as unknown as Record<string, unknown>,
      ) as CreateIngredientDto,
      populate,
    );

    this.logger.debug(`${this.constructorName} create success`, {
      id: result.id,
    });

    // Some pipelines persist a finished asset directly as GENERATED (fleet
    // ingest, frame splits, public API) rather than via a patch transition.
    // Guard on the input dto (app-form enum value), consistent with patch —
    // `result.status` may be in DB casing after normalization.
    if (createDto.status === IngredientStatus.GENERATED) {
      await this.fireAssetGateForOrganizations([result.organizationId]);
    }

    return result;
  }

  /**
   * Find all children of a parent ingredient.
   *
   * @param id - Parent ingredient ID
   * @param limit - Maximum number of children to return (default: 100, max: 500)
   * @returns Array of child ingredients
   */
  async findChildren(
    id: string,
    limit: number = 100,
  ): Promise<IngredientDocument[]> {
    try {
      this.logger.debug(`${this.constructorName} findChildren`, {
        parentId: id,
      });

      const safeLimit = Math.min(limit, 500);

      const result = await this.prisma.ingredient.findMany({
        where: { isDeleted: false, parentId: id },
        take: safeLimit,
      });

      this.logger.debug(`${this.constructorName} findChildren success`, {
        count: result.length,
        parentId: id,
      });

      return result as unknown as IngredientDocument[];
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} findChildren failed`, {
        error,
        parentId: id,
      });
      throw error;
    }
  }

  /**
   * Batch find ingredients by IDs with organization isolation.
   */
  async findByIds(
    ids: string[],
    organizationId: string,
  ): Promise<IngredientDocument[]> {
    try {
      if (!ids || ids.length === 0) {
        return [];
      }

      this.logger.debug(`${this.constructorName} findByIds`, {
        count: ids.length,
        organizationId,
      });

      const result = await this.prisma.ingredient.findMany({
        where: scopedWhere(organizationId, { id: { in: ids } }),
      });

      this.logger.debug(`${this.constructorName} findByIds success`, {
        found: result.length,
        requested: ids.length,
      });

      return result as unknown as IngredientDocument[];
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} findByIds failed`, {
        count: ids.length,
        error,
      });
      throw error;
    }
  }

  async findAvatarImageById(
    ingredientId: string,
    organizationId: string,
  ): Promise<IngredientDocument | null> {
    const ingredient = (await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        id: ingredientId,
        category: 'AVATAR' as const,
      }),
      include: { metadata: true },
    })) as
      | (IngredientDocument & {
          metadata?: { extension?: string } | null;
        })
      | null;

    if (!ingredient) {
      return null;
    }

    const metadataExtension = (
      ingredient.metadata as { extension?: string } | null
    )?.extension;

    if (
      metadataExtension !== MetadataExtension.JPG &&
      metadataExtension !== MetadataExtension.JPEG
    ) {
      return null;
    }

    return ingredient as unknown as IngredientDocument;
  }

  /**
   * Find approved image ingredients for a campaign within a brand and organization.
   */
  async findApprovedImagesByCampaign(
    campaign: string,
    organizationId: string,
    brandId: string,
  ): Promise<IngredientDocument[]> {
    try {
      this.logger.debug(
        `${this.constructorName} findApprovedImagesByCampaign`,
        { brandId, campaign, organizationId },
      );

      const result = await this.prisma.ingredient.findMany({
        where: scopedWhere(organizationId, {
          brandId,
          campaign,
          category: 'IMAGE' as const,
          reviewStatus: 'APPROVED' as const,
          status: {
            in: ['GENERATED' as const, 'VALIDATED' as const],
          },
        }),
        orderBy: [{ id: 'asc' }, { createdAt: 'asc' }],
      });

      this.logger.debug(
        `${this.constructorName} findApprovedImagesByCampaign success`,
        { brandId, campaign, count: result.length, organizationId },
      );

      return result as unknown as IngredientDocument[];
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} findApprovedImagesByCampaign failed`,
        { brandId, campaign, error, organizationId },
      );
      throw error;
    }
  }

  async patch(
    id: string,
    updateDto: Partial<UpdateIngredientDto>,
    populate: PopulateInput = [],
  ): Promise<IngredientDocument> {
    try {
      this.logger.debug(`${this.constructorName} patch`, { id, updateDto });

      const updated = await this.prisma.ingredient.update({
        where: { id },
        data: this.normalizeData(
          toIngredientUpdateData(
            updateDto as unknown as Record<string, unknown>,
          ),
        ) as Prisma.IngredientUpdateInput,
      });

      if (!updated) {
        throw new NotFoundException('Ingredient', id);
      }

      const result = await this.findOne({ id }, populate);

      if (!result) {
        this.logger.error(
          `${this.constructorName} patch - updated but not found on re-fetch`,
          { id },
        );
        throw new NotFoundException('Ingredient', id);
      }

      this.logger.debug(`${this.constructorName} patch success`, { id });

      // Fire only on the GENERATED transition (updateDto intent), not on every
      // patch of an already-generated asset. `result` carries organizationId.
      if (updateDto.status === IngredientStatus.GENERATED) {
        await this.fireAssetGateForOrganizations([result.organizationId]);
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} patch failed`, {
        error,
        id,
        updateDto,
      });
      throw error;
    }
  }

  async patchAll(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ modifiedCount: number }> {
    try {
      this.logger.debug(`${this.constructorName} patchAll`, { filter, update });

      if (Object.hasOwn(update, 'sources') || Object.hasOwn(update, 'tags')) {
        throw new BadRequestException(
          'Bulk ingredient updates do not support sources or tags',
        );
      }

      const updateData = toIngredientUpdateData(update);

      // Capture the owning org(s) BEFORE the update: once rows flip to GENERATED
      // a post-update re-query on a status-based filter would match nothing.
      const isGeneratedTransition =
        update.status === IngredientStatus.GENERATED;
      const targetOrganizationIds = isGeneratedTransition
        ? (
            await this.prisma.ingredient.findMany({
              where: this.normalizeWhere({
                ...filter,
                isDeleted: filter.isDeleted ?? false,
              }) as Prisma.IngredientWhereInput,
              select: { organizationId: true },
              distinct: ['organizationId'],
            })
          ).map((row: { organizationId: string | null }) => row.organizationId)
        : [];

      const result = await this.prisma.ingredient.updateMany({
        where: this.normalizeWhere({
          ...filter,
          isDeleted: filter.isDeleted ?? false,
        }) as Prisma.IngredientWhereInput,
        data: this.normalizeData(
          updateData,
        ) as Prisma.IngredientUpdateManyMutationInput,
      });

      this.logger.debug(`${this.constructorName} patchAll success`, {
        filter,
        modifiedCount: result.count,
      });

      if (isGeneratedTransition && result.count > 0) {
        await this.fireAssetGateForOrganizations(targetOrganizationIds);
      }

      return { modifiedCount: result.count };
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} patchAll failed`, {
        error,
        filter,
        update,
      });
      throw error;
    }
  }

  /**
   * Soft-delete a caller-supplied id list in two queries.
   *
   * Replaces a per-id `findOne` + `patch` loop. Permission semantics are
   * unchanged: an id is deletable when it exists, is not already deleted, and
   * the caller either owns it or shares its organization. Everything else —
   * missing, already deleted, or foreign on both axes — comes back in
   * `failed`. `findByIds` cannot be reused here: it is organization-scoped
   * only and would drop ingredients the caller owns in another org.
   */
  async bulkSoftDeleteScoped(params: {
    ids: string[];
    organizationId: string;
    userId: string;
  }): Promise<{ deleted: string[]; failed: string[] }> {
    const { ids, organizationId, userId } = params;

    if (!ids || ids.length === 0) {
      return { deleted: [], failed: [] };
    }

    const uniqueIds = [...new Set(ids)];

    const permitted = await this.prisma.ingredient.findMany({
      select: { id: true },
      where: {
        id: { in: uniqueIds },
        isDeleted: false,
        OR: [{ userId }, { organizationId }],
      },
    });

    const permittedIds = new Set(
      permitted.map((row: { id: string }) => row.id),
    );

    const deleted: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      if (permittedIds.has(id)) {
        deleted.push(id);
      } else {
        failed.push(id);
      }
    }

    if (permittedIds.size > 0) {
      // The scope predicate is repeated on the write, not just the read: it
      // closes the window between the two queries and keeps the tenant guard
      // visible at the mutation site.
      await this.prisma.ingredient.updateMany({
        data: { isDeleted: true },
        where: {
          id: { in: [...permittedIds] },
          isDeleted: false,
          OR: [{ userId }, { organizationId }],
        },
      });
    }

    this.logger.debug(`${this.constructorName} bulkSoftDeleteScoped success`, {
      deleted: deleted.length,
      failed: failed.length,
      requested: ids.length,
    });

    return { deleted, failed };
  }

  /**
   * Find top ingredients sorted by total votes (most voted first).
   */
  @HandleErrors('findTopByVotes', 'ingredients')
  async findTopByVotes(params: {
    brandId?: string;
    category?: string;
    limit?: number;
    organizationId: string;
  }): Promise<AggregatePaginateResult<IngredientDocument>> {
    const where: Prisma.IngredientWhereInput = scopedWhere(
      params.organizationId,
      {},
    );

    if (params.brandId) {
      where.brandId = params.brandId;
    }
    if (params.category) {
      where.category = CategoryPrismaUtil.toIngredientCategory(params.category);
    }

    const limit = params.limit ?? 10;

    const [docs, totalDocs] = await Promise.all([
      this.prisma.ingredient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.ingredient.count({ where }),
    ]);

    return {
      docs: docs as unknown as IngredientDocument[],
      hasNextPage: false,
      hasPrevPage: false,
      limit,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
    };
  }

  /**
   * Get KPI metrics for ingredients
   */
  async getKPIMetrics(
    organizationId: string,
    category?: string,
  ): Promise<{
    total: number;
    generated: number;
    rejected: number;
    validated: number;
    byCategory?: Record<
      string,
      { generated: number; rejected: number; validated: number }
    >;
  }> {
    try {
      this.logger.debug(`${this.constructorName} getKPIMetrics`, {
        category,
        organizationId,
      });

      const baseWhere: Prisma.IngredientWhereInput = scopedWhere(
        organizationId,
        {
          ...CategoryPrismaUtil.toIngredientCategoryFilter(category),
        },
      );

      if (category) {
        const [total, generated, rejected, validated] = await Promise.all([
          this.prisma.ingredient.count({ where: baseWhere }),
          this.prisma.ingredient.count({
            where: {
              ...baseWhere,
              status: IngredientStatus.GENERATED,
            },
          }),
          this.prisma.ingredient.count({
            where: {
              ...baseWhere,
              status: IngredientStatus.REJECTED,
            },
          }),
          this.prisma.ingredient.count({
            where: {
              ...baseWhere,
              status: IngredientStatus.VALIDATED,
            },
          }),
        ]);

        return { generated, rejected, total, validated };
      }

      // All categories
      const [total, generated, rejected, validated] = await Promise.all([
        this.prisma.ingredient.count({ where: baseWhere }),
        this.prisma.ingredient.count({
          where: {
            ...baseWhere,
            status: IngredientStatus.GENERATED,
          },
        }),
        this.prisma.ingredient.count({
          where: {
            ...baseWhere,
            status: IngredientStatus.REJECTED,
          },
        }),
        this.prisma.ingredient.count({
          where: {
            ...baseWhere,
            status: IngredientStatus.VALIDATED,
          },
        }),
      ]);

      // Build per-category breakdown
      const categoryGroups = await this.prisma.ingredient.groupBy({
        by: ['category', 'status'],
        where: baseWhere,
        _count: { id: true },
      });

      const byCategory: Record<
        string,
        { generated: number; rejected: number; validated: number }
      > = {};

      for (const group of categoryGroups) {
        if (!group.category) continue;
        if (!byCategory[group.category]) {
          byCategory[group.category] = {
            generated: 0,
            rejected: 0,
            validated: 0,
          };
        }
        if (group.status === IngredientStatus.GENERATED) {
          byCategory[group.category].generated = group._count.id;
        } else if (group.status === IngredientStatus.REJECTED) {
          byCategory[group.category].rejected = group._count.id;
        } else if (group.status === IngredientStatus.VALIDATED) {
          byCategory[group.category].validated = group._count.id;
        }
      }

      return { byCategory, generated, rejected, total, validated };
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} getKPIMetrics failed`, {
        category,
        error,
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Aggregate the counts behind the Library sidebar: one count per asset type,
   * one per shelf, plus Starred, Trash, and the storage meter.
   *
   * Shelf counts overlap on purpose and do not partition `total` — an asset can
   * be both unfoldered and awaiting review, and `total` excludes the archived,
   * rejected, and failed rows that only their own shelf surfaces. The sidebar
   * renders each number as "the size of this saved query", never as a share of
   * a whole.
   *
   * Six queries, all tenant-scoped through `scopedWhere`. The type breakdown and
   * three of the six shelves fall out of a single `groupBy` that also carries the
   * `fileSize` sum, so the storage meter costs nothing extra.
   */
  @HandleErrors('get library summary', 'ingredients')
  async getLibrarySummary(
    organizationId: string,
    filters: Prisma.IngredientWhereInput = {},
  ): Promise<ILibrarySummary> {
    const defaultStatuses = [...LibraryShelfUtil.defaultStatuses];

    const [
      groups,
      unsortedCount,
      needsReviewCount,
      approvedCount,
      starredCount,
      trashedCount,
    ] = await Promise.all([
      this.prisma.ingredient.groupBy({
        _count: { id: true },
        _sum: { fileSize: true },
        by: ['category', 'status'],
        where: scopedWhere(organizationId, { ...filters }),
      }),
      this.prisma.ingredient.count({
        where: scopedWhere(organizationId, {
          ...filters,
          ...LibraryShelfUtil.buildShelfFilter(LibraryShelf.UNSORTED),
        }),
      }),
      this.prisma.ingredient.count({
        where: scopedWhere(organizationId, {
          ...filters,
          ...LibraryShelfUtil.buildShelfFilter(LibraryShelf.NEEDS_REVIEW),
        }),
      }),
      this.prisma.ingredient.count({
        where: scopedWhere(organizationId, {
          ...filters,
          ...LibraryShelfUtil.buildShelfFilter(LibraryShelf.APPROVED),
        }),
      }),
      this.prisma.ingredient.count({
        where: scopedWhere(organizationId, {
          ...filters,
          isFavorite: true,
          status: { in: defaultStatuses },
        }),
      }),
      this.prisma.ingredient.count({
        where: scopedWhere(organizationId, { ...filters, isDeleted: true }),
      }),
    ]);

    const byCategory: Partial<Record<IngredientCategory, number>> = {};
    const byStatus = new Map<string, number>();
    let total = 0;
    let storageBytes = 0;

    for (const group of groups) {
      const count = group._count.id;

      byStatus.set(group.status, (byStatus.get(group.status) ?? 0) + count);

      if (!defaultStatuses.includes(group.status as IngredientStatus)) {
        continue;
      }

      total += count;
      storageBytes += group._sum.fileSize ?? 0;

      if (group.category) {
        const category = group.category as IngredientCategory;
        byCategory[category] = (byCategory[category] ?? 0) + count;
      }
    }

    const countOf = (...statuses: IngredientStatus[]): number =>
      statuses.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0);

    return {
      byCategory,
      byShelf: {
        [LibraryShelf.GENERATING]: countOf(IngredientStatus.PROCESSING),
        [LibraryShelf.UNSORTED]: unsortedCount,
        [LibraryShelf.NEEDS_REVIEW]: needsReviewCount,
        [LibraryShelf.APPROVED]: approvedCount,
        [LibraryShelf.FAILED]: countOf(IngredientStatus.FAILED),
        [LibraryShelf.ARCHIVED]: countOf(
          IngredientStatus.ARCHIVED,
          IngredientStatus.REJECTED,
        ),
      },
      starredCount,
      storageBytes,
      total,
      trashedCount,
    };
  }

  /**
   * Count persona-scoped fleet assets for an organization. Encapsulates the
   * raw Prisma aggregation so fleet callers don't reach into `.prisma.*`.
   */
  async countPersonaAssets(organizationId: string): Promise<number> {
    return this.prisma.ingredient.count({
      where: scopedWhere(organizationId, { personaId: { not: null } }),
    });
  }

  /**
   * Group persona-scoped fleet assets by ingredient status.
   */
  async groupPersonaAssetsByStatus(
    organizationId: string,
  ): Promise<Array<{ status: string | null; count: number }>> {
    const groups = await this.prisma.ingredient.groupBy({
      _count: { id: true },
      by: ['status'],
      where: scopedWhere(organizationId, { personaId: { not: null } }),
    });

    return groups.map((group) => ({
      count: group._count.id,
      status: group.status,
    }));
  }

  /**
   * Group persona-scoped fleet assets by review status.
   */
  async groupPersonaAssetsByReviewStatus(
    organizationId: string,
  ): Promise<Array<{ reviewStatus: string | null; count: number }>> {
    const groups = await this.prisma.ingredient.groupBy({
      _count: { id: true },
      by: ['reviewStatus'],
      where: scopedWhere(organizationId, { personaId: { not: null } }),
    });

    return groups.map((group) => ({
      count: group._count.id,
      reviewStatus: group.reviewStatus,
    }));
  }

  /**
   * Group persona-scoped fleet assets by campaign + review status, with the
   * earliest creation timestamp per group.
   */
  async groupPersonaAssetCampaigns(organizationId: string): Promise<
    Array<{
      campaign: string | null;
      reviewStatus: string | null;
      count: number;
      earliestCreatedAt: Date | null;
    }>
  > {
    const groups = await this.prisma.ingredient.groupBy({
      _count: { id: true },
      _min: { createdAt: true },
      by: ['campaign', 'reviewStatus'],
      orderBy: { campaign: 'asc' },
      where: scopedWhere(organizationId, {
        campaign: { not: null },
        personaId: { not: null },
      }),
    });

    return groups.map((group) => ({
      campaign: group.campaign,
      count: group._count.id,
      earliestCreatedAt: group._min.createdAt ?? null,
      reviewStatus: group.reviewStatus,
    }));
  }
}
