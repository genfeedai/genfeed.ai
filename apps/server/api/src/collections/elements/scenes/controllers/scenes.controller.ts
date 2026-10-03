import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateElementSceneDto } from '@api/collections/elements/scenes/dto/create-scene.dto';
import { UpdateElementSceneDto } from '@api/collections/elements/scenes/dto/update-scene.dto';
import type { ElementSceneDocument } from '@api/collections/elements/scenes/schemas/scene.schema';
import { ElementsScenesService } from '@api/collections/elements/scenes/services/scenes.service';
import { buildElementFindAllQuery } from '@api/collections/elements/shared/build-element-find-all-pipeline.util';
import { ElementsCRUDController } from '@api/collections/elements/shared/elements-crud.controller';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { MemberRole } from '@genfeedai/contracts';
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
export class ElementsScenesController extends ElementsCRUDController<
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

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific scene' })
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
  @ApiOperation({ summary: 'Create a new scene' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementSceneDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a scene' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateElementSceneDto,
  ) {
    return super.patch(request, user, id, updateDto);
  }

  @Delete(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a scene' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return super.remove(request, user, id);
  }

  public buildFindAllQuery(user: User, query: BaseQueryDto) {
    return buildElementFindAllQuery({
      adminFilter: CollectionFilterUtil.buildAdminFilter(user, query),
      filters:
        typeof query.isFavorite === 'boolean'
          ? { isFavorite: query.isFavorite }
          : undefined,
      metadata: {
        isSuperAdmin: getIsSuperAdmin(user),
        organizationId: user.organizationId,
      },
      query,
    });
  }
}
