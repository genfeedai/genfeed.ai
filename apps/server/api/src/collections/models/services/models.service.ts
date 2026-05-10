import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const MODEL_CONFIG_FIELDS = new Set([
  'aspectRatios',
  'capabilities',
  'category',
  'cost',
  'costPerUnit',
  'costTier',
  'defaultAspectRatio',
  'defaultDuration',
  'deprecatedAt',
  'description',
  'discoveredAt',
  'durations',
  'hasAudioToggle',
  'hasDurationEditing',
  'hasEndFrame',
  'hasInterpolation',
  'hasResolutionOptions',
  'hasSpeech',
  'inputCostPerMillionTokens',
  'isBatchSupported',
  'isDefault',
  'isDeprecated',
  'isDiscovered',
  'isHighlighted',
  'isImagenModel',
  'isLegacy',
  'isPublic',
  'isReferencesMandatory',
  'key',
  'lastSyncedAt',
  'margin',
  'maxDimensions',
  'maxOutputs',
  'maxReferences',
  'minCost',
  'minDimensions',
  'outputCostPerMillionTokens',
  'parentModel',
  'predecessorOf',
  'pricingType',
  'provider',
  'providerConfig',
  'providerCostUsd',
  'qualityTier',
  'recommendedFor',
  'speedTier',
  'succeededBy',
  'supportsFeatures',
  'training',
  'trigger',
  'triggerWord',
  'usesOrientation',
]);

const MODEL_PRISMA_FIELDS = new Set([
  'config',
  'createdAt',
  'externalId',
  'id',
  'isActive',
  'isDeleted',
  'label',
  'mongoId',
  'organizationId',
  'parentModelId',
  'trainingId',
  'updatedAt',
]);

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

type ModelPrismaRecord = Record<string, unknown> & {
  config?: unknown;
  id?: string;
  mongoId?: string | null;
  organizationId?: string | null;
};

type FindAvailableModelsParams = {
  category?: string;
  enabledModelIds?: string[];
  isActive?: boolean;
  organizationId?: string;
};

