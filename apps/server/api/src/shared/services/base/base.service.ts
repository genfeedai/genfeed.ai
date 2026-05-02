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

type PopulateInput = (string | PopulateOption)[] | 'none';

type PrismaOrderDirection = 'asc' | 'desc' | 1 | -1;
type PrismaOrderByInput = Record<string, PrismaOrderDirection>;
type PrismaOrderBy = Record<string, 'asc' | 'desc'>;

export interface PrismaFindAllInput {
  where?: PrismaFilter;
  orderBy?: PrismaOrderByInput;
  include?: Record<string, unknown>;
}

const PAGINATION_OPTION_KEYS = new Set([
  'allowDiskUse',
  'countQuery',
  'customLabels',
  'limit',
  'offset',
  'page',
  'pagination',
  'sort',
  'useFacet',
]);

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
  populate: PopulateInput,
): Record<string, boolean> | undefined {
  if (populate === 'none') {
    return undefined;
  }

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
 * The `findAll` method previously accepted MongoDB findAll queries. In the Prisma
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

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private mergeLegacyPayload(
    target: Record<string, unknown>,
    source: unknown,
  ): void {
    if (!this.isPlainObject(source)) {
      return;
    }

    for (const [key, value] of Object.entries(source)) {
      if (target[key] === undefined) {
        target[key] = value;
      }
    }
  }

  protected normalizeDocument(document: unknown): T {
    if (!this.isPlainObject(document)) {
      return document as T;
    }

    const normalized: Record<string, unknown> = { ...document };

    const legacyId =
      typeof normalized.mongoId === 'string' && normalized.mongoId.length > 0
        ? normalized.mongoId
        : normalized.id;

    if (normalized._id === undefined && typeof legacyId === 'string') {
      normalized._id = legacyId;
    }

    if (
      normalized.organization === undefined &&
      typeof normalized.organizationId === 'string'
    ) {
      normalized.organization = normalized.organizationId;
    }

    if (
      normalized.user === undefined &&
      typeof normalized.userId === 'string'
    ) {
      normalized.user = normalized.userId;
    }

    if (
      normalized.brand === undefined &&
      (typeof normalized.brandId === 'string' || normalized.brandId === null)
    ) {
      normalized.brand = normalized.brandId;
    }

    if (
      normalized.parentModel === undefined &&
      typeof normalized.parentType === 'string'
    ) {
      normalized.parentModel = normalized.parentType;
    }

    if (normalized.parent === undefined) {
      const parentCandidate =
        normalized.parentBrandId ??
        normalized.parentOrgId ??
        normalized.parentIngredientId ??
        normalized.parentArticleId;

      if (typeof parentCandidate === 'string' || parentCandidate === null) {
        normalized.parent = parentCandidate;
      }
    }

    this.mergeLegacyPayload(normalized, normalized.data);
    this.mergeLegacyPayload(normalized, normalized.config);
    this.mergeLegacyPayload(normalized, normalized.settings);
    this.mergeLegacyPayload(normalized, normalized.policies);
    this.mergeLegacyPayload(normalized, normalized.metadata);
    this.mergeLegacyPayload(normalized, normalized.stats);
    this.mergeLegacyPayload(normalized, normalized.result);

    if (normalized.key === undefined && typeof normalized.action === 'string') {
      normalized.key = normalized.action;
    }

    if (normalized.action === undefined && typeof normalized.key === 'string') {
      normalized.action = normalized.key;
    }

    return normalized as T;
  }

  protected normalizeDocuments(documents: unknown[]): T[] {
    return documents.map((document) => this.normalizeDocument(document));
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

  private normalizeSort(
    sort: AggregationOptions['sort'] | PrismaOrderByInput | undefined,
  ): PrismaOrderBy {
    if (!sort || typeof sort !== 'object') {
      return { createdAt: 'desc' };
    }

    return Object.entries(sort).reduce<PrismaOrderBy>((acc, [key, dir]) => {
      acc[key] = dir === 1 || dir === 'asc' ? 'asc' : 'desc';
      return acc;
    }, {});
  }

  private normalizeOperatorValue(value: unknown): unknown {
    if (!this.isPlainObject(value)) {
      return value;
    }

    const operators = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    if ('in' in operators) {
      normalized.in = operators.in;
    }
    if ('notIn' in operators) {
      normalized.notIn = operators.notIn;
    }
    if ('not' in operators) {
      normalized.not = operators.not;
    }
    if ('gte' in operators) {
      normalized.gte = operators.gte;
    }
    if ('gt' in operators) {
      normalized.gt = operators.gt;
    }
    if ('lte' in operators) {
      normalized.lte = operators.lte;
    }
    if ('lt' in operators) {
      normalized.lt = operators.lt;
    }
    if ('not' in operators) {
      normalized.not = operators.not;
    }
    if ('contains' in operators) {
      normalized.contains = operators.contains;
    }
    if ('mode' in operators) {
      normalized.mode = operators.mode === 'i' ? 'insensitive' : operators.mode;
    }

    return Object.keys(normalized).length ? normalized : value;
  }

  private normalizeWhere(where: PrismaFilter = {}): PrismaFilter {
    const normalized = this.processSearchParams(where);
    const result: PrismaFilter = {};

    for (const [key, value] of Object.entries(normalized)) {
      if (key === 'OR') {
        result.OR = Array.isArray(value)
          ? value.map((entry) =>
              this.normalizeWhere(
                this.isPlainObject(entry) ? entry : ({} as PrismaFilter),
              ),
            )
          : value;
        continue;
      }

      if (key === 'AND') {
        result.AND = Array.isArray(value)
          ? value.map((entry) =>
              this.normalizeWhere(
                this.isPlainObject(entry) ? entry : ({} as PrismaFilter),
              ),
            )
          : value;
        continue;
      }

      result[key] = this.normalizeOperatorValue(value);
    }

    return result;
  }

  private extractOptionsWhere(options: AggregationOptions): PrismaFilter {
    return Object.fromEntries(
      Object.entries(options).filter(([key, value]) => {
        return !PAGINATION_OPTION_KEYS.has(key) && value !== undefined;
      }),
    );
  }

  private resolveFindAllInput(
    input: unknown,
    options: AggregationOptions,
  ): PrismaFindAllInput {
    const optionsWhere = this.extractOptionsWhere(options);

    if (Array.isArray(input)) {
      throw new ValidationException(
        'findAll expects a Prisma query object, not an aggregation array',
      );
    }

    if (!this.isPlainObject(input)) {
      return { where: optionsWhere };
    }

    const explicitInput = input as PrismaFindAllInput;
    if (
      'where' in explicitInput ||
      'orderBy' in explicitInput ||
      'include' in explicitInput
    ) {
      return {
        include: explicitInput.include,
        orderBy: explicitInput.orderBy
          ? this.normalizeSort(explicitInput.orderBy)
          : undefined,
        where: {
          ...(explicitInput.where ?? {}),
          ...optionsWhere,
        },
      };
    }

    return {
      where: {
        ...(input as PrismaFilter),
        ...optionsWhere,
      },
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

      return this.normalizeDocument(doc);
    } catch (error: unknown) {
      this.logger?.error('Failed to create document', { createDto, error });
      throw error;
    }
  }

  /**
   * Find documents with pagination.
   *
   * Previously accepted MongoDB findAll queries. Now accepts an options object.
   * Services that require raw aggregation should override this method or call
   * `this.prisma.$queryRaw` / `this.delegate.findMany(...)` directly.
   *
   * The first parameter `_pipeline` is kept for API compatibility with callers that pass
   * a MongoDB pipeline array — it is ignored. Pass `{}` or `[]` when calling from
   * migrated code.
   */
  async findAll(
    input: unknown,
    options: AggregationOptions,
    enableCache: boolean = false,
  ): Promise<AggregatePaginateResult<T>> {
    try {
      const page = options.page ?? 1;
      const limit = options.limit ?? 20;
      const skip = (page - 1) * limit;
      const findAllInput = this.resolveFindAllInput(input, options);
      const orderBy = findAllInput.orderBy ?? this.normalizeSort(options.sort);
      const where = this.withSoftDeleteFilter(
        this.normalizeWhere(findAllInput.where ?? {}),
      );
      const include = findAllInput.include;

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
        const docs = this.normalizeDocuments(
          await this.delegate.findMany({
            where,
            orderBy,
            ...(include ? { include } : {}),
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
        this.delegate.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          ...(include ? { include } : {}),
        }),
        this.delegate.count({ where }),
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

  async find(params: PrismaFilter, populate: PopulateInput = []): Promise<T[]> {
    const where = this.processSearchParams(params);
    const include = populateToInclude(populate);
    const docs = await this.delegate.findMany({
      where,
      ...(include ? { include } : {}),
    });

    return this.normalizeDocuments(docs);
  }

  async findOne(
    params: PrismaFilter,
    populate: PopulateInput = [],
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
      const data = updateDto as PrismaUpdate;

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

      const result = await this.delegate.updateMany({
        where: filter,
        data: update,
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

      return result ? this.normalizeDocument(result) : null;
    } catch (error: unknown) {
      this.logger?.error('Failed to soft delete document', { error, id });
      throw error;
    }
  }

  /**
   * Process search parameters for Prisma where clauses.
   * Converts `_id` → `id` and also matches `mongoId` when the model still
   * carries a legacy Mongo identifier.
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

      const shouldMapRelationObject =
        this.isPlainObject(value) &&
        Object.keys(value).some((operator) => operator.startsWith('$'));

      if (typeof value === 'string' || shouldMapRelationObject) {
        const scalarRelationKey = `${key}Id`;
        if (this.modelHasField(scalarRelationKey)) {
          processed[scalarRelationKey] = value;
          continue;
        }
      }

      if (key === '_id') {
        if (this.modelHasField('mongoId')) {
          const existingOr = Array.isArray(processed.OR)
            ? [...processed.OR]
            : [];

          processed.OR = [...existingOr, { id: value }, { mongoId: value }];
          continue;
        }

        processed.id = value;
        continue;
      }

      const prismaKey = key;
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

    const query = this.processSearchParams(filterBuilder.build());
    const include = populateToInclude(populate);

    const orderBy = Object.entries(sort).reduce<Record<string, string>>(
      (acc, [key, dir]) => {
        acc[key] = dir === 1 ? 'asc' : 'desc';
        return acc;
      },
      {},
    );

    const docs = await this.delegate.findMany({
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
