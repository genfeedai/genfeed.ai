import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateRssSourceDto } from '@api/collections/rss-sources/dto/create-rss-source.dto';
import { RssSourcesQueryDto } from '@api/collections/rss-sources/dto/rss-sources-query.dto';
import { UpdateRssSourceDto } from '@api/collections/rss-sources/dto/update-rss-source.dto';
import type { RssSourceScope } from '@api/collections/rss-sources/schemas/rss-source.schema';
import { RssSourceWorkflowService } from '@api/collections/rss-sources/services/rss-source-workflow.service';
import { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { API_KEY_POSTING_CONFIGURATION_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { RssSourceSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('RssSources')
@Controller('rss-sources')
export class RssSourcesController {
  constructor(
    private readonly rssSourcesService: RssSourcesService,
    private readonly rssSourceWorkflowService: RssSourceWorkflowService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: RssSourcesQueryDto,
  ) {
    const context = this.requireScope(user, query);
    const result = await this.rssSourcesService.findAllScoped(context, query);
    return serializeCollection(request, RssSourceSerializer, result);
  }

  @Post()
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateRssSourceDto,
  ) {
    const context = this.requireScope(user);
    const rssSource = await this.rssSourcesService.createScoped(body, context);
    return serializeSingle(request, RssSourceSerializer, rssSource);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: RssSourcesQueryDto,
    @Param('id') id: string,
  ) {
    const context = this.requireScope(user, query);
    const rssSource = await this.rssSourcesService.findOneScoped(id, context);
    return serializeSingle(request, RssSourceSerializer, rssSource);
  }

  @Patch(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: RssSourcesQueryDto,
    @Param('id') id: string,
    @Body() body: UpdateRssSourceDto,
  ) {
    const context = this.requireScope(user, query);
    const rssSource = await this.rssSourcesService.updateScoped(
      id,
      body,
      context,
    );
    return serializeSingle(request, RssSourceSerializer, rssSource);
  }

  @Delete(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @CurrentUser() user: User,
    @Query() query: RssSourcesQueryDto,
    @Param('id') id: string,
  ) {
    const context = this.requireScope(user, query);
    await this.rssSourcesService.removeScoped(id, context);
    return { success: true };
  }

  @Post(':id/poll')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async poll(
    @CurrentUser() user: User,
    @Query() query: RssSourcesQueryDto,
    @Param('id') id: string,
  ) {
    const context = this.requireScope(user, query);
    await this.rssSourcesService.findOneScoped(id, context);
    const jobId = await this.rssSourceWorkflowService.enqueueSource({
      ...context,
      sourceId: id,
    });
    return { jobId, status: 'queued' };
  }

  private requireScope(user: User, query?: RssSourcesQueryDto): RssSourceScope {
    const authorized = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query ?? {},
      user,
      getIsSuperAdmin(user),
    );
    const organizationId = authorized.organizationId ?? user.organizationId;
    const userId = user.userId ?? user.id;
    if (!organizationId || !userId) {
      throw new BadRequestException(
        'Organization and user context are required',
      );
    }
    const brandId = authorized.brandId ?? user.brandId;
    return {
      ...(brandId ? { brandId } : {}),
      organizationId,
      userId,
    };
  }
}
