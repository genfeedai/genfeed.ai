import { AddCreatorDto } from '@api/collections/content-intelligence/dto/add-creator.dto';
import { ImportCreatorsDto } from '@api/collections/content-intelligence/dto/import-creators.dto';
import { CreatorsQueryDto } from '@api/collections/content-intelligence/dto/patterns-query.dto';
import type { CreatorAnalysisDocument } from '@api/collections/content-intelligence/schemas/creator-analysis.schema';
import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { PatternAnalyzerService } from '@api/collections/content-intelligence/services/pattern-analyzer.service';
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
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
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

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

type SerializableDocument = Record<string, unknown> & {
  _id?: string | { toString(): string };
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

// Simple serializer for creator analysis
const CreatorAnalysisSerializer = {
  serialize: (data: unknown) => {
    if (!data) {
      return null;
    }
    const doc = toSerializableDocument(data);
    return {
      attributes: {
        avatarUrl: doc.avatarUrl,
        bio: doc.bio,
        displayName: doc.displayName,
        errorMessage: doc.errorMessage,
        followerCount: doc.followerCount,
        followingCount: doc.followingCount,
        handle: doc.handle,
        lastScrapedAt: doc.lastScrapedAt,
        metrics: doc.metrics,
        niche: doc.niche,
        patternsExtracted: doc.patternsExtracted,
        platform: doc.platform,
        postsScraped: doc.postsScraped,
        profileUrl: doc.profileUrl,
        scrapeConfig: doc.scrapeConfig,
        status: doc.status,
        tags: doc.tags,
      },
      id: doc._id?.toString(),
      type: 'creator-analysis',
    };
  },
};

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
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

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
    if (query.niche) {
      match.niche = query.niche;
    }
    if (query.tags && query.tags.length > 0) {
      match.tags = { in: query.tags };
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
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    const publicMetadata = getPublicMetadata(user);
    const data = await this.contentIntelligenceService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
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
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;
    const userId = publicMetadata.user;

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
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;
    const userId = publicMetadata.user;

    const results: CreatorAnalysisDocument[] = [];

    for (const creatorDto of dto.creators) {
      const existing = await this.contentIntelligenceService.findByHandle(
        organizationId,
        creatorDto.platform,
        creatorDto.handle,
      );

      if (!existing) {
        const created = await this.contentIntelligenceService.addCreator(
          organizationId,
          userId,
          creatorDto,
        );
        results.push(created);
      } else {
        results.push(existing);
      }
    }

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
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    const publicMetadata = getPublicMetadata(user);
    const creator = await this.contentIntelligenceService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!creator) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    // Trigger analysis (async)
    await this.patternAnalyzerService.analyzeCreator(id);

    // Return updated creator
    const updated = await this.contentIntelligenceService.findOne({
      _id: id,
      isDeleted: false,
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
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    const publicMetadata = getPublicMetadata(user);
    const creator = await this.contentIntelligenceService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!creator) {
      ErrorResponse.notFound('CreatorAnalysis', id);
    }

    // Delete associated patterns
    await this.patternStoreService.deleteByCreator(id);

    // Soft delete creator
    const deleted = await this.contentIntelligenceService.remove(id);

    return serializeSingle(request, CreatorAnalysisSerializer, deleted);
  }
}
