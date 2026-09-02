import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { ValidationException } from '@api/exceptions/validation.exception';
import { isReplicateSchemaFamilyCompatible } from '@api/services/integrations/replicate/services/replicate-contract';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
} from '@genfeedai/contracts';
import type {
  IModelProviderContractSnapshot,
  IModelProviderContracts,
} from '@genfeedai/contracts/interfaces';
import { withLiveModelCreditPricing } from '@genfeedai/pricing';
import type { Prisma, Model as PrismaModel } from '@genfeedai/prisma';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

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

const IMAGE_FAL_SCHEMA_FAMILIES = new Set([
  'image-edit-multi-v1',
  'image-edit-single-v1',
  'image-text-v1',
]);
const VIDEO_FAL_SCHEMA_FAMILIES = new Set(['video-image-v1', 'video-text-v1']);

function isFalSchemaFamilyCompatible(
  category: string,
  schemaFamily: string,
): boolean {
  if (IMAGE_FAL_SCHEMA_FAMILIES.has(schemaFamily)) {
    return [ModelCategory.IMAGE, ModelCategory.IMAGE_EDIT].includes(
      category as ModelCategory,
    );
  }
  if (VIDEO_FAL_SCHEMA_FAMILIES.has(schemaFamily)) {
    return [ModelCategory.VIDEO, ModelCategory.VIDEO_EDIT].includes(
      category as ModelCategory,
    );
  }
  return false;
}

type FindAvailableModelsParams = {
  category?: string;
  enabledModelIds?: string[];
  isActive?: boolean;
  organizationId?: string;
};

const PUBLIC_MODEL_CATALOG_SELECT = {
  aspectRatios: true,
  capabilities: true,
  category: true,
  cost: true,
  costPerUnit: true,
  costTier: true,
  defaultAspectRatio: true,
  defaultDuration: true,
  description: true,
  durations: true,
  id: true,
  isDefault: true,
  isHighlighted: true,
  key: true,
  label: true,
  maxOutputs: true,
  minCost: true,
  pricingType: true,
  provider: true,
  providerCostUsd: true,
  qualityTier: true,
  recommendedFor: true,
  speedTier: true,
  supportsFeatures: true,
} satisfies Prisma.ModelSelect;

type PublicModelCatalogRow = Prisma.ModelGetPayload<{
  select: typeof PUBLIC_MODEL_CATALOG_SELECT;
}>;

export type PublicModelCatalogDocument = Pick<
  PublicModelCatalogRow,
  | 'aspectRatios'
  | 'capabilities'
  | 'category'
  | 'costTier'
  | 'defaultAspectRatio'
  | 'defaultDuration'
  | 'description'
  | 'durations'
  | 'id'
  | 'isDefault'
  | 'isHighlighted'
  | 'key'
  | 'label'
  | 'maxOutputs'
  | 'provider'
  | 'qualityTier'
  | 'recommendedFor'
  | 'speedTier'
  | 'supportsFeatures'
> & { cost: number };

type PublicModelCatalogFilters = {
  category?: ModelCategory;
  provider?: ModelProvider;
};

type RegistryReviewPatch = Partial<UpdateModelDto> & {
  deprecatedAt?: Date;
  lastSyncedAt?: Date;
  rejectionReason?: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewStatus?: 'approved' | 'legacy' | 'pending' | 'rejected';
  reviewedProviderContractVersion?: string;
  pendingProviderContractVersion?: null;
  providerInputSchema?: Prisma.InputJsonValue;
  providerSchemaFamily?: string;
  providerSyncStatus?: string;
  pricingType?: string;
  providerCostUsd?: number;
  succeededBy?: string;
};

