import { CreateElementMoodDto } from '@api/collections/elements/moods/dto/create-mood.dto';
import { UpdateElementMoodDto } from '@api/collections/elements/moods/dto/update-mood.dto';
import {
  ElementMood,
  type ElementMoodDocument,
} from '@api/collections/elements/moods/schemas/mood.schema';
import { ElementsMoodsService } from '@api/collections/elements/moods/services/moods.service';
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

  /**
   * Override the base pipeline to load moods
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   */
  public buildFindAllPipeline(
    user: User,
    query: BaseQueryDto,
  ): Record<string, unknown>[] {
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
        organization: publicMetadata.organization,
      });
    }

    if (publicMetadata.user) {
      orConditions.push({ user: publicMetadata.user });
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
