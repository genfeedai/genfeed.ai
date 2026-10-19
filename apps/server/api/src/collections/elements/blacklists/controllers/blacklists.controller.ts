import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BlacklistsQueryDto } from '@api/collections/elements/blacklists/dto/blacklists-query.dto';
import { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';
import { UpdateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/update-blacklist.dto';
import type { ElementBlacklistDocument } from '@api/collections/elements/blacklists/schemas/blacklist.schema';
import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { buildElementFindAllQuery } from '@api/collections/elements/shared/build-element-find-all-pipeline.util';
import { ElementsCRUDController } from '@api/collections/elements/shared/elements-crud.controller';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { MemberRole } from '@genfeedai/contracts';
import { BlacklistSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
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

@AutoSwagger()
@Controller('elements/blacklists')
@ApiTags('blacklists')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ElementsBlacklistsController extends ElementsCRUDController<
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
   * Platform defaults plus the caller organization's own blacklists. A
   * superadmin naming an organization sees that organization's rows instead.
   */
  public buildFindAllQuery(user: User, query: BlacklistsQueryDto) {
    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);
    const findAllQuery = buildElementFindAllQuery({
      adminFilter,
      filters: query.category ? { category: query.category } : undefined,
      metadata: {
        isSuperAdmin: getIsSuperAdmin(user),
        organizationId: user.organizationId,
      },
      query,
    });

    if (!query.value) {
      return findAllQuery;
    }

    return {
      ...findAllQuery,
      where: {
        ...(findAllQuery.where as Record<string, unknown>),
        AND: [
          {
            OR: [
              { label: { contains: query.value, mode: 'insensitive' } },
              { description: { contains: query.value, mode: 'insensitive' } },
            ],
          },
        ],
      },
    };
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

    // Superadmins may edit another organization's entry; everyone else is
    // pinned to their own organization.
    const isSuperAdmin = getIsSuperAdmin(user, request);

    // Check ownership before update - don't populate 'user' field since blacklists don't have it
    const existing = isSuperAdmin
      ? await crossOrgUnsafe(
          async () => await this.blacklistsService.findOne({ id }, []),
        )
      : await this.blacklistsService.findOne(
          scopedWhere(user.organizationId, { id }),
          [], // No population needed for ownership check
        );

    if (!existing) {
      ErrorResponse.notFound(this.entityName, id);
    }

    // Return 404 instead of 403 for security
    if (!this.canUserModifyEntity(user, existing)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const enrichedDto = await this.enrichUpdateDto(updateDto, user);

    // `BaseService.patch` writes by id alone, which the tenant guard rejects;
    // write through the tenant-scoped predicate instead.
    const data =
      isSuperAdmin && existing.organizationId !== user.organizationId
        ? await crossOrgUnsafe(
            async () =>
              await this.blacklistsService.patchOneWhere(
                { id },
                enrichedDto,
                this.getPopulateFields(),
              ),
          )
        : await this.blacklistsService.patchOneWhere(
            scopedWhere(user.organizationId, { id }),
            enrichedDto,
            this.getPopulateFields(),
          );

    if (!data) {
      ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(
      request,
      this.serializer,
      this.decorateForResponse(data, user),
    );
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
