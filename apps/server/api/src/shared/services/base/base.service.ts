import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { QueryBuilder } from '@api/helpers/utils/query-builder.util';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseQueryNormalizationAdapter,
  type PopulateInput,
  type PrismaFilter,
  type PrismaUpdate,
} from '@api/shared/services/base/base-query-normalization.adapter';
import {
  GLOBAL_PAGINATED_QUERY_CACHE_TAG,
  generateQueryCacheKey,
  invalidateCollectionQueryCache,
  paginatedQueryCacheTag,
} from '@api/shared/utils/query-cache/query-cache.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { PopulateOption } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

export type {
  PopulateInput,
  PrismaFindAllInput,
} from '@api/shared/services/base/base-query-normalization.adapter';

/**
 * Common fields present on all records managed by BaseService.
 */
export interface BaseDocument {
  id: string;
  isDeleted?: boolean;
  organizationId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Stage 4: argument shape whose `where` clause is compile-time typed to the
 * model's `Prisma.<Model>WhereInput` (via the `TWhere` generic), while the
 * remaining Prisma args (data/select/include/orderBy/skip/take…) stay permissive.
 * A subclass that specializes `TWhere` gets its `this.internalDelegate.*({ where })`
 * calls checked against the real columns — catching the Mongo→Prisma field
 * mismatch class at compile time instead of via the runtime audit.
 */
type PrismaDelegateArgs<TWhere> = {
  where?: TWhere;
  data?: unknown;
  orderBy?: unknown;
  cursor?: unknown;
  take?: number;
  skip?: number;
  limit?: number;
  distinct?: unknown;
  select?: unknown;
  include?: unknown;
  omit?: unknown;
};

/**
 * Dynamic Prisma delegate type, generic over the model's where-input.
 * Returns use the service's model type plus common document fields. Prisma
 * generates concrete return types per model, but BaseService operates
 * generically across all models via `prisma[modelName]`.
 * Default `TWhere = PrismaFilter` keeps the delegate loose for services that
 * have not opted into the typed where yet.
 */
type PrismaDelegate<TWhere = PrismaFilter, TResult = BaseDocument> = {
  findMany: (args?: PrismaDelegateArgs<TWhere>) => Promise<TResult[]>;
  findFirst: (args?: PrismaDelegateArgs<TWhere>) => Promise<TResult | null>;
  findUnique: (args?: PrismaDelegateArgs<TWhere>) => Promise<TResult | null>;
  create: (args: Record<string, unknown>) => Promise<TResult>;
  update: (args: PrismaDelegateArgs<TWhere>) => Promise<TResult>;
  updateMany: (args: PrismaDelegateArgs<TWhere>) => Promise<{ count: number }>;
  delete: (args: PrismaDelegateArgs<TWhere>) => Promise<TResult>;
  count: (args?: PrismaDelegateArgs<TWhere>) => Promise<number>;
};

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
 * ## findAll
 * Accepts a Prisma query shape plus pagination options and executes `findMany`
 * and `count`. Complex queries belong in their domain service.
 */
@Injectable()
export abstract class BaseService<
  T,
  CreateDto = Partial<T>,
  UpdateDto = Partial<CreateDto>,
  TWhere extends PrismaFilter = PrismaFilter,
> {
  private readonly queryNormalizationAdapter: BaseQueryNormalizationAdapter;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string,
    public readonly logger?: LoggerService,
    public readonly baseConfigService?: ConfigService,
    @Optional() protected readonly cacheService?: CacheService,
  ) {
    this.queryNormalizationAdapter = new BaseQueryNormalizationAdapter(
      modelName,
      logger,
      {
        modelHasField: (fieldName) => this.modelHasField(fieldName),
        normalizeWhere: (where) => this.normalizeWhere(where),
      },
    );
  }

  /**
   * Returns the model name — used for logging and cache tag generation.
   * Replaces the old `this.model.collection.name` getter.
   */
  protected get collectionName(): string {
    return this.modelName;
  }

  /**
   * Subclass-facing Prisma delegate: its `where` args are typed to `TWhere`
   * (`Prisma.<Model>WhereInput` once a subclass specializes it). Use this in
   * service query code so filter fields are checked at compile time.
   */
  protected get delegate(): PrismaDelegate<TWhere, T & BaseDocument> {
    return (
      this.prisma as unknown as Record<
        string,
        PrismaDelegate<TWhere, T & BaseDocument>
      >
    )[this.modelName];
  }

