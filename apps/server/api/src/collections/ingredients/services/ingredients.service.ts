import { HIDDEN_LIBRARY_ASSET_STATUSES } from '@api/collections/ingredients/constants/library-asset-listing.constants';
import {
  CreateIngredientDto,
  type IngredientServerCreate,
} from '@api/collections/ingredients/dto/create-ingredient.dto';
import {
  type IngredientServerUpdate,
  UpdateIngredientDto,
} from '@api/collections/ingredients/dto/update-ingredient.dto';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { assertTagsVisibleToBrand } from '@api/collections/ingredients/utils/assert-tags-visible-to-brand.util';
import {
  toIngredientCreateData,
  toIngredientUpdateData,
} from '@api/collections/ingredients/utils/ingredient-create-data.util';
import {
  ingredientGenerationUpdateTargets,
  preserveIngredientGenerationEntry,
  stampIngredientGenerationEntry,
} from '@api/collections/ingredients/utils/ingredient-generation-entry.util';
import { canEditAssetTags } from '@api/collections/ingredients/utils/ingredient-tag-edit-access.util';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { persistQuoteGroupDisposition } from '@api/helpers/utils/credits/persist-quote-group-completion.util';
import { persistSubmissionFailure } from '@api/helpers/utils/credits/persist-submission-failure.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { LibraryShelfUtil } from '@api/helpers/utils/library-shelf/library-shelf.util';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { MediaDerivativePreparationService } from '@api/services/media-urls/media-derivative-preparation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  FleetReviewStatus,
  type IngredientCategory,
  type IngredientOrigin,
  IngredientStatus,
  LibraryShelf,
  MetadataExtension,
} from '@genfeedai/contracts';
import type {
  ILibrarySummary,
  PopulateOption,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { withExternalMediaFallback } from '@libs/media/media-url.util';
import {
  getTenantContext,
  isCrossOrgUnsafe,
} from '@libs/prisma/tenant-context';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/** The request organization writes stay inside; `undefined` for workers and `crossOrgUnsafe`. */
function requestOrganizationId(): string | undefined {
  return isCrossOrgUnsafe() ? undefined : getTenantContext()?.organizationId;
}

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
   * Media on a read: `cdnUrl` is computed from the row's own key; external
   * media without a key falls back to its loaded metadata link.
   */
  protected override normalizeDocument(document: unknown): IngredientDocument {
    return super.normalizeDocument(withExternalMediaFallback(document));
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
    createDto: IngredientServerCreate,
    populate: PopulateInput = this.getPopulationForContext('create'),
  ): Promise<IngredientDocument> {
    this.logger.debug(`${this.constructorName} create`, { createDto });

    const result = await super.create(
      toIngredientCreateData({
        ...createDto,
        providerData: stampIngredientGenerationEntry(
          createDto.origin,
          createDto.providerData,
        ),
      } as unknown as Record<string, unknown>) as CreateIngredientDto,
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

      // `metadata.result` is the only media link keyless external media has.
      const result = await this.prisma.ingredient.findMany({
        include: { metadata: { select: { result: true } } },
        where: scopedWhere(organizationId, { id: { in: ids } }),
      });

      this.logger.debug(`${this.constructorName} findByIds success`, {
        found: result.length,
        requested: ids.length,
      });

      return result.map((row) => this.normalizeDocument(row));
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} findByIds failed`, {
        count: ids.length,
        error,
      });
      throw error;
    }
  }

  /**
   * One page of an organization's Library assets of a single category, newest
   * first. Scoped by `organizationId` and `isDeleted: false`, and by `brandId`
   * when the caller is brand-scoped. Training ingredients and failed, archived
   * or rejected assets are left out, like the Library list defaults.
   */
  async listLibraryAssets(params: {
    brandId?: string;
    characterFilter?: Record<string, unknown>;
    category: IngredientCategory;
    limit: number;
    offset: number;
    organizationId: string;
    origin?: IngredientOrigin;
    shelf?: LibraryShelf;
    tagFilter?: Record<string, unknown>;
  }): Promise<IngredientDocument[]> {
    const rows = await this.prisma.ingredient.findMany({
      include: {
        metadata: { select: { result: true } },
        ...IngredientFilterUtil.buildLibraryTagsInclude(),
      },
      orderBy: { createdAt: 'desc' },
      skip: params.offset,
      take: params.limit,
      where: scopedWhere(params.organizationId, {
        ...(params.brandId ? { brandId: params.brandId } : {}),
        category: params.category,
        ...(params.shelf
          ? {
              AND: [
                LibraryShelfUtil.buildShelfFilter(params.shelf),
                ...(params.tagFilter ? [params.tagFilter] : []),
              ],
            }
          : {
              status: { notIn: [...HIDDEN_LIBRARY_ASSET_STATUSES] },
              ...(params.tagFilter ?? {}),
            }),
        trainingId: null,
        ...(params.origin ? { origin: params.origin } : {}),
        ...(params.characterFilter ?? {}),
      }),
    });

    return rows.map((row) => this.normalizeDocument(row));
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

  /**
   * Tags an asset may carry (#6011): its brand's tags, organization-wide tags
   * and the legacy default tags, never another brand's or organization's.
   */
  async assertClientTags(
    tagIds: string[],
    organizationId: string,
    brandId?: string | null,
  ): Promise<void> {
    await assertTagsVisibleToBrand(this.prisma, tagIds, {
      brandId,
      organizationId,
    });
  }

  async patch(
    id: string,
    updateDto: IngredientServerUpdate,
    populate: PopulateInput = [],
  ): Promise<IngredientDocument> {
    try {
      this.logger.debug(`${this.constructorName} patch`, { id, updateDto });

      const data = this.normalizeData(
        toIngredientUpdateData(updateDto as unknown as Record<string, unknown>),
      );
      // In a request the row is read, written and re-read under its organization.
      const organizationId = requestOrganizationId();
      const rowWhere = organizationId ? { id, organizationId } : { id };
      const current = await this.findOne(rowWhere);
      if (!current) throw new NotFoundException('Ingredient', id);
      if (Object.hasOwn(data, 'providerData'))
        data.providerData = preserveIngredientGenerationEntry(
          data.providerData,
          current.providerData,
        );
      if (
        current.reviewStatus &&
        (updateDto.status === IngredientStatus.VALIDATED ||
          updateDto.status === IngredientStatus.REJECTED)
      ) {
        data.reviewStatus =
          updateDto.status === IngredientStatus.VALIDATED
            ? FleetReviewStatus.APPROVED
            : FleetReviewStatus.REJECTED;
      }
      const completed = current?.organizationId
        ? await persistQuoteGroupDisposition(
            this.prisma,
            { id, organizationId: current.organizationId, isDeleted: false },
            data as Prisma.IngredientUpdateManyMutationInput,
          )
        : null;
      const updated =
        completed !== null
          ? completed.count === 1
          : await this.prisma.ingredient.update({
              where: {
                id,
                organizationId: current.organizationId ?? null,
                isDeleted: false,
              },
              data: data as Prisma.IngredientUpdateInput,
            });

      if (!updated) {
        throw new NotFoundException('Ingredient', id);
      }

      const result = await this.findOne(rowWhere, populate);

      if (!result) {
        this.logger.error(
          `${this.constructorName} patch - updated but not found on re-fetch`,
          { id },
        );
        throw new NotFoundException('Ingredient', id);
      }

      try {
        await this.moduleRef
          .get(CacheService, { strict: false })
          .invalidateByTags(['ingredients']);
      } catch (error: unknown) {
        this.logger.warn(
          `${this.constructorName} could not invalidate the Library list cache`,
          { error },
        );
      }

      this.logger.debug(`${this.constructorName} patch success`, { id });

      // Fire only on the GENERATED transition (updateDto intent), not on every
      // patch of an already-generated asset. `result` carries organizationId.
      if (updateDto.status === IngredientStatus.GENERATED) {
        await this.fireAssetGateForOrganizations([result.organizationId]);
      }

      if (
        result.organizationId &&
        result.s3Key &&
        (updateDto.status === IngredientStatus.GENERATED ||
          updateDto.status === IngredientStatus.UPLOADED ||
          updateDto.scope === 'PUBLIC')
      ) {
        try {
          await this.moduleRef
            .get(MediaDerivativePreparationService, { strict: false })
            .enqueue(result.organizationId, result.id);
          if (result.isPublic || result.scope === 'PUBLIC') {
            const preparation = this.moduleRef.get(
              MediaDerivativePreparationService,
              { strict: false },
            );
            await preparation.enqueue(
              result.organizationId,
              result.id,
              'public-share',
            );
            await preparation.enqueue(
              result.organizationId,
              result.id,
              'public-og',
            );
          }
        } catch (error: unknown) {
          this.logger.warn('Protected preview preparation requires retry', {
            id,
            error,
          });
        }
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

  /** Soft-delete one ingredient, keyed by the request organization inside a request. */
  override async remove(id: string): Promise<IngredientDocument | null> {
    const organizationId = requestOrganizationId();
    if (!organizationId) {
      return super.remove(id);
    }

    return this.patchOneWhere(scopedWhere(organizationId, { id }), {
      isDeleted: true,
    });
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

      const isGeneratedTransition =
        update.status === IngredientStatus.GENERATED;
      const where = this.normalizeWhere({
        ...filter,
        isDeleted: filter.isDeleted ?? false,
      }) as Prisma.IngredientWhereInput;
      const data = this.normalizeData(
        updateData,
      ) as Prisma.IngredientUpdateManyMutationInput;
      const replacesProviderData = Object.hasOwn(updateData, 'providerData');
      const owners = await this.findAll(
        {
          where,
          select: {
            organizationId: true,
            ...(replacesProviderData ? { id: true, providerData: true } : {}),
          },
        },
        { pagination: false },
        false,
      );
      // A tenant request never writes platform rows (`organizationId: null`).
      const isTenantRequest = requestOrganizationId() !== undefined;
      const targets = ingredientGenerationUpdateTargets(
        owners.docs,
        replacesProviderData,
        isTenantRequest,
      );
      const targetOrganizationIds = [
        ...new Set(targets.map((target) => target.organizationId)),
      ];
      let modifiedCount = 0;
      for (const target of targets) {
        const { organizationId } = target;
        const targetData = replacesProviderData
          ? {
              ...data,
              providerData: preserveIngredientGenerationEntry(
                data.providerData,
                target.providerData,
              ) as Prisma.InputJsonValue,
            }
          : data;
        const ownedWhere = {
          ...where,
          ...(target.id ? { AND: [where], id: target.id } : {}),
          organizationId,
          isDeleted: where.isDeleted ?? false,
        };
        const completed =
          (await persistQuoteGroupDisposition(
            this.prisma,
            ownedWhere,
            targetData,
            update.isGenerationFailureConfirmed === true,
          )) ??
          (await persistSubmissionFailure(
            this.prisma,
            ownedWhere,
            targetData,
            update.isGenerationFailureConfirmed === true,
          ));
        const result =
          completed ??
          (await this.prisma.ingredient.updateMany({
            where: {
              AND: [where],
              ...(target.id ? { id: target.id } : {}),
              organizationId,
              isDeleted: where.isDeleted ?? false,
            },
            data: targetData,
          }));
        modifiedCount += result.count;
      }
      const result = { count: modifiedCount };

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
   * Soft-delete one live ingredient the caller may edit.
   *
   * Missing, already-deleted, other-organization, and non-editable rows return
   * null. The route maps that to 404 so those cases are not distinguishable.
   * The write repeats the organization and live-row predicates.
   */
  async softDeleteOneScoped(params: {
    id: string;
    organizationId: string;
    editor: { brandId: string; userId: string };
  }): Promise<IngredientDocument | null> {
    const { id, organizationId, editor } = params;

    if (!id) {
      return null;
    }

    const existing = await this.prisma.ingredient.findFirst({
      select: { id: true, userId: true, scope: true, brandId: true },
      where: scopedWhere(organizationId, { id }),
    });

    if (
      !existing ||
      !canEditAssetTags(existing, {
        brandId: editor.brandId,
        userIds: [editor.userId],
      })
    ) {
      return null;
    }

    return this.patchOneWhere(scopedWhere(organizationId, { id }), {
      isDeleted: true,
    });
  }

  /**
   * Soft-delete a caller-supplied id list in two queries.
   *
   * Both queries require the active organization and live rows. The existing
   * asset edit rule selects owned, same-brand, or organization-shared rows;
   * inaccessible, missing, and already-deleted ids are reported as failed.
   */
  async bulkSoftDeleteScoped(params: {
    ids: string[];
    organizationId: string;
    editor: { brandId: string; userId: string };
  }): Promise<{ deleted: string[]; failed: string[] }> {
    const { ids, organizationId, editor } = params;

    if (!ids || ids.length === 0) {
      return { deleted: [], failed: [] };
    }

    const uniqueIds = [...new Set(ids)];

    const permitted = await this.prisma.ingredient.findMany({
      select: { id: true, userId: true, scope: true, brandId: true },
      where: scopedWhere(organizationId, { id: { in: uniqueIds } }),
    });

    const permittedIds = new Set(
      permitted
        .filter((row) =>
          canEditAssetTags(row, {
            brandId: editor.brandId,
            userIds: [editor.userId],
          }),
        )
        .map((row) => row.id),
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
        where: scopedWhere(organizationId, { id: { in: [...permittedIds] } }),
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
   * Aggregate the counts behind the Library sidebar: one count per asset type,
   * one per shelf, plus Starred, Trash, and the storage meter.
   *
   * Shelf counts overlap on purpose and do not partition `total` — an asset can
   * be both unfoldered and awaiting review, and `total` excludes the archived,
   * rejected, and failed rows that only their own shelf surfaces. The sidebar
   * renders each number as "the size of this saved query", never as a share of
   * a whole.
   *
   * Seven tenant-scoped (`scopedWhere`) queries; one `groupBy` yields the type
   * breakdown, three shelves and the `fileSize` sum for the storage meter.
   */
  @HandleErrors('get library summary', 'ingredients')
  async getLibrarySummary(
    organizationId: string,
    filters: Prisma.IngredientWhereInput = {},
  ): Promise<ILibrarySummary> {
    const defaultStatuses = [...LibraryShelfUtil.defaultStatuses];

    const [
      groups,
      referencesCount,
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
          ...LibraryShelfUtil.buildShelfFilter(LibraryShelf.REFERENCES),
        }),
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
        [LibraryShelf.REFERENCES]: referencesCount,
        [LibraryShelf.GENERATING]: countOf(IngredientStatus.PROCESSING),
        [LibraryShelf.UNSORTED]: unsortedCount,
        [LibraryShelf.NEEDS_REVIEW]: needsReviewCount,
        [LibraryShelf.APPROVED]: approvedCount,
        [LibraryShelf.REJECTED]: countOf(IngredientStatus.REJECTED),
        [LibraryShelf.FAILED]: countOf(IngredientStatus.FAILED),
        [LibraryShelf.ARCHIVED]: countOf(IngredientStatus.ARCHIVED),
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
