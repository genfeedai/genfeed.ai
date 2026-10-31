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
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { PresetFilterUtil } from '@api/helpers/utils/preset-filter/preset-filter.util';
import { buildSearchWhere } from '@api/helpers/utils/search-where/search-where.util';
import { handleStableAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ScopedCRUDController } from '@api/shared/controllers/base-crud/scoped-crud.controller';
import type { SortObject } from '@genfeedai/contracts/interfaces';
import { PresetSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Columns the presets list can be ordered by. A preset's label and key live in
 * its JSON `config`, which Prisma cannot order by.
 */
export const PRESET_SORT_FIELDS: readonly string[] = [
  'category',
  'createdAt',
  'isActive',
];

@AutoSwagger()
@ApiTags('presets')
@ApiBearerAuth()
@Controller('presets')
@UseGuards(RolesGuard)
export class PresetsController extends ScopedCRUDController<
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

  @TenantReadPolicy('selected')
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  override findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PresetsQueryDto,
  ) {
    return super.findAll(request, user, query);
  }

  protected buildScopeConditions(user: User): Record<string, unknown>[] {
    return PresetFilterUtil.buildScopeOrConditions(user);
  }

  /**
   * Override buildFindAllQuery to implement preset-specific filtering
   * Load items with: (no org AND no user) OR (user's org) OR (user's user)
   * Uses PresetFilterUtil for consistent three-tier scope filtering
   */
  public buildFindAllQuery(user: User, query: PresetsQueryDto) {
    const readScope = resolveTenantReadScope(user);
    const matchStage = PresetFilterUtil.buildBaseMatch(
      {
        organizationId: readScope.organizationId,
        userId: user.userId ?? user.id,
      },
      {
        category: query.category,
        isActive: query.isActive,
        isFavorite: query.isFavorite,
      },
      query.isDeleted ?? false,
    );

    const where: Record<string, unknown> = {
      ...matchStage,
      ...buildSearchWhere(query.search, {
        json: { config: ['label', 'key', 'description'] },
      }),
    };

    return {
      where,
      orderBy: query.sort
        ? handleStableAllowedQuerySort(query.sort, PRESET_SORT_FIELDS, {
            createdAt: -1,
          })
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