  /**
   * BaseService-internal delegate: `where` stays the loose `PrismaFilter`. The
   * base builds dynamic where clauses from untyped HTTP input (the runtime audit
   * covers field validity there), so narrowing `TWhere` in a subclass must not
   * reject the base's own generic plumbing.
   */
  private get internalDelegate(): PrismaDelegate<
    PrismaFilter,
    T & BaseDocument
  > {
    return (
      this.prisma as unknown as Record<
        string,
        PrismaDelegate<PrismaFilter, T & BaseDocument>
      >
    )[this.modelName];
  }

  /** Preserve the subclass-facing model metadata seam. */
  protected modelHasField(fieldName: string): boolean {
    return this.queryNormalizationAdapter.modelHasField(fieldName);
  }

  /** Whether this service's Prisma model declares a concrete scalar/relation field. */
  public supportsField(fieldName: string): boolean {
    return this.queryNormalizationAdapter.supportsField(fieldName);
  }

  protected populateToInclude(
    populate: PopulateInput,
  ): Record<string, unknown> | undefined {
    return this.queryNormalizationAdapter.populateToInclude(populate);
  }

  /**
   * Stage-4 runtime guard: warn (never throw) when a normalized `where`
   * references a top-level field the Prisma model does not have. Catches the
   * Mongo→Prisma field-mismatch class early (e.g. filtering `status` on a model
   * whose column is `stage`) instead of letting it silently no-op or 500 in
   * Prisma. Compile-time enforcement (typed `Prisma.<Model>WhereInput`) is the
   * eventual end state and rides on the TS6.0 build migration; this is the
   * verifiable runtime net until then. No-op when model metadata is unavailable.
   */
  protected auditUnknownFilterFields(where: PrismaFilter = {}): void {
    this.queryNormalizationAdapter.auditUnknownFilterFields(where);
  }

  /** Domain extension point for decoding canonical persisted JSON fields. */
  protected normalizeDocument(document: unknown): T {
    return document as T;
  }

  protected normalizeDocuments(documents: unknown[]): T[] {
    return documents.map((document) => this.normalizeDocument(document));
  }

  /**
   * Default soft-delete scoping for every filter-driven operation that flows
   * through the service layer — `findAll`, `find`, `findOne`, `patchAll`,
   * `findOneWithOrganization`, and the entity-flag helpers. Injects
   * `isDeleted: false` on models that declare the column, so a call-site that
   * forgets the filter can neither resurface nor bulk-write tombstoned rows.
   *
   * The caller always wins:
   * - `{ isDeleted: true }` reads tombstones only.
   * - `{ isDeleted: undefined }` — an *explicit* key holding `undefined` —
   *   opts out entirely and reads live and deleted rows together. That is the
   *   only way to express "either" in Prisma, and it is invisible after
   *   `normalizeWhere` (which strips `undefined` values), which is why the
   *   pre-normalization filter is passed separately as `params`.
   * - Omitting `isDeleted` gets the default.
   *
   * Not applied to `patch` / `remove`: those address a single row by primary
   * key, which the caller named explicitly, and both are how a tombstone is
   * written and un-written. Injecting there would break restore.
   */
  protected withSoftDeleteFilter(
    where: PrismaFilter = {},
    params: PrismaFilter = where,
  ): PrismaFilter {
    return this.queryNormalizationAdapter.withSoftDeleteFilter(where, params);
  }

  protected normalizeWhere(where: PrismaFilter = {}): PrismaFilter {
    return this.queryNormalizationAdapter.normalizeWhere(where);
  }