const SUCCESSOR_REQUIRED_LIFECYCLES = new Set<ModelLifecycle>([
  ModelLifecycle.LEGACY,
  ModelLifecycle.RETIRED,
]);

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

  private getProviderConfig(document: unknown): Record<string, unknown> {
    if (!this.isModelRecord(document)) {
      return {};
    }

    if (this.isModelRecord(document.config)) {
      return document.config;
    }
    return this.isModelRecord(document.providerConfig)
      ? document.providerConfig
      : {};
  }

  private normalizeModelDocument(document: PrismaModel): ModelDocument {
    const { config: _config, ...model } = document;
    // Virtual cost / costPerUnit / minCost: when providerCostUsd is present,
    // project live credits via applyMargin (admin marginMultiplier). DB still
    // stores providerCostUsd + optional baked fallbacks; UI/API always see
    // margin-current values on read.
    const withProviderConfig = {
      ...model,
      providerConfig: this.getProviderConfig(document),
    };
    return withLiveModelCreditPricing(
      withProviderConfig,
    ) as unknown as ModelDocument;
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

  private readModelCategory(value: unknown): ModelCategory | undefined {
    const category = this.readString(value);
    return category &&
      Object.values(ModelCategory).includes(category as ModelCategory)
      ? (category as ModelCategory)
      : undefined;
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
    const trainingId = this.readString(training.id);
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
    existingConfig?: Record<string, unknown>,
  ): Record<string, unknown> {
    const nextData = Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) => key !== 'providerConfig' && value !== undefined,
      ),
    );
    const providerConfig = data.providerConfig;
    if (this.isModelRecord(providerConfig)) {
      nextData.config = providerConfig;
    } else if (existingConfig !== undefined) {
      nextData.config = existingConfig;
    }
    return nextData;
  }

  private normalizeWhereForModel(
    where: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(where).map(([key, value]) => {
        if (
          (key === 'AND' || key === 'OR' || key === 'NOT') &&
          Array.isArray(value)
        ) {
          return [
            key,
            value
              .filter((entry) => this.isModelRecord(entry))
              .map((entry) => this.normalizeWhereForModel(entry)),
          ];
        }

        return [key, value];
      }),
    );
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
  ): Record<string, 'asc' | 'desc'> {
    if (this.isModelRecord(input) && this.isModelRecord(input.orderBy)) {
      return Object.fromEntries(
        Object.entries(input.orderBy).map(([key, value]) => [
          key,
          value === 1 ? 'asc' : 'desc',
        ]),
      );
    }

    if (this.isModelRecord(options.sort)) {
      return Object.fromEntries(
        Object.entries(options.sort).map(([key, value]) => [
          key,
          value === 1 ? 'asc' : 'desc',
        ]),
      );
    }

    return { createdAt: 'desc' };
  }

  private toPublicModelCatalogDocument(
    row: PublicModelCatalogRow,
  ): PublicModelCatalogDocument {
    const priced = withLiveModelCreditPricing(row);

    return {
      aspectRatios: priced.aspectRatios,
      capabilities: priced.capabilities,
      category: priced.category,
      cost: priced.cost,
      costTier: priced.costTier,
      defaultAspectRatio: priced.defaultAspectRatio,
      defaultDuration: priced.defaultDuration,
      description: priced.description,
      durations: priced.durations,
      id: priced.id,
      isDefault: priced.isDefault,
      isHighlighted: priced.isHighlighted,
      key: priced.key,
      label: priced.label,
      maxOutputs: priced.maxOutputs,
      provider: priced.provider,
      qualityTier: priced.qualityTier,
      recommendedFor: priced.recommendedFor,
      speedTier: priced.speedTier,
      supportsFeatures: priced.supportsFeatures,
    };
  }

  /**
   * Public catalog projection. This deliberately selects only the public
   * contract plus the private pricing inputs needed to calculate live credits.
   * A newly added internal registry column therefore cannot break or leak into
   * the anonymous catalog merely because Prisma selects every field by default.
   */
  async findPublicCatalog(
    filters: PublicModelCatalogFilters,
    options: AggregationOptions,
  ): Promise<AggregatePaginateResult<PublicModelCatalogDocument>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const where: Prisma.ModelWhereInput = {
      ...(filters.category ? { category: filters.category } : {}),
      isActive: true,
      isDeleted: false,
      isLegacy: false,
      isPublic: true,
      organizationId: null,
      ...(filters.provider ? { provider: filters.provider } : {}),
    };
    const [rows, totalDocs] = await Promise.all([
      // tenant-scope-ignore: the anonymous catalog is restricted to active global rows with organizationId:null and isDeleted:false in the shared where above
      this.prisma.model.findMany({
        orderBy: [
          { isHighlighted: 'desc' },
          { isDefault: 'desc' },
          { label: 'asc' },
        ],
        select: PUBLIC_MODEL_CATALOG_SELECT,
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      // tenant-scope-ignore: the anonymous catalog count reuses the same global-only organizationId:null and isDeleted:false filter as the projected rows
      this.prisma.model.count({ where }),
    ]);
    const totalPages = Math.ceil(totalDocs / limit);

    return {
      docs: rows.map((row) => this.toPublicModelCatalogDocument(row)),
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

    const model = await this.prisma.model.findFirst({
      where: this.normalizeWhereForModel(
        scopedParams,
      ) as Prisma.ModelWhereInput,
    });
    return model ? this.normalizeModelDocument(model) : null;
  }

  override async find(
    params: Record<string, unknown>,
    populate: Parameters<BaseService<ModelDocument>['find']>[1] = [],
  ): Promise<ModelDocument[]> {
    void populate;
    const models = await this.prisma.model.findMany({
      where: this.normalizeWhereForModel(params) as Prisma.ModelWhereInput,
    });
    return models.map((model) => this.normalizeModelDocument(model));
  }

  override async create(
    createDto: CreateModelDto,
    populate: Parameters<BaseService<ModelDocument>['create']>[1] = [],
  ): Promise<ModelDocument> {
    void populate;
    const lifecycle = createDto.lifecycle ?? ModelLifecycle.AVAILABLE;
    const successorKey = createDto.succeededBy?.trim();
    if (SUCCESSOR_REQUIRED_LIFECYCLES.has(lifecycle)) {
      if (!successorKey) {
        throw new BadRequestException(
          'A successor model is required for Legacy and Retired',
        );
      }
      await this.assertValidSuccessor(createDto, successorKey);
    }
    const data = this.splitModelData(
      createDto as unknown as Record<string, unknown>,
    );
    const isLegacy = lifecycle === ModelLifecycle.LEGACY;
    const isRetired = lifecycle === ModelLifecycle.RETIRED;
    data.lifecycle = lifecycle;
    data.isActive = !isRetired && (createDto.isActive ?? true);
    data.isDefault =
      lifecycle === ModelLifecycle.RECOMMENDED
        ? (createDto.isDefault ?? false)
        : false;
    data.isDeprecated = isLegacy || isRetired;
    data.isLegacy = isLegacy;
    data.succeededBy = isLegacy || isRetired ? successorKey : null;
    if (!this.readString(data.endpoint)) {
      data.endpoint = createDto.key;
    }
    const created = await this.prisma.model.create({
      data: data as Prisma.ModelUncheckedCreateInput,
    });
    return this.normalizeModelDocument(created);
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateModelDto> | Record<string, unknown>,
    populate: Parameters<BaseService<ModelDocument>['patch']>[2] = [],
  ): Promise<ModelDocument> {
    void populate;
    const existing = await this.prisma.model.findUnique({ where: { id } });
    const data = this.splitModelData(
      updateDto as Record<string, unknown>,
      this.getProviderConfig(existing),
    );
    const updated = await this.prisma.model.update({
      data: data as Prisma.ModelUpdateInput,
      where: { id },
    });
    return this.normalizeModelDocument(updated);
  }

  override async remove(id: string): Promise<ModelDocument | null> {
    if (!id) {
      throw new ValidationException('Document ID is required');
    }
    const removed = await this.prisma.model.update({
      data: { isDeleted: true },
      where: { id },
    });
    return this.normalizeModelDocument(removed);
  }

  override async findAll(
    input: unknown,
    options: AggregationOptions,
  ): Promise<AggregatePaginateResult<ModelDocument>> {
    const where = this.getFindAllWhere(input, options);
    const dbWhere = this.normalizeWhereForModel(where);
    const orderBy = this.getFindAllOrderBy(input, options);
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const isPaginated = options.pagination !== false;
    const [docs, totalDocs] = await Promise.all([
      this.prisma.model.findMany({
        orderBy: orderBy as Prisma.ModelOrderByWithRelationInput,
        skip: isPaginated ? (page - 1) * limit : undefined,
        take: isPaginated ? limit : undefined,
        where: dbWhere as Prisma.ModelWhereInput,
      }),
      this.prisma.model.count({ where: dbWhere as Prisma.ModelWhereInput }),
    ]);
    const normalizedDocs = docs.map((model) =>
      this.normalizeModelDocument(model),
    );
    const totalPages = isPaginated ? Math.ceil(totalDocs / limit) : 1;

    return {
      docs: normalizedDocs,
      hasNextPage: isPaginated ? page * limit < totalDocs : false,
      hasPrevPage: isPaginated ? page > 1 : false,
      limit: isPaginated ? limit : totalDocs,
      nextPage: isPaginated && page * limit < totalDocs ? page + 1 : null,
      page: isPaginated ? page : 1,
      pagingCounter: isPaginated ? (page - 1) * limit + 1 : 1,
      prevPage: isPaginated && page > 1 ? page - 1 : null,
      totalDocs,
      totalPages,
    };
  }

  /**
   * Prisma treats an *absent* `organizationId` key as "every value", so a bulk
   * filter that simply omits it widens the write across every tenant plus the
   * global registry. Require the key to be **present**, not truthy:
   * `organizationId: null` is the global model registry this service is built to
   * maintain (see `touchDiscoveredModels`), so a truthiness check would reject
   * legitimate registry writes. Presence alone is not enough either:
   * `normalizeWhere` drops `undefined`, so `{ organizationId: undefined }`
   * passes an `in` check and still widens the write.
   */
  override async patchAll(
    filter: Parameters<BaseService<ModelDocument>['patchAll']>[0],
    update: Parameters<BaseService<ModelDocument>['patchAll']>[1],
  ): Promise<{ modifiedCount: number }> {
    if (!this.isModelRecord(filter)) {
      throw new ValidationException('Filter criteria are required');
    }

    const organizationId = filter.organizationId;
    const hasValidScope =
      Object.hasOwn(filter, 'organizationId') &&
      (organizationId === null ||
        (typeof organizationId === 'string' &&
          organizationId.trim().length > 0));

    if (!hasValidScope) {
      throw new ValidationException(
        'organizationId is required for bulk model updates',
      );
    }

    return super.patchAll(filter, update);
  }

  async clearOtherDefaults(
    category: string,
    organizationId: string | null,
    exceptModelId: string,
  ): Promise<void> {
    if (organizationId === undefined) {
      throw new BadRequestException(
        'organizationId is required for bulk model updates',
      );
    }

    await this.prisma.model.updateMany({
      data: { isDefault: false },
      where: {
        category,
        id: { not: exceptModelId },
        isDefault: true,
        isDeleted: false,
        organizationId,
      },
    });
  }

  /**
   * Apply the lifecycle as the authoritative availability state while keeping
   * the historical booleans synchronized for older consumers. Registry review
   * remains an independent approval boundary for discovered provider rows.
   */
  async transitionLifecycle(
    modelId: string,
    lifecycle: ModelLifecycle,
    succeededBy?: string,
  ): Promise<ModelDocument | null> {
    const existing = await this.findOne({ id: modelId });
    if (!existing) {
      return null;
    }

    const successorKey = succeededBy?.trim();
    if (SUCCESSOR_REQUIRED_LIFECYCLES.has(lifecycle)) {
      if (!successorKey) {
        throw new BadRequestException(
          'A successor model is required for Legacy and Retired',
        );
      }
      await this.assertValidSuccessor(existing, successorKey);
    }

    const isLegacy = lifecycle === ModelLifecycle.LEGACY;
    const isRetired = lifecycle === ModelLifecycle.RETIRED;
    const reviewAllowsExecution =
      !existing.isDiscovered || existing.reviewStatus === 'approved';

    return this.patch(modelId, {
      deprecatedAt: isLegacy || isRetired ? new Date() : null,
      isActive: !isRetired && reviewAllowsExecution,
      isDefault:
        lifecycle === ModelLifecycle.RECOMMENDED ? existing.isDefault : false,
      isDeprecated: isLegacy || isRetired,
      isLegacy,
      lifecycle,
      succeededBy: isLegacy || isRetired ? successorKey : null,
    });
  }

  private async assertValidSuccessor(
    model: {
      category: string;
      key: string;
      organizationId?: string | null;
    },
    successorKey: string,
  ): Promise<void> {
    if (successorKey === model.key) {
      throw new BadRequestException('A model cannot succeed itself');
    }

    const visibility = { organizationId: model.organizationId ?? null };
    const successor = await this.findOne({ key: successorKey, ...visibility });
    if (
      !successor ||
      successor.category !== model.category ||
      successor.lifecycle === ModelLifecycle.RETIRED ||
      !successor.isActive
    ) {
      throw new BadRequestException(
        'Successor must be an active, non-retired model in the same category',
      );
    }

    const seen = new Set([String(model.key)]);
    let current: ModelDocument | null = successor;
    while (current) {
      if (seen.has(String(current.key))) {
        throw new BadRequestException('Successor chain cannot contain a cycle');
      }
      seen.add(String(current.key));
      if (!current.succeededBy) {
        return;
      }
      current = await this.findOne({
        key: current.succeededBy,
        ...visibility,
      });
      if (!current) {
        throw new BadRequestException(
          'Successor chain must resolve to a model',
        );
      }
    }
  }

  async touchDiscoveredModels(
    provider: ModelProvider,
    endpoints: string[],
    lastSyncedAt: Date,
  ): Promise<void> {
    await this.prisma.model.updateMany({
      data: { lastSyncedAt },
      where: {
        isDeleted: false,
        isDiscovered: true,
        endpoint: { in: endpoints },
        organizationId: null,
        provider,
      },
    });
  }

  async count(filter: Record<string, unknown>): Promise<number> {
    return this.prisma.model.count({
      where: this.normalizeWhereForModel(filter) as Prisma.ModelWhereInput,
    });
  }

  async getProviderContracts(
    modelId: string,
  ): Promise<IModelProviderContracts | null> {
    const model = await this.findOne({ id: modelId });
    if (!model) {
      return null;
    }

    const versions = [
      model.reviewedProviderContractVersion,
      model.pendingProviderContractVersion,
    ].filter((version): version is string => Boolean(version));
    const contracts =
      versions.length > 0
        ? await this.prisma.modelProviderContract.findMany({
            where: { modelId, version: { in: versions } },
          })
        : [];
    const contractByVersion = new Map(
      contracts.map((contract) => [contract.version, contract]),
    );
    const toSnapshot = (
      version: string | null | undefined,
    ): IModelProviderContractSnapshot | null => {
      if (!version) {
        return null;
      }
      const contract = contractByVersion.get(version);
      if (!contract) {
        return null;
      }
      return {
        billingUnit: contract.billingUnit ?? undefined,
        conditionalDimensions: this.isModelRecord(
          contract.conditionalDimensions,
        )
          ? contract.conditionalDimensions
          : {},
        currency: contract.currency ?? undefined,
        discoveredAt: contract.discoveredAt,
        inputSchema: this.isModelRecord(contract.inputSchema)
          ? contract.inputSchema
          : {},
        lastSeenAt: contract.lastSeenAt,
        mappingStatus: contract.mappingStatus,
        outputSchema: this.isModelRecord(contract.outputSchema)
          ? contract.outputSchema
          : {},
        pricingType: contract.pricingType ?? undefined,
        reviewStatus: contract.reviewStatus,
        schemaFamily: contract.schemaFamily ?? undefined,
        unitPrice: contract.unitPrice ?? undefined,
        unsupportedReason: contract.unsupportedReason ?? undefined,
        version: contract.version,
      };
    };

    return {
      endpoint: model.endpoint,
      pending: toSnapshot(model.pendingProviderContractVersion),
      provider: model.provider,
      reviewed: toSnapshot(model.reviewedProviderContractVersion),
    };
  }

  async approveRegistryModel(
    modelId: string,
    updateDto: Partial<UpdateModelDto> = {},
    reviewedBy?: string,
  ): Promise<ModelDocument | null> {
    const existing = await this.findOne({ id: modelId });
    if (!existing) {
      return null;
    }

    const now = new Date();
    const pendingVersion = existing.pendingProviderContractVersion;
    const pendingContract = pendingVersion
      ? await this.prisma.modelProviderContract.findUnique({
          where: {
            provider_endpoint_version: {
              endpoint: existing.endpoint,
              provider: existing.provider,
              version: pendingVersion,
            },
          },
        })
      : null;

    if (
      pendingVersion &&
      (pendingContract?.mappingStatus !== 'supported' ||
        !pendingContract.schemaFamily ||
        !pendingContract.pricingType ||
        pendingContract.unitPriceMicros === null)
    ) {
      throw new BadRequestException(
        'The pending provider contract is quarantined and cannot be activated',
      );
    }
    if (
      pendingContract?.schemaFamily &&
      existing.provider === ModelProvider.FAL &&
      !isFalSchemaFamilyCompatible(
        updateDto.category ?? existing.category,
        pendingContract.schemaFamily,
      )
    ) {
      throw new BadRequestException(
        'The pending provider contract schema family does not match the model category',
      );
    }
    if (
      pendingContract?.schemaFamily &&
      existing.provider === ModelProvider.REPLICATE &&
      !isReplicateSchemaFamilyCompatible(
        updateDto.category ?? existing.category,
        pendingContract.schemaFamily,
      )
    ) {
      throw new BadRequestException(
        'The pending provider contract schema family does not match the model category',
      );
    }

    const patch: RegistryReviewPatch = {
      ...updateDto,
      isActive: existing.lifecycle !== ModelLifecycle.RETIRED,
      isLegacy: false,
      reviewStatus: 'approved',
      reviewedAt: now,
      reviewedBy,
    };

    if (pendingContract) {
      patch.pendingProviderContractVersion = null;
      patch.providerCostUsd =
        Number(pendingContract.unitPriceMicros) / 1_000_000;
      patch.providerInputSchema =
        pendingContract.inputSchema as Prisma.InputJsonValue;
      patch.providerSchemaFamily = pendingContract.schemaFamily as string;
      patch.providerSyncStatus = 'fresh';
      patch.pricingType = pendingContract.pricingType as string;
      patch.reviewedProviderContractVersion = pendingContract.version;
    }

    if (!existing.lastSyncedAt) {
      patch.lastSyncedAt = now;
    }

    if (!pendingContract) {
      return this.patch(modelId, patch);
    }

    const data = this.splitModelData(
      patch as Record<string, unknown>,
      this.getProviderConfig(existing),
    );
    const updated = await this.prisma.$transaction(async (transaction) => {
      const nextModel = await transaction.model.update({
        data: data as Prisma.ModelUpdateInput,
        where: { id: modelId, isDeleted: false, organizationId: null },
      });
      await transaction.modelProviderContract.update({
        data: {
          reviewStatus: 'approved',
          reviewedAt: now,
          reviewedBy,
        },
        where: { id: pendingContract.id },
      });
      return nextModel;
    });
    return this.normalizeModelDocument(updated);
  }

  async rejectRegistryModel(
    modelId: string,
    params: { reason?: string; reviewedBy?: string } = {},
  ): Promise<ModelDocument | null> {
    const existing = await this.findOne({ id: modelId });
    if (!existing) {
      return null;
    }

    return this.patch(modelId, {
      isActive: false,
      isDefault: false,
      rejectionReason: params.reason,
      reviewStatus: 'rejected',
      reviewedAt: new Date(),
      reviewedBy: params.reviewedBy,
    } satisfies RegistryReviewPatch);
  }

  async createFromTraining(training: TrainingDocument): Promise<ModelDocument> {
    const trainingId = this.getTrainingId(training);
    const existing = await this.prisma.model.findFirst({
      where: { trainingId },
    });

    if (existing) {
      return this.normalizeModelDocument(existing);
    }

    const organizationId = this.readString(training.organizationId);
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
    const parentFeatures = this.readStringArray(parentModel?.supportsFeatures);
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
        this.readModelCategory(parentModel?.category) ??
        this.readModelCategory(config.category) ??
        ModelCategory.IMAGE,
      cost: typeof parentModel?.cost === 'number' ? parentModel.cost : 1,
      externalId: trainedModelVersion,
      isActive: true,
      isDefault: false,
      isPublic: false,
      key: `genfeedai/${organizationSlug}/${trainingSlug}`,
      label: trainingLabel,
      organizationId,
      parentModelId: parentModel?.id,
      provider: ModelProvider.GENFEED_AI,
      supportsFeatures,
      trainingId,
      trigger: triggerWord,
      triggerWord,
    });
  }

  /**
   * Find all active models (for use in organization settings initialization)
   */
  async findAllActive(
    filter?: Record<string, unknown>,
  ): Promise<ModelDocument[]> {
    const dbWhere = this.normalizeWhereForModel({
      isActive: true,
      isDeleted: false,
      ...(filter ?? {}),
    });
    const models = await this.prisma.model.findMany({
      where: dbWhere as Prisma.ModelWhereInput,
    });

    return models.map((model) => this.normalizeModelDocument(model));
  }

  async findAvailableModels(
    params: FindAvailableModelsParams = {},
  ): Promise<ModelDocument[]> {
    const where: Record<string, unknown> = {
      ...(params.category ? { category: params.category } : {}),
      ...(params.enabledModelIds ? { id: { in: params.enabledModelIds } } : {}),
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

    const models = await this.prisma.model.findMany({
      where: where as Prisma.ModelWhereInput,
    });

    return models.map((model) => this.normalizeModelDocument(model));
  }
}
