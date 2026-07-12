import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  DarkroomReviewStatus,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
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
    // NOTE: User populate is intentionally excluded from all contexts.
    // The User model is on the AUTH connection, but Ingredients are on CLOUD.
    // Cross-database relation loading is not supported here. Use
    // createUserLookupPipeline() in findAll queries instead.
    switch (context) {
      case 'list':
        return [
          PopulatePatterns.brandMinimal,
          PopulatePatterns.metadataBasic,
          PopulatePatterns.promptMinimal,
          { path: 'tags', select: '_id label' },
        ];
      case 'detail':
        return [
          PopulatePatterns.organizationMinimal,
          PopulatePatterns.brandMinimal,
          PopulatePatterns.metadataFull,
          PopulatePatterns.promptFull,
          { path: 'parent', select: '_id category status' },
          { path: 'references', select: '_id category status' },
          { path: 'tags', select: '_id label' },
        ];
      case 'create':
        return [
          PopulatePatterns.brandMinimal,
          PopulatePatterns.metadataBasic,
          PopulatePatterns.promptMinimal,
        ];
      default:
        return [PopulatePatterns.brandId, { path: 'metadata', select: '_id' }];
    }
  }

  @HandleErrors('create ingredient', 'ingredients')
  async create(createDto: CreateIngredientDto): Promise<IngredientDocument> {
    this.logger.debug(`${this.constructorName} create`, { createDto });

    const result = await super.create(
      createDto,
      this.getPopulationForContext('create'),
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

  async findLatest(
    params: Record<string, unknown>,
  ): Promise<IngredientDocument | null> {
    try {
      this.logger.debug(`${this.constructorName} findLatest`, { params });

      const where = this.buildWhereFromParams(params);

      const result = await this.prisma.ingredient.findFirst({
        where,
        orderBy: { version: 'desc' },
      });

      this.logger.debug(
        `${this.constructorName} findLatest ${result ? 'success' : 'not found'}`,
        { found: !!result, params },
      );

      return result as unknown as IngredientDocument | null;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} findLatest failed`, {
        error,
        params,
      });
      throw error;
    }
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
        where: {
          id: { in: ids },
          isDeleted: false,
          organizationId,
        },
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
      where: {
        id: ingredientId,
        category: 'AVATAR',
        isDeleted: false,
        organizationId,
      },
      include: { metadata: true } as never,
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
        where: {
          brandId,
          campaign,
          category: 'IMAGE',
          isDeleted: false,
          organizationId,
          reviewStatus: 'APPROVED',
          status: {
            in: ['GENERATED', 'VALIDATED'],
          },
        },
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

  /**
   * Override findOne to use Prisma query
   */
  async findOne(
    params: Record<string, unknown>,
    _populate: PopulateOption[] = [],
  ): Promise<IngredientDocument | null> {
    try {
      this.logger.debug(`${this.constructorName} findOne`, { params });

      const where = this.buildWhereFromParams(params);

      const result = await this.prisma.ingredient.findFirst({ where });

      this.logger.debug(
        `${this.constructorName} findOne ${result ? 'success' : 'not found'}`,
        { params },
      );

      return result as unknown as IngredientDocument | null;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} findOne failed`, {
        error,
        params,
      });
      throw error;
    }
  }

  async patch(
    id: string,
    updateDto: Partial<UpdateIngredientDto>,
    _populate: PopulateOption[] = [],
  ): Promise<IngredientDocument> {
    try {
      this.logger.debug(`${this.constructorName} patch`, { id, updateDto });

      const updated = await this.prisma.ingredient.update({
        where: { id },
        data: this.normalizeData(updateDto) as never,
      });

      if (!updated) {
        throw new NotFoundException('Ingredient', id);
      }

      const result = await this.findOne({ id });

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

      const normalizedWhere = this.normalizeWhere({
        ...filter,
        isDeleted: filter.isDeleted ?? false,
      }) as never;

      // Capture the owning org(s) BEFORE the update: once rows flip to GENERATED
      // a post-update re-query on a status-based filter would match nothing.
      const isGeneratedTransition =
        update.status === IngredientStatus.GENERATED;
      const targetOrganizationIds = isGeneratedTransition
        ? (
            await this.prisma.ingredient.findMany({
              where: normalizedWhere,
              select: { organizationId: true },
              distinct: ['organizationId'],
            })
          ).map((row: { organizationId: string | null }) => row.organizationId)
        : [];

      const result = await this.prisma.ingredient.updateMany({
        where: normalizedWhere,
        data: this.normalizeData(update) as never,
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
   * Find top ingredients sorted by total votes (most voted first).
   */
  @HandleErrors('findTopByVotes', 'ingredients')
  async findTopByVotes(params: {
    brandId?: string;
    category?: string;
    limit?: number;
    organizationId: string;
  }): Promise<AggregatePaginateResult<IngredientDocument>> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId: params.organizationId,
    };

    if (params.brandId) {
      where.brandId = params.brandId;
    }
    if (params.category) {
      where.category = CategoryPrismaUtil.toIngredientCategory(params.category);
    }

    const limit = params.limit ?? 10;

    const [docs, totalDocs] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.ingredient.count({ where: where as never }),
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

      const baseWhere: Record<string, unknown> = {
        isDeleted: false,
        organizationId,
        ...CategoryPrismaUtil.toIngredientCategoryFilter(category),
      };

      if (category) {
        const [total, generated, rejected, validated] = await Promise.all([
          this.prisma.ingredient.count({ where: baseWhere as never }),
          this.prisma.ingredient.count({
            where: {
              ...baseWhere,
              status: 'GENERATED',
            } as never,
          }),
          this.prisma.ingredient.count({
            where: {
              ...baseWhere,
              status: 'REJECTED',
            } as never,
          }),
          this.prisma.ingredient.count({
            where: {
              ...baseWhere,
              status: 'VALIDATED',
            } as never,
          }),
        ]);

        return { generated, rejected, total, validated };
      }

      // All categories
      const [total, generated, rejected, validated] = await Promise.all([
        this.prisma.ingredient.count({ where: baseWhere as never }),
        this.prisma.ingredient.count({
          where: {
            ...baseWhere,
            status: 'GENERATED',
          } as never,
        }),
        this.prisma.ingredient.count({
          where: {
            ...baseWhere,
            status: 'REJECTED',
          } as never,
        }),
        this.prisma.ingredient.count({
          where: {
            ...baseWhere,
            status: 'VALIDATED',
          } as never,
        }),
      ]);

      // Build per-category breakdown
      const categoryGroups = await this.prisma.ingredient.groupBy({
        by: ['category', 'status'],
        where: baseWhere as never,
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
        if (group.status === 'GENERATED') {
          byCategory[group.category].generated = group._count.id;
        } else if (group.status === 'REJECTED') {
          byCategory[group.category].rejected = group._count.id;
        } else if (group.status === 'VALIDATED') {
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
   * Build a Prisma where clause from generic params, normalising id fields.
   */
  private buildWhereFromParams(
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (key === '_id') {
        where.id = value;
      } else if (key === 'organization') {
        where.organizationId = value;
      } else if (key === 'brand') {
        where.brandId = value;
      } else if (key === 'parent') {
        where.parentId = value;
      } else if (key === 'metadata') {
        where.metadataId = value;
      } else {
        where[key] = value;
      }
    }

    return where;
  }

  /**
   * Count persona-scoped darkroom assets for an organization. Encapsulates the
   * raw Prisma aggregation so darkroom callers don't reach into `.prisma.*`.
   */
  async countPersonaAssets(organizationId: string): Promise<number> {
    return this.prisma.ingredient.count({
      where: { isDeleted: false, organizationId, personaId: { not: null } },
    });
  }

  /**
   * Group persona-scoped darkroom assets by ingredient status.
   */
  async groupPersonaAssetsByStatus(
    organizationId: string,
  ): Promise<Array<{ status: string | null; count: number }>> {
    const groups = await this.prisma.ingredient.groupBy({
      _count: { id: true },
      by: ['status'],
      where: { isDeleted: false, organizationId, personaId: { not: null } },
    });

    return groups.map((group) => ({
      count: group._count.id,
      status: group.status,
    }));
  }

  /**
   * Group persona-scoped darkroom assets by review status.
   */
  async groupPersonaAssetsByReviewStatus(
    organizationId: string,
  ): Promise<Array<{ reviewStatus: string | null; count: number }>> {
    const groups = await this.prisma.ingredient.groupBy({
      _count: { id: true },
      by: ['reviewStatus'],
      where: { isDeleted: false, organizationId, personaId: { not: null } },
    });

    return groups.map((group) => ({
      count: group._count.id,
      reviewStatus: group.reviewStatus,
    }));
  }

  /**
   * Group persona-scoped darkroom assets by campaign + review status, with the
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
      where: {
        campaign: { not: null },
        isDeleted: false,
        organizationId,
        personaId: { not: null },
      },
    });

    return groups.map((group) => ({
      campaign: group.campaign,
      count: group._count.id,
      earliestCreatedAt: group._min.createdAt ?? null,
      reviewStatus: group.reviewStatus,
    }));
  }
}