@Injectable()
export class ModelsService extends BaseService<
  ModelDocument,
  CreateModelDto,
  UpdateModelDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'model', logger);
  }

  private isModelRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private getConfig(document: unknown): Record<string, unknown> {
    if (!this.isModelRecord(document)) {
      return {};
    }

    return this.isModelRecord(document.config) ? document.config : {};
  }

  private readModelValue(document: unknown, field: string): unknown {
    if (!this.isModelRecord(document)) {
      return undefined;
    }

    if (document[field] !== undefined) {
      return document[field];
    }

    return this.getConfig(document)[field];
  }

  private normalizeModelDocument(document: unknown): ModelDocument {
    const normalized = this.normalizeDocument(document) as Record<
      string,
      unknown
    >;

    if (
      normalized.training === undefined &&
      typeof normalized.trainingId === 'string'
    ) {
      normalized.training = normalized.trainingId;
    }

    if (
      normalized.parentModel === undefined &&
      typeof normalized.parentModelId === 'string'
    ) {
      normalized.parentModel = normalized.parentModelId;
    }

    return normalized as ModelDocument;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async resolveOrganizationSlug(
    organizationId: string,
  ): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      select: { label: true, slug: true },
      where: { id: organizationId },
    });

    return (
      this.readString(organization?.slug) ??
      this.slugify(this.readString(organization?.label) ?? organizationId) ??
      organizationId
    );
  }

  private getTrainingId(training: TrainingDocument): string {
    const trainingId =
      this.readString(training._id) ?? this.readString(training.id);
    if (!trainingId) {
      throw new Error('Training id is required to create a model');
    }

    return trainingId;
  }

  private getTrainingConfig(
    training: TrainingDocument,
  ): Record<string, unknown> {
    return this.isModelRecord(training.config) ? training.config : {};
  }

  private getTrainingModelKey(training: TrainingDocument): string | undefined {
    const config = this.getTrainingConfig(training);
    return (
      this.readString(config.baseModel) ??
      this.readString(training.baseModel) ??
      this.readString(config.model) ??
      this.readString(training.model)
    );
  }

  private splitModelData(
    data: Record<string, unknown>,
    existingConfig: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const nextData: Record<string, unknown> = {};
    const nextConfig: Record<string, unknown> = { ...existingConfig };

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        continue;
      }

      if (key === 'organization' && typeof value === 'string') {
        nextData.organizationId = value;
        continue;
      }

      if (key === 'parentModel' && typeof value === 'string') {
        nextData.parentModelId = value;
        nextConfig.parentModel = value;
        continue;
      }

      if (key === 'training' && typeof value === 'string') {
        nextData.trainingId = value;
        nextConfig.training = value;
        continue;
      }

      if (MODEL_PRISMA_FIELDS.has(key)) {
        nextData[key] = value;
        continue;
      }

      if (MODEL_CONFIG_FIELDS.has(key)) {
        nextConfig[key] = value;
        continue;
      }
    }

    nextData.config = nextConfig;
    return nextData;
  }

  private normalizeWhereForModel(where: Record<string, unknown>): {
    configWhere: Record<string, unknown>;
    dbWhere: Record<string, unknown>;
  } {
    const dbWhere: Record<string, unknown> = {};
    const configWhere: Record<string, unknown> = {};

    // Collect _id expansion and caller OR/AND separately so they don't overwrite
    // each other. Both are merged under a top-level AND clause at the end.
    let idOrClause: Array<Record<string, unknown>> | undefined;
    let callerOrClause: unknown;
    let callerAndClause: unknown;

    for (const [key, value] of Object.entries(where)) {
      if (key === 'OR') {
        callerOrClause = Array.isArray(value)
          ? value
              .map((entry) =>
                this.isModelRecord(entry)
                  ? this.normalizeWhereForModel(entry).dbWhere
                  : {},
              )
              .filter((entry) => Object.keys(entry).length > 0)
          : value;
        continue;
      }

      if (key === 'AND') {
        callerAndClause = Array.isArray(value)
          ? value
              .map((entry) =>
                this.isModelRecord(entry)
                  ? this.normalizeWhereForModel(entry).dbWhere
                  : {},
              )
              .filter((entry) => Object.keys(entry).length > 0)
          : value;
        continue;
      }

      if (key === '_id') {
        idOrClause = [{ id: value }, { mongoId: value }];
        continue;
      }

      if (key === 'organization') {
        // Map both string values and explicit null to organizationId
        dbWhere.organizationId = typeof value === 'string' ? value : null;
        continue;
      }

      if (key === 'parentModel' && typeof value === 'string') {
        dbWhere.parentModelId = value;
        continue;
      }

      if (key === 'training' && typeof value === 'string') {
        dbWhere.trainingId = value;
        continue;
      }

      if (MODEL_PRISMA_FIELDS.has(key)) {
        dbWhere[key] = value;
        continue;
      }

      if (MODEL_CONFIG_FIELDS.has(key)) {
        configWhere[key] = value;
      }
    }

    // Combine _id OR-expansion and caller OR/AND under AND so neither overwrites
    // the other. If there is only one constraint, hoist it to avoid unnecessary
    // nesting.
    const andClauses: Array<Record<string, unknown>> = [];

    if (idOrClause) {
      andClauses.push({ OR: idOrClause });
    }

    if (callerOrClause !== undefined) {
      andClauses.push({ OR: callerOrClause as never });
    }

    if (callerAndClause !== undefined) {
      andClauses.push({ AND: callerAndClause as never });
    }

    if (andClauses.length === 1) {
      const [single] = andClauses;
      Object.assign(dbWhere, single);
    } else if (andClauses.length > 1) {
      const existingAnd = Array.isArray(dbWhere.AND) ? dbWhere.AND : [];
      dbWhere.AND = [
        ...(existingAnd as Array<Record<string, unknown>>),
        ...andClauses,
      ];
    }

    return { configWhere, dbWhere };
  }

  private matchesOperator(value: unknown, filter: unknown): boolean {
    if (!this.isModelRecord(filter)) {
      return value === filter;
    }

    if ('in' in filter && Array.isArray(filter.in)) {
      return filter.in.includes(value);
    }

    if ('not' in filter) {
      return value !== filter.not;
    }

    if ('notIn' in filter && Array.isArray(filter.notIn)) {
      return !filter.notIn.includes(value);
    }

    return value === filter;
  }

  private matchesConfigWhere(
    model: ModelPrismaRecord,
    configWhere: Record<string, unknown>,
  ): boolean {
    return Object.entries(configWhere).every(([key, filter]) =>
      this.matchesOperator(this.readModelValue(model, key), filter),
    );
  }

  private sortModels(
    models: ModelDocument[],
    orderBy: Record<string, 'asc' | 'desc' | 1 | -1> = { createdAt: -1 },
  ): ModelDocument[] {
    const entries = Object.entries(orderBy);

    return [...models].sort((a, b) => {
      for (const [field, direction] of entries) {
        const aValue = this.readModelValue(a, field);
        const bValue = this.readModelValue(b, field);
        if (aValue === bValue) continue;

        const multiplier = direction === 'asc' || direction === 1 ? 1 : -1;
        return (
          String(aValue ?? '').localeCompare(String(bValue ?? '')) * multiplier
        );
      }

      return 0;
    });
  }

  private extractModelOptionsWhere(
    options: AggregationOptions,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(options).filter(
        ([key, value]) =>
          !PAGINATION_OPTION_KEYS.has(key) && value !== undefined,
      ),
    );
  }

  private getFindAllWhere(
    input: unknown,
    options: AggregationOptions,
  ): Record<string, unknown> {
    const inputWhere =
      this.isModelRecord(input) && this.isModelRecord(input.where)
        ? input.where
        : this.isModelRecord(input)
          ? input
          : {};

    return {
      ...inputWhere,
      ...this.extractModelOptionsWhere(options),
    };
  }

  private getFindAllOrderBy(
    input: unknown,
    options: AggregationOptions,
  ): Record<string, 'asc' | 'desc' | 1 | -1> {
    if (this.isModelRecord(input) && this.isModelRecord(input.orderBy)) {
      return input.orderBy as Record<string, 'asc' | 'desc' | 1 | -1>;
    }

    if (this.isModelRecord(options.sort)) {
      return options.sort as Record<string, 'asc' | 'desc' | 1 | -1>;
    }

    return { createdAt: -1 };
  }

  /**
   * Find a single model by filter.
   * Supports querying by id, key, isDeleted, isActive, and organizationId.
   *
   * Security: always enforces isDeleted: false unless the caller explicitly
   * passes a different value. When organizationId is supplied the result is
   * restricted to models that belong to that org OR are global (null org).
   */
  override async findOne(
    params: Record<string, unknown>,
  ): Promise<ModelDocument | null> {
    const scopedParams: Record<string, unknown> = {
      isDeleted: false,
      ...params,
    };

    // When an organizationId is supplied, restrict to org-owned or global models
    // to prevent cross-tenant reads.
    const organizationId = scopedParams.organizationId;
    if (organizationId !== undefined && organizationId !== null) {
      delete scopedParams.organizationId;
      const existingOr = Array.isArray(scopedParams.OR)
        ? (scopedParams.OR as Array<Record<string, unknown>>)
        : undefined;

      const orgVisibilityOr: Array<Record<string, unknown>> = [
        { organizationId },
        { organizationId: null },
      ];

      if (existingOr) {
        scopedParams.AND = [{ OR: existingOr }, { OR: orgVisibilityOr }];
        delete scopedParams.OR;
      } else {
        scopedParams.OR = orgVisibilityOr;
      }
    }

    const { configWhere, dbWhere } = this.normalizeWhereForModel(scopedParams);

    const models = await this.prisma.model.findMany({
      where: dbWhere as never,
    });
    const match = models.find((model) =>
      this.matchesConfigWhere(model as ModelPrismaRecord, configWhere),
    );

    return match ? this.normalizeModelDocument(match) : null;
  }

  override async create(
    createDto: CreateModelDto,
    populate: Parameters<BaseService<ModelDocument>['create']>[1] = [],
  ): Promise<ModelDocument> {
    return super.create(
      this.splitModelData(
        createDto as unknown as Record<string, unknown>,
      ) as never,
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateModelDto> | Record<string, unknown>,
    populate: Parameters<BaseService<ModelDocument>['patch']>[2] = [],
  ): Promise<ModelDocument> {
    const existing = await this.findOne({ _id: id });
    const data = this.splitModelData(
      updateDto as Record<string, unknown>,
      this.getConfig(existing),
    );

    return super.patch(id, data as never, populate);
  }

  override async findAll(
    input: unknown,
    options: AggregationOptions,
  ): Promise<AggregatePaginateResult<ModelDocument>> {
    const where = this.getFindAllWhere(input, options);
    const { configWhere, dbWhere } = this.normalizeWhereForModel(where);
    const orderBy = this.getFindAllOrderBy(input, options);

    const docs = (await this.prisma.model.findMany({
      where: dbWhere as never,
    })) as unknown as ModelPrismaRecord[];

    const filtered = docs
      .filter((model) => this.matchesConfigWhere(model, configWhere))
      .map((model) => this.normalizeModelDocument(model));
    const sorted = this.sortModels(filtered, orderBy);

    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const isPaginated = options.pagination !== false;
    const pageDocs = isPaginated
      ? sorted.slice((page - 1) * limit, page * limit)
      : sorted;
    const totalPages = isPaginated ? Math.ceil(sorted.length / limit) : 1;

    return {
      docs: pageDocs,
      hasNextPage: isPaginated ? page * limit < sorted.length : false,
      hasPrevPage: isPaginated ? page > 1 : false,
      limit: isPaginated ? limit : sorted.length,
      nextPage: isPaginated && page * limit < sorted.length ? page + 1 : null,
      page: isPaginated ? page : 1,
      pagingCounter: isPaginated ? (page - 1) * limit + 1 : 1,
      prevPage: isPaginated && page > 1 ? page - 1 : null,
      totalDocs: sorted.length,
      totalPages,
    };
  }

  async updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<void> {
    const { configWhere, dbWhere } = this.normalizeWhereForModel(filter);
    const models = (await this.prisma.model.findMany({
      where: dbWhere as never,
    })) as unknown as ModelPrismaRecord[];

    await Promise.all(
      models
        .filter((model) => this.matchesConfigWhere(model, configWhere))
        .map((model) =>
          this.prisma.model.update({
            data: this.splitModelData(update, this.getConfig(model)) as never,
            where: { id: model.id as string },
          }),
        ),
    );
  }

  async count(filter: Record<string, unknown>): Promise<number> {
    const { configWhere, dbWhere } = this.normalizeWhereForModel(filter);
    const models = (await this.prisma.model.findMany({
      where: dbWhere as never,
    })) as unknown as ModelPrismaRecord[];

    return models.filter((model) => this.matchesConfigWhere(model, configWhere))
      .length;
  }

  async createFromTraining(training: TrainingDocument): Promise<ModelDocument> {
    const trainingId = this.getTrainingId(training);
    const existing = await this.prisma.model.findFirst({
      where: { trainingId },
    });

    if (existing) {
      return this.normalizeModelDocument(existing);
    }

    const organizationId =
      this.readString(training.organizationId) ??
      this.readString(training.organization);
    if (!organizationId) {
      throw new Error(`Training ${trainingId} is missing an organization`);
    }

    const config = this.getTrainingConfig(training);
    const trainingLabel = this.readString(training.label) ?? trainingId;
    const organizationSlug = await this.resolveOrganizationSlug(organizationId);
    const trainingSlug = this.slugify(trainingLabel) || trainingId;
    const parentModelKey = this.getTrainingModelKey(training);
    const parentModel = parentModelKey
      ? await this.findOne({ key: parentModelKey })
      : null;
    const parentConfig = this.getConfig(parentModel);
    const parentFeatures = this.readStringArray(parentConfig.supportsFeatures);
    const supportsFeatures = Array.from(
      new Set([...parentFeatures, 'lora-weights', 'trigger-word']),
    );
    const trainedModelVersion =
      this.readString(config.trainedModelVersion) ??
      this.readString(config.model) ??
      this.readString(training.model) ??
      this.readString(training.externalId);
    const triggerWord =
      this.readString(config.trigger) ?? this.readString(training.trigger);

    return this.create({
      category:
        this.readString(parentConfig.category) ??
        this.readString(config.category) ??
        ModelCategory.IMAGE,
      cost: typeof parentConfig.cost === 'number' ? parentConfig.cost : 1,
      externalId: trainedModelVersion,
      isActive: true,
      isDefault: false,
      isPublic: false,
      key: `genfeedai/${organizationSlug}/${trainingSlug}`,
      label: trainingLabel,
      organization: organizationId,
      parentModel: parentModel?._id ?? parentModel?.id,
      provider: ModelProvider.GENFEED_AI,
      supportsFeatures,
      training: trainingId,
      trigger: triggerWord,
      triggerWord,
    } as CreateModelDto);
  }

  /**
   * Find all active models (for use in organization settings initialization)
   */
  async findAllActive(
    filter?: Record<string, unknown>,
  ): Promise<ModelDocument[]> {
    const { configWhere, dbWhere } = this.normalizeWhereForModel({
      isActive: true,
      isDeleted: false,
      ...(filter ?? {}),
    });
    const models = (await this.prisma.model.findMany({
      where: dbWhere as never,
    })) as unknown as ModelPrismaRecord[];

    return models
      .filter((model) => this.matchesConfigWhere(model, configWhere))
      .map((model) => this.normalizeModelDocument(model));
  }

  async findAvailableModels(
    params: FindAvailableModelsParams = {},
  ): Promise<ModelDocument[]> {
    const where: Record<string, unknown> = {
      isActive: params.isActive ?? true,
      isDeleted: false,
    };

    if (params.organizationId) {
      where.OR = [
        { organizationId: null },
        { organizationId: params.organizationId },
      ];
    } else {
      where.organizationId = null;
    }

    const models = (await this.prisma.model.findMany({
      where: where as never,
    })) as unknown as ModelPrismaRecord[];
    const enabledSet = params.enabledModelIds
      ? new Set(params.enabledModelIds)
      : null;

    return models
      .filter((model) => {
        if (enabledSet && !enabledSet.has(String(model.id))) {
          return false;
        }

        if (params.category) {
          return this.readModelValue(model, 'category') === params.category;
        }

        return true;
      })
      .map((model) => this.normalizeModelDocument(model));
  }
}
