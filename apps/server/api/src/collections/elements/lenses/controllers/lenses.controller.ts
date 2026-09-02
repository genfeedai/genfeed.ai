import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';
import { UpdateElementLensDto } from '@api/collections/elements/lenses/dto/update-lens.dto';
import type { ElementLensDocument } from '@api/collections/elements/lenses/schemas/lens.schema';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
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
    super(loggerService, lensesService, LensSerializer, 'ElementLens');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific lens' })
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
  @ApiOperation({ summary: 'Create a new lens' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementLensDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a lens' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateElementLensDto,
  ) {
    return super.patch(request, user, id, updateDto);
  }

  @Delete(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a lens' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return super.remove(request, user, id);
  }

  /**
   * Override the base pipeline to load lenses
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
    entity: ElementLensDocument,
  ): boolean {
    return canModifyOrganizationElement(user, entity);
  }
}
