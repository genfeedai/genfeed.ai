import { CreateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/create-camera-movement.dto';
import { UpdateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/update-camera-movement.dto';
import {
  ElementCameraMovement,
  type ElementCameraMovementDocument,
} from '@api/collections/elements/camera-movements/schemas/camera-movement.schema';
import { ElementsCameraMovementsService } from '@api/collections/elements/camera-movements/services/camera-movements.service';
import { buildElementFindAllPipeline } from '@api/collections/elements/shared/build-element-find-all-pipeline.util';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import { CameraMovementSerializer } from '@genfeedai/serializers';
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
import type { PipelineStage } from 'mongoose';

@AutoSwagger()
@Controller('elements/camera-movements')
@ApiTags('camera-movements')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ElementsCameraMovementsController extends BaseCRUDController<
  ElementCameraMovementDocument,
  CreateElementCameraMovementDto,
  UpdateElementCameraMovementDto,
  BaseQueryDto
> {
  constructor(
    public readonly cameraMovementsService: ElementsCameraMovementsService,
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      cameraMovementsService,
      CameraMovementSerializer,
      ElementCameraMovement.name,
    );
  }

  @Get(':cameraMovementId')
  @ApiOperation({ summary: 'Get a specific camera movement' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('cameraMovementId') cameraMovementId: string,
  ) {
    return super.findOne(request, _user, cameraMovementId);
  }

  @Post()
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Create a new camera movement' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementCameraMovementDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':cameraMovementId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a camera movement' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('cameraMovementId') cameraMovementId: string,
    @Body() updateDto: UpdateElementCameraMovementDto,
  ) {
    return super.patch(request, user, cameraMovementId, updateDto);
  }

  @Delete(':cameraMovementId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a camera movement' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('cameraMovementId') cameraMovementId: string,
  ) {
    return super.remove(request, user, cameraMovementId);
  }

  /**
   * Override the base pipeline to load camera movements
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   */
  public buildFindAllPipeline(
    user: User,
    query: BaseQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);
    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    return buildElementFindAllPipeline({
      adminFilter,
      includeStateFilters: true,
      metadata: {
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      },
      query,
      searchableFields: ['label', 'description', 'key'],
    });
  }
}
