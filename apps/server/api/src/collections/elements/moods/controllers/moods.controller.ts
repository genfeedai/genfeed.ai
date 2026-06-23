import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateElementMoodDto } from '@api/collections/elements/moods/dto/create-mood.dto';
import { UpdateElementMoodDto } from '@api/collections/elements/moods/dto/update-mood.dto';
import {
  ElementMood,
  type ElementMoodDocument,
} from '@api/collections/elements/moods/schemas/mood.schema';
import { ElementsMoodsService } from '@api/collections/elements/moods/services/moods.service';
import { buildElementFindAllQuery } from '@api/collections/elements/shared/build-element-find-all-pipeline.util';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { MemberRole } from '@genfeedai/enums';
import { MoodSerializer } from '@genfeedai/serializers';
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
@Controller('elements/moods')
@ApiTags('moods')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ElementsMoodsController extends BaseCRUDController<
  ElementMoodDocument,
  CreateElementMoodDto,
  UpdateElementMoodDto,
  BaseQueryDto
> {
  constructor(
    public readonly moodsService: ElementsMoodsService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, moodsService, MoodSerializer, 'ElementMood');
  }

  @Get(':moodId')
  @ApiOperation({ summary: 'Get a specific mood' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('moodId') moodId: string,
  ) {
    return super.findOne(request, _user, moodId);
  }

  @Post()
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Create a new mood' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateElementMoodDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':moodId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Update a mood' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('moodId') moodId: string,
    @Body() updateDto: UpdateElementMoodDto,
  ) {
    return super.patch(request, user, moodId, updateDto);
  }

  @Delete(':moodId')
  @SetMetadata('roles', ['superadmin', MemberRole.ADMIN])
  @ApiOperation({ summary: 'Delete a mood' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('moodId') moodId: string,
  ) {
    return super.remove(request, user, moodId);
  }

  public buildFindAllQuery(user: User, query: BaseQueryDto) {
    const publicMetadata = getPublicMetadata(user);
    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    return buildElementFindAllQuery({
      adminFilter,
      metadata: {
        organization: publicMetadata.organization,
      },
      query,
    });
  }
}
