import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { EntityDocument } from '@api/helpers/types/common/common.types';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  PopulateBuilder,
  PopulatePatterns,
} from '@api/shared/utils/populate/populate.util';
import { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import type {
  IJsonApiSerializer,
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  PopulateOption,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { isValidObjectId, type PipelineStage, Types } from 'mongoose';

@AutoSwagger()
export abstract class BaseCRUDController<
  T = EntityDocument<unknown>,
  CreateDto = unknown,
  UpdateDto = unknown,
  QueryDto extends BaseQueryDto = BaseQueryDto,
> {
  public readonly constructorName: string;
  public readonly optimizedPopulateFields: PopulateOption[] = [];

  constructor(
    public readonly logger: LoggerService,
    public readonly service: BaseService<T, CreateDto, UpdateDto>,
    public readonly serializer: IJsonApiSerializer | null,
    public readonly entityName: string,
    public readonly populateFields: (string | PopulateOption)[] = [],
  ) {
    this.constructorName = this.constructor.name;

    // Convert string populate fields to optimized versions
    // NOTE: 'user' is excluded — User model is on AUTH connection,
    // cannot .populate() from CLOUD connection. Use $lookup in aggregation instead.
    this.optimizedPopulateFields = populateFields
      .filter((field) => field !== 'user')
      .map((field) => {
        if (typeof field === 'string') {
          // Apply default optimizations for common fields
          switch (field) {
            case 'brand':
              return PopulatePatterns.brandMinimal;
            case 'organization':
              return PopulatePatterns.organizationMinimal;
            case 'metadata':
              return PopulatePatterns.metadataFull;
            case 'asset':
              return PopulatePatterns.assetMinimal;
            case 'parent':
              return PopulatePatterns.parentMinimal;
            default:
              // For unknown fields, populate minimally
              return PopulateBuilder.minimal(field);
          }
        }
        return field;
      });
  }

  /**
   * Find all entities with pagination and filtering
   * Implements the common pattern used across all controllers
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: QueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    // Build base aggregation pipeline - child controllers can override this
    const aggregate = this.buildFindAllPipeline(user, query);

    const data: AggregatePaginateResult<T> = await this.service.findAll(
      aggregate,
      options,
    );
    return serializeCollection(request, this.serializer, data);
  }

  /**
   * Find a single entity by ID
   */
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const data = await this.service.findOne(
      { _id: id },
      this.getPopulateFields(),
    );

    if (!data) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(request, this.serializer, data);
  }

  /**
   * Create a new entity
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateDto,
  ): Promise<JsonApiSingleResponse> {
    const enrichedDto = this.enrichCreateDto(createDto, user);

    const data = await this.service.create(
      enrichedDto,
      this.getPopulateFields(),
    );

    return serializeSingle(request, this.serializer, data);
  }

  /**
   * Update an entity by ID
   */
  @Patch(':id')
  async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { params: { id }, updateDto });

    if (!isValidObjectId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Check ownership before update - use minimal population
    // Only populate user if the entity might have one (can be overridden by child controllers)
    const populateForOwnershipCheck = this.getPopulateForOwnershipCheck();
    const existing = await this.service.findOne(
      { _id: new Types.ObjectId(id) },
      populateForOwnershipCheck,
    );

    if (!existing) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const publicMetadata = getPublicMetadata(user);

    // Return 404 instead of 403 for security
    if (
      !this.canUserModifyEntity(user, existing) &&
      !getIsSuperAdmin(user, request)
    ) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Add user context to create data
    const enrichedDto = await this.enrichUpdateDto(updateDto, user);
    const data = await this.service.patch(
      id,
      enrichedDto,
      this.getPopulateFields(),
    );

    if (!data) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(request, this.serializer, data);
  }

  /**
   * Soft delete an entity by ID
   */
  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Check ownership before deletion
    const existing = await this.service.findOne({ _id: id });
    if (!existing) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Return 404 instead of 403 for security
    if (!this.canUserModifyEntity(user, existing)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const data = await this.service.remove(id);

    if (!data) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(request, this.serializer, data);
  }

  /**
   * Build the aggregation pipeline for findAll
   * Child controllers can override this to customize the query
   */
  public buildFindAllPipeline(user: User, query: QueryDto): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);
    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    const matchFilter: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    if (adminFilter) {
      Object.assign(matchFilter, adminFilter);
    } else {
      matchFilter.user = new Types.ObjectId(publicMetadata.user);
    }

    return [{ $match: matchFilter }, { $sort: handleQuerySort(query.sort) }];
  }

  /**
   * Enrich create DTO with user context
   * Child controllers can override this to add more context
   */
  public enrichCreateDto(createDto: Partial<CreateDto>, user: User): CreateDto {
    const publicMetadata = getPublicMetadata(user);

    let organization;
    let brand;

    if (publicMetadata.brand) {
      brand = new Types.ObjectId(publicMetadata.brand);
    }

    if (publicMetadata.organization) {
      organization = new Types.ObjectId(publicMetadata.organization);
    }

    // Only set brand if it exists on both publicMetadata or createDto, and avoid TS error for generic CreateDto
    const dtoRecord = createDto as Record<string, unknown>;
    if (createDto && Object.hasOwn(createDto, 'brand') && dtoRecord.brand) {
      brand = new Types.ObjectId(String(dtoRecord.brand));
    }

    if (
      createDto &&
      Object.hasOwn(createDto, 'organization') &&
      dtoRecord.organization
    ) {
      organization = new Types.ObjectId(String(dtoRecord.organization));
    }

    return {
      ...createDto,
      brand,
      organization,
      user: new Types.ObjectId(publicMetadata.user),
    } as CreateDto;
  }

  public async enrichUpdateDto(
    updateDto: Partial<UpdateDto>,
    user: User,
  ): Promise<UpdateDto> {
    const publicMetadata = getPublicMetadata(user);

    // Convert common relationship ObjectId fields from various input types
    const dto: Record<string, unknown> = { ...updateDto } as Record<
      string,
      unknown
    >;

    // Handle common relationship fields that might need ObjectId conversion
    const relationshipFields = ['parent', 'folder', 'brand', 'organization'];
    for (const field of relationshipFields) {
      if (Object.hasOwn(dto, field)) {
        dto[field] = await ObjectIdUtil.convertRelationshipField(
          dto[field],
          field,
        );
      }
    }

    // Determine final brand and organization values
    // Prefer dto values over publicMetadata (same logic as enrichCreateDto)
    let brand;
    let organization;

    // Start with publicMetadata defaults
    if (publicMetadata.brand) {
      brand = new Types.ObjectId(publicMetadata.brand);
    }

    if (publicMetadata.organization) {
      organization = new Types.ObjectId(publicMetadata.organization);
    }

    // Override with dto values if provided (already converted above)
    if (Object.hasOwn(dto, 'brand')) {
      brand = dto.brand;
    }

    if (Object.hasOwn(dto, 'organization')) {
      organization = dto.organization;
    }

    return await Promise.resolve({
      ...dto,
      brand,
      organization,
      user: new Types.ObjectId(publicMetadata.user),
    } as UpdateDto);
  }

  /**
   * Check if user can modify the entity
   * Child controllers can override this for custom authorization logic
   */
  public canUserModifyEntity(user: User, entity: T): boolean {
    const publicMetadata = getPublicMetadata(user);

    // Default: user can only modify their own entities
    const entityRecord = entity as Record<string, unknown>;
    const entityUser = entityRecord.user as
      | { _id?: { toString(): string }; toString(): string }
      | undefined;
    const entityUserId = entityUser?._id?.toString() || entityUser?.toString();
    return entityUserId === publicMetadata.user;
  }

  /**
   * Get additional populate fields for specific operations
   * Child controllers can override this
   */
  public getPopulateFields(): PopulateOption[] {
    return this.optimizedPopulateFields;
  }

  /**
   * Get populate fields for ownership check
   * Child controllers can override this for entities without user field
   */
  public getPopulateForOwnershipCheck(): PopulateOption[] {
    // User field contains ObjectId directly — no populate needed.
    // canUserModifyEntity() handles both populated and unpopulated user fields.
    return [];
  }
}
