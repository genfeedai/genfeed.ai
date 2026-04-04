import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import {
  Ingredient,
  type IngredientDocument,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BaseService } from '@api/shared/services/base/base.service';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import {
  createModelLookupPipeline,
  createUserLookupPipeline,
  PopulatePatterns,
} from '@api/shared/utils/populate/populate.util';
import type {
  AggregatePaginateModel,
  AggregatePaginateResult,
} from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import {
  DarkroomReviewStatus,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

@Injectable()
export class IngredientsService extends BaseService<
  IngredientDocument,
  CreateIngredientDto,
  UpdateIngredientDto
> {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(Ingredient.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<IngredientDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
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
    // Mongoose .populate() fails across connections. Use createUserLookupPipeline()
    // in aggregation pipelines instead ($lookup works across collections).
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
      id: result._id,
    });
    return result;
  }

  async findLatest(
    params: Record<string, unknown>,
  ): Promise<IngredientDocument | null> {
    try {
      this.logger.debug(`${this.constructorName} findLatest`, { params });

      const result = await this.model
        .findOne(params)
        .sort({ version: -1 })
        .populate(this.getPopulationForContext('detail'))
        .exec();

      this.logger.debug(
        `${this.constructorName} findLatest ${result ? 'success' : 'not found'}`,
        {
          found: !!result,
          params,
        },
      );

      return result;
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

      // Enforce maximum limit to prevent DOS
      const safeLimit = Math.min(limit, 500);

      const result = await this.model
        .find({ isDeleted: false, parent: id })
        .populate(this.getPopulationForContext('detail'))
        .limit(safeLimit)
        .exec();

      this.logger.debug(`${this.constructorName} findChildren success`, {
        count: result.length,
        parentId: id,
      });

      return result;
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
   * More efficient than individual findOne calls in a loop (N+1 problem).
   *
   * @param ids - Array of ingredient IDs to find
   * @param organizationId - Organization ID for tenant isolation
   * @returns Array of found ingredients (may be fewer than requested if some don't exist)
   */
  async findByIds(
    ids: (string | Types.ObjectId)[],
    organizationId: string | Types.ObjectId,
  ): Promise<IngredientDocument[]> {
    try {
      if (!ids || ids.length === 0) {
        return [];
      }

      const objectIds = ids.map((id) =>
        id instanceof Types.ObjectId ? id : new Types.ObjectId(id),
      );
      const orgObjectId =
        organizationId instanceof Types.ObjectId
          ? organizationId
          : new Types.ObjectId(organizationId);

      this.logger.debug(`${this.constructorName} findByIds`, {
        count: ids.length,
        organizationId: orgObjectId.toString(),
      });

      const result = await this.model
        .find({
          _id: { $in: objectIds },
          isDeleted: false,
          organization: orgObjectId,
        })
        .populate(this.getPopulationForContext('minimal'))
        .exec();

      this.logger.debug(`${this.constructorName} findByIds success`, {
        found: result.length,
        requested: ids.length,
      });

      return result;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} findByIds failed`, {
        count: ids.length,
        error,
      });
      throw error;
    }
  }

  async findAvatarImageById(
    ingredientId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
  ): Promise<IngredientDocument | null> {
    const ingredientObjectId =
      ingredientId instanceof Types.ObjectId
        ? ingredientId
        : new Types.ObjectId(ingredientId);
    const organizationObjectId =
      organizationId instanceof Types.ObjectId
        ? organizationId
        : new Types.ObjectId(organizationId);

    const ingredient = await this.findOne(
      {
        _id: ingredientObjectId,
        category: IngredientCategory.AVATAR,
        isDeleted: false,
        organization: organizationObjectId,
      },
      [PopulatePatterns.metadataFull],
    );

    if (!ingredient) {
      return null;
    }

    const metadataExtension = (ingredient.metadata as { extension?: string })
      ?.extension;

    if (
      metadataExtension !== MetadataExtension.JPG &&
      metadataExtension !== MetadataExtension.JPEG
    ) {
      return null;
    }

    return ingredient;
  }

  /**
   * Find approved image ingredients for a campaign within a brand and organization.
   * Used to resolve darkroom campaign carousel publishing without trusting client-side IDs.
   */
  async findApprovedImagesByCampaign(
    campaign: string,
    organizationId: string | Types.ObjectId,
    brandId: string | Types.ObjectId,
  ): Promise<IngredientDocument[]> {
    try {
      const orgObjectId =
        organizationId instanceof Types.ObjectId
          ? organizationId
          : new Types.ObjectId(organizationId);
      const brandObjectId =
        brandId instanceof Types.ObjectId
          ? brandId
          : new Types.ObjectId(brandId);

      this.logger.debug(
        `${this.constructorName} findApprovedImagesByCampaign`,
        {
          brandId: brandObjectId.toString(),
          campaign,
          organizationId: orgObjectId.toString(),
        },
      );

      const result = await this.model
        .find({
          brand: brandObjectId,
          campaign,
          category: IngredientCategory.IMAGE,
          isDeleted: false,
          organization: orgObjectId,
          reviewStatus: DarkroomReviewStatus.APPROVED,
          status: {
            $in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
        })
        .sort({ _id: 1, createdAt: 1 })
        .populate(this.getPopulationForContext('minimal'))
        .exec();

      this.logger.debug(
        `${this.constructorName} findApprovedImagesByCampaign success`,
        {
          brandId: brandObjectId.toString(),
          campaign,
          count: result.length,
          organizationId: orgObjectId.toString(),
        },
      );

      return result;
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} findApprovedImagesByCampaign failed`,
        {
          brandId:
            brandId instanceof Types.ObjectId ? brandId.toString() : brandId,
          campaign,
          error,
          organizationId:
            organizationId instanceof Types.ObjectId
              ? organizationId.toString()
              : organizationId,
        },
      );
      throw error;
    }
  }

  /**
   * Override findOne to use aggregation with model lookup
   * This adds a root-level modelLabel field computed from models/trainings collections
   */
  async findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [],
  ): Promise<IngredientDocument | null> {
    try {
      this.logger.debug(`${this.constructorName} findOne with model lookup`, {
        params,
      });

      // Convert string IDs to ObjectId for MongoDB queries
      const processedParams = Object.entries(params).reduce(
        (acc, [key, value]) => {
          if (
            key === '_id' ||
            key === 'id' ||
            key.endsWith('Id') ||
            key.endsWith('_id')
          ) {
            if (typeof value === 'string' && Types.ObjectId.isValid(value)) {
              acc[key === 'id' ? '_id' : key] = new Types.ObjectId(value);
            } else {
              acc[key] = value;
            }
          } else {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, unknown>,
      );

      // Build aggregation pipeline with model + user lookup
      const pipeline: PipelineStage[] = [
        { $match: processedParams },
        ...createModelLookupPipeline(),
        ...createUserLookupPipeline('minimal'),
        { $limit: 1 },
      ];

      this.logger.debug(
        `${this.constructorName} findOne - executing aggregation`,
        {
          pipelineStages: pipeline.length,
        },
      );

      const results = await this.model.aggregate(pipeline).exec();

      if (!results || results.length === 0) {
        this.logger.debug(`${this.constructorName} findOne - not found`, {
          params,
        });
        return null;
      }

      const doc = results[0];

      // If population is requested, populate the document
      // Filter out 'user' populates — user data is already resolved via $lookup above
      const populateOptions = populate.filter((p) => p.path !== 'user');
      if (populateOptions.length > 0) {
        // Model.populate() returns the document directly when populating a single document
        const populated = await this.model.populate(doc, populateOptions);

        // Handle both single document and array return types from Mongoose
        const result = Array.isArray(populated) ? populated[0] : populated;

        this.logger.debug(
          `${this.constructorName} findOne success (populated)`,
          {
            id: result._id,
          },
        );

        return result as IngredientDocument;
      }

      this.logger.debug(`${this.constructorName} findOne success`, {
        id: doc._id,
      });

      return doc as IngredientDocument;
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
    populate: PopulateOption[] = [],
  ): Promise<IngredientDocument> {
    try {
      this.logger.debug(`${this.constructorName} patch`, { id, updateDto });

      // Perform the update
      const updated = await super.patch(id, updateDto, []);

      if (!updated) {
        this.logger.debug(`${this.constructorName} patch - not found`, { id });
        throw new NotFoundException('Ingredient', id);
      }

      // Re-fetch with model lookup to get modelLabel
      const result = await this.findOne({ _id: id }, populate);

      if (!result) {
        this.logger.error(
          `${this.constructorName} patch - updated but not found on re-fetch`,
          { id },
        );
        throw new NotFoundException('Ingredient', id);
      }

      this.logger.debug(`${this.constructorName} patch success`, {
        id,
      });

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

      const result = await super.patchAll(filter, update);

      this.logger.debug(`${this.constructorName} patchAll success`, {
        filter,
        modifiedCount: result.modifiedCount,
      });

      return result;
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
   * Override findAll to inject model lookup pipeline
   * This adds a root-level modelLabel field by looking up model names from models/trainings collections
   */
  async findAll(
    aggregate: PipelineStage[],
    options: AggregationOptions,
    enableCache: boolean = true,
  ): Promise<AggregatePaginateResult<IngredientDocument>> {
    try {
      this.logger.debug(`${this.constructorName} findAll with model lookup`, {
        aggregateStages: aggregate.length,
        options,
      });

      // Inject model lookup pipeline stages after the initial aggregation stages
      // but before sorting/pagination
      const enhancedAggregate = [
        ...aggregate,
        ...createModelLookupPipeline(),
        ...createUserLookupPipeline('minimal'),
      ];

      this.logger.debug(
        `${this.constructorName} findAll - pipeline enhanced with model lookup`,
        {
          enhancedStages: enhancedAggregate.length,
          originalStages: aggregate.length,
        },
      );

      // Call parent findAll with enhanced pipeline
      const result = await super.findAll(
        enhancedAggregate,
        options,
        enableCache,
      );

      this.logger.debug(`${this.constructorName} findAll success`, {
        page: result.page,
        totalDocs: result.totalDocs,
      });

      return result;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} findAll failed`, {
        aggregate,
        error,
        options,
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
    const matchStage: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(params.organizationId),
    };

    if (params.brandId) {
      matchStage.brand = new Types.ObjectId(params.brandId);
    }
    if (params.category) {
      matchStage.category = params.category;
    }

    return this.findAll(
      [{ $match: matchStage }],
      {
        limit: params.limit || 10,
        page: 1,
        sort: { totalVotes: -1 },
      },
      false,
    );
  }

  /**
   * Get KPI metrics for ingredients
   * Returns counts by status (generated, rejected, validated) with optional category filtering
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

      const pipeline: PipelineStage[] = [
        PipelineBuilder.buildMatch({
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
          ...(category && { category }),
        }),
        {
          $group: {
            _id: category ? null : '$category',
            generated: {
              $sum: {
                $cond: [{ $eq: ['$status', IngredientStatus.GENERATED] }, 1, 0],
              },
            },
            rejected: {
              $sum: {
                $cond: [{ $eq: ['$status', IngredientStatus.REJECTED] }, 1, 0],
              },
            },
            total: { $sum: 1 },
            validated: {
              $sum: {
                $cond: [{ $eq: ['$status', IngredientStatus.VALIDATED] }, 1, 0],
              },
            },
          },
        },
      ];

      const results = await this.model.aggregate(pipeline).exec();

      if (category) {
        // Single category result
        const result = results[0] || {
          generated: 0,
          rejected: 0,
          total: 0,
          validated: 0,
        };
        return {
          generated: result.generated,
          rejected: result.rejected,
          total: result.total,
          validated: result.validated,
        };
      } else {
        // All categories - aggregate totals and provide breakdown
        let total = 0;
        let generated = 0;
        let rejected = 0;
        let validated = 0;
        const byCategory: Record<
          string,
          { generated: number; rejected: number; validated: number }
        > = {};

        results.forEach((result) => {
          total += result.total;
          generated += result.generated;
          rejected += result.rejected;
          validated += result.validated;

          if (result._id) {
            byCategory[result._id] = {
              generated: result.generated,
              rejected: result.rejected,
              validated: result.validated,
            };
          }
        });

        return {
          byCategory,
          generated,
          rejected,
          total,
          validated,
        };
      }
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} getKPIMetrics failed`, {
        category,
        error,
        organizationId,
      });
      throw error;
    }
  }
}
