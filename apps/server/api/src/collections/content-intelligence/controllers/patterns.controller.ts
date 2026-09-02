import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PatternsQueryDto } from '@api/collections/content-intelligence/dto/patterns-query.dto';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
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
import { ContentPatternSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Delete, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

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
    const organizationId = user.organizationId;

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

    const data = await this.patternStoreService.findOne({
      id: id,
      organizationId: user.organizationId,
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

    const pattern = await this.patternStoreService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!pattern) {
      ErrorResponse.notFound('ContentPattern', id);
    }

    const deleted = await this.patternStoreService.remove(id);

    return serializeSingle(request, ContentPatternSerializer, deleted);
  }
}
