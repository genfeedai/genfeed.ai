import { CreateElementCameraDto } from '@api/collections/elements/cameras/dto/create-camera.dto';
import { UpdateElementCameraDto } from '@api/collections/elements/cameras/dto/update-camera.dto';
import {
  ElementCamera,
  type ElementCameraDocument,
} from '@api/collections/elements/cameras/schemas/camera.schema';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import type { User } from '@clerk/backend';
import { CameraSerializer } from '@genfeedai/serializers';
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
import { type PipelineStage, Types } from 'mongoose';

@AutoSwagger()
@Controller('elements/cameras')
@ApiTags('cameras')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ElementsCamerasController extends BaseCRUDController<
  ElementCameraDocument,
  CreateElementCameraDto,
  UpdateElementCameraDto,
  BaseQueryDto
> {
  constructor(
    public readonly camerasService: ElementsCamerasService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, camerasService, CameraSerializer, ElementCamera.name);
  }

  @Get(':cameraId')
  @ApiOperation({ summary: 'Get a specific camera' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('cameraId') cameraId: string,
  ) {
    return super.findOne(request, _user, cameraId);
  }

  @Post()
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Create a new camera' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementCameraDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':cameraId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a camera' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('cameraId') cameraId: string,
    @Body() updateDto: UpdateElementCameraDto,
  ) {
    return super.patch(request, user, cameraId, updateDto);
  }

  @Delete(':cameraId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a camera' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('cameraId') cameraId: string,
  ) {
    return super.remove(request, user, cameraId);
  }

  /**
   * Override the base pipeline to load cameras
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

    // Build OR conditions: global items OR user's org items OR user's items
    const orConditions: Record<string, unknown>[] = [
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

    return PipelineBuilder.create()
      .match({
        isDeleted: query.isDeleted ?? false,
        ...(adminFilter ?? { $or: orConditions }),
      })
      .sort(
        query.sort ? handleQuerySort(query.sort) : { createdAt: -1, label: 1 },
      )
      .build();
  }
}
