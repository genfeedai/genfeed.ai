import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { buildElementFindAllQuery } from '@api/collections/elements/shared/build-element-find-all-pipeline.util';
import { ElementsCRUDController } from '@api/collections/elements/shared/elements-crud.controller';
import { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';
import { UpdateElementSoundDto } from '@api/collections/elements/sounds/dto/update-sound.dto';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { MemberRole } from '@genfeedai/contracts';
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
export class ElementsSoundsController extends ElementsCRUDController<
  ElementSound,
  CreateElementSoundDto,
  UpdateElementSoundDto,
  BaseQueryDto
> {
  constructor(
    public readonly soundsService: ElementsSoundsService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, soundsService, SoundSerializer, 'ElementSound');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific sound' })
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
  @ApiOperation({ summary: 'Create a new sound' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementSoundDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a sound' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateElementSoundDto,
  ) {
    return super.patch(request, user, id, updateDto);
  }

  @Delete(':id')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a sound' })
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
