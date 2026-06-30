import { ConfigService } from '@api/config/config.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { QueryBuilder } from '@api/helpers/utils/query-builder.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AggregationCacheUtil } from '@api/shared/utils/aggregation-cache/aggregation-cache.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { PopulateOption } from '@genfeedai/interfaces';
import * as PrismaEnums from '@genfeedai/prisma';
import { getModelMeta } from '@genfeedai/prisma';
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

type PrismaOrderDirection = 'asc' | 'desc' | number;
type PrismaOrderByInput = Record<string, PrismaOrderDirection>;
type PrismaOrderBy = Record<string, 'asc' | 'desc'>;
/**
 * @deprecated Internal shape kept only for backward-compatible method signatures.
 * All runtime field lookups now use the static PRISMA_MODEL_METADATA map via
 * `getModelMeta()` from `@genfeedai/prisma`. The `_runtimeDataModel` property
 * on PrismaService is NOT populated by the PrismaPg driver adapter (Prisma 7)
 * and must not be relied on.
 */
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
 * Returns stay `any` — Prisma generates concrete return types per model, but
 * BaseService operates generically across all models via `prisma[modelName]`.
 * Default `TWhere = PrismaFilter` keeps the delegate loose for services that
 * have not opted into the typed where yet.
 */
type PrismaDelegate<TWhere = PrismaFilter> = {
  // biome-ignore lint/suspicious/noExplicitAny: concrete return types per model
  findMany: (args?: PrismaDelegateArgs<TWhere>) => Promise<any[]>;
  // biome-ignore lint/suspicious/noExplicitAny: concrete return types per model
  findFirst: (args?: PrismaDelegateArgs<TWhere>) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: concrete return types per model
  findUnique: (args?: PrismaDelegateArgs<TWhere>) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: concrete return types per model
  create: (args: Record<string, unknown>) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: concrete return types per model
  update: (args: PrismaDelegateArgs<TWhere>) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: concrete return types per model
  updateMany: (args: PrismaDelegateArgs<TWhere>) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: concrete return types per model
  delete: (args: PrismaDelegateArgs<TWhere>) => Promise<any>;
  count: (args?: PrismaDelegateArgs<TWhere>) => Promise<number>;
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
  protected get delegate(): PrismaDelegate<TWhere> {
    return (this.prisma as unknown as Record<string, PrismaDelegate<TWhere>>)[
      this.modelName
    ];
  }

  /**
   * BaseService-internal delegate: `where` stays the loose `PrismaFilter`. The
   * base builds dynamic where clauses from untyped HTTP input (the runtime audit
   * covers field validity there), so narrowing `TWhere` in a subclass must not
   * reject the base's own generic plumbing.
   */
  private get internalDelegate(): PrismaDelegate<PrismaFilter> {
    return (
      this.prisma as unknown as Record<string, PrismaDelegate<PrismaFilter>>
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
    return (meta.allFields as ReadonlyArray<string>).includes(fieldName);
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

    if ('equals' in operators) {
      assignOperator('equals', normalizeMaybeList(operators.equals));
    }
    if ('set' in operators) {
      assignOperator('set', normalizeMaybeList(operators.set));
    }
    if ('in' in operators) {
      assignOperator('in', normalizeMaybeList(operators.in));
    }
    if ('notIn' in operators) {
      assignOperator('notIn', normalizeMaybeList(operators.notIn));
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
    if ('gte' in operators) {
      assignOperator('gte', operators.gte);
    }
    if ('gt' in operators) {
      assignOperator('gt', operators.gt);
    }
    if ('lte' in operators) {
      assignOperator('lte', operators.lte);
    }
    if ('lt' in operators) {
      assignOperator('lt', operators.lt);
    }
    if ('contains' in operators) {
      assignOperator('contains', operators.contains);
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
    const normalized = this.processSearchParams(where);
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
      // Belt-and-suspenders remap: legacy call sites on the ingredient↔metadata
      // relation write `{ metadata: someId }` (Mongo-style). The Prisma column is
      // `metadataId` (scalar FK). We remap ONLY the exact key `"metadata"` when
      // its value is a non-empty string to avoid Prisma silently dropping the
      // relation key and writing NULL. All other keys — including `organization`,
      // `user`, `brand`, `prompt`, `parent`, `folder` — are intentionally left
      // untouched; their callers either already use the correct scalar FK or pass
      // Prisma connect objects. Scoped narrowly to prevent tenancy/ownership side-
      // effects from a broad remap.
      if (key === 'metadata' && typeof value === 'string' && value.length > 0) {
        result['metadataId'] = value;
        continue;
      }

      result[key] = this.normalizeOperatorValue(key, value);
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

      const include = populateToInclude(populate);
      const doc = await this.internalDelegate.create({
        data: this.normalizeData(createDto),
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
    enableCache: boolean = true,
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
      this.auditUnknownFilterFields(where);
      const include = findAllInput.include;
      const select = findAllInput.select;
      const projection = select ? { select } : include ? { include } : {};

      const cacheKey =
        enableCache && this.cacheService
          ? AggregationCacheUtil.generateCacheKey(
              this.collectionName,
              [
                {
                  include: include ?? null,
                  orderBy,
                  select: select ?? null,
                  where,
                },
              ],
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
    const where = this.normalizeWhere(params);
    const include = populateToInclude(populate);
    const docs = await this.internalDelegate.findMany({
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

      const where = this.normalizeWhere(params);
      const include = populateToInclude(populate);

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

      const include = populateToInclude(populate);
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

      const result = await this.internalDelegate.updateMany({
        where: {
          ...this.normalizeWhere(filter),
          isDeleted: (filter as Record<string, unknown>).isDeleted ?? false,
        },
        data: this.normalizeData(update),
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

      if (
        key in legacyRelationFields &&
        (typeof value === 'string' || value === null)
      ) {
        const relationKey = key as keyof typeof legacyRelationFields;
        const scalarKey = legacyRelationFields[relationKey];

        // Map the legacy relation alias to its scalar FK for BOTH id strings and
        // explicit nulls (global / unowned items use `{ organization: null }`).
        // Null must be mapped too — otherwise the raw relation name reaches
        // Prisma and throws "Unknown argument `organization`" for models that
        // only expose the scalar FK (e.g. FontFamilyRecord, Tag.user).
        if (this.modelHasField(scalarKey)) {
          processed[scalarKey] = value;
          continue;
        }

        if (this.modelHasField(relationKey)) {
          processed[relationKey] =
            typeof value === 'string' ? { is: { id: value } } : value;
          continue;
        }

        // Model exposes neither the scalar FK nor the relation — drop the
        // condition instead of emitting an unknown argument.
        continue;
      }

      const scalarRelationKey = `${key}Id`;
      const shouldMapRelationObject =
        this.isPlainObject(value) &&
        Object.keys(value).some((operator) => operator.startsWith('$'));

      if (
        (typeof value === 'string' ||
          value === null ||
          shouldMapRelationObject) &&
        this.modelHasField(scalarRelationKey)
      ) {
        processed[scalarRelationKey] = value;
        continue;
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
    const include = populateToInclude(populate);

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
