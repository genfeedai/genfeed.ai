import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MusicQueryDto } from '@api/collections/musics/dto/music-query.dto';
import { UpdateMusicDto } from '@api/collections/musics/dto/update-music.dto';
import type { MusicDocument } from '@api/collections/musics/schemas/music.schema';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { AggregatePaginateResult } from '@api/shared/controllers/base-crud/base-crud.types';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  PopulateOption,
} from '@genfeedai/interfaces';
import { MusicSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

const MUSIC_POPULATE_FIELDS: PopulateOption[] = [
  PopulatePatterns.metadataFull,
  PopulatePatterns.brandMinimal,
];

@AutoSwagger()
@Controller('musics')
@UseGuards(RolesGuard)
export class MusicsController {
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly loggerService: LoggerService,
    private readonly musicsService: MusicsService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: MusicQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const data: AggregatePaginateResult<MusicDocument> =
      await this.musicsService.findAll(
        this.buildFindAllQuery(user, query),
        options,
      );

    return serializeCollection(request, MusicSerializer, data);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound('Music', id);
    }

    const data = await this.musicsService.findOne(
      this.buildFindOneQuery(user, id),
      MUSIC_POPULATE_FIELDS,
    );
    if (!data) {
      ErrorResponse.notFound('Music', id);
    }

    return serializeSingle(request, MusicSerializer, data);
  }

  @Patch(':id')
  async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateMusicDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { params: { id }, updateDto });

    if (!isEntityId(id)) {
      ErrorResponse.notFound('Music', id);
    }

    const existing = await this.musicsService.findOne({ _id: id }, []);
    if (
      !existing ||
      (!this.canUserModifyEntity(user, existing) &&
        !getIsSuperAdmin(user, request))
    ) {
      ErrorResponse.notFound('Music', id);
    }

    const data = await this.musicsService.patch(
      id,
      await this.enrichUpdateDto(updateDto, user),
      MUSIC_POPULATE_FIELDS,
    );
    if (!data) {
      ErrorResponse.notFound('Music', id);
    }

    return serializeSingle(request, MusicSerializer, data);
  }

  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound('Music', id);
    }

    const existing = await this.musicsService.findOne(
      this.buildFindOneQuery(user, id),
    );
    if (!existing || !this.canUserModifyEntity(user, existing)) {
      ErrorResponse.notFound('Music', id);
    }

    const canonicalId = EntityIdUtil.resolveCanonicalId(existing, id);
    const data = await this.musicsService.remove(canonicalId);
    if (!data) {
      ErrorResponse.notFound('Music', id);
    }

    return serializeSingle(request, MusicSerializer, data);
  }

  /**
   * Override buildFindAllQuery to add music-specific filtering
   */
  public buildFindAllQuery(user: User, query: MusicQueryDto) {
    const publicMetadata = getPublicMetadata(user);

    // Use CollectionFilterUtil for common filtering patterns
    const brand = CollectionFilterUtil.buildBrandFilter(
      query.brand,
      publicMetadata,
      'user',
    );

    // Ingredient.isDefault is a non-nullable Boolean column; { not: null } is not
    // a valid Prisma filter shape for it (only nullable fields accept `not: null`)
    // and crashed this endpoint with PrismaClientValidationError. This OR branch
    // exists specifically to surface the org's default music tracks, so default
    // to { equals: true } when the caller doesn't filter explicitly.
    const isDefault = CollectionFilterUtil.buildBooleanFilter(query.isDefault, {
      equals: true,
    });

    const scope = CollectionFilterUtil.buildScopeFilter(query.scope);

    const status = QueryDefaultsUtil.parseMusicStatusFilter(query.status);

    return {
      where: {
        OR: [
          {
            brandId: brand,
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.MUSIC,
            ),
            isDeleted: query.isDeleted ?? false,
            organizationId: publicMetadata.organization,
            status,
            userId: publicMetadata.user,
          },
          {
            OR: [
              { organizationId: publicMetadata.organization },
              { organizationId: null },
            ],
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.MUSIC,
            ),
            isDefault,
            isDeleted: query.isDeleted ?? false,
            ...(scope !== undefined ? { scope } : {}),
            status,
            // Filter default musics by brand when brand is specified
            ...(query.brand && isEntityId(query.brand)
              ? { brandId: brand }
              : {}),
          },
        ],
      },
      orderBy: query.sort ? handleQuerySort(query.sort) : { createdAt: -1 },
    };
  }

  public buildFindOneQuery(user: User, id: string): Record<string, unknown> {
    const publicMetadata = getPublicMetadata(user);

    return {
      _id: id,
      OR: [
        { organizationId: publicMetadata.organization },
        { isDefault: true, organizationId: null },
      ],
      category: CategoryPrismaUtil.toIngredientCategory(
        IngredientCategory.MUSIC,
      ),
      isDeleted: false,
    };
  }

  public canUserModifyEntity(user: User, entity: MusicDocument): boolean {
    const publicMetadata = getPublicMetadata(user);
    const music = entity as unknown as Record<string, unknown>;

    return (
      music.organizationId === publicMetadata.organization &&
      music.userId === publicMetadata.user
    );
  }

  private async enrichUpdateDto(
    updateDto: UpdateMusicDto,
    user: User,
  ): Promise<UpdateMusicDto> {
    const publicMetadata = getPublicMetadata(user);
    const dto = { ...updateDto } as Record<string, unknown>;

    for (const field of ['parent', 'folder', 'brand', 'organization']) {
      if (Object.hasOwn(dto, field)) {
        dto[field] = await EntityIdUtil.convertRelationshipField(
          dto[field],
          field,
        );
      }
    }

    return {
      ...dto,
      brand: Object.hasOwn(dto, 'brand') ? dto.brand : publicMetadata.brand,
      organization: Object.hasOwn(dto, 'organization')
        ? dto.organization
        : publicMetadata.organization,
      user: publicMetadata.user,
    } as UpdateMusicDto;
  }
}
