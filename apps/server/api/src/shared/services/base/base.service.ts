import { ConfigService } from '@api/config/config.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { QueryBuilder } from '@api/helpers/utils/query-builder.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { AggregationCacheUtil } from '@api/shared/utils/aggregation-cache/aggregation-cache.util';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import type {
  AggregatePaginateModel,
  AggregatePaginateResult,
} from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { type PipelineStage, Types } from 'mongoose';

/**
 * Common fields present on all Mongoose documents managed by BaseService.
 * All document types passed as T should extend this shape.
 */
export interface BaseDocument {
  _id: Types.ObjectId;
  isDeleted?: boolean;
  organization?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * MongoDB filter type for query operations.
 * Uses Record<string, unknown> because BaseService builds dynamic queries
 * (e.g., processSearchParams converts string IDs to ObjectId at runtime).
 * This is intentionally loose to support MongoDB query operators ($in, $or, etc.).
 */
type MongoFilter = Record<string, unknown>;

/**
 * MongoDB update type for update operations.
 * Supports both direct field updates and MongoDB update operators ($set, $unset, $push, etc.).
 */
type MongoUpdate = Record<string, unknown>;

/**
 * Type-safe model cast for Mongoose query methods.
 *
 * Mongoose 9's FilterQuery<T> and UpdateQuery<T> require concrete types,
 * but BaseService operates on generic T with dynamic query construction.
 * This type provides a single, documented cast point rather than scattering
 * `as unknown` casts throughout the codebase.
 *
 * All query methods cast `this.model` through this type to pass MongoFilter
 * and MongoUpdate objects that include runtime-constructed fields like
 * ObjectId conversions and MongoDB operators.
 */
type QueryableModel = AggregatePaginateModel<MongoFilter>;

/**
 * BaseService - Abstract base class for all services extending Mongoose models
 *
 * ## Update Methods:
 *
 * - `patch(id, data)` - For updates with $set/$unset. Auto-wraps in $set, invalidates cache.
 *   ```ts
 *   await this.patch(id, { name: 'New Name', status: 'active' });
 *   await this.patch(id, { $set: { status: 'active' }, $unset: { oldField: '' } });
 *   ```
 *
 * - `patchAll(filter, update)` - For bulk updates. Returns { modifiedCount }.
 *   ```ts
 *   await this.patchAll({ status: 'pending' }, { $set: { status: 'processed' } });
 *   ```
 *
 * ## ID Handling:
 *
 * - `findOne()` uses `processSearchParams()` which auto-converts string IDs to ObjectId
 *   for these fields: _id, id, user, brand, organization, parent, metadata, asset, credential, activity, ingredient
 * - `patch()` accepts both string and ObjectId - Mongoose handles conversion
 * - For aggregation pipelines and $or queries, use explicit `new Types.ObjectId(id)`
 *
 * ## DO NOT use raw model.updateOne():
 * - Bypasses cache invalidation
 * - No return value (just modifiedCount)
 * - Use `patch()` or `patchAll()` instead
 */
@Injectable()
export abstract class BaseService<
  T,
  CreateDto = Partial<T>,
  UpdateDto = Partial<CreateDto>,
> {
  constructor(
    protected readonly model: AggregatePaginateModel<T>,

    public readonly logger?: LoggerService,
    public readonly baseConfigService?: ConfigService,
    @Optional() protected readonly cacheService?: CacheService,
  ) {}

  /**
   * Get the collection name from the model for logging and cache invalidation
   */
  protected get collectionName(): string {
    return this.model.collection.name;
  }

  public logOperation(
    operation: string,
    stage: 'started' | 'completed' | 'failed',
    data?: string | Record<string, unknown>,
  ): void {
    const url = `${this.constructor.name} ${operation}`;
    if (stage === 'failed') {
      this.logger?.error(`${url} failed`, data);
    } else {
      this.logger?.log(`${url} ${stage}`, data);
    }
  }

  protected optimizePopulate(
    populate: (string | PopulateOption)[] = [],
  ): PopulateOption[] {
    return populate.map((field) =>
      typeof field === 'string' ? PopulateBuilder.minimal(field) : field,
    );
  }

  async create(
    createDto: CreateDto,
    populate: (string | PopulateOption)[] = [],
  ): Promise<T> {
    try {
      if (!createDto) {
        throw new ValidationException('Create data is required');
      }

      this.logger?.debug('Creating new document', {
        collectionName: this.collectionName,
        createDto,
        modelName: this.model.modelName,
      });

      const doc = new this.model(createDto as Partial<T>);
      const saved = await doc.save();
      const savedId = (saved as unknown as BaseDocument)._id;

      // Optimize: Only populate if explicitly requested, otherwise return saved document
      if (populate.length === 0) {
        this.logger?.debug('Document created successfully', { id: savedId });
        return saved as T;
      }

      const result = await this.model
        .findById(savedId)
        .populate(this.optimizePopulate(populate))
        .exec();

      this.logger?.debug('Document created successfully', { id: savedId });

      if (!result) {
        throw new NotFoundException('Document', savedId.toString());
      }

      // Invalidate collection cache after create.
      // Bust the collection name tag (matches @Cache({ tags: [collectionName] }))
      // as well as aggregation-specific tags. patch() and remove() already do this;
      // create() was only busting agg tags, missing the HTTP-level cache (fixes #433).
      if (this.cacheService) {
        await this.cacheService.invalidateByTags([
          this.collectionName,
          `collection:${this.collectionName}`,
          `agg:${this.collectionName}`,
          'agg:paginated',
        ]);
      }

      return result;
    } catch (error: unknown) {
      this.logger?.error('Failed to create document', { createDto, error });
      throw error;
    }
  }

  async findAll(
    aggregate: PipelineStage[],
    options: AggregationOptions,
    enableCache: boolean = false, // Disable cache by default - causing too many issues
  ): Promise<AggregatePaginateResult<T>> {
    try {
      if (!Array.isArray(aggregate)) {
        throw new ValidationException('Aggregate pipeline must be an array');
      }

      this.logger?.debug('Finding documents with aggregation', {
        aggregate,
        cacheEnabled: enableCache && !!this.cacheService,
        options,
      });

      let result: AggregatePaginateResult<T>;

      if (
        enableCache &&
        this.cacheService &&
        AggregationCacheUtil.isCacheable(aggregate) &&
        options.pagination !== false // Skip cache for non-paginated queries for now
      ) {
        result = (await AggregationCacheUtil.executePaginatedWithCache(
          this.model,
          aggregate,
          options,
          this.cacheService,
          {
            tags: [`collection:${this.collectionName}`],
            ttl: 300, // 5 minutes default
          },
        )) as AggregatePaginateResult<T>;
      } else {
        if (options.pagination === false) {
          const agg = this.model.aggregate(aggregate);
          const docs = await agg.exec();
          result = {
            docs,
            hasNextPage: false,
            hasPrevPage: false,
            limit: docs.length,
            nextPage: null,
            page: 1,
            pagingCounter: 1,
            prevPage: null,
            totalDocs: docs.length,
            totalPages: 1,
          } as AggregatePaginateResult<T>;
        } else {
          const agg = this.model.aggregate(aggregate);
          result = await this.model.aggregatePaginate(agg, options);
        }
      }

      this.logger?.debug('Documents found successfully', {
        cached: enableCache && !!this.cacheService,
        limit: result.limit,
        page: result.page,
        totalDocs: result.totalDocs,
      });

      return result;
    } catch (error: unknown) {
      this.logger?.error('Failed to find documents', {
        aggregate,
        error,
        options,
      });
      throw error;
    }
  }

  async find(
    params: MongoFilter,
    populate: (string | PopulateOption)[] = [],
  ): Promise<T[]> {
    const processedParams = this.processSearchParams(params);
    return (this.model as QueryableModel)
      .find(processedParams)
      .populate(populate)
      .lean()
      .exec() as Promise<T[]>;
  }

  async findOne(
    params: MongoFilter,
    populate: (string | PopulateOption)[] = [],
  ): Promise<T | null> {
    try {
      if (!params || typeof params !== 'object') {
        throw new ValidationException('Search parameters are required');
      }

      this.logger?.debug('Finding document', { params, populate });

      // Convert string IDs to ObjectId for MongoDB queries
      const processedParams = this.processSearchParams(params);

      if (populate.length > 0) {
        const result = await (this.model as QueryableModel)
          .findOne(processedParams)
          .populate(this.optimizePopulate(populate))
          .exec();

        if (result) {
          this.logger?.debug('Document found successfully', {
            id: (result as BaseDocument)._id,
          });
        } else {
          this.logger?.debug('Document not found', { params: processedParams });
        }

        return result as T | null;
      }

      const result = await (this.model as QueryableModel)
        .findOne(processedParams)
        .exec();

      if (result) {
        this.logger?.debug('Document found successfully', {
          id: (result as BaseDocument)._id,
        });
      } else {
        this.logger?.debug('Document not found', { params: processedParams });
      }

      return result as T | null;
    } catch (error: unknown) {
      this.logger?.error('Failed to find document', {
        error,
        params,
        populate,
      });
      throw error;
    }
  }

  async patch(
    id: Types.ObjectId | string,
    updateDto:
      | Partial<UpdateDto>
      | { $set?: Partial<UpdateDto>; $unset?: Record<string, string> }
      | Record<string, unknown>,
    populate: (string | PopulateOption)[] = [],
  ): Promise<T> {
    try {
      if (!id) {
        throw new ValidationException('Document ID is required');
      }

      if (!updateDto || typeof updateDto !== 'object') {
        throw new ValidationException('Update data is required');
      }

      this.logger?.debug('Updating document', { id, populate, updateDto });

      const updateOperation =
        '$set' in updateDto || '$unset' in updateDto
          ? (updateDto as {
              $set?: Partial<UpdateDto>;
              $unset?: Record<string, string>;
            })
          : { $set: updateDto };

      const result = await (this.model as QueryableModel)
        .findByIdAndUpdate(id, updateOperation, { returnDocument: 'after' })
        .populate(this.optimizePopulate(populate))
        .exec();

      if (result) {
        this.logger?.debug('Document updated successfully', { id });

        if (this.cacheService) {
          await this.cacheService.invalidateByTags([
            this.collectionName,
            `collection:${this.collectionName}`,
            `agg:${this.collectionName}`,
            'agg:paginated',
          ]);
        }
      } else {
        this.logger?.debug('Document not found for update', { id });
      }

      return result as T;
    } catch (error: unknown) {
      this.logger?.error('Failed to update document', {
        error,
        id,
        populate,
        updateDto,
      });
      throw error;
    }
  }

  async patchAll(
    filter: MongoFilter,
    update: MongoUpdate,
  ): Promise<{ modifiedCount: number }> {
    try {
      if (!filter || typeof filter !== 'object') {
        throw new ValidationException('Filter criteria are required');
      }

      if (!update || typeof update !== 'object') {
        throw new ValidationException('Update data is required');
      }

      this.logger?.debug('Bulk updating documents', { filter, update });

      const result = await (this.model as QueryableModel)
        .updateMany(filter, update)
        .exec();

      this.logger?.debug('Bulk update completed', {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      });

      // Invalidate collection cache after bulk update
      if (this.cacheService && result.modifiedCount > 0) {
        await AggregationCacheUtil.invalidateCollectionCache(
          this.cacheService,
          this.collectionName,
        );
      }

      return { modifiedCount: result.modifiedCount };
    } catch (error: unknown) {
      this.logger?.error('Failed to bulk update documents', {
        error,
        filter,
        update,
      });
      throw error;
    }
  }

  async remove(id: string): Promise<T | null> {
    try {
      if (!id) {
        throw new ValidationException('Document ID is required');
      }

      this.logger?.debug('Soft deleting document', { id });

      const result = await (this.model as QueryableModel)
        .findByIdAndUpdate(id, { isDeleted: true }, { returnDocument: 'after' })
        .exec();

      if (result) {
        this.logger?.debug('Document soft deleted successfully', { id });

        if (this.cacheService) {
          await this.cacheService.invalidateByTags([
            this.collectionName,
            `collection:${this.collectionName}`,
            `agg:${this.collectionName}`,
            'agg:paginated',
          ]);
        }
      } else {
        this.logger?.debug('Document not found for deletion', { id });
      }

      return result as T | null;
    } catch (error: unknown) {
      this.logger?.error('Failed to soft delete document', { error, id });
      throw error;
    }
  }

  /**
   * Process search parameters to convert string IDs to ObjectId where needed
   */
  public processSearchParams(params: MongoFilter): MongoFilter {
    const processed = { ...params };

    // Fields that should be converted to ObjectId
    const objectIdFields = [
      '_id',
      'id',
      'user',
      'brand',
      'organization',
      'parent',
      'metadata',
      'asset',
      'credential',
      'activity',
      'ingredient',
    ];

    for (const [key, value] of Object.entries(processed)) {
      if (
        objectIdFields.includes(key) &&
        typeof value === 'string' &&
        Types.ObjectId.isValid(value)
      ) {
        processed[key] = new Types.ObjectId(value);
      }
    }

    return processed;
  }

  /**
   * Find one document with organization isolation
   * Automatically includes organization and isDeleted filters
   *
   * @example
   * const item = await this.findOneWithOrganization(id, organizationId);
   */
  protected async findOneWithOrganization(
    id: string,
    organizationId: string,
    populate: PopulateOption[] = [],
  ): Promise<T> {
    const item = await (this.model as QueryableModel)
      .findOne({
        _id: id,
        isDeleted: false,
        organizationId,
      })
      .populate(this.optimizePopulate(populate))
      .lean();

    if (!item) {
      throw new NotFoundException(`${this.constructor.name} not found`);
    }

    return item as T;
  }

  /**
   * Find all documents for an organization with optional filters
   * Automatically includes organization and isDeleted filters
   *
   * @example
   * const items = await this.findAllByOrganization(organizationId, { isActive: true });
   */
  async findAllByOrganization(
    organizationId: string,
    filters?: MongoFilter,
    sort: Record<string, 1 | -1> = { createdAt: -1 },
    populate: PopulateOption[] = [],
  ): Promise<T[]> {
    const queryBuilder = new QueryBuilder(organizationId);

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          queryBuilder.addInFilter(key, value);
        } else if (typeof value === 'boolean') {
          queryBuilder.addBooleanFilter(key, value);
        } else if (value !== undefined && value !== null) {
          queryBuilder.addFilter(key, value);
        }
      });
    }

    const query = queryBuilder.build();

    return (await (this.model as QueryableModel)
      .find(query)
      .sort(sort)
      .populate(this.optimizePopulate(populate))
      .lean()) as T[];
  }

  /**
   * Create a QueryBuilder instance for building complex queries
   *
   * @example
   * const query = this.createQueryBuilder(organizationId)
   *   .addFilter('status', 'active')
   *   .addInFilter('categories', ['tech', 'news'])
   *   .build();
   */
  protected createQueryBuilder(organizationId: string): QueryBuilder {
    return new QueryBuilder(organizationId);
  }

  /**
   * Update a single boolean flag on an entity with organization isolation.
   * Common pattern for markAsRead, markAsDismissed, markAsArchived, etc.
   *
   * @param id - Document ID
   * @param organizationId - Organization ID for tenant isolation
   * @param field - The boolean field to update
   * @param value - The new value (default: true)
   * @returns The updated document or null if not found
   *
   * @example
   * // Mark as read
   * await this.updateEntityFlag(id, organizationId, 'isRead', true);
   *
   * // Mark as dismissed
   * await this.updateEntityFlag(id, organizationId, 'isDismissed', true);
   *
   * // Mark as archived
   * await this.updateEntityFlag(id, organizationId, 'isArchived', true);
   */
  async updateEntityFlag(
    id: string,
    organizationId: string,
    field: keyof T & string,
    value: boolean = true,
  ): Promise<T | null> {
    try {
      this.logger?.debug(`Updating ${field} flag on document`, {
        field,
        id,
        organizationId,
        value,
      });

      const result = await (this.model as QueryableModel).findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
        { $set: { [field]: value } },
        { returnDocument: 'after' },
      );

      if (result) {
        this.logger?.debug(`${field} flag updated successfully`, { id });
      } else {
        this.logger?.debug('Document not found for flag update', { id });
      }

      return result as T | null;
    } catch (error: unknown) {
      this.logger?.error(`Failed to update ${field} flag`, {
        error,
        field,
        id,
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Bulk update a boolean flag on multiple entities with organization isolation.
   *
   * @param ids - Array of document IDs
   * @param organizationId - Organization ID for tenant isolation
   * @param field - The boolean field to update
   * @param value - The new value (default: true)
   * @returns Object with modifiedCount
   *
   * @example
   * // Mark multiple as read
   * await this.bulkUpdateEntityFlag(ids, organizationId, 'isRead', true);
   */
  async bulkUpdateEntityFlag(
    ids: string[],
    organizationId: string,
    field: keyof T & string,
    value: boolean = true,
  ): Promise<{ modifiedCount: number }> {
    try {
      this.logger?.debug(`Bulk updating ${field} flag on documents`, {
        count: ids.length,
        field,
        organizationId,
        value,
      });

      const objectIds = ids.map((id) => new Types.ObjectId(id));

      const result = await (this.model as QueryableModel).updateMany(
        {
          _id: { $in: objectIds },
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
        { $set: { [field]: value } },
      );

      this.logger?.debug(`Bulk ${field} flag update completed`, {
        modifiedCount: result.modifiedCount,
      });

      return { modifiedCount: result.modifiedCount };
    } catch (error: unknown) {
      this.logger?.error(`Failed to bulk update ${field} flag`, {
        count: ids.length,
        error,
        field,
        organizationId,
      });
      throw error;
    }
  }
}
