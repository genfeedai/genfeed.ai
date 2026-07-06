import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';
import { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import { type ModelDocument } from '@api/collections/models/schemas/model.schema';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/interfaces';
import { ModelSerializer } from '@genfeedai/serializers';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';

type MatchConditions = Record<string, unknown>;

@AutoSwagger()
@Controller('models')
export class ModelsController extends BaseCRUDController<
  ModelDocument,
  CreateModelDto,
  UpdateModelDto,
  ModelsQueryDto
> {
  private organizationSettingsService!: OrganizationSettingsService;

  constructor(
    protected readonly modelsService: ModelsService,
    public readonly loggerService: LoggerService,
    private readonly moduleRef: ModuleRef,
  ) {
    super(loggerService, modelsService, ModelSerializer, 'Model');
  }

  private getOrganizationSettingsService(): OrganizationSettingsService {
    if (!this.organizationSettingsService) {
      this.organizationSettingsService = this.moduleRef.get(
        OrganizationSettingsService,
        { strict: false },
      );
    }
    return this.organizationSettingsService;
  }

  /**
   * Override enrichCreateDto to not add user field (admin-only system entities)
   */
  public enrichCreateDto(createDto: CreateModelDto): CreateModelDto {
    // Models are system entities - don't add user, brand, or organization
    return { ...createDto };
  }

  /**
   * Override enrichUpdateDto to not add user field
   */
  // @ts-expect-error - simplified override without user param
  public enrichUpdateDto(updateDto: UpdateModelDto): UpdateModelDto {
    // Models are system entities - don't add user, brand, or organization
    return { ...updateDto };
  }

  /**
   * Override canUserModifyEntity - only superadmins can modify models
   */
  public canUserModifyEntity(user: User): boolean {
    // Only superadmins can modify system models
    return getIsSuperAdmin(user);
  }

  public buildFindAllQuery(_user: User, query: ModelsQueryDto) {
    let matchConditions: MatchConditions = {
      isDeleted: query.isDeleted ?? false,
    };

    // Add isActive filter if provided
    if (query.isActive !== undefined) {
      matchConditions.isActive = query.isActive;
    }

    if (query.registryStatus) {
      matchConditions = {
        ...matchConditions,
        ...this.buildRegistryStatusFilter(query.registryStatus),
      };
    }

    // Add category filter if provided
    if (query.category) {
      // Handle "other" category as a special case - match multiple categories
      if (query.category === 'other') {
        // Use CollectionFilterUtil for array matching
        const otherCategoriesFilter = CollectionFilterUtil.buildArrayFilter(
          [
            'text',
            'assistant',
            'image-edit',
            'video-edit',
            'image-upscale',
            'video-upscale',
            'voice',
          ],
          'category',
        );
        matchConditions = {
          ...matchConditions,
          ...otherCategoriesFilter,
        } as MatchConditions;
      } else {
        // Use CollectionFilterUtil for single category
        const categoryFilter = CollectionFilterUtil.buildCategoryFilter(
          query.category,
        );
        matchConditions = {
          ...matchConditions,
          ...categoryFilter,
        } as MatchConditions;
      }
    }

    // Note: Organization filtering is handled in the overridden findAll method
    // because it requires async database lookup

    return {
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : ({ createdAt: -1, key: 1, label: 1, type: 1 } as SortObject),
      where: matchConditions,
    };
  }

  private buildRegistryStatusFilter(
    status: NonNullable<ModelsQueryDto['registryStatus']>,
  ): MatchConditions {
    switch (status) {
      case 'approved':
        return { isActive: true, isDiscovered: true, reviewStatus: 'approved' };
      case 'discovered':
        return { isDiscovered: true };
      case 'legacy':
        return { isLegacy: true };
      case 'pending':
        return { isActive: false, isDiscovered: true, reviewStatus: 'pending' };
      case 'rejected':
        return { reviewStatus: 'rejected' };
    }
  }

  private assertCanManageRegistry(user: User, request: Request): void {
    if (!getIsSuperAdmin(user, request)) {
      ErrorResponse.forbidden(
        'Only superadmins can manage model registry review',
      );
    }
  }

  private getReviewerId(user: User): string {
    return user.id;
  }

  private async assertCanDisableModel(modelId: string): Promise<void> {
    const model = await this.modelsService.findOne({ _id: modelId });
    if (!model) {
      ErrorResponse.notFound(this.entityName, modelId);
    }

    if (!model.isDefault) {
      return;
    }

    const otherDefaults = await this.modelsService.count({
      _id: { not: modelId },
      category: model.category,
      isDefault: true,
      isDeleted: false,
    });

    if (otherDefaults === 0) {
      ErrorResponse.validationFailed([
        {
          code: 'CANNOT_DISABLE_LAST_DEFAULT',
          field: 'isDefault',
          message:
            'Cannot disable the only default model in this category. Set another model as default first.',
        },
      ]);
    }
  }

  /**
   * Override findAll to add organization filtering support
   * When organizationId is provided, filter by organization's enabledModels
   */
  @Get()
  async findAll(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
    @Query() query: ModelsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const findAllQuery = this.buildFindAllQuery(user, query);
    const where = { ...(findAllQuery.where ?? {}) } as Record<string, unknown>;

    // Add organization filtering if organizationId is provided
    if (query.organizationId) {
      const organizationSettings =
        await this.getOrganizationSettingsService().findOne({
          organization: query.organizationId,
        });

      const rawEnabledModels = (
        organizationSettings as Record<string, unknown> | undefined
      )?.enabledModels;
      const rawEnabledModelIds = (
        organizationSettings as Record<string, unknown> | undefined
      )?.enabledModelIds;
      const enabledModelIds = Array.isArray(rawEnabledModels)
        ? rawEnabledModels.filter((id): id is string => typeof id === 'string')
        : Array.isArray(rawEnabledModelIds)
          ? rawEnabledModelIds.filter(
              (id): id is string => typeof id === 'string',
            )
          : [];

      if (enabledModelIds.length > 0) {
        where._id = { in: enabledModelIds };
      } else {
        // Strict mode: if no organization settings or empty enabledModels, return no models
        where._id = { in: [] };
      }
    }

    // Defense-in-depth: org-scoped tenant isolation
    // Derive org from request context middleware, NOT from query params
    const authenticatedOrgId = request.context?.organizationId
      ? request.context.organizationId
      : null;

    if (authenticatedOrgId) {
      where.OR = [{ organization: null }, { organization: authenticatedOrgId }];
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const data = await this.modelsService.findAll(
      { ...findAllQuery, where },
      options,
    );
    return serializeCollection(request, ModelSerializer, data);
  }

  /**
   * Override getPopulateForOwnershipCheck - Model entities don't have user field
   */
  public getPopulateForOwnershipCheck(): [] {
    return [];
  }

  /**
   * Override patch to enforce mutual exclusivity of isDefault within category.
   * - Only one model per category can be isDefault: true
   * - Cannot remove the last default in a category
   */
  @Patch(':modelId')
  async patch(
    @Req() request: RequestWithContext,
    @CurrentUser() user: User,
    @Param('modelId') modelId: string,
    @Body() updateDto: UpdateModelDto,
  ): Promise<JsonApiSingleResponse> {
    // Registry review transitions (approve/reject/legacy) route through the
    // dedicated service methods, preserving the superadmin guard and the
    // last-default protection — rather than a plain field write.
    if (updateDto.reviewStatus) {
      return this.applyRegistryReview(request, user, modelId, updateDto);
    }

    const model = await this.modelsService.findOne({ _id: modelId });
    if (!model) {
      ErrorResponse.notFound(this.entityName, modelId);
    }

    // If turning OFF isDefault, check if it's the only default in category
    if (updateDto.isDefault === false && model.isDefault) {
      const otherDefaults = await this.modelsService.count({
        _id: { not: modelId },
        category: model.category,
        isDefault: true,
        isDeleted: false,
      });
      if (otherDefaults === 0) {
        ErrorResponse.validationFailed([
          {
            code: 'CANNOT_REMOVE_LAST_DEFAULT',
            field: 'isDefault',
            message:
              'Cannot remove the only default model in this category. Set another model as default first.',
          },
        ]);
      }
    }

    // If setting isDefault to true, clear other defaults in same category
    if (updateDto.isDefault === true) {
      // sql-risk-audit: ignore bulk-write-tenant-review -- Wrapped service call is constrained to non-deleted models in the same registry category.
      await this.modelsService.updateMany(
        {
          _id: { not: modelId },
          category: model.category,
          isDefault: true,
          isDeleted: false,
        },
        { isDefault: false },
      );
    }

    // Call parent patch method
    return super.patch(request, user, modelId, updateDto);
  }

  /**
   * Apply a registry review transition (approve/reject/legacy) driven by the
   * `reviewStatus` field on a `PATCH /models/:id`. Superadmin-guarded; reject and
   * legacy additionally protect the last default model in a category. Approve
   * carries any remaining update fields through (e.g. `label`).
   */
  private async applyRegistryReview(
    request: RequestWithContext,
    user: User,
    modelId: string,
    updateDto: UpdateModelDto,
  ): Promise<JsonApiSingleResponse> {
    this.assertCanManageRegistry(user, request as unknown as Request);

    const { reviewStatus, reason, succeededBy, ...updates } = updateDto;
    const reviewedBy = this.getReviewerId(user);

    let data: ModelDocument | null;
    switch (reviewStatus) {
      case 'approved':
        data = await this.modelsService.approveRegistryModel(
          modelId,
          updates,
          reviewedBy,
        );
        break;
      case 'rejected':
        await this.assertCanDisableModel(modelId);
        data = await this.modelsService.rejectRegistryModel(modelId, {
          reason,
          reviewedBy,
        });
        break;
      case 'legacy':
        await this.assertCanDisableModel(modelId);
        data = await this.modelsService.markRegistryModelLegacy(modelId, {
          reviewedBy,
          succeededBy,
        });
        break;
      default:
        data = null;
    }

    if (!data) {
      ErrorResponse.notFound(this.entityName, modelId);
    }

    return serializeSingle(
      request as unknown as Request,
      ModelSerializer,
      data,
    );
  }
}
