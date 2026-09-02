import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { EntityDocument } from '@api/helpers/types/common/common.types';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  BaseService,
  type PrismaFindAllInput,
} from '@api/shared/services/base/base.service';
import {
  PopulateBuilder,
  PopulatePatterns,
} from '@api/shared/utils/populate/populate.util';
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
import type { AggregatePaginateResult } from './base-crud.types';
import { resolveScopeId } from './base-crud-scope.util';

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

    // Convert known relation names to explicit projections. Unknown relations
    // retain full loading because their serializer requirements are domain-specific.
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
              return PopulateBuilder.create(field);
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

    const findAllQuery = this.buildFindAllQuery(user, query);

    const data: AggregatePaginateResult<T> = await this.service.findAll(
      findAllQuery,
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
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const data = await this.service.findOne(
      this.buildFindOneQuery(user, id),
      this.getPopulateFields(),
    );

    if (!data) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Fetch-then-check, mirroring patch/remove. Return 404 instead of 403 so a
    // cross-tenant probe can't distinguish "exists elsewhere" from "missing".
    if (
      !(await this.canUserReadEntity(user, data)) &&
      !getIsSuperAdmin(user, request)
    ) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(
      request,
      this.serializer,
      await this.decorateForResponse(data, user),
    );
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

    if (!isEntityId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Check ownership before update - use minimal population
    // Only populate user if the entity might have one (can be overridden by child controllers)
    const populateForOwnershipCheck = this.getPopulateForOwnershipCheck();
    const existing = await this.service.findOne(
      { id },
      populateForOwnershipCheck,
    );

    if (!existing) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Return 404 instead of 403 for security
    const canModifyEntity = this.canUserModifyEntity(user, existing);
    if (!canModifyEntity && !getIsSuperAdmin(user, request)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    await this.assertPatchAllowed(user, existing, updateDto);

    // Add user context to create data
    const enrichedDto = await this.enrichUpdateDto(updateDto, user);
    if (!canModifyEntity) {
      const existingRecord = existing as Record<string, unknown>;
      const existingOrganizationId = resolveScopeId(
        existingRecord.organizationId,
      );
      const enrichedRecord = enrichedDto as Record<string, unknown>;
      if (existingOrganizationId) {
        enrichedRecord.organizationId = existingOrganizationId;
      } else {
        delete enrichedRecord.organizationId;
      }
    }
    const data = await this.service.patch(
      id,
      enrichedDto,
      this.getPopulateFields(),
    );

    if (!data) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(
      request,
      this.serializer,
      await this.decorateForResponse(data, user),
    );
  }

  /**
   * Last chance to enrich a single entity before it is serialized.
   *
   * Default is a no-op. Child controllers override it when the serializer
   * declares relations that are not columns on the entity's own table and so
   * have to be resolved from elsewhere — `BrandsController` populates a brand's
   * logo/banner/reference assets this way. Deliberately not applied to
   * `create`, where a freshly inserted row cannot have related records yet.
   */
  public decorateForResponse(data: T, _user: User): Promise<T> | T {
    return data;
  }

  protected assertPatchAllowed(
    _user: User,
    _existing: T,
    _updateDto: Partial<UpdateDto>,
  ): Promise<void> | void {}

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
    if (!isEntityId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Check ownership before deletion
    const existing = await this.service.findOne(
      this.buildFindOneQuery(user, id),
    );
    if (!existing) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Return 404 instead of 403 for security
    if (
      !this.canUserModifyEntity(user, existing) &&
      !getIsSuperAdmin(user, request)
    ) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const canonicalId = EntityIdUtil.resolveCanonicalId(existing, id);
    const data = await this.service.remove(canonicalId);

    if (!data) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(request, this.serializer, data);
  }

  /**
   * Build the findAll query for findAll
   * Child controllers can override this to customize the query
   */
  public buildFindAllQuery(user: User, query: QueryDto): PrismaFindAllInput {
    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);

    const matchFilter: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    if (adminFilter) {
      Object.assign(matchFilter, adminFilter);
    } else {
      matchFilter.userId = user.userId ?? user.id;
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: matchFilter,
    };
  }

  /**
   * Build the single-record lookup used by findOne and remove.
   *
   * Tenancy is NOT enforced here — see canUserReadEntity. `service.findOne`
   * runs no unknown-field audit. Soft deletes are safe to filter because
   * processSearchParams drops `isDeleted` for models without the field.
   */
  public buildFindOneQuery(_user: User, id: string): Record<string, unknown> {
    return { id, isDeleted: false };
  }

  /**
   * Check if the user can READ the fetched entity.
   *
   * Runs after the fetch (like the patch/remove ownership checks) so it can
   * inspect the row instead of widening the query. Precedence:
   *
   *  1. `organizationId` set -> must match the caller's organization.
   *  2. else `brandId` set -> must match the caller's brand.
   *  3. else the row carries no tenancy pointer (shared/default catalog rows,
   *     e.g. `organizationId: null` presets and elements) -> readable.
   *
   * It deliberately does NOT delegate to canUserModifyEntity: that default is
   * per-user ownership, which would hide every teammate-owned row.
   *
   * Collections whose rows carry neither pointer but are still scoped (e.g.
   * organizations, resolved by membership) MUST override this.
   */
  public canUserReadEntity(user: User, entity: T): boolean | Promise<boolean> {
    const entityRecord = entity as Record<string, unknown>;

    const entityOrganizationId = resolveScopeId(entityRecord.organizationId);
    if (entityOrganizationId) {
      return entityOrganizationId === user.organizationId;
    }

    const entityBrandId = resolveScopeId(entityRecord.brandId);
    if (entityBrandId) {
      return entityBrandId === user.brandId;
    }

    return true;
  }

  /**
   * Enrich create DTO with user context
   * Child controllers can override this to add more context
   *
   * Tenant and identity scope come from the auth token and nothing else. A
   * body-supplied `organization`/`organizationId` (or `user`/`userId`) is
   * DELETED rather than preferred: `BaseService.normalizeData` remaps the
   * `organization` alias onto the real `organizationId` column, so honouring
   * a client value would let any authenticated caller write rows into another
   * tenant. Canonical `brandId` stays caller-selectable — a user legitimately
   * picks among their own brands, and the row is still pinned to the caller's
   * organization.
   */
  public enrichCreateDto(createDto: Partial<CreateDto>, user: User): CreateDto {
    const dto = { ...(createDto as Record<string, unknown>) };

    delete dto.brand;
    delete dto.organization;
    delete dto.organizationId;
    delete dto.user;
    delete dto.userId;

    if (this.serviceSupportsField('brandId')) {
      dto.brandId = dto.brandId ?? user.brandId;
    }
    if (this.serviceSupportsField('organizationId')) {
      dto.organizationId = user.organizationId;
    }
    if (this.serviceSupportsField('userId')) {
      dto.userId = user.userId ?? user.id;
    }

    return dto as CreateDto;
  }

  /**
   * Keep controller unit doubles compatible while production services use the
   * Prisma metadata-backed field check. Older focused controller specs provide
   * only the service methods exercised by the endpoint; treating an omitted
   * capability method as supported preserves their historical BaseService
   * contract without weakening the production path.
   */
  private serviceSupportsField(fieldName: string): boolean {
    const supportsField = this.service.supportsField;
    return typeof supportsField === 'function'
      ? supportsField.call(this.service, fieldName)
      : true;
  }

  public async enrichUpdateDto(
    updateDto: Partial<UpdateDto>,
    _user: User,
  ): Promise<UpdateDto> {
    const dto = { ...(updateDto as Record<string, unknown>) };

    delete dto.brand;
    delete dto.organization;
    delete dto.organizationId;
    delete dto.user;
    delete dto.userId;

    return await Promise.resolve(dto as UpdateDto);
  }

  /**
   * Check if user can modify the entity
   * Child controllers can override this for custom authorization logic
   */
  public canUserModifyEntity(user: User, entity: T): boolean {
    // Default: user can only modify their own entities through the scalar FK.
    const entityRecord = entity as Record<string, unknown>;
    const entityUserId = resolveScopeId(entityRecord.userId);
    return entityUserId === (user.userId ?? user.id);
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
    // Ownership resolves from the scalar `userId` FK — no populate needed.
    return [];
  }
}