  protected normalizeData(data: unknown): PrismaUpdate {
    return this.queryNormalizationAdapter.normalizeData(data);
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

  async create(createDto: CreateDto, populate: PopulateInput = []): Promise<T> {
    try {
      if (!createDto) {
        throw new ValidationException('Create data is required');
      }

      this.logger?.debug('Creating new document', {
        collectionName: this.collectionName,
        createDto,
        modelName: this.modelName,
      });

      const include = this.populateToInclude(populate);
      const doc = await this.internalDelegate.create({
        data: this.normalizeData(createDto),
        ...(include ? { include } : {}),
      });

      this.logger?.debug('Document created successfully', { id: doc.id });

      if (this.cacheService) {
        await this.cacheService.invalidateByTags([
          this.collectionName,
          `collection:${this.collectionName}`,
          `query:${this.collectionName}`,
          paginatedQueryCacheTag(this.collectionName),
        ]);
      }

      return this.normalizeDocument(doc);
    } catch (error: unknown) {
      this.logger?.error('Failed to create document', { createDto, error });
      throw error;
    }
  }

  /** Find documents with optional projection, sorting, caching, and pagination. */
  async findAll(
    input: unknown,
    options: AggregationOptions,
    enableCache: boolean = true,
  ): Promise<AggregatePaginateResult<T>> {
    try {
      const page = options.page ?? 1;
      const limit = options.limit ?? 20;
      const skip = (page - 1) * limit;
      const findAllInput = this.queryNormalizationAdapter.resolveFindAllInput(
        input,
        options,
      );
      const orderBy =
        findAllInput.orderBy ??
        this.queryNormalizationAdapter.normalizeSort(options.sort);
      const rawWhere = findAllInput.where ?? {};
      const where = this.withSoftDeleteFilter(
        this.normalizeWhere(rawWhere),
        rawWhere,
      );
      this.auditUnknownFilterFields(where);
      const include = findAllInput.include;
      const select = findAllInput.select;
      this.queryNormalizationAdapter.assertProjectionFields(include, 'include');
      this.queryNormalizationAdapter.assertProjectionFields(select, 'select');
      const projection = select ? { select } : include ? { include } : {};

      const cacheKey =
        enableCache && this.cacheService
          ? generateQueryCacheKey(
              this.collectionName,
              {
                include: include ?? null,
                orderBy,
                select: select ?? null,
                where,
              },
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
        const docs = this.normalizeDocuments(
          await this.internalDelegate.findMany({
            where,
            orderBy,
            ...projection,
          }),
        );
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
        this.internalDelegate.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          ...projection,
        }),
        this.internalDelegate.count({ where }),
      ]);

