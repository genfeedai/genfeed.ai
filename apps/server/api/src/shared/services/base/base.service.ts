import { ConfigService } from '@api/config/config.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { QueryBuilder } from '@api/helpers/utils/query-builder.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AggregationCacheUtil } from '@api/shared/utils/aggregation-cache/aggregation-cache.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { PopulateOption } from '@genfeedai/interfaces';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Common fields present on all documents managed by BaseService.
 * Prisma entities use string `id` (cuid/uuid) instead of ObjectId `_id`.
 */
export interface BaseDocument {
  id: string;
  isDeleted?: boolean;
  organizationId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Filter type for Prisma where clauses.
 */
type PrismaFilter = Record<string, unknown>;

/**
 * Update type for Prisma data clauses.
 */
type PrismaUpdate = Record<string, unknown>;

/**
 * Dynamic Prisma delegate type.
 * Covers the subset of Prisma client methods used by BaseService.
 * Using `any` here is intentional — Prisma generates concrete types per model,
 * but BaseService operates generically across all models via `prisma[modelName]`.
 */
type PrismaDelegate = {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic delegate, concrete types per model
  findMany: (args?: any) => Promise<any[]>;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic delegate, concrete types per model
  findFirst: (args?: any) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic delegate, concrete types per model
  findUnique: (args?: any) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic delegate, concrete types per model
  create: (args: any) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic delegate, concrete types per model
  update: (args: any) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic delegate, concrete types per model
  updateMany: (args: any) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic delegate, concrete types per model
  delete: (args: any) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic delegate, concrete types per model
  count: (args?: any) => Promise<number>;
};

/**
 * Convert a populate array (string | PopulateOption) into a Prisma `include` object.
 *
 * Populate strings map directly to Prisma relation names.
 * PopulateOption `select` field is ignored here — Prisma `include` includes full relations
 * by default. Field-level selection within a relation requires a nested `select`, which
 * callers that need it should override directly using Prisma APIs.
 */
function populateToInclude(
  populate: (string | PopulateOption)[],
): Record<string, boolean> | undefined {
  if (!populate.length) return undefined;
  return Object.fromEntries(
    populate.map((p) => [typeof p === 'string' ? p : p.path, true]),
  );
}

/**
 * BaseService — Abstract base class for all services backed by Prisma models.
 *
 * ## Constructor
 * ```ts
 * constructor(prisma: PrismaService, 'modelName', logger, configService?, cacheService?)
 * ```
 * `modelName` must match the Prisma model name in camelCase (e.g. `'post'`, `'brand'`, `'user'`).
 *
 * ## Update Methods
 * - `patch(id, data)` — Updates a single document by ID. Auto-invalidates cache.
 * - `patchAll(filter, update)` — Bulk update. Returns `{ modifiedCount }`.
 *
 * ## findAll / aggregation
 * The `findAll` method previously accepted MongoDB aggregation pipelines. In the Prisma
 * migration it accepts `AggregationOptions` (page, limit, sort) and builds a simple
 * `findMany` + `count` query. Services that require complex aggregations should call
 * `this.prisma[this.modelName].findMany(...)` directly.
 */
@Injectable()
export abstract class BaseService<
  T,
  CreateDto = Partial<T>,
  UpdateDto = Partial<CreateDto>,
> {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string,
    public readonly logger?: LoggerService,
    public readonly baseConfigService?: ConfigService,
    @Optional() protected readonly cacheService?: CacheService,
  ) {}

  /**
   * Returns the model name — used for logging and cache tag generation.
   * Replaces the old `this.model.collection.name` getter.
   */
  protected get collectionName(): string {
    return this.modelName;
  }

  /**
   * Returns the typed Prisma delegate for this service's model.
   */
  protected get delegate(): PrismaDelegate {
    return (this.prisma as unknown as Record<string, PrismaDelegate>)[
      this.modelName
    ];
  }

  private get runtimeModel(): { fields?: Array<{ name: string }> } | undefined {
    const runtimeModels = (
      this.prisma as PrismaService & {
        _runtimeDataModel?: {
          models?: Record<string, { fields?: Array<{ name: string }> }>;
        };
      }
    )._runtimeDataModel?.models;

    if (!runtimeModels) {
      return undefined;
    }

    const prismaModelName = `${this.modelName[0]?.toUpperCase() ?? ''}${this.modelName.slice(1)}`;
    return runtimeModels[prismaModelName];
  }

  protected modelHasField(fieldName: string): boolean {
    const fields = this.runtimeModel?.fields;
    if (!fields) {
      return true;
    }

    return fields.some((field) => field.name === fieldName);
  }

