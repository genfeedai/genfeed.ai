import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { MusicQueryDto } from '@api/collections/musics/dto/music-query.dto';
import { UpdateMusicDto } from '@api/collections/musics/dto/update-music.dto';
import type { MusicDocument } from '@api/collections/musics/schemas/music.schema';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { IngredientCategory } from '@genfeedai/enums';
import { MusicSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, UseGuards } from '@nestjs/common';

@AutoSwagger()
@Controller('musics')
@UseGuards(RolesGuard)
export class MusicsController extends BaseCRUDController<
  MusicDocument,
  CreateMusicDto,
  UpdateMusicDto,
  MusicQueryDto
> {
  constructor(
    readonly loggerService: LoggerService,
    private readonly musicsService: MusicsService,
  ) {
    super(loggerService, musicsService, MusicSerializer, 'Music', [
      'metadata',
      'brand',
    ]);
  }

  /**
   * Override buildFindAllQuery to add music-specific filtering.
   *
   * Newest-first by default (`orderBy: { createdAt: -1 }`), so `GET /musics`
   * is the canonical "latest musics" list (the former `/musics/latest` shortcut
   * was collapsed into this endpoint in the REST audit).
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
            brand,
            category: IngredientCategory.MUSIC,
            isDeleted: query.isDeleted ?? false,
            status,
            user: publicMetadata.user,
          },
          {
            category: IngredientCategory.MUSIC,
            isDefault,
            isDeleted: query.isDeleted ?? false,
            ...(scope !== undefined ? { scope } : {}),
            status,
            // Filter default musics by brand when brand is specified
            ...(query.brand && isEntityId(query.brand) ? { brand } : {}),
          },
        ],
      },
      orderBy: query.sort ? handleQuerySort(query.sort) : { createdAt: -1 },
    };
  }
}
