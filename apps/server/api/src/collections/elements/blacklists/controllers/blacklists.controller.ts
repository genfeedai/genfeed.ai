import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BlacklistsQueryDto } from '@api/collections/elements/blacklists/dto/blacklists-query.dto';
import { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';
import { UpdateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/update-blacklist.dto';
import type { ElementBlacklistDocument } from '@api/collections/elements/blacklists/schemas/blacklist.schema';
import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { canModifyOrganizationElement } from '@api/collections/elements/shared/can-modify-organization-element.util';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { MemberRole } from '@genfeedai/enums';
import type { SortObject } from '@genfeedai/interfaces';
import { BlacklistSerializer } from '@genfeedai/serializers';
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

type MatchConditions = Record<string, unknown>;

import { isEntityId } from '@api/helpers/validation/entity-id.validator';

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
      'ElementBlacklist',
    );
  }

  /**
   * Override buildFindAllQuery to implement blacklist-specific filtering
   * - Blacklists don't have a user field, they have addedBy and organization
   * - Filter by organization for non-superadmins
   * - Show all for superadmins
   */
  public buildFindAllQuery(user: User, query: BlacklistsQueryDto) {
    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);

    // Build OR conditions for ownership: global items OR user's org items OR user's items
    const orConditions: MatchConditions[] = [];

    if (user.organizationId) {
      orConditions.push({
        organizationId: user.organizationId,
      });
    }

    // Build conditions array for AND
    const conditions: MatchConditions[] = [];

    // Filter by value if provided (search functionality)
    if (query.value) {
      conditions.push({
        OR: [
          { label: { mode: 'insensitive', contains: query.value } },
          { description: { mode: 'insensitive', contains: query.value } },
        ],
      });
    }

    // Add ownership condition to AND array (skip when admin filter is active)
    if (!adminFilter && orConditions.length > 0) {
      conditions.push({ OR: orConditions });
    }

    const match: MatchConditions = {
      isDeleted: query.isDeleted ?? false,
      ...(query.category && { category: query.category }),
      ...((adminFilter as MatchConditions | undefined) ?? {}),
      ...(conditions.length > 0 && { AND: conditions }),
    };

    return {
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : ({ label: 1 } as SortObject),
      where: match,
    };
  }

  /**
   * Override enrichCreateDto
   */
  public enrichCreateDto(
    createDto: CreateElementBlacklistDto,
    user: User,
  ): CreateElementBlacklistDto {
    const enriched: CreateElementBlacklistDto & { organizationId?: string } = {
      ...createDto,
    };

    // Add organization if not super admin
    if (!getIsSuperAdmin(user) && user.organizationId) {
      enriched.organizationId = user.organizationId;
    }

    // Do NOT add user field - Blacklist schema doesn't have it
    return enriched as CreateElementBlacklistDto;
  }

  /**
   * Override enrichUpdateDto to not add user field
   */
  public enrichUpdateDto(
    updateDto: UpdateElementBlacklistDto,
    _user?: User,
  ): Promise<UpdateElementBlacklistDto> {
    return Promise.resolve({ ...updateDto });
  }

  /** Authorize writes against canonical organization ownership. */
  public override canUserModifyEntity(
    user: User,
    entity: ElementBlacklistDocument,
  ): boolean {
    return canModifyOrganizationElement(user, entity);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific blacklist entry' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('id') id: string,
  ) {
    return super.findOne(request, _user, id);
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

  @Patch(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a blacklist entry' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateElementBlacklistDto,
  ) {
    if (!isEntityId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Check ownership before update - don't populate 'user' field since blacklists don't have it
    const existing = await this.blacklistsService.findOne(
      { id: id },
      [], // No population needed for ownership check
    );

    if (!existing) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Return 404 instead of 403 for security
    if (!this.canUserModifyEntity(user, existing)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Enrich the update DTO
    const enrichedDto = await this.enrichUpdateDto(updateDto);

    const data = await this.blacklistsService.patch(
      id,
      enrichedDto,
      this.getPopulateFields(),
    );

    if (!data) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(request, this.serializer, data);
  }

  @Delete(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a blacklist entry' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return super.remove(request, user, id);
  }
}
