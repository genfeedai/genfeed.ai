import { CreateElementLightingDto } from '@api/collections/elements/lightings/dto/create-lighting.dto';
import { UpdateElementLightingDto } from '@api/collections/elements/lightings/dto/update-lighting.dto';
import {
  ElementLighting,
  type ElementLightingDocument,
} from '@api/collections/elements/lightings/schemas/lighting.schema';
import { ElementsLightingsService } from '@api/collections/elements/lightings/services/lightings.service';
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
import { LightingSerializer } from '@genfeedai/serializers';
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
@Controller('elements/lightings')
@ApiTags('lightings')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ElementsLightingsController extends BaseCRUDController<
  ElementLightingDocument,
  CreateElementLightingDto,
  UpdateElementLightingDto,
  BaseQueryDto
> {
  constructor(
    public readonly lightingsService: ElementsLightingsService,
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      lightingsService,
      LightingSerializer,
      ElementLighting.name,
    );
  }

  @Get(':lightingId')
  @ApiOperation({ summary: 'Get a specific lighting' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('lightingId') lightingId: string,
  ) {
    return super.findOne(request, _user, lightingId);
  }

  @Post()
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Create a new lighting' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementLightingDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':lightingId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a lighting' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('lightingId') lightingId: string,
    @Body() updateDto: UpdateElementLightingDto,
  ) {
    return super.patch(request, user, lightingId, updateDto);
  }

  @Delete(':lightingId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a lighting' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('lightingId') lightingId: string,
  ) {
    return super.remove(request, user, lightingId);
  }

  /**
   * Override the base pipeline to load lightings
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
