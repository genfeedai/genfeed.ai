import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { TagsQueryDto } from '@api/collections/tags/dto/tags-query.dto';
import { UpdateTagDto } from '@api/collections/tags/dto/update-tag.dto';
import {
  Tag,
  type TagDocument,
} from '@api/collections/tags/schemas/tag.schema';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
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
    const publicMetadata = getPublicMetadata(user);

    // Build OR conditions: global items OR user's org items OR user's items
    const orConditions: MatchConditions[] = [
      { organization: null, user: null }, // global items (null, not missing)
    ];

    if (publicMetadata.organization) {
      orConditions.push({
        organization: publicMetadata.organization,
      });
    }

    if (publicMetadata.user) {
      orConditions.push({ user: publicMetadata.user });
    }

    const matchConditions: MatchConditions = {
      isDeleted: query.isDeleted ?? false,
      ...(query.category && { category: query.category }),
      ...(query.brand && { brand: query.brand }),
      OR: orConditions,
    };

    // Add search condition (searches across label, key, description, category)
    // If both search and label are provided, search takes precedence
    if (query.search) {
      // Add search OR condition - MongoDB will AND it with the organization OR
      matchConditions.AND = [
        {
          OR: [
            { label: { mode: 'insensitive', contains: query.search } },
            { key: { mode: 'insensitive', contains: query.search } },
            { description: { mode: 'insensitive', contains: query.search } },
            { category: { mode: 'insensitive', contains: query.search } },
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

  /**
   * Override enrichCreateDto to support global tags
   * If user is explicitly null, create global tag (all org/user/brand set to null)
   * Otherwise, enrich with authenticated user context (normal tag)
   */
  public enrichCreateDto(
    createDto: Partial<CreateTagDto> & { user?: string | null },
    user: User,
  ): CreateTagDto {
    const dtoRecord = createDto as Record<string, unknown>;

    // Check if explicitly requesting global tag (user explicitly set to null)
    if (dtoRecord.user === null) {
      // Create global tag - set user/org/brand to null
      return {
        ...createDto,
        brand: null,
        organization: null,
        user: null,
      } as unknown as CreateTagDto;
    }

    // Normal tag creation - enrich with authenticated user context
    return super.enrichCreateDto(createDto, user);
  }
}
