import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { PresetsQueryDto } from '@api/collections/presets/dto/presets-query.dto';
import { UpdatePresetDto } from '@api/collections/presets/dto/update-preset.dto';
import {
  Preset,
  type PresetDocument,
} from '@api/collections/presets/schemas/preset.schema';
import { PresetsService } from '@api/collections/presets/services/presets.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { PresetFilterUtil } from '@api/helpers/utils/preset-filter/preset-filter.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import type { SortObject } from '@genfeedai/interfaces';
import { PresetSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { isValidObjectId, type PipelineStage, Types } from 'mongoose';

@AutoSwagger()
@ApiTags('presets')
@ApiBearerAuth()
@Controller('presets')
@UseGuards(RolesGuard)
export class PresetsController extends BaseCRUDController<
  PresetDocument,
  CreatePresetDto,
  UpdatePresetDto,
  PresetsQueryDto
> {
  constructor(
    public readonly presetsService: PresetsService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, presetsService, PresetSerializer, Preset.name);
  }

  /**
   * Override buildFindAllPipeline to implement preset-specific filtering
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   * Uses PresetFilterUtil for consistent three-tier scope filtering
   */
  public buildFindAllPipeline(
    user: User,
    query: PresetsQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);

    // Use PresetFilterUtil to build base match stage
    const matchStage = PresetFilterUtil.buildBaseMatch(
      publicMetadata,
      {
        category: query.category,
        isActive: query.isActive,
        isFavorite: query.isFavorite,
      },
      query.isDeleted ?? false,
    );

    return [
      { $match: matchStage },
      {
        $sort: query.sort
          ? handleQuerySort(query.sort)
          : ({ createdAt: -1, key: 1, label: 1, type: 1 } as SortObject),
      },
    ];
  }

  /**
   * Override enrichCreateDto to handle preset-specific logic
   * - Only admins can create default presets (organization: null)
   * - Regular users create organization-specific presets
   * - Presets can be app-wide (no org/brand), org-wide (org but no brand), or brand-specific
   * Uses PresetFilterUtil for consistent enrichment logic
   */
  public enrichCreateDto(
    createDto: CreatePresetDto,
    user: User,
  ): CreatePresetDto {
    return PresetFilterUtil.enrichPresetDto(createDto, user);
  }

  /**
   * Override canUserModifyEntity to handle preset-specific authorization
   * - Admins can modify any preset
   * - Organizations can only modify their own presets (not presets without organization)
   * Uses PresetFilterUtil for consistent permission logic
   */
  public canUserModifyEntity(user: User, entity: unknown): boolean {
    return PresetFilterUtil.canUserModifyPreset(user, entity);
  }

  @Post()
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreatePresetDto,
  ) {
    return super.create(request, user, createDto);
  }

  @Patch(':presetId')
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('presetId') presetId: string,
    @Body() updateDto: UpdatePresetDto,
  ) {
    if (!isValidObjectId(presetId)) {
      ErrorResponse.notFound(this.entityName, presetId);
    }

    // Check if preset exists - don't populate 'user' since Preset doesn't have that field
    const existing = await this.presetsService.findOne({
      _id: new Types.ObjectId(presetId),
    });

    if (!existing) {
      ErrorResponse.notFound(this.entityName, presetId);
    }

    const publicMetadata = getPublicMetadata(user);

    // Return 404 instead of 403 for security
    if (
      !this.canUserModifyEntity(user, existing) &&
      !getIsSuperAdmin(user, request)
    ) {
      ErrorResponse.notFound(this.entityName, presetId);
    }

    // Update without adding user field since Preset doesn't have it
    const enrichedDto = {
      ...updateDto,
      // Only add organization if it's being updated
      ...(updateDto.organization && {
        organization: new Types.ObjectId(updateDto.organization),
      }),

      ...(updateDto.brand && {
        brand: new Types.ObjectId(updateDto.brand),
      }),
    };

    const data = await this.presetsService.patch(
      presetId,
      enrichedDto,
      this.getPopulateFields(),
    );

    if (!data) {
      ErrorResponse.notFound(this.entityName, presetId);
    }

    return serializeSingle(request, PresetSerializer, data);
  }

  @Delete(':presetId')
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('presetId') presetId: string,
  ) {
    return super.remove(request, user, presetId);
  }
}
