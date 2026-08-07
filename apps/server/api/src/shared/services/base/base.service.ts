import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { QueryBuilder } from '@api/helpers/utils/query-builder.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  GLOBAL_PAGINATED_QUERY_CACHE_TAG,
  generateQueryCacheKey,
  invalidateCollectionQueryCache,
  paginatedQueryCacheTag,
} from '@api/shared/utils/query-cache/query-cache.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { PopulateOption } from '@genfeedai/interfaces';
import * as PrismaEnums from '@genfeedai/prisma';
import { getModelMeta } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

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
 * Filter type for Prisma where clauses.
 */
type PrismaFilter = Record<string, unknown>;

/**
 * Update type for Prisma data clauses.
 */
type PrismaUpdate = Record<string, unknown>;

export type PopulateInput = (string | PopulateOption)[] | 'none';

type PrismaOrderDirection = 'asc' | 'desc' | number;
type PrismaOrderByInput = Record<string, PrismaOrderDirection>;
type PrismaOrderBy = Record<string, 'asc' | 'desc'>;
/** Static Prisma model-field metadata used for enum and nullability handling. */
type RuntimeModelField = {
  isList?: boolean;
  isRequired?: boolean;
  kind?: string;
  name: string;
  type?: string;
};

/**
 * Explicit app-value → Prisma-enum-value overrides, keyed by Prisma enum type name.
 *
 * Only needed for values that the generic `toUpperCase().replace(/[^A-Z0-9]+/g, '_')`
 * algorithm cannot derive correctly.  The key must be the **lower-cased** form of the
 * incoming app value (after `.trim().toLowerCase()`).
 *
 * Leave out cases that are already handled by the algorithm:
 *   'image'       → IMAGE       ✓ (straight uppercase)
 *   'image-edit'  → IMAGE_EDIT  ✓ (hyphen replaced by _)
 *   'Ingredient'  → INGREDIENT  ✓ (PascalCase uppercased, no separator)
 */
const PRISMA_ENUM_ALIASES: Record<string, Record<string, string>> = {
  ArticleStatus: {
    // 'public' is a legacy app alias for the Prisma value PUBLISHED.
    public: 'PUBLISHED',
    published: 'PUBLISHED',
  },
  ApiKeyCategory: {
    // 'opuspro' does not split into OPUS_PRO via the generic algorithm.
    opuspro: 'OPUS_PRO',
  },
  IngredientStatus: {
    // 'completed' was the legacy status name; Prisma stores GENERATED.
    completed: 'GENERATED',
  },
  PromptCategory: {
    // Full slug used in older client code that differs from the derived form.
    'models-prompt-genfeedai': 'MODELS_PROMPT_TRAINING',
  },
  SubscriptionStatus: {
    // Stripe sends 'canceled' (US spelling); Prisma stores CANCELLED (UK).
    canceled: 'CANCELLED',
  },
};

const NORMALIZED_PRISMA_FILTER_OPERATORS = [
  'equals',
  'set',
  'in',
  'notIn',
] as const;

const PASSTHROUGH_PRISMA_FILTER_OPERATORS = [
  'gte',
  'gt',
  'lte',
  'lt',
  'contains',
  'path',
  'string_contains',
  'string_starts_with',
  'string_ends_with',
  'array_contains',
  'array_starts_with',
  'array_ends_with',
] as const;

