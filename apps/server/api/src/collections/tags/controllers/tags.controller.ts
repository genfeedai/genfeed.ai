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
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import type { User } from '@clerk/backend';
import { TagSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller } from '@nestjs/common';
import { type PipelineStage, Types } from 'mongoose';

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
    super(loggerService, tagsService, TagSerializer, Tag.name, [
      'organization',
      'brand',
      'user',
    ]);
  }

  /**
   * Override the base pipeline to load organization tags or defaults
   */
  public buildFindAllPipeline(
    user: User,
    query: TagsQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);

    // Build OR conditions: global items OR user's org items OR user's items
    const orConditions: unknown = [
      { organization: null, user: null }, // global items (null, not missing)
    ];

    if (publicMetadata.organization) {
      orConditions.push({
        organization: new Types.ObjectId(publicMetadata.organization),
      });
    }

    if (publicMetadata.user) {
      orConditions.push({ user: new Types.ObjectId(publicMetadata.user) });
    }

    const matchConditions: unknown = {
      isDeleted: query.isDeleted ?? false,
      ...(query.category && { category: query.category }),
      ...(query.brand && { brand: new Types.ObjectId(query.brand) }),
      $or: orConditions,
    };

    // Add search condition (searches across label, key, description, category)
    // If both search and label are provided, search takes precedence
    if (query.search) {
      // Add search $or condition - MongoDB will AND it with the organization $or
      matchConditions.$and = [
        {
          $or: [
            { label: { $options: 'i', $regex: query.search } },
            { key: { $options: 'i', $regex: query.search } },
            { description: { $options: 'i', $regex: query.search } },
            { category: { $options: 'i', $regex: query.search } },
          ],
        },
      ];
    } else if (query.label) {
      // Use label filter only if search is not provided
      matchConditions.label = { $options: 'i', $regex: query.label };
    }

    return PipelineBuilder.create()
      .match(matchConditions)
      .sort(
        query.sort
          ? handleQuerySort(query.sort)
          : { createdAt: -1, key: 1, label: 1 },
      )
      .build();
  }

  /**
   * Override enrichCreateDto to support global tags
   * If user is explicitly null, create global tag (all org/user/brand set to null)
   * Otherwise, enrich with authenticated user context (normal tag)
   */
  public enrichCreateDto(createDto: unknown, user: User): CreateTagDto {
    // Check if explicitly requesting global tag (user explicitly set to null)
    if (createDto?.user === null) {
      // Create global tag - set user/org/brand to null
      return {
        ...createDto,
        brand: null,
        organization: null,
        user: null,
      } as CreateTagDto;
    }

    // Normal tag creation - enrich with authenticated user context
    return super.enrichCreateDto(createDto, user);
  }
}
