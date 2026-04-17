import { CreateFontFamilyDto } from '@api/collections/font-families/dto/create-font-family.dto';
import { UpdateFontFamilyDto } from '@api/collections/font-families/dto/update-font-family.dto';
import {
  FontFamily,
  type FontFamilyDocument,
} from '@api/collections/font-families/schemas/font-family.schema';
import { FontFamiliesService } from '@api/collections/font-families/services/font-families.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import type { User } from '@clerk/backend';
import { FontFamilySerializer } from '@genfeedai/serializers';
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('font-families')
@Controller('font-families')
@ApiBearerAuth()
@AutoSwagger()
@UseGuards(RolesGuard)
export class FontFamiliesController extends BaseCRUDController<
  FontFamilyDocument,
  CreateFontFamilyDto,
  UpdateFontFamilyDto,
  BaseQueryDto
> {
  constructor(
    public readonly fontFamiliesService: FontFamiliesService,
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      fontFamiliesService,
      FontFamilySerializer,
      FontFamily.name,
    );
  }

  @Get(':fontFamilyId')
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findOne(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('fontFamilyId') fontFamilyId: string,
  ) {
    return super.findOne(request, _user, fontFamilyId);
  }

  @Post()
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateFontFamilyDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':fontFamilyId')
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('fontFamilyId') fontFamilyId: string,
    @Body() updateDto: UpdateFontFamilyDto,
  ) {
    return super.patch(request, user, fontFamilyId, updateDto);
  }

  @Delete(':fontFamilyId')
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('fontFamilyId') fontFamilyId: string,
  ) {
    return super.remove(request, user, fontFamilyId);
  }

  /**
   * Override the base pipeline to load font families
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   */
  public buildFindAllPipeline(
    user: User,
    query: BaseQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);

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
        // @ts-expect-error TS2322
        $or: orConditions,
        isDeleted: query.isDeleted ?? false,
      })
      .sort(
        query.sort ? handleQuerySort(query.sort) : { createdAt: -1, label: 1 },
      )
      .build();
  }
}