export interface PrismaFindAllInput {
  where?: PrismaFilter;
  orderBy?: PrismaOrderByInput | PrismaOrderByInput[];
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
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
 * Convert relation-loading options into Prisma `include` entries. Explicit
 * field lists become nested `select` objects so list endpoints do not fetch
 * complete related records.
 */
function populateToInclude(
  populate: PopulateInput,
): Record<string, unknown> | undefined {
  if (populate === 'none') {
    return undefined;
  }

  if (!populate.length) return undefined;
  const toRelationSelection = (option: PopulateOption): unknown => {
    const nested = option.populate
      ? { [option.populate.path]: toRelationSelection(option.populate) }
      : undefined;

    if (option.select?.length) {
      return {
        select: {
          ...Object.fromEntries(option.select.map((field) => [field, true])),
          ...nested,
        },
      };
    }

    return nested ? { include: nested } : true;
  };

  return Object.fromEntries(
    populate.map((option) =>
      typeof option === 'string'
        ? [option, true]
        : [option.path, toRelationSelection(option)],
    ),
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

  /**
   * Returns the static model metadata for this service's model.
   *
   * Uses the committed `PRISMA_MODEL_METADATA` map generated from the Prisma
   * schema instead of `prisma._runtimeDataModel`, which is not populated by
   * the PrismaPg driver adapter under Prisma 7.
   */
  private get staticModelMeta() {
    return getModelMeta(this.modelName);
  }

  protected modelHasField(fieldName: string): boolean {
    const meta = this.staticModelMeta;
    if (!meta) {
      // Model not in static map (shouldn't happen in production; fail open).
      return true;
    }
    return (
      (meta.allFields as ReadonlyArray<string>).includes(fieldName) ||
      meta.listFields.includes(fieldName)
    );
  }

  /** Whether this service's Prisma model declares a concrete scalar/relation field. */
  public supportsField(fieldName: string): boolean {
    return this.staticModelMeta !== undefined && this.modelHasField(fieldName);
  }

  private assertProjectionFields(
    projection: Record<string, unknown> | undefined,
    kind: 'include' | 'select',
  ): void {
    if (!projection || !this.staticModelMeta) {
      return;
    }

    for (const fieldName of Object.keys(projection)) {
      if (fieldName === '_count') {
        continue;
      }
      if (!this.modelHasField(fieldName)) {
        throw new ValidationException(
          `Invalid Prisma ${kind} field "${fieldName}" on model "${this.modelName}"`,
        );
      }
    }
  }

  private populateToInclude(
    populate: PopulateInput,
  ): Record<string, unknown> | undefined {
    const include = populateToInclude(populate);
    this.assertProjectionFields(include, 'include');
    return include;
  }

  /**
   * Returns a RuntimeModelField-shaped object for `fieldName` when the field
   * exists in the static metadata, or `undefined` when it does not.
   */
  private getRuntimeField(fieldName: string): RuntimeModelField | undefined {
    const meta = this.staticModelMeta;
    if (!meta) {
      return undefined;
    }

    const enumMeta = meta.enumFields[fieldName];
    if (enumMeta) {
      return {
        kind: 'enum',
        name: fieldName,
        type: enumMeta.enumType,
        isRequired: enumMeta.isRequired,
      };
    }

    // Field exists but is not an enum.
    if ((meta.allFields as ReadonlyArray<string>).includes(fieldName)) {
      return { kind: 'scalar', name: fieldName };
    }

    return undefined;
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
    if (!this.staticModelMeta) {
      return;
    }

    const structuralKeys = new Set(['OR', 'AND', 'NOT', 'isDeleted']);
    for (const key of Object.keys(where)) {
      if (structuralKeys.has(key)) {
        continue;
      }
      if (!this.modelHasField(key)) {
        this.logger?.warn(
          `Filter references unknown field "${key}" on model "${this.modelName}" — it will not match in Prisma. Fix the controller's buildFindAllQuery (or add the column).`,
          { field: key, model: this.modelName, operation: 'findAll' },
        );
      }
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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
    if (!this.modelHasField('isDeleted')) {
      return where;
    }

    if (params && 'isDeleted' in params) {
      return where;
    }

    // Default first so an explicit value already present in `where` wins —
    // the reverse spread silently clobbered `isDeleted: true` reads.
    return {
      isDeleted: false,
      ...where,
    };
  }

  private normalizeSort(
    sort:
      | AggregationOptions['sort']
      | PrismaOrderByInput
      | PrismaOrderByInput[]
      | undefined,
  ): PrismaOrderBy[] {
    if (!sort || typeof sort !== 'object') {
      return [{ createdAt: 'desc' }];
    }

    const toEntry = ([key, dir]: [string, unknown]): PrismaOrderBy => ({
      [key]: dir === 1 || dir === 'asc' ? 'asc' : 'desc',
    });

    // Emit an ARRAY of single-key entries. Prisma rejects a multi-key orderBy
    // object ("Expected ...OrderByWithRelationInput[], provided Object") since
    // object key order is not guaranteed; the array form is required for
    // deterministic multi-field sorting. Already-array input (the multi-field
    // sort path) is flattened to the same single-key entry shape.
    if (Array.isArray(sort)) {
      return sort.flatMap((entry) => Object.entries(entry).map(toEntry));
    }

    return Object.entries(sort).map(toEntry);
  }

  private getPrismaEnumValues(
    enumName: string | undefined,
  ): Set<string> | null {
    if (!enumName) {
      return null;
    }

    const enumObject = (PrismaEnums as unknown as Record<string, unknown>)[
      enumName
    ];

    if (!this.isPlainObject(enumObject)) {
      return null;
    }

    const values = Object.values(enumObject).filter(
      (value): value is string => typeof value === 'string',
    );

    return values.length > 0 ? new Set(values) : null;
  }

  private toPrismaEnumCandidate(enumName: string, value: string): string {
    const trimmed = value.trim();
    const alias = PRISMA_ENUM_ALIASES[enumName]?.[trimmed.toLowerCase()];

    if (alias) {
      return alias;
    }

    return trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  private normalizeEnumScalarValue(fieldName: string, value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const field = this.getRuntimeField(fieldName);
    if (field?.kind !== 'enum' || !field.type) {
      return value;
    }

    const enumValues = this.getPrismaEnumValues(field.type);
    const candidate = this.toPrismaEnumCandidate(field.type, value);

    if (!enumValues) {
      return candidate;
    }

    if (enumValues.has(value)) {
      return value;
    }

    return enumValues.has(candidate) ? candidate : value;
  }

  private fieldAllowsNull(fieldName: string): boolean {
    const field = this.getRuntimeField(fieldName);
    return field ? field.isRequired !== true : true;
  }

  private normalizeOperatorValue(fieldName: string, value: unknown): unknown {
    if (!this.isPlainObject(value)) {
      return this.normalizeEnumScalarValue(fieldName, value);
    }

    const operators = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    let sawOperator = false;
    const normalizeMaybeList = (operatorValue: unknown): unknown =>
      Array.isArray(operatorValue)
        ? operatorValue
            .map((entry) => this.normalizeOperatorValue(fieldName, entry))
            .filter((entry) => entry !== undefined)
        : this.normalizeOperatorValue(fieldName, operatorValue);
    const assignOperator = (operator: string, operatorValue: unknown): void => {
      sawOperator = true;
      if (operatorValue !== undefined) {
        normalized[operator] = operatorValue;
      }
    };

    for (const operator of NORMALIZED_PRISMA_FILTER_OPERATORS) {
      if (operator in operators) {
        assignOperator(operator, normalizeMaybeList(operators[operator]));
      }
    }
    if ('not' in operators) {
      if (operators.not === null && !this.fieldAllowsNull(fieldName)) {
        sawOperator = true;
      } else {
        assignOperator(
          'not',
          this.isPlainObject(operators.not)
            ? this.normalizeOperatorValue(fieldName, operators.not)
            : normalizeMaybeList(operators.not),
        );
      }
    }
    for (const operator of PASSTHROUGH_PRISMA_FILTER_OPERATORS) {
      if (operator in operators) {
        assignOperator(operator, operators[operator]);
      }
    }
    if ('mode' in operators) {
      assignOperator(
        'mode',
        operators.mode === 'i' ? 'insensitive' : operators.mode,
      );
    }

    if (sawOperator && Object.keys(normalized).length === 0) {
      return undefined;
    }

    return Object.keys(normalized).length ? normalized : value;
  }

  protected normalizeWhere(where: PrismaFilter = {}): PrismaFilter {
    const normalized = where;
    const result: PrismaFilter = {};

    for (const [key, value] of Object.entries(normalized)) {
      if (key === 'OR' || key === 'AND') {
        if (!Array.isArray(value)) {
          result[key] = value;
          continue;
        }

        const normalizedEntries = value
          .map((entry) =>
            this.normalizeWhere(
              this.isPlainObject(entry) ? entry : ({} as PrismaFilter),
            ),
          )
          // Drop entries that normalized to `{}` (every key was an unknown
          // relation alias the model lacks). An empty object inside OR matches
          // every row — a tenancy-broadening leak — so it must be removed.
          .filter((entry) => Object.keys(entry).length > 0);

        // Omit the operator entirely if nothing survives, rather than emit an
        // empty `OR: []` (which Prisma treats as match-none).
        if (normalizedEntries.length > 0) {
          result[key] = normalizedEntries;
        }
        continue;
      }

      const normalizedValue = this.normalizeOperatorValue(key, value);
      if (normalizedValue !== undefined) {
        result[key] = normalizedValue;
      }
    }

    return result;
  }

  protected normalizeData(data: unknown): PrismaUpdate {
    if (!this.isPlainObject(data)) {
      return data as PrismaUpdate;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Nest DTO instances materialize omitted fields as own properties holding
      // `undefined`. Prisma rejects those keys; drop them before write.
      if (value === undefined) {
        continue;
      }

      const normalizedValue = this.normalizeOperatorValue(key, value);
      if (normalizedValue !== undefined) {
        result[key] = normalizedValue;
      }
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
      'include' in explicitInput ||
      'select' in explicitInput
    ) {
      return {
        include: explicitInput.include,
        orderBy: explicitInput.orderBy
          ? this.normalizeSort(explicitInput.orderBy)
          : undefined,
        select: explicitInput.select,
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
      const findAllInput = this.resolveFindAllInput(input, options);
      const orderBy = findAllInput.orderBy ?? this.normalizeSort(options.sort);
      const rawWhere = findAllInput.where ?? {};
      const where = this.withSoftDeleteFilter(
        this.normalizeWhere(rawWhere),
        rawWhere,
      );
      this.auditUnknownFilterFields(where);
      const include = findAllInput.include;
      const select = findAllInput.select;
      this.assertProjectionFields(include, 'include');
      this.assertProjectionFields(select, 'select');
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

    const orderBy = Object.entries(sort).map(([key, dir]) => ({
      [key]: dir === 1 ? 'asc' : 'desc',
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
