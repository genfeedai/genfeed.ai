import { BlacklistsQueryDto } from '@api/collections/elements/blacklists/dto/blacklists-query.dto';
import { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';
import { UpdateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/update-blacklist.dto';
import {
  ElementBlacklist,
  type ElementBlacklistDocument,
} from '@api/collections/elements/blacklists/schemas/blacklist.schema';
import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import type { User } from '@clerk/backend';
import type { SortObject } from '@genfeedai/interfaces';
import { BlacklistSerializer } from '@genfeedai/serializers';
import { MemberRole } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { isValidObjectId, type PipelineStage, Types } from 'mongoose';

@AutoSwagger()
@Controller('elements/blacklists')
@ApiTags('blacklists')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ElementsBlacklistsController extends BaseCRUDController<
  ElementBlacklistDocument,
  CreateElementBlacklistDto,
  UpdateElementBlacklistDto,
  BlacklistsQueryDto
> {
  constructor(
    public readonly blacklistsService: ElementsBlacklistsService,
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      blacklistsService,
      BlacklistSerializer,
      ElementBlacklist.name,
    );
  }

  /**
   * Override buildFindAllPipeline to implement blacklist-specific filtering
   * - Blacklists don't have a user field, they have addedBy and organization
   * - Filter by organization for non-superadmins
   * - Show all for superadmins
   */
  public buildFindAllPipeline(
    user: User,
    query: BlacklistsQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);
    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    // Build OR conditions for ownership: global items OR user's org items OR user's items
    const orConditions: unknown = [
      { organization: { $exists: false }, user: { $exists: false } }, // global items
    ];

    if (publicMetadata.organization) {
      orConditions.push({
        organization: new Types.ObjectId(publicMetadata.organization),
      });
    }

    if (publicMetadata.user) {
      orConditions.push({ user: new Types.ObjectId(publicMetadata.user) });
    }

    // Build conditions array for $and
    const conditions = [];

    // Filter by value if provided (search functionality)
    if (query.value) {
      conditions.push({
        $or: [
          { label: { $options: 'i', $regex: query.value } },
          { description: { $options: 'i', $regex: query.value } },
        ],
      });
    }

    // Add ownership condition to $and array (skip when admin filter is active)
    if (!adminFilter) {
      conditions.push({ $or: orConditions });
    }

    const builder = PipelineBuilder.create().match({
      isDeleted: query.isDeleted ?? false,
      ...(query.category && { category: query.category }),
      ...(adminFilter ?? {}),
      ...(conditions.length > 0 && { $and: conditions }),
    });

    // Add sorting - default to newest first
    builder.sort(
      query.sort ? handleQuerySort(query.sort) : ({ label: 1 } as SortObject),
    );

    return builder.build();
  }

  /**
   * Override enrichCreateDto
   */
  public enrichCreateDto(
    createDto: CreateElementBlacklistDto,
    user: User,
  ): CreateElementBlacklistDto {
    const publicMetadata = getPublicMetadata(user);
    const enriched: unknown = { ...createDto };

    // Add organization if not super admin
    if (!getIsSuperAdmin(user) && publicMetadata.organization) {
      enriched.organization = new Types.ObjectId(publicMetadata.organization);
    }

    // Do NOT add user field - Blacklist schema doesn't have it
    return enriched;
  }

  /**
   * Override enrichUpdateDto to not add user field
   */
  public enrichUpdateDto(
    updateDto: UpdateElementBlacklistDto,
  ): Promise<UpdateElementBlacklistDto> {
    const enriched: unknown = { ...updateDto };

    // Only add organization if it's being updated
    if (enriched.organization) {
      enriched.organization = new Types.ObjectId(enriched.organization);
    }

    // Do NOT add user field - Blacklist schema doesn't have it
    return enriched;
  }

  /**
   * Override canUserModifyEntity to use organization/addedBy authorization
   */
  public canUserModifyEntity(user: User, entity: unknown): boolean {
    const publicMetadata = getPublicMetadata(user);

    // Superadmins can modify any blacklist entry
    if (getIsSuperAdmin(user)) {
      return true;
    }

    // Check organization ownership (for organization-level blacklists)
    const entityOrgId =
      entity.organization?._id?.toString() || entity.organization?.toString();
    if (entityOrgId && entityOrgId === publicMetadata.organization) {
      return true;
    }

    return false;
  }

  @Get(':blacklistId')
  @ApiOperation({ summary: 'Get a specific blacklist entry' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('blacklistId') blacklistId: string,
  ) {
    return super.findOne(request, _user, blacklistId);
  }

  @Post()
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Create a new blacklist entry' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementBlacklistDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':blacklistId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a blacklist entry' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('blacklistId') blacklistId: string,
    @Body() updateDto: UpdateElementBlacklistDto,
  ) {
    if (!isValidObjectId(blacklistId)) {
      ErrorResponse.notFound(this.entityName, blacklistId);
    }

    // Check ownership before update - don't populate 'user' field since blacklists don't have it
    const existing = await this.blacklistsService.findOne(
      { _id: new Types.ObjectId(blacklistId) },
      [], // No population needed for ownership check
    );

    if (!existing) {
      ErrorResponse.notFound(this.entityName, blacklistId);
    }

    const publicMetadata = getPublicMetadata(user);

    // Return 404 instead of 403 for security
    if (!this.canUserModifyEntity(user, existing) && !getIsSuperAdmin(user)) {
      ErrorResponse.notFound(this.entityName, blacklistId);
    }

    // Enrich the update DTO
    const enrichedDto = await this.enrichUpdateDto(updateDto);

    const data = await this.blacklistsService.patch(
      blacklistId,
      enrichedDto,
      this.getPopulateFields(),
    );

    if (!data) {
      ErrorResponse.notFound(this.entityName, blacklistId);
    }

    return serializeSingle(request, this.serializer, data);
  }

  @Delete(':blacklistId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a blacklist entry' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('blacklistId') blacklistId: string,
  ) {
    return super.remove(request, user, blacklistId);
  }
}
