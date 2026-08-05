import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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

type FindAvailableModelsParams = {
  category?: string;
  enabledModelIds?: string[];
  isActive?: boolean;
  organizationId?: string;
};

type RegistryReviewPatch = Partial<UpdateModelDto> & {
  deprecatedAt?: Date;
  lastSyncedAt?: Date;
  rejectionReason?: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewStatus?: 'approved' | 'legacy' | 'pending' | 'rejected';
  succeededBy?: string;
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

  private getProviderConfig(document: unknown): Record<string, unknown> {
    if (!this.isModelRecord(document)) {
      return {};
    }

    return this.isModelRecord(document.config) ? document.config : {};
  }

  private normalizeModelDocument(document: unknown): ModelDocument {
    if (!this.isModelRecord(document)) {
      return document as ModelDocument;
    }

    const { config: _config, ...model } = document;
    return {
      ...model,
      providerConfig: this.getProviderConfig(document),
    } as unknown as ModelDocument;
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
      where: this.normalizeWhereForModel(scopedParams) as never,
    });
    return model ? this.normalizeModelDocument(model) : null;
  }

  override async find(
    params: Record<string, unknown>,
    populate: Parameters<BaseService<ModelDocument>['find']>[1] = [],
  ): Promise<ModelDocument[]> {
    void populate;
    const models = await this.prisma.model.findMany({
      where: this.normalizeWhereForModel(params) as never,
    });
    return models.map((model) => this.normalizeModelDocument(model));
  }

  override async create(
    createDto: CreateModelDto,
    populate: Parameters<BaseService<ModelDocument>['create']>[1] = [],
  ): Promise<ModelDocument> {
    void populate;
    const created = await this.prisma.model.create({
      data: this.splitModelData(
        createDto as unknown as Record<string, unknown>,
      ) as never,
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
      data: data as never,
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
        orderBy: orderBy as never,
        skip: isPaginated ? (page - 1) * limit : undefined,
        take: isPaginated ? limit : undefined,
        where: dbWhere as never,
      }),
      this.prisma.model.count({ where: dbWhere as never }),
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

  async clearOtherDefaults(
    category: string,
    organizationId: string | null,
    exceptModelId: string,
  ): Promise<void> {
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

  async touchDiscoveredModels(
    keys: string[],
    lastSyncedAt: Date,
  ): Promise<void> {
    await this.prisma.model.updateMany({
      data: { lastSyncedAt },
      where: {
        isDeleted: false,
        isDiscovered: true,
        key: { in: keys },
        organizationId: null,
      },
    });
  }

  async count(filter: Record<string, unknown>): Promise<number> {
    return this.prisma.model.count({
      where: this.normalizeWhereForModel(filter) as never,
    });
  }

  async approveRegistryModel(
    modelId: string,
    updateDto: Partial<UpdateModelDto> = {},
    reviewedBy?: string,
  ): Promise<ModelDocument | null> {
    const existing = await this.findOne({ id: modelId, isDeleted: false });
    if (!existing) {
      return null;
    }

    const now = new Date();
    const patch: RegistryReviewPatch = {
      ...updateDto,
      isActive: true,
      isLegacy: false,
      reviewStatus: 'approved',
      reviewedAt: now,
      reviewedBy,
    };

    if (!existing.lastSyncedAt) {
      patch.lastSyncedAt = now;
    }

    return this.patch(modelId, patch);
  }

  async rejectRegistryModel(
    modelId: string,
    params: { reason?: string; reviewedBy?: string } = {},
  ): Promise<ModelDocument | null> {
    const existing = await this.findOne({ id: modelId, isDeleted: false });
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

  async markRegistryModelLegacy(
    modelId: string,
    params: {
      reviewedBy?: string;
      succeededBy?: string;
    } = {},
  ): Promise<ModelDocument | null> {
    const existing = await this.findOne({ id: modelId, isDeleted: false });
    if (!existing) {
      return null;
    }

    return this.patch(modelId, {
      deprecatedAt: new Date(),
      isActive: false,
      isDefault: false,
      isLegacy: true,
      reviewStatus: 'legacy',
      reviewedAt: new Date(),
      reviewedBy: params.reviewedBy,
      succeededBy: params.succeededBy,
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
      where: dbWhere as never,
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
      where: where as never,
    });

    return models.map((model) => this.normalizeModelDocument(model));
  }
}
