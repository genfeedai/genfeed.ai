import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateElementCameraDto } from '@api/collections/elements/cameras/dto/create-camera.dto';
import { UpdateElementCameraDto } from '@api/collections/elements/cameras/dto/update-camera.dto';
import type { ElementCameraDocument } from '@api/collections/elements/cameras/schemas/camera.schema';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { buildElementFindAllQuery } from '@api/collections/elements/shared/build-element-find-all-pipeline.util';
import { canModifyOrganizationElement } from '@api/collections/elements/shared/can-modify-organization-element.util';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { MemberRole } from '@genfeedai/enums';
import { CameraSerializer } from '@genfeedai/serializers';
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
    super(loggerService, camerasService, CameraSerializer, 'ElementCamera');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific camera' })
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
  @ApiOperation({ summary: 'Create a new camera' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementCameraDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a camera' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateElementCameraDto,
  ) {
    return super.patch(request, user, id, updateDto);
  }

  @Delete(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a camera' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return super.remove(request, user, id);
  }

  public buildFindAllQuery(user: User, query: BaseQueryDto) {
    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);

    return buildElementFindAllQuery({
      adminFilter,
      metadata: {
        organizationId: user.organizationId,
      },
      query,
    });
  }

  public override canUserModifyEntity(
    user: User,
    entity: ElementCameraDocument,
  ): boolean {
    return canModifyOrganizationElement(user, entity);
  }
}
