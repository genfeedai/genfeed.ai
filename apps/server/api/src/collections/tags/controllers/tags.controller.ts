import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { TagsLibraryQueryDto } from '@api/collections/tags/dto/tags-library-query.dto';
import { TagsQueryDto } from '@api/collections/tags/dto/tags-query.dto';
import { UpdateTagDto } from '@api/collections/tags/dto/update-tag.dto';
import type { TagDocument } from '@api/collections/tags/schemas/tag.schema';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import { MemberRole, TagScope } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { TagSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

type MatchConditions = Record<string, unknown>;

@AutoSwagger()
@Controller('tags')
export class TagsController extends BaseCRUDController<
  TagDocument,
  CreateTagDto,
  UpdateTagDto,
  TagsQueryDto
> {
  constructor(
    public readonly tagsService: TagsService,
    public readonly loggerService: LoggerService,
    private readonly membersService: MembersService,
  ) {
    super(loggerService, tagsService, TagSerializer, 'Tag', [
      'organization',
      'brand',
      'user',
    ]);
  }

  /**
   * The tags one brand can use, for the Library picker (#6011): the brand's
   * own tags, organization-wide tags and legacy default tags, each with the
   * number of the brand's assets carrying it. Another brand's tags never
   * appear, and a member can only ask for their own active brand.
   */
  @Get('library')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findLibrary(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: TagsLibraryQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    if (!user.organizationId) {
      throw new ForbiddenException({
        detail: 'An authenticated organization is required',
        title: 'Forbidden',
      });
    }

    const isSuperAdmin = getIsSuperAdmin(user, request);
    if (query.brandId && !isSuperAdmin && query.brandId !== user.brandId) {
      throw new ForbiddenException({
        detail: 'Access denied to this brand',
        title: 'Forbidden',
      });
    }

    const docs = await this.tagsService.listLibraryTags(
      {
        brandId: query.brandId ?? user.brandId ?? null,
        organizationId: user.organizationId,
      },
      query.search,
    );

    return serializeCollection(request, TagSerializer, {
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
    });
  }

  /**
   * Create a tag in the active brand, or organization-wide with
   * `scope: 'organization'` (owners and admins only). A label that already
   * exists in the same scope reuses that tag instead of making a duplicate.
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  override async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateTagDto,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new ForbiddenException({
        detail: 'An authenticated organization is required',
        title: 'Forbidden',
      });
    }

    const label = createDto.label?.trim();
    if (!label) {
      throw new BadRequestException('A tag needs a label');
    }

    const isOrganizationWide = createDto.scope === TagScope.ORGANIZATION;
    if (isOrganizationWide) {
      await this.assertCanManageOrganizationTags(user, request);
    } else if (!user.brandId) {
      throw new BadRequestException(
        'Select a brand to create a brand tag, or create an organization-wide tag',
      );
    }

    const brandId = isOrganizationWide ? null : (user.brandId ?? null);

    const existing = await this.tagsService.findByLabelInScope({
      brandId,
      label,
      organizationId,
    });
    if (existing) {
      return serializeSingle(request, TagSerializer, existing);
    }

    const data = await this.tagsService.createInScope({
      backgroundColor: createDto.backgroundColor,
      brandId,
      category: createDto.category,
      description: createDto.description,
      key: createDto.key,
      label,
      organizationId,
      textColor: createDto.textColor,
      userId: user.userId ?? user.id,
    });

    return serializeSingle(request, TagSerializer, data);
  }

  /**
   * Delete a tag: it leaves every asset it was on, the assets stay. Legacy
   * default tags are read-only; organization-wide tags need an owner or admin.
   */
  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  override async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const existing = await this.tagsService.findOne(
      this.buildFindOneQuery(user, id, request),
    );
    if (
      !existing ||
      (!this.canUserModifyEntity(user, existing) &&
        !getIsSuperAdmin(user, request))
    ) {
      ErrorResponse.notFound(this.entityName, id);
    }

    await this.assertTagManageable(user, existing, request);

    const organizationId = existing.organizationId;
    if (!organizationId) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const data = await this.tagsService.removeDetachingAssets(
      id,
      String(organizationId),
    );
    if (!data) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(request, TagSerializer, data);
  }

  /**
   * Any member of the tag's organization may reach the tag; whether they may
   * change it is decided by `assertTagManageable`. Legacy default tags have no
   * organization and are read-only.
   */
  override canUserModifyEntity(user: User, entity: TagDocument): boolean {
    return (
      Boolean(entity.organizationId) &&
      entity.organizationId === user.organizationId
    );
  }

  override async assertPatchAllowed(
    user: User,
    existing: TagDocument,
    _updateDto: Partial<UpdateTagDto>,
    request?: Request,
  ): Promise<void> {
    await this.assertTagManageable(user, existing, request);
  }

  /**
   * Organization-wide tags are shared by every brand, so only an owner or
   * admin may change or delete them. A brand tag is managed from its own brand
   * (or by an owner or admin).
   */
  private async assertTagManageable(
    user: User,
    tag: TagDocument,
    request?: Request,
  ): Promise<void> {
    if (getIsSuperAdmin(user, request)) {
      return;
    }

    if (!tag.organizationId) {
      ErrorResponse.forbidden('Default tags are read-only');
    }

    if (!tag.brandId) {
      await this.assertCanManageOrganizationTags(user, request);
      return;
    }

    if (tag.brandId !== user.brandId) {
      await this.assertCanManageOrganizationTags(user, request);
    }
  }

  private async assertCanManageOrganizationTags(
    user: User,
    request?: Request,
  ): Promise<void> {
    if (getIsSuperAdmin(user, request)) {
      return;
    }

    const userId = user.userId ?? user.id;
    if (!user.organizationId || !userId) {
      ErrorResponse.forbidden(
        'Only an organization owner or admin can manage organization-wide tags',
      );
    }

    const member = await this.membersService.findOne(
      {
        isActive: true,
        isDeleted: false,
        organizationId: user.organizationId,
        userId,
      },
      [PopulateBuilder.withFields('role', ['id', 'key', 'label'])],
    );
    const roleKey = (member as { role?: { key?: string } } | null)?.role?.key;
    const effectiveRole = roleKey
      ? resolveApiKeyEffectiveMemberRole(user, roleKey as MemberRole)
      : undefined;

    if (
      effectiveRole !== MemberRole.OWNER &&
      effectiveRole !== MemberRole.ADMIN
    ) {
      ErrorResponse.forbidden(
        'Only an organization owner or admin can manage organization-wide tags',
      );
    }
  }

  /**
   * Override the base pipeline to load organization tags or defaults
   */
  public buildFindAllQuery(user: User, query: TagsQueryDto) {
    // Build OR conditions: global items OR user's org items OR user's items.
    // Prefer explicit `organization` query (collection style) over session org,
    // but only when authorized for that tenant.
    const orConditions: MatchConditions[] = [
      { organizationId: null, userId: null },
    ];

    const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query,
      user,
      getIsSuperAdmin(user),
    );
    const organizationId = scope.organizationId;

    if (organizationId) {
      orConditions.push({
        organizationId,
      });
    }

    if (user.userId ?? user.id) {
      orConditions.push({ userId: user.userId ?? user.id });
    }

    const matchConditions: MatchConditions = {
      isDeleted: query.isDeleted ?? false,
      ...(query.category && { category: query.category }),
      ...(scope.brandId ? { brandId: scope.brandId } : {}),
      OR: orConditions,
    };

    // Add search condition (searches across label, key, description)
    // If both search and label are provided, search takes precedence
    // Note: category is a TagCategory enum — Prisma does not support `contains` on enum fields
    if (query.search) {
      // Prisma ANDs this search group with the ownership OR above.
      matchConditions.AND = [
        {
          OR: [
            { label: { mode: 'insensitive', contains: query.search } },
            { key: { mode: 'insensitive', contains: query.search } },
            { description: { mode: 'insensitive', contains: query.search } },
          ],
        },
      ];
    } else if (query.label) {
      // Use label filter only if search is not provided
      matchConditions.label = { mode: 'insensitive', contains: query.label };
    }

    return {
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : { createdAt: -1, key: 1, label: 1 },
      where: matchConditions,
    };
  }
}