  private withSoftDeleteFilter(where: PrismaFilter = {}): PrismaFilter {
    if (!this.modelHasField('isDeleted')) {
      return where;
    }

    return {
      ...where,
      isDeleted: false,
    };
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
        modelName: this.modelName,
      });

      const include = populateToInclude(populate);
      const doc = await this.delegate.create({
        data: createDto,
        ...(include ? { include } : {}),
      });

      this.logger?.debug('Document created successfully', { id: doc.id });

      if (this.cacheService) {
        await this.cacheService.invalidateByTags([
          this.collectionName,
          `collection:${this.collectionName}`,
          `agg:${this.collectionName}`,
          'agg:paginated',
        ]);
      }

      return doc as T;
    } catch (error: unknown) {
      this.logger?.error('Failed to create document', { createDto, error });
      throw error;
    }
  }

  /**
   * Find documents with pagination.
   *
   * Previously accepted MongoDB aggregation pipelines. Now accepts an options object.
   * Services that require raw aggregation should override this method or call
   * `this.prisma.$queryRaw` / `this.delegate.findMany(...)` directly.
   *
   * The first parameter `_pipeline` is kept for API compatibility with callers that pass
   * a MongoDB pipeline array — it is ignored. Pass `{}` or `[]` when calling from
   * migrated code.
   */
  async findAll(
    _pipeline: unknown,
    options: AggregationOptions,
    enableCache: boolean = false,
  ): Promise<AggregatePaginateResult<T>> {
    try {
      const page = options.page ?? 1;
      const limit = options.limit ?? 20;
      const skip = (page - 1) * limit;
      const orderBy = options.sort
        ? Object.entries(options.sort).reduce<Record<string, string>>(
            (acc, [key, dir]) => {
              acc[key] = dir === 1 ? 'asc' : 'desc';
              return acc;
            },
            {},
          )
        : { createdAt: 'desc' };

      const where = this.withSoftDeleteFilter();

      const cacheKey =
        enableCache && this.cacheService
          ? AggregationCacheUtil.generateCacheKey(
              this.collectionName,
              [],
              options,
            )
          : null;

      if (cacheKey && this.cacheService) {
        const cached =
          await this.cacheService.get<AggregatePaginateResult<T>>(cacheKey);
        if (cached !== null) return cached;
      }

      const isPaginated = options.pagination !== false;

      if (!isPaginated) {
        const docs = (await this.delegate.findMany({ where, orderBy })) as T[];
        const result: AggregatePaginateResult<T> = {
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
        };
        return result;
      }

      const [docs, totalDocs] = await Promise.all([
        this.delegate.findMany({ where, orderBy, skip, take: limit }),
        this.delegate.count({ where }),
      ]);

      const totalPages = Math.ceil(totalDocs / limit);
      const result: AggregatePaginateResult<T> = {
        docs: docs as T[],
        hasNextPage: page * limit < totalDocs,
        hasPrevPage: page > 1,
        limit,
        nextPage: page * limit < totalDocs ? page + 1 : null,
        page,
        pagingCounter: (page - 1) * limit + 1,
        prevPage: page > 1 ? page - 1 : null,
        totalDocs,
        totalPages,
      };

      if (cacheKey && this.cacheService) {
        await this.cacheService.set(cacheKey, result, {
          tags: [
            `collection:${this.collectionName}`,
            `agg:${this.collectionName}`,
            'agg:paginated',
          ],
          ttl: 300,
        });
      }

      this.logger?.debug('Documents found successfully', {
        limit: result.limit,
        page: result.page,
        totalDocs: result.totalDocs,
      });

      return result;
    } catch (error: unknown) {
      this.logger?.error('Failed to find documents', { error, options });
      throw error;
    }
  }

  async find(
    params: PrismaFilter,
    populate: (string | PopulateOption)[] = [],
  ): Promise<T[]> {
    const where = this.processSearchParams(params);
    const include = populateToInclude(populate);
    return this.delegate.findMany({
      where,
      ...(include ? { include } : {}),
    }) as Promise<T[]>;
  }

  async findOne(
    params: PrismaFilter,
    populate: (string | PopulateOption)[] = [],
  ): Promise<T | null> {
    try {
      if (!params || typeof params !== 'object') {
        throw new ValidationException('Search parameters are required');
      }

      this.logger?.debug('Finding document', { params, populate });

      const where = this.processSearchParams(params);
      const include = populateToInclude(populate);

      const result = await this.delegate.findFirst({
        where,
        ...(include ? { include } : {}),
      });

      if (result) {
        this.logger?.debug('Document found successfully', { id: result.id });
      } else {
        this.logger?.debug('Document not found', { params: where });
      }

      return (result as T) ?? null;
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
    id: string,
    updateDto: Partial<UpdateDto> | PrismaUpdate,
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

      // Flatten legacy $set/$unset operators into plain Prisma data.
      // Prisma does not use MongoDB operators — field values are set directly.
      let data: PrismaUpdate;
      if ('$set' in updateDto || '$unset' in updateDto) {
        const setFields = (updateDto as { $set?: PrismaUpdate }).$set ?? {};
        // $unset fields are nulled out in Prisma (no equivalent of MongoDB $unset)
        const unsetFields = Object.fromEntries(
          Object.keys(
            (updateDto as { $unset?: Record<string, string> }).$unset ?? {},
          ).map((k) => [k, null]),
        );
        data = { ...setFields, ...unsetFields };
      } else {
        data = updateDto as PrismaUpdate;
      }

      const include = populateToInclude(populate);
      const result = await this.delegate.update({
        where: { id },
        data,
        ...(include ? { include } : {}),
      });

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
    filter: PrismaFilter,
    update: PrismaUpdate,
  ): Promise<{ modifiedCount: number }> {
    try {
      if (!filter || typeof filter !== 'object') {
        throw new ValidationException('Filter criteria are required');
      }

      if (!update || typeof update !== 'object') {
        throw new ValidationException('Update data is required');
      }

      this.logger?.debug('Bulk updating documents', { filter, update });

      // Flatten $set operator if present (legacy MongoDB update syntax)
      const data = '$set' in update ? (update.$set as PrismaUpdate) : update;

      const result = await this.delegate.updateMany({
        where: filter,
        data,
      });

      this.logger?.debug('Bulk update completed', {
        modifiedCount: result.count,
      });

      if (this.cacheService && result.count > 0) {
        await AggregationCacheUtil.invalidateCollectionCache(
          this.cacheService,
          this.collectionName,
        );
      }

      return { modifiedCount: result.count };
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

      const result = await this.delegate.update({
        where: { id },
        data: { isDeleted: true },
      });

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

      return (result as T) ?? null;
    } catch (error: unknown) {
      this.logger?.error('Failed to soft delete document', { error, id });
      throw error;
    }
  }

  /**
   * Process search parameters for Prisma where clauses.
   * Converts `_id` → `id` (Prisma uses `id`, not `_id`).
   * Converts legacy scalar `organization` / `user` filters to scalar foreign keys.
   * Strips ObjectId conversion — Prisma uses string IDs natively.
   */
  public processSearchParams(params: PrismaFilter): PrismaFilter {
    const processed: PrismaFilter = {};
    const legacyRelationFields = {
      organization: 'organizationId',
      user: 'userId',
    } as const;

    for (const [key, value] of Object.entries(params)) {
      if (key === 'isDeleted' && !this.modelHasField('isDeleted')) {
        continue;
      }

      if (key in legacyRelationFields && typeof value === 'string') {
        const relationKey = key as keyof typeof legacyRelationFields;
        const scalarKey = legacyRelationFields[relationKey];

        if (this.modelHasField(scalarKey)) {
          processed[scalarKey] = value;
          continue;
        }

        if (this.modelHasField(relationKey)) {
          processed[relationKey] = { is: { id: value } };
          continue;
        }

        continue;
      }

      // Remap MongoDB _id field to Prisma id field
      const prismaKey = key === '_id' ? 'id' : key;
      processed[prismaKey] = value;
    }

    return processed;
  }

  /**
   * Find one document with organization isolation.
   * Automatically includes `organizationId` and `isDeleted: false` filters.
   */
  protected async findOneWithOrganization(
    id: string,
    organizationId: string,
    populate: PopulateOption[] = [],
  ): Promise<T> {
    const include = populateToInclude(populate);
    const item = await this.delegate.findFirst({
      where: this.withSoftDeleteFilter({ id, organizationId }),
      ...(include ? { include } : {}),
    });

    if (!item) {
      throw new NotFoundException(`${this.constructor.name} not found`);
    }

    return item as T;
  }

  /**
   * Find all documents for an organization with optional filters.
   * Automatically includes `organizationId` and `isDeleted: false` filters.
   */
  async findAllByOrganization(
    organizationId: string,
    filters?: PrismaFilter,
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

    const query = this.processSearchParams(queryBuilder.build());
    const include = populateToInclude(populate);

    const orderBy = Object.entries(sort).reduce<Record<string, string>>(
      (acc, [key, dir]) => {
        acc[key] = dir === 1 ? 'asc' : 'desc';
        return acc;
      },
      {},
    );

    return this.delegate.findMany({
      where: query,
      orderBy,
      ...(include ? { include } : {}),
    }) as Promise<T[]>;
  }

  /**
   * Create a QueryBuilder instance for building complex queries.
   */
  protected createQueryBuilder(organizationId: string): QueryBuilder {
    return new QueryBuilder(organizationId);
  }

  /**
   * Update a single boolean flag on an entity with organization isolation.
   * Common pattern for markAsRead, markAsDismissed, markAsArchived, etc.
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

      // Verify ownership first, then update
      const existing = await this.delegate.findFirst({
        where: this.withSoftDeleteFilter({ id, organizationId }),
        select: { id: true },
      });

      if (!existing) {
        this.logger?.debug('Document not found for flag update', { id });
        return null;
      }

      const result = await this.delegate.update({
        where: { id },
        data: { [field]: value },
      });

      this.logger?.debug(`${field} flag updated successfully`, { id });

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

      const result = await this.delegate.updateMany({
        where: this.withSoftDeleteFilter({
          id: { in: ids },
          organizationId,
        }),
        data: { [field]: value },
      });

      this.logger?.debug(`Bulk ${field} flag update completed`, {
        modifiedCount: result.count,
      });

      return { modifiedCount: result.count };
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
