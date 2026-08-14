import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { TagsQueryDto } from '@api/collections/tags/dto/tags-query.dto';
import { UpdateTagDto } from '@api/collections/tags/dto/update-tag.dto';
import type { TagDocument } from '@api/collections/tags/schemas/tag.schema';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { TagSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller } from '@nestjs/common';

type MatchConditions = Record<string, unknown>;

@AutoSwagger()
@Controller('tags')
export class TagsController extends BaseCRUDController<
  TagDocument,
  CreateTagDto,
  UpdateTagDto,
  TagsQueryDto
> {
  constructor(
    public readonly tagsService: TagsService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, tagsService, TagSerializer, 'Tag', [
      'organization',
      'brand',
      'user',
    ]);
  }

  /**
   * Override the base pipeline to load organization tags or defaults
   */
  public buildFindAllQuery(user: User, query: TagsQueryDto) {
    // Build OR conditions: global items OR user's org items OR user's items.
    // Prefer explicit `organization` query (collection style) over session org,
    // but only when authorized for that tenant.
    const orConditions: MatchConditions[] = [
      { organizationId: null, userId: null },
    ];

    const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query,
      user,
      getIsSuperAdmin(user),
    );
    const organizationId = scope.organizationId;

    if (organizationId) {
      orConditions.push({
        organizationId,
      });
    }

    if (user.userId ?? user.id) {
      orConditions.push({ userId: user.userId ?? user.id });
    }

    const matchConditions: MatchConditions = {
      isDeleted: query.isDeleted ?? false,
      ...(query.category && { category: query.category }),
      ...(scope.brandId ? { brandId: scope.brandId } : {}),
      OR: orConditions,
    };

    // Add search condition (searches across label, key, description)
    // If both search and label are provided, search takes precedence
    // Note: category is a TagCategory enum — Prisma does not support `contains` on enum fields
    if (query.search) {
      // Prisma ANDs this search group with the ownership OR above.
      matchConditions.AND = [
        {
          OR: [
            { label: { mode: 'insensitive', contains: query.search } },
            { key: { mode: 'insensitive', contains: query.search } },
            { description: { mode: 'insensitive', contains: query.search } },
          ],
        },
      ];
    } else if (query.label) {
      // Use label filter only if search is not provided
      matchConditions.label = { mode: 'insensitive', contains: query.label };
    }

    return {
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : { createdAt: -1, key: 1, label: 1 },
      where: matchConditions,
    };
  }
}
