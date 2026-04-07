import type { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import type { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';
import type { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import type { User } from '@clerk/backend';
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
import { Model, type PipelineStage, Types } from 'mongoose';

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
    super(loggerService, modelsService, ModelSerializer, Model.name);
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

  public buildFindAllPipeline(
    _user: User,
    query: ModelsQueryDto,
  ): PipelineStage[] {
    let matchConditions: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    // Add isActive filter if provided
    if (query.isActive !== undefined) {
      matchConditions.isActive = query.isActive;
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
        matchConditions = { ...matchConditions, ...otherCategoriesFilter };
      } else {
        // Use CollectionFilterUtil for single category
        const categoryFilter = CollectionFilterUtil.buildCategoryFilter(
          query.category,
        );
        matchConditions = { ...matchConditions, ...categoryFilter };
      }
    }

    // Note: Organization filtering is handled in the overridden findAll method
    // because it requires async database lookup

    return PipelineBuilder.create()
      .match(matchConditions)
      .sort(
        query.sort
          ? handleQuerySort(query.sort)
          : ({ createdAt: -1, key: 1, label: 1, type: 1 } as SortObject),
      )
      .build();
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
    // Build base pipeline
    let pipeline = this.buildFindAllPipeline(user, query);

    // Add organization filtering if organizationId is provided
    if (query.organizationId) {
      const organizationSettings =
        await this.getOrganizationSettingsService().findOne({
          organization: new Types.ObjectId(query.organizationId),
        });

      if (organizationSettings?.enabledModels) {
        const enabledModelIds = organizationSettings.enabledModels.map(
          (id) => new Types.ObjectId(id),
        );
        // Strict mode: if enabledModels array exists, only return those models
        // If array is empty, no models will match (strict mode)
        // Add $match stage at the beginning to filter by enabled model IDs
        pipeline = [
          {
            $match: {
              _id: { $in: enabledModelIds },
            },
          },
          ...pipeline,
        ];
      } else {
        // Strict mode: if no organization settings or empty enabledModels, return no models
        pipeline = [
          {
            $match: {
              _id: { $in: [] },
            },
          },
          ...pipeline,
        ];
      }
    }

    // Defense-in-depth: org-scoped tenant isolation
    // Derive org from request context middleware, NOT from query params
    const authenticatedOrgId = request.context?.organizationId
      ? new Types.ObjectId(request.context.organizationId)
      : null;

    if (authenticatedOrgId) {
      pipeline.push({
        $match: {
          $or: [
            { organization: null },
            { organization: { $exists: false } },
            { organization: authenticatedOrgId },
          ],
        },
      });
    }

    // Use the base service findAll with the modified pipeline
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const data = await this.modelsService.findAll(pipeline, options);
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
    const model = await this.modelsService.findOne({ _id: modelId });
    if (!model) {
      ErrorResponse.notFound(this.entityName, modelId);
    }

    // If turning OFF isDefault, check if it's the only default in category
    if (updateDto.isDefault === false && model.isDefault) {
      const otherDefaults = await this.modelsService.count({
        _id: { $ne: modelId },
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
      await this.modelsService.updateMany(
        {
          _id: { $ne: modelId },
          category: model.category,
          isDefault: true,
        },
        { isDefault: false },
      );
    }

    // Call parent patch method
    return super.patch(request, user, modelId, updateDto);
  }
}
