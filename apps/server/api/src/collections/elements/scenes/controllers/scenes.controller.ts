import { CreateElementSceneDto } from '@api/collections/elements/scenes/dto/create-scene.dto';
import { UpdateElementSceneDto } from '@api/collections/elements/scenes/dto/update-scene.dto';
import {
  ElementScene,
  type ElementSceneDocument,
} from '@api/collections/elements/scenes/schemas/scene.schema';
import { ElementsScenesService } from '@api/collections/elements/scenes/services/scenes.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import { MemberRole } from '@genfeedai/enums';
import { SceneSerializer } from '@genfeedai/serializers';
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

@AutoSwagger()
@Controller('elements/scenes')
@ApiTags('scenes')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ElementsScenesController extends BaseCRUDController<
  ElementSceneDocument,
  CreateElementSceneDto,
  UpdateElementSceneDto,
  BaseQueryDto
> {
  constructor(
    public readonly scenesService: ElementsScenesService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, scenesService, SceneSerializer, 'ElementScene');
  }

  @Get(':sceneId')
  @ApiOperation({ summary: 'Get a specific scene' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('sceneId') sceneId: string,
  ) {
    return super.findOne(request, _user, sceneId);
  }

  @Post()
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Create a new scene' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementSceneDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':sceneId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a scene' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('sceneId') sceneId: string,
    @Body() updateDto: UpdateElementSceneDto,
  ) {
    return super.patch(request, user, sceneId, updateDto);
  }

  @Delete(':sceneId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a scene' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('sceneId') sceneId: string,
  ) {
    return super.remove(request, user, sceneId);
  }

  /**
   * Override the base pipeline to load scenes
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   */
  public buildFindAllQuery(user: User, query: BaseQueryDto) {
    const publicMetadata = getPublicMetadata(user);
    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    // Build OR conditions: global items OR user's org items OR user's items
    const orConditions: unknown[] = [
      { organization: null, user: null }, // global items
    ];

    if (publicMetadata.organization) {
      orConditions.push({
        organization: publicMetadata.organization,
      });
    }

    if (publicMetadata.user) {
      orConditions.push({ user: publicMetadata.user });
    }

    return {
      where: {
        isDeleted: query.isDeleted ?? false,
        ...(typeof query.isFavorite === 'boolean' && {
          isFavorite: query.isFavorite,
        }),
        ...(adminFilter ?? { OR: orConditions }),
      },
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : { createdAt: -1, key: 1 },
    };
  }
}
