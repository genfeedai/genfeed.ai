import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AddCreatorDto } from '@api/collections/content-intelligence/dto/add-creator.dto';
import { ImportCreatorsDto } from '@api/collections/content-intelligence/dto/import-creators.dto';
import { CreatorsQueryDto } from '@api/collections/content-intelligence/dto/patterns-query.dto';
import type { CreatorAnalysisDocument } from '@api/collections/content-intelligence/schemas/creator-analysis.schema';
import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { PatternAnalyzerService } from '@api/collections/content-intelligence/services/pattern-analyzer.service';
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
} from '@genfeedai/contracts/interfaces';
import { CreatorAnalysisSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('content-intelligence/creators')
export class CreatorsController {
  constructor(
    private readonly contentIntelligenceService: ContentIntelligenceService,
    private readonly patternAnalyzerService: PatternAnalyzerService,
    private readonly patternStoreService: PatternStoreService,
    readonly _logger: LoggerService,
  ) {}

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: CreatorsQueryDto,
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
    if (query.niche) {
      dataFilters.push({ data: { path: ['niche'], equals: query.niche } });
    }
    if (query.tags && query.tags.length > 0) {
      dataFilters.push({
        data: { path: ['tags'], array_contains: query.tags },
      });
    }
    if (dataFilters.length > 0) {
      match.AND = dataFilters;
    }

    const pipeline = { where: match, orderBy: { createdAt: -1 } };

    const data = await this.contentIntelligenceService.findAll(
      pipeline,
      options,
    );
    return serializeCollection(request, CreatorAnalysisSerializer, data);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    const data = await this.contentIntelligenceService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!data) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    return serializeSingle(request, CreatorAnalysisSerializer, data);
  }

  @Post()
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: AddCreatorDto,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = user.organizationId;
    const userId = user.userId ?? user.id;

    // Check if creator already exists
    const existing = await this.contentIntelligenceService.findByHandle(
      organizationId,
      dto.platform,
      dto.handle,
    );

    if (existing) {
      return serializeSingle(request, CreatorAnalysisSerializer, existing);
    }

    const data = await this.contentIntelligenceService.addCreator(
      organizationId,
      userId,
      dto,
    );

    return serializeSingle(request, CreatorAnalysisSerializer, data);
  }

  @Post('import')
  async importCreators(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: ImportCreatorsDto,
  ): Promise<JsonApiCollectionResponse> {
    const organizationId = user.organizationId;
    const userId = user.userId ?? user.id;

    const resolutions = new Map<string, Promise<CreatorAnalysisDocument>>();
    const resolveCreator = (creatorDto: AddCreatorDto) => {
      const key = JSON.stringify([creatorDto.platform, creatorDto.handle]);
      const pending = resolutions.get(key);
      if (pending) {
        return pending;
      }

      const resolution = (async () => {
        const existing = await this.contentIntelligenceService.findByHandle(
          organizationId,
          creatorDto.platform,
          creatorDto.handle,
        );
        return (
          existing ??
          this.contentIntelligenceService.addCreator(
            organizationId,
            userId,
            creatorDto,
          )
        );
      })();
      resolutions.set(key, resolution);
      return resolution;
    };

    const results = await Promise.all(dto.creators.map(resolveCreator));

    return serializeCollection(request, CreatorAnalysisSerializer, {
      docs: results,
      hasNextPage: false,
      hasPrevPage: false,
      limit: results.length,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs: results.length,
      totalPages: 1,
    });
  }

  @Post(':id/analyze')
  async analyze(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    const creator = await this.contentIntelligenceService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!creator) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    // Trigger analysis (async)
    await this.patternAnalyzerService.analyzeCreator(id);

    // Return updated creator
    const updated = await this.contentIntelligenceService.findOne({
      id: id,
    });

    return serializeSingle(request, CreatorAnalysisSerializer, updated);
  }

  @Post(':id/rescrape')
  rescrape(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    return this.analyze(request, user, id);
  }

  @Delete(':id')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    const creator = await this.contentIntelligenceService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!creator) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    // Delete associated patterns (scoped to the caller's organization)
    await this.patternStoreService.deleteByCreator(id, user.organizationId);

    // Soft delete creator
    const deleted = await this.contentIntelligenceService.remove(id);

    return serializeSingle(request, CreatorAnalysisSerializer, deleted);
  }
}
