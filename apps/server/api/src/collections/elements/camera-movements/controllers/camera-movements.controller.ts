import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/create-camera-movement.dto';
import { UpdateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/update-camera-movement.dto';
import type { ElementCameraMovementDocument } from '@api/collections/elements/camera-movements/schemas/camera-movement.schema';
import { ElementsCameraMovementsService } from '@api/collections/elements/camera-movements/services/camera-movements.service';
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
import { CameraMovementSerializer } from '@genfeedai/serializers';
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
      'ElementCameraMovement',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific camera movement' })
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
  @ApiOperation({ summary: 'Create a new camera movement' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementCameraMovementDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a camera movement' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateElementCameraMovementDto,
  ) {
    return super.patch(request, user, id, updateDto);
  }

  @Delete(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a camera movement' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return super.remove(request, user, id);
  }

  /**
   * Override the base pipeline to load camera movements
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   */
  public buildFindAllQuery(user: User, query: BaseQueryDto) {
    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);

    return buildElementFindAllQuery({
      adminFilter,
      includeStateFilters: true,
      metadata: {
        organizationId: user.organizationId,
      },
      query,
      searchableFields: ['label', 'description', 'key'],
    });
  }

  public override canUserModifyEntity(
    user: User,
    entity: ElementCameraMovementDocument,
  ): boolean {
    return canModifyOrganizationElement(user, entity);
  }
}
