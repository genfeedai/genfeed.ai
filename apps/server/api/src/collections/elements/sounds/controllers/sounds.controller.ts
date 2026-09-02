import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { canModifyOrganizationElement } from '@api/collections/elements/shared/can-modify-organization-element.util';
import { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';
import { UpdateElementSoundDto } from '@api/collections/elements/sounds/dto/update-sound.dto';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { MemberRole } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { type ElementSound } from '@genfeedai/prisma';
import { SoundSerializer } from '@genfeedai/serializers';
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

@Controller('elements/sounds')
@ApiTags('sounds')
@ApiBearerAuth()
@AutoSwagger()
@UseGuards(RolesGuard)
export class ElementsSoundsController extends BaseCRUDController<
  ElementSound,
  CreateElementSoundDto,
  UpdateElementSoundDto,
  BaseQueryDto
> {
  constructor(
    public readonly soundsService: ElementsSoundsService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, soundsService, SoundSerializer, 'ElementSound');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific sound' })
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
  @ApiOperation({ summary: 'Create a new sound' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementSoundDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a sound' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateElementSoundDto,
  ) {
    return super.patch(request, user, id, updateDto);
  }

  @Delete(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a sound' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return super.remove(request, user, id);
  }

  /**
   * Override the base pipeline to load sounds
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   */
  public buildFindAllQuery(user: User, query: BaseQueryDto) {
    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);

    // Build OR conditions: global items OR user's org items OR user's items
    const orConditions: Record<string, unknown>[] = [];

    if (user.organizationId) {
      orConditions.push({
        organizationId: user.organizationId,
      });
    }

    return {
      where: {
        isDeleted: query.isDeleted ?? false,
        ...(typeof query.isFavorite === 'boolean' && {
          isFavorite: query.isFavorite,
        }),
        ...(adminFilter ??
          (orConditions.length > 0 ? { OR: orConditions } : {})),
      },
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : { createdAt: -1, label: 1 },
    };
  }

  /**
   * Override enrichCreateDto to handle organization
   */
  public enrichCreateDto(
    createDto: CreateElementSoundDto,
    user: User,
  ): CreateElementSoundDto {
    const enriched: CreateElementSoundDto & { organizationId?: string } = {
      ...createDto,
    };

    // Add organization if not super admin
    if (!getIsSuperAdmin(user) && user.organizationId) {
      enriched.organizationId = user.organizationId;
    }

    // Sounds don't have a user field
    return enriched as CreateElementSoundDto;
  }

  /**
   * Override enrichUpdateDto to handle organization
   */
  public enrichUpdateDto(
    updateDto: UpdateElementSoundDto,
    _user?: User,
  ): Promise<UpdateElementSoundDto> {
    return Promise.resolve({ ...updateDto });
  }

  /**
   * Override canUserModifyEntity to use organization authorization
   */
  public override canUserModifyEntity(
    user: User,
    entity: ElementSound,
  ): boolean {
    return canModifyOrganizationElement(user, entity);
  }

  /**
   * Override getPopulateForOwnershipCheck since sounds don't have a user field
   * Only populate organization field for ownership checks
   */
  public getPopulateForOwnershipCheck(): PopulateOption[] {
    return [];
  }
}
