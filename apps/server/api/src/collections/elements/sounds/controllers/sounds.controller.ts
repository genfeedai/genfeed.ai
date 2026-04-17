import { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';
import { UpdateElementSoundDto } from '@api/collections/elements/sounds/dto/update-sound.dto';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
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
    super(
      loggerService,
      soundsService as unknown,
      SoundSerializer,
      ElementSound.name,
    );
  }

  @Get(':soundId')
  @ApiOperation({ summary: 'Get a specific sound' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('soundId') soundId: string,
  ) {
    return super.findOne(request, _user, soundId);
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

  @Patch(':soundId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a sound' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('soundId') soundId: string,
    @Body() updateDto: UpdateElementSoundDto,
  ) {
    return super.patch(request, user, soundId, updateDto);
  }

  @Delete(':soundId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a sound' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('soundId') soundId: string,
  ) {
    return super.remove(request, user, soundId);
  }

  /**
   * Override the base pipeline to load sounds
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   */
  public buildFindAllPipeline(
    user: User,
    query: BaseQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);
    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    // Build OR conditions: global items OR user's org items OR user's items
    const orConditions: Record<string, unknown>[] = [
      { organization: { $exists: false }, user: { $exists: false } }, // global items
    ];

    if (publicMetadata.organization) {
      orConditions.push({
        organization: publicMetadata.organization,
      });
    }

    if (publicMetadata.user) {
      orConditions.push({ user: publicMetadata.user });
    }

    return PipelineBuilder.create()
      .match({
        isDeleted: query.isDeleted ?? false,
        ...(typeof query.isFavorite === 'boolean' && {
          isFavorite: query.isFavorite,
        }),
        ...(adminFilter ?? { $or: orConditions }),
      })
      .sort(
        query.sort ? handleQuerySort(query.sort) : { createdAt: -1, label: 1 },
      )
      .build();
  }

  /**
   * Override enrichCreateDto to handle organization
   */
  public enrichCreateDto(
    createDto: CreateElementSoundDto,
    user: User,
  ): CreateElementSoundDto {
    const publicMetadata = getPublicMetadata(user);
    const enriched: unknown = { ...createDto };

    // Add organization if not super admin
    if (!getIsSuperAdmin(user) && publicMetadata.organization) {
      enriched.organization = publicMetadata.organization;
    }

    // Sounds don't have a user field
    return enriched;
  }

  /**
   * Override enrichUpdateDto to handle organization
   */
  public enrichUpdateDto(
    updateDto: UpdateElementSoundDto,
  ): Promise<UpdateElementSoundDto> {
    const enriched: unknown = { ...updateDto };

    // Only add organization if it's being updated
    if (enriched.organization) {
      enriched.organization = enriched.organization;
    }

    // Sounds don't have a user field
    return enriched;
  }

  /**
   * Override canUserModifyEntity to use organization authorization
   */
  public canUserModifyEntity(user: User, entity: unknown): boolean {
    const publicMetadata = getPublicMetadata(user);

    // Superadmins can modify any sound
    if (getIsSuperAdmin(user)) {
      return true;
    }

    // Check organization ownership
    const entityOrgId =
      entity.organization?._id?.toString() || entity.organization?.toString();
    if (entityOrgId && entityOrgId === publicMetadata.organization) {
      return true;
    }

    // Default sounds (no organization) cannot be modified by non-superadmins
    return false;
  }

  /**
   * Override getPopulateForOwnershipCheck since sounds don't have a user field
   * Only populate organization field for ownership checks
   */
  public getPopulateForOwnershipCheck(): PopulateOption[] {
    return [PopulateBuilder.idOnly('organization')];
  }
}
