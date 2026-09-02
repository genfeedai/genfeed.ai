import { ValidationException } from '@api/exceptions/validation.exception';
import type { PopulateOption } from '@genfeedai/interfaces';
import * as PrismaEnums from '@genfeedai/prisma';
import { getModelMeta } from '@genfeedai/prisma';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import type { LoggerService } from '@libs/logger/logger.service';

export type PrismaFilter = Record<string, unknown>;
export type PrismaUpdate = Record<string, unknown>;
export type PopulateInput = (string | PopulateOption)[] | 'none';

type PrismaOrderDirection = 'asc' | 'desc' | number;
type PrismaOrderByInput = Record<string, PrismaOrderDirection>;
type PrismaOrderBy = Record<string, 'asc' | 'desc'>;

export interface PrismaFindAllInput {
  where?: PrismaFilter;
  orderBy?: PrismaOrderByInput | PrismaOrderByInput[];
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

type RuntimeModelField = {
  isRequired?: boolean;
  kind?: string;
  name: string;
  type?: string;
};

type BaseQueryNormalizationHooks = {
  modelHasField?: (fieldName: string) => boolean;
  normalizeWhere?: (where: PrismaFilter) => PrismaFilter;
};

/**
 * Explicit app-value to Prisma-enum-value overrides, keyed by Prisma enum type.
 * Generic casing handles values not listed here.
 */
const PRISMA_ENUM_ALIASES: Record<string, Record<string, string>> = {
  ArticleStatus: {
    // `public` is the legacy app alias for Prisma's PUBLISHED value.
    public: 'PUBLISHED',
    published: 'PUBLISHED',
  },
  ApiKeyCategory: {
    // Generic casing cannot split `opuspro` into OPUS_PRO.
    opuspro: 'OPUS_PRO',
  },
  IngredientStatus: {
    // `completed` was the legacy status name; Prisma stores GENERATED.
    completed: 'GENERATED',
  },
  PromptCategory: {
    // This older client slug differs from the derived enum spelling.
    'models-prompt-genfeedai': 'MODELS_PROMPT_TRAINING',
  },
  SubscriptionStatus: {
    // Stripe sends US `canceled`; Prisma stores UK `CANCELLED`.
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
 * Converts transport-level query shapes into safe, deterministic Prisma input.
 * This is a plain adapter because BaseService subclasses construct through Nest
 * today and adding another injected dependency would change their contract.
 */
export class BaseQueryNormalizationAdapter {
  constructor(
    private readonly modelName: string,
    private readonly logger?: LoggerService,
    private readonly hooks: BaseQueryNormalizationHooks = {},
  ) {}

  private get staticModelMeta() {
    return getModelMeta(this.modelName);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private fieldExists(fieldName: string): boolean {
    return (
      this.hooks.modelHasField?.(fieldName) ?? this.modelHasField(fieldName)
    );
  }

  public modelHasField(fieldName: string): boolean {
    // Recursion floor: the BaseService hook delegates here, so this method must
    // read metadata directly instead of dispatching through fieldExists().
    const meta = this.staticModelMeta;
    if (!meta) {
      // Model not in the static map should never happen in production. Fail open.
      return true;
    }

    return (
      (meta.allFields as ReadonlyArray<string>).includes(fieldName) ||
      meta.listFields.includes(fieldName)
    );
  }

  public supportsField(fieldName: string): boolean {
    return this.staticModelMeta !== undefined && this.fieldExists(fieldName);
  }

  public assertProjectionFields(
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
      if (!this.fieldExists(fieldName)) {
        throw new ValidationException(
          `Invalid Prisma ${kind} field "${fieldName}" on model "${this.modelName}"`,
        );
      }
    }
  }

  private toRelationSelection(option: PopulateOption): unknown {
    const nested = option.populate
      ? {
          [option.populate.path]: this.toRelationSelection(option.populate),
        }
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
  }

  public populateToInclude(
    populate: PopulateInput,
  ): Record<string, unknown> | undefined {
    if (populate === 'none' || !populate.length) {
      return undefined;
    }

    const include = Object.fromEntries(
      populate.map((option) =>
        typeof option === 'string'
          ? [option, true]
          : [option.path, this.toRelationSelection(option)],
      ),
    );
    this.assertProjectionFields(include, 'include');
    return include;
  }

  private getRuntimeField(fieldName: string): RuntimeModelField | undefined {
    const meta = this.staticModelMeta;
    if (!meta) {
      return undefined;
    }

    const enumMeta = meta.enumFields[fieldName];
    if (enumMeta) {
      return {
        isRequired: enumMeta.isRequired,
        kind: 'enum',
        name: fieldName,
        type: enumMeta.enumType,
      };
    }

    if ((meta.allFields as ReadonlyArray<string>).includes(fieldName)) {
      return { kind: 'scalar', name: fieldName };
    }

    return undefined;
  }

  public auditUnknownFilterFields(where: PrismaFilter = {}): void {
    if (!this.staticModelMeta) {
      return;
    }

    const structuralKeys = new Set(['OR', 'AND', 'NOT', 'isDeleted']);
    for (const key of Object.keys(where)) {
      if (structuralKeys.has(key)) {
        continue;
      }
      if (!this.fieldExists(key)) {
        this.logger?.warn(
          `Filter references unknown field "${key}" on model "${this.modelName}" — it will not match in Prisma. Fix the controller's buildFindAllQuery (or add the column).`,
          { field: key, model: this.modelName, operation: 'findAll' },
        );
      }
    }
  }

  public withSoftDeleteFilter(
    where: PrismaFilter = {},
    params: PrismaFilter = where,
  ): PrismaFilter {
    if (!this.fieldExists('isDeleted')) {
      return where;
    }

    if (params && 'isDeleted' in params) {
      return where;
    }

    return {
      isDeleted: false,
      ...where,
    };
  }

  public normalizeSort(
    sort:
      | AggregationOptions['sort']
      | PrismaOrderByInput
      | PrismaOrderByInput[]
      | undefined,
  ): PrismaOrderBy[] {
    if (!sort || typeof sort !== 'object') {
      return [{ createdAt: 'desc' }];
    }

    const toEntry = ([key, direction]: [string, unknown]): PrismaOrderBy => ({
      [key]: direction === 1 || direction === 'asc' ? 'asc' : 'desc',
    });

    // Prisma's array form preserves deterministic multi-field precedence;
    // a multi-key object does not provide the required ordering contract.
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
    return alias ?? trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
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

  public normalizeWhere(where: PrismaFilter = {}): PrismaFilter {
    const result: PrismaFilter = {};

    for (const [key, value] of Object.entries(where)) {
      if (key === 'OR' || key === 'AND') {
        if (!Array.isArray(value)) {
          result[key] = value;
          continue;
        }

        // Prisma treats an explicit empty OR as a no-match filter. Preserve it
        // instead of broadening the query by dropping the operator.
        if (key === 'OR' && value.length === 0) {
          result[key] = value;
          continue;
        }

        const normalizeNested =
          this.hooks.normalizeWhere ??
          ((entry: PrismaFilter) => this.normalizeWhere(entry));
        const normalizedEntries = value
          .map((entry) =>
            normalizeNested(this.isPlainObject(entry) ? entry : {}),
          )
          // A normalized `{}` inside OR matches every row, which can broaden a
          // tenant-scoped query. Remove empty branches before emitting Prisma input.
          .filter((entry) => Object.keys(entry).length > 0);
        // Omit a nonempty operator when no normalized branch survives.
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

  public normalizeData(data: unknown): PrismaUpdate {
    if (!this.isPlainObject(data)) {
      return data as PrismaUpdate;
    }

    const result: PrismaUpdate = {};
    for (const [key, value] of Object.entries(data)) {
      // Nest DTO instances materialize omitted fields as own `undefined`
      // properties, which Prisma rejects on writes.
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
      Object.entries(options).filter(
        ([key, value]) =>
          !PAGINATION_OPTION_KEYS.has(key) && value !== undefined,
      ),
    );
  }

  public resolveFindAllInput(
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
}
