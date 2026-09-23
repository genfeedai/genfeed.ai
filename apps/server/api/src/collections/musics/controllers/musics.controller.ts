import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MusicQueryDto } from '@api/collections/musics/dto/music-query.dto';
import { UpdateMusicDto } from '@api/collections/musics/dto/update-music.dto';
import type { MusicDocument } from '@api/collections/musics/schemas/music.schema';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { AggregatePaginateResult } from '@api/shared/controllers/base-crud/base-crud.types';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  PopulateOption,
} from '@genfeedai/contracts/interfaces';
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

    const existing = await this.musicsService.findOne({ id: id }, []);
    if (
      !existing ||
      (!this.canUserModifyEntity(user, existing) &&
        !getIsSuperAdmin(user, request))
    ) {
      ErrorResponse.notFound('Music', id);
    }

    const data = await this.musicsService.patch(
      id,
      this.enrichUpdateDto(updateDto, user),
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

    const data = await this.musicsService.remove(existing.id);
    if (!data) {
      ErrorResponse.notFound('Music', id);
    }

    return serializeSingle(request, MusicSerializer, data);
  }

  /**
   * Override buildFindAllQuery to add music-specific filtering
   */
  public buildFindAllQuery(user: User, query: MusicQueryDto) {
    // Use CollectionFilterUtil for common filtering patterns
    const brandId = CollectionFilterUtil.buildBrandFilter(
      query.brandId,
      user,
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
    const metadataWhere = {
      ...(query.search
        ? {
            OR: [
              { label: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(query.format ? { extension: query.format } : {}),
      ...(query.provider ? { externalProvider: query.provider } : {}),
    };
    const metadataFilter =
      Object.keys(metadataWhere).length > 0
        ? { metadata: { is: metadataWhere } }
        : {};

    return {
      where: {
        OR: [
          {
            brandId,
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.MUSIC,
            ),
            isDeleted: query.isDeleted ?? false,
            ...metadataFilter,
            organizationId: user.organizationId,
            status,
            userId: user.userId ?? user.id,
          },
          {
            OR: [
              { organizationId: user.organizationId },
              { organizationId: null },
            ],
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.MUSIC,
            ),
            isDefault,
            isDeleted: query.isDeleted ?? false,
            ...metadataFilter,
            ...(scope !== undefined ? { scope } : {}),
            status,
            // Filter default musics by brand when brand is specified
            ...(query.brandId && isEntityId(query.brandId) ? { brandId } : {}),
          },
        ],
      },
      orderBy: query.sort ? handleQuerySort(query.sort) : { createdAt: -1 },
    };
  }

  public buildFindOneQuery(user: User, id: string): Record<string, unknown> {
    return {
      id,
      OR: [
        { organizationId: user.organizationId },
        { isDefault: true, organizationId: null },
      ],
      category: CategoryPrismaUtil.toIngredientCategory(
        IngredientCategory.MUSIC,
      ),
      isDeleted: false,
    };
  }

  public canUserModifyEntity(user: User, entity: MusicDocument): boolean {
    return (
      entity.organizationId === user.organizationId &&
      entity.userId === (user.userId ?? user.id)
    );
  }

  private enrichUpdateDto(
    updateDto: UpdateMusicDto,
    user: User,
  ): UpdateMusicDto {
    return {
      ...updateDto,
      brandId: updateDto.brandId ?? user.brandId,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };
  }
}
