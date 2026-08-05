import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PatternsQueryDto } from '@api/collections/content-intelligence/dto/patterns-query.dto';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Delete, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

type SerializableDocument = Record<string, unknown> & {
  toObject?: () => unknown;
};

function toSerializableDocument(data: unknown): SerializableDocument {
  if (!data || typeof data !== 'object') {
    return {};
  }

  if (
    'toObject' in data &&
    typeof (data as SerializableDocument).toObject === 'function'
  ) {
    const objectValue = (data as SerializableDocument).toObject?.();
    return objectValue && typeof objectValue === 'object'
      ? (objectValue as SerializableDocument)
      : {};
  }

  return data as SerializableDocument;
}

// Simple serializer for content pattern
const ContentPatternSerializer = {
  serialize: (data: unknown) => {
    if (!data) {
      return null;
    }
    const doc = toSerializableDocument(data);
    const persistedData = toSerializableDocument(doc.data);
    return {
      attributes: {
        description: persistedData.description,
        extractedFormula: persistedData.extractedFormula,
        patternType: persistedData.patternType,
        placeholders: persistedData.placeholders,
        platform: persistedData.platform,
        rawExample: persistedData.rawExample,
        relevanceWeight: persistedData.relevanceWeight,
        sourceCreatorId: doc.sourceCreatorId,
        sourceMetrics: persistedData.sourceMetrics,
        sourcePostDate: persistedData.sourcePostDate,
        sourcePostUrl: persistedData.sourcePostUrl,
        tags: persistedData.tags,
        templateCategory: persistedData.templateCategory,
        usageCount: persistedData.usageCount,
      },
      id: doc.id?.toString(),
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
    const organizationId = publicMetadata.organization;

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const match: Record<string, unknown> = {
      isDeleted: false,
      organizationId: organizationId,
    };
    const dataFilters: Record<string, unknown>[] = [];

    if (query.platform) {
      dataFilters.push({
        data: { path: ['platform'], equals: query.platform },
      });
    }
    if (query.patternType) {
      dataFilters.push({
        data: { path: ['patternType'], equals: query.patternType },
      });
    }
    if (query.templateCategory) {
      dataFilters.push({
        data: { path: ['templateCategory'], equals: query.templateCategory },
      });
    }
    if (query.sourceCreatorId) {
      match.sourceCreatorId = query.sourceCreatorId;
    }
    if (query.tags && query.tags.length > 0) {
      dataFilters.push({
        data: { path: ['tags'], array_contains: query.tags },
      });
    }
    if (query.minRelevanceWeight !== undefined) {
      dataFilters.push({
        data: { path: ['relevanceWeight'], gte: query.minRelevanceWeight },
      });
    }
    if (query.minEngagementRate !== undefined) {
      dataFilters.push({
        data: {
          path: ['sourceMetrics', 'engagementRate'],
          gte: query.minEngagementRate,
        },
      });
    }
    if (dataFilters.length > 0) {
      match.AND = dataFilters;
    }

    const pipeline = {
      where: match,
      orderBy: { createdAt: query.sortOrder === 'asc' ? 1 : -1 },
    };

    const data = await this.patternStoreService.findAll(pipeline, options);
    return serializeCollection(request, ContentPatternSerializer, data);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound('ContentPattern', id);
    }

    const publicMetadata = getPublicMetadata(user);
    const data = await this.patternStoreService.findOne({
      id: id,
      isDeleted: false,
      organizationId: publicMetadata.organization,
    });

    if (!data) {
      ErrorResponse.notFound('ContentPattern', id);
    }

    return serializeSingle(request, ContentPatternSerializer, data);
  }

  @Delete(':id')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound('ContentPattern', id);
    }

    const publicMetadata = getPublicMetadata(user);
    const pattern = await this.patternStoreService.findOne({
      id: id,
      isDeleted: false,
      organizationId: publicMetadata.organization,
    });

    if (!pattern) {
      ErrorResponse.notFound('ContentPattern', id);
    }

    const deleted = await this.patternStoreService.remove(id);

    return serializeSingle(request, ContentPatternSerializer, deleted);
  }
}
