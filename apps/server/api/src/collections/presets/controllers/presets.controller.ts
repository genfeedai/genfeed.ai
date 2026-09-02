import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { PresetsQueryDto } from '@api/collections/presets/dto/presets-query.dto';
import { UpdatePresetDto } from '@api/collections/presets/dto/update-preset.dto';
import { type PresetDocument } from '@api/collections/presets/schemas/preset.schema';
import { PresetsService } from '@api/collections/presets/services/presets.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { PresetFilterUtil } from '@api/helpers/utils/preset-filter/preset-filter.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { SortObject } from '@genfeedai/contracts/interfaces';
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
    super(loggerService, presetsService, PresetSerializer, 'Preset');
  }

  /**
   * Override buildFindAllQuery to implement preset-specific filtering
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   * Uses PresetFilterUtil for consistent three-tier scope filtering
   */
  public buildFindAllQuery(user: User, query: PresetsQueryDto) {
    // Use PresetFilterUtil to build base match stage
    const matchStage = PresetFilterUtil.buildBaseMatch(
      user,
      {
        category: query.category,
        isActive: query.isActive,
        isFavorite: query.isFavorite,
      },
      query.isDeleted ?? false,
    );

    return {
      where: matchStage,
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : ({ createdAt: -1 } as SortObject),
    };
  }

  /**
   * Override enrichCreateDto to handle preset-specific logic
   * - Only admins can create default presets (organizationId: null)
   * - Regular users create organization-specific presets
   * - Presets can be app-wide, organization-wide, or brand-specific
   * Uses PresetFilterUtil for consistent enrichment logic
   */
  public enrichCreateDto(
    createDto: CreatePresetDto,
    user: User,
  ): CreatePresetDto {
    return PresetFilterUtil.enrichPresetDto(
      createDto as unknown as Record<string, unknown>,
      user,
    ) as unknown as CreatePresetDto;
  }

  /**
   * Override canUserModifyEntity to handle preset-specific authorization
   * - Admins can modify any preset
   * - Organizations can only modify their own presets (not presets without organization)
   * Uses PresetFilterUtil for consistent permission logic
   */
  public canUserModifyEntity(user: User, entity: unknown): boolean {
    return PresetFilterUtil.canUserModifyPreset(
      user,
      entity as { organizationId?: string | null },
    );
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
    return super.patch(request, user, presetId, updateDto);
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