      const totalPages = Math.ceil(totalDocs / limit);
      const result: AggregatePaginateResult<T> = {
        docs: this.normalizeDocuments(docs),
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
            `query:${this.collectionName}`,
            paginatedQueryCacheTag(this.collectionName),
            GLOBAL_PAGINATED_QUERY_CACHE_TAG,
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

  /**
   * Find every matching document, unpaginated. Soft-deleted rows are excluded
   * by default (see `withSoftDeleteFilter`); pass `isDeleted` explicitly to
   * opt out.
   */
  async find(params: PrismaFilter, populate: PopulateInput = []): Promise<T[]> {
    const where = this.withSoftDeleteFilter(
      this.normalizeWhere(params),
      params,
    );
    const include = this.populateToInclude(populate);
    const docs = await this.internalDelegate.findMany({
      where,
      ...(include ? { include } : {}),
    });

    return this.normalizeDocuments(docs);
  }

  /**
   * Find a single document. Soft-deleted rows are excluded by default (see
   * `withSoftDeleteFilter`); pass `isDeleted` explicitly to opt out.
   */
  async findOne(
    params: PrismaFilter,
    populate: PopulateInput = [],
  ): Promise<T | null> {
    try {
      if (!params || typeof params !== 'object') {
        throw new ValidationException('Search parameters are required');
      }

      // A missing canonical ID must never degrade into an unscoped findFirst.
      if (
        'id' in params &&
        (params.id === undefined || params.id === null || params.id === '')
      ) {
        this.logger?.warn(
          'findOne called with an empty identifier — returning null instead of an unscoped first-row read',
          { model: this.modelName, params },
        );
        return null;
      }

      this.logger?.debug('Finding document', { params, populate });

      const where = this.withSoftDeleteFilter(
        this.normalizeWhere(params),
        params,
      );
      const include = this.populateToInclude(populate);

      const result = await this.internalDelegate.findFirst({
        where,
        ...(include ? { include } : {}),
      });

      if (result) {
        this.logger?.debug('Document found successfully', { id: result.id });
      } else {
        this.logger?.debug('Document not found', { params: where });
      }

      return result ? this.normalizeDocument(result) : null;
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
    populate: PopulateInput = [],
  ): Promise<T> {
    try {
      if (!id) {
        throw new ValidationException('Document ID is required');
      }

      if (!updateDto || typeof updateDto !== 'object') {
        throw new ValidationException('Update data is required');
      }

      this.logger?.debug('Updating document', { id, populate, updateDto });
      const data = this.normalizeData(updateDto);

      const include = this.populateToInclude(populate);
      const result = await this.internalDelegate.update({
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
            `query:${this.collectionName}`,
            paginatedQueryCacheTag(this.collectionName),
          ]);
        }
      } else {
        this.logger?.debug('Document not found for update', { id });
      }

      return this.normalizeDocument(result);
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

  /**
   * Bulk-update every matching document. Soft-deleted rows are excluded by
   * default (see `withSoftDeleteFilter`); pass `isDeleted` explicitly to opt
   * out. This is a filter-driven write, so the same default that keeps
   * tombstones out of reads keeps them out of bulk writes.
   */
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

      // sql-risk-audit: ignore bulk-write-tenant-review -- withSoftDeleteFilter forces the isDeleted:false default onto every filter-driven bulk write; organization scoping is the caller's filter contract (single-tenant self-host omits it by design).
      const result = await this.internalDelegate.updateMany({
        where: this.withSoftDeleteFilter(this.normalizeWhere(filter), filter),
        data: this.normalizeData(update),
      });

      this.logger?.debug('Bulk update completed', {
        modifiedCount: result.count,
      });

      if (this.cacheService && result.count > 0) {
        await invalidateCollectionQueryCache(
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

      const result = await this.internalDelegate.update({
        where: { id },
        data: { isDeleted: true },
      });

      if (result) {
        this.logger?.debug('Document soft deleted successfully', { id });

        if (this.cacheService) {
          await this.cacheService.invalidateByTags([
            this.collectionName,
            `collection:${this.collectionName}`,
            `query:${this.collectionName}`,
            paginatedQueryCacheTag(this.collectionName),
          ]);
        }
      } else {
        this.logger?.debug('Document not found for deletion', { id });
      }

      return result ? this.normalizeDocument(result) : null;
    } catch (error: unknown) {
      this.logger?.error('Failed to soft delete document', { error, id });
      throw error;
    }
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
    const include = this.populateToInclude(populate);
    const item = await this.internalDelegate.findFirst({
      where: this.withSoftDeleteFilter({ id, organizationId }),
      ...(include ? { include } : {}),
    });

    if (!item) {
      throw new NotFoundException(`${this.constructor.name} not found`);
    }

    return this.normalizeDocument(item);
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
    const filterBuilder = new QueryBuilder(organizationId);

    // QueryBuilder seeds `isDeleted: false` unconditionally; on the 23 models
    // that never declared the column, Prisma rejects the unknown filter key.
    if (!this.modelHasField('isDeleted')) {
      filterBuilder.remove('isDeleted');
    }

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          filterBuilder.addInFilter(key, value);
        } else if (typeof value === 'boolean') {
          filterBuilder.addBooleanFilter(key, value);
        } else if (value !== undefined && value !== null) {
          filterBuilder.addFilter(key, value);
        }
      });
    }

    const query = this.normalizeWhere(filterBuilder.build());
    const include = this.populateToInclude(populate);

    const orderBy = Object.entries(sort).map(([key, direction]) => ({
      [key]: direction === 1 ? 'asc' : 'desc',
    }));

    const docs = await this.internalDelegate.findMany({
      where: query,
      orderBy,
      ...(include ? { include } : {}),
    });

    return this.normalizeDocuments(docs);
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
      const existing = await this.internalDelegate.findFirst({
        where: this.withSoftDeleteFilter({ id, organizationId }),
        select: { id: true },
      });

      if (!existing) {
        this.logger?.debug('Document not found for flag update', { id });
        return null;
      }

      const result = await this.internalDelegate.update({
        where: { id },
        data: { [field]: value },
      });

      this.logger?.debug(`${field} flag updated successfully`, { id });

      return result ? this.normalizeDocument(result) : null;
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

      const result = await this.internalDelegate.updateMany({
        where: this.withSoftDeleteFilter({
          id: { in: ids },
          organizationId: organizationId,
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
