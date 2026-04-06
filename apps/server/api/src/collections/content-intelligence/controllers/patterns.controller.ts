import { PatternsQueryDto } from '@api/collections/content-intelligence/dto/patterns-query.dto';
import { ContentPattern } from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { ContentPatternType } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Delete, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { isValidObjectId, type PipelineStage, Types } from 'mongoose';

// Simple serializer for content pattern
const ContentPatternSerializer = {
  serialize: (data: unknown) => {
    if (!data) {
      return null;
    }
    const doc = data.toObject ? data.toObject() : data;
    return {
      attributes: {
        description: doc.description,
        extractedFormula: doc.extractedFormula,
        patternType: doc.patternType,
        placeholders: doc.placeholders,
        platform: doc.platform,
        rawExample: doc.rawExample,
        relevanceWeight: doc.relevanceWeight,
        sourceCreator: doc.sourceCreator?.toString(),
        sourceMetrics: doc.sourceMetrics,
        sourcePostDate: doc.sourcePostDate,
        sourcePostUrl: doc.sourcePostUrl,
        tags: doc.tags,
        templateCategory: doc.templateCategory,
        usageCount: doc.usageCount,
      },
      id: doc._id?.toString(),
      type: 'content-pattern',
    };
  },
};

@AutoSwagger()
@Controller('content-intelligence/patterns')
export class PatternsController {
  constructor(
    private readonly patternStoreService: PatternStoreService,
    readonly _logger: LoggerService,
  ) {}

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PatternsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = new Types.ObjectId(publicMetadata.organization);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const match: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
    };

    if (query.platform) {
      match.platform = query.platform;
    }
    if (query.patternType) {
      match.patternType = query.patternType;
    }
    if (query.templateCategory) {
      match.templateCategory = query.templateCategory;
    }
    if (query.sourceCreator) {
      match.sourceCreator = new Types.ObjectId(query.sourceCreator.toString());
    }
    if (query.tags && query.tags.length > 0) {
      match.tags = { $in: query.tags };
    }
    if (query.minRelevanceWeight !== undefined) {
      match.relevanceWeight = { $gte: query.minRelevanceWeight };
    }
    if (query.minEngagementRate !== undefined) {
      match['sourceMetrics.engagementRate'] = { $gte: query.minEngagementRate };
    }

    const sortField = query.sortBy || 'sourceMetrics.engagementRate';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { [sortField]: sortOrder, createdAt: -1 } },
    ];

    const data = await this.patternStoreService.findAll(pipeline, options);
    return serializeCollection(request, ContentPatternSerializer, data);
  }

  @Get('hooks')
  async findHooks(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PatternsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = new Types.ObjectId(publicMetadata.organization);

    const hooks = await this.patternStoreService.findHooks(
      organizationId,
      query.platform,
      query.limit ?? 50,
    );

    return serializeCollection(request, ContentPatternSerializer, {
      docs: hooks,
      hasNextPage: false,
      hasPrevPage: false,
      limit: hooks.length,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs: hooks.length,
      totalPages: 1,
    });
  }

  @Get('templates')
  async findTemplates(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PatternsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = new Types.ObjectId(publicMetadata.organization);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const match: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
      patternType: ContentPatternType.TEMPLATE,
    };

    if (query.platform) {
      match.platform = query.platform;
    }
    if (query.templateCategory) {
      match.templateCategory = query.templateCategory;
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: -1, 'sourceMetrics.engagementRate': -1 } },
    ];

    const data = await this.patternStoreService.findAll(pipeline, options);
    return serializeCollection(request, ContentPatternSerializer, data);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound(ContentPattern.name, id);
    }

    const publicMetadata = getPublicMetadata(user);
    const data = await this.patternStoreService.findOne({
      _id: id,
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!data) {
      ErrorResponse.notFound(ContentPattern.name, id);
    }

    return serializeSingle(request, ContentPatternSerializer, data);
  }

  @Delete(':id')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound(ContentPattern.name, id);
    }

    const publicMetadata = getPublicMetadata(user);
    const pattern = await this.patternStoreService.findOne({
      _id: id,
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!pattern) {
      ErrorResponse.notFound(ContentPattern.name, id);
    }

    const deleted = await this.patternStoreService.remove(id);

    return serializeSingle(request, ContentPatternSerializer, deleted);
  }
}
