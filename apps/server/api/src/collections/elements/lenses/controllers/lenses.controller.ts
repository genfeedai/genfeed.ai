import { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';
import { UpdateElementLensDto } from '@api/collections/elements/lenses/dto/update-lens.dto';
import {
  ElementLens,
  type ElementLensDocument,
} from '@api/collections/elements/lenses/schemas/lens.schema';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
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
import { MemberRole } from '@genfeedai/enums';
import { LensSerializer } from '@genfeedai/serializers';
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
@Controller('elements/lenses')
@ApiTags('lenses')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ElementsLensesController extends BaseCRUDController<
  ElementLensDocument,
  CreateElementLensDto,
  UpdateElementLensDto,
  BaseQueryDto
> {
  constructor(
    public readonly lensesService: ElementsLensesService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, lensesService, LensSerializer, ElementLens.name);
  }

  @Get(':lensId')
  @ApiOperation({ summary: 'Get a specific lens' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('lensId') lensId: string,
  ) {
    return super.findOne(request, _user, lensId);
  }

  @Post()
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Create a new lens' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementLensDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':lensId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a lens' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('lensId') lensId: string,
    @Body() updateDto: UpdateElementLensDto,
  ) {
    return super.patch(request, user, lensId, updateDto);
  }

  @Delete(':lensId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a lens' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('lensId') lensId: string,
  ) {
    return super.remove(request, user, lensId);
  }

  /**
   * Override the base pipeline to load lenses
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
