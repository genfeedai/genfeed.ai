import { PostGroupRecurrenceService } from '@api/collections/post-groups/services/post-group-recurrence.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ApiKeyScope } from '@genfeedai/enums';
import { ReleaseGroupSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { PostGroupsQueryDto } from '@server/collections/post-groups/dto/post-groups-query.dto';
import { PostGroupsService } from '@server/collections/post-groups/services/post-groups.service';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import { assertApiKeyPublishingScope } from '@server/helpers/utils/auth/api-key-publishing-scope.util';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('PostGroups')
@Controller('post-groups')
export class PostGroupsController {
  constructor(
    private readonly postGroupsService: PostGroupsService,
    private readonly postGroupRecurrenceService: PostGroupRecurrenceService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query() query: PostGroupsQueryDto,
  ) {
    const organization = user.organizationId;
    const data = await this.postGroupsService.list(organization, query);
    return serializeCollection(req, ReleaseGroupSerializer, data);
  }

  @Post()
  @RequiredScopes(
    ApiKeyScope.POSTS_DRAFT,
    ApiKeyScope.POSTS_CREATE,
    ApiKeyScope.POSTS_SCHEDULE,
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const metadata = user;
    const data = await this.postGroupsService.create(
      metadata.organizationId,
      user.id,
      body,
      idempotencyKey,
      undefined,
      metadata,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post('from-post')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async ensureFromPost(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() body: unknown,
  ) {
    const metadata = user;
    const postId =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).postId
        : undefined;
    const data = await this.postGroupsService.ensureReleaseForPost(
      metadata.organizationId,
      user.id,
      typeof postId === 'string' ? postId : '',
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post('recurrence/preview')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  previewRecurrence(@Body() body: unknown) {
    return this.postGroupRecurrenceService.preview(body);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getOne(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const organization = user.organizationId;
    const data = await this.postGroupsService.getOne(organization, id);
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Patch(':id')
  @RequiredScopes(
    ApiKeyScope.POSTS_DRAFT,
    ApiKeyScope.POSTS_CREATE,
    ApiKeyScope.POSTS_SCHEDULE,
    ApiKeyScope.POSTS_PUBLISH,
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const metadata = user;
    const organization = metadata.organizationId;
    const action =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).action
        : undefined;

    // State transitions via PATCH body (preferred over POST /:id/{verb}).
    if (typeof action === 'string') {
      let data: Awaited<ReturnType<PostGroupsService['pause']>>;
      switch (action) {
        case 'pause':
          data = await this.postGroupsService.pause(organization, user.id, id);
          break;
        case 'resume':
          data = await this.postGroupsService.resume(organization, user.id, id);
          break;
        case 'cancel':
          data = await this.postGroupsService.cancel(organization, user.id, id);
          break;
        case 'publish-now':
          data = await this.postGroupsService.publishNow(
            organization,
            user.id,
            id,
          );
          break;
        case 'series-pause':
          data = await this.postGroupRecurrenceService.pauseFuture(
            organization,
            user.id,
            id,
          );
          break;
        case 'series-resume':
          data = await this.postGroupRecurrenceService.resumeFuture(
            organization,
            user.id,
            id,
          );
          break;
        case 'series-cancel-future':
          data = await this.postGroupRecurrenceService.cancelFuture(
            organization,
            user.id,
            id,
          );
          break;
        case 'calendar-move':
          data = await this.postGroupsService.moveCalendarPlacement(
            organization,
            user.id,
            id,
            body,
            metadata,
          );
          break;
        case 'republish':
          data = await this.postGroupsService.republishAt(
            organization,
            user.id,
            id,
            body,
            metadata,
          );
          break;
        default:
          data = await this.postGroupsService.update(
            organization,
            user.id,
            id,
            body,
            metadata,
          );
      }
      return serializeSingle(req, ReleaseGroupSerializer, data);
    }

    const data = await this.postGroupsService.update(
      organization,
      user.id,
      id,
      body,
      metadata,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Patch(':id/targets/:targetId')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE, ApiKeyScope.POSTS_PUBLISH)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateTarget(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @Body() body: unknown,
  ) {
    const metadata = user;
    const action =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).action
        : undefined;
    if (action === 'schedule') {
      assertApiKeyPublishingScope(user, 'schedule');
      const scheduledDate =
        body && typeof body === 'object' && !Array.isArray(body)
          ? (body as Record<string, unknown>).scheduledDate
          : undefined;
      const data = await this.postGroupsService.scheduleTarget(
        metadata.organizationId,
        user.id,
        id,
        targetId,
        typeof scheduledDate === 'string' ? scheduledDate : '',
        { source: 'post-desk' },
      );
      return serializeSingle(req, ReleaseGroupSerializer, data);
    }
    if (action === 'publish-now') {
      assertApiKeyPublishingScope(user, 'publish');
      const data = await this.postGroupsService.publishTargetNow(
        metadata.organizationId,
        user.id,
        id,
        targetId,
        { source: 'post-desk' },
      );
      return serializeSingle(req, ReleaseGroupSerializer, data);
    }
    if (action === 'publish-via-tiktok-app') {
      assertApiKeyPublishingScope(user, 'publish');
      const data = await this.postGroupsService.publishTargetViaTikTokApp(
        metadata.organizationId,
        user.id,
        id,
        targetId,
        { source: 'post-desk' },
      );
      return serializeSingle(req, ReleaseGroupSerializer, data);
    }
    const data = await this.postGroupsService.updateTarget(
      metadata.organizationId,
      user.id,
      id,
      targetId,
      body,
      metadata,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Patch(':id/series/future')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async editFutureSeries(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const organization = user.organizationId;
    const data = await this.postGroupRecurrenceService.editFuture(
      organization,
      user.id,
      id,
      body,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }
}
