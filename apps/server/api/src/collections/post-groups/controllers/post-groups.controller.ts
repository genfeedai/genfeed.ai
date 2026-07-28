import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostGroupsQueryDto } from '@api/collections/post-groups/dto/post-groups-query.dto';
import { PostGroupRecurrenceService } from '@api/collections/post-groups/services/post-group-recurrence.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
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
    const { organization } = getPublicMetadata(user);
    const docs = await this.postGroupsService.list(organization, query);
    return serializeCollection(req, ReleaseGroupSerializer, { docs });
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
    const metadata = getPublicMetadata(user);
    const data = await this.postGroupsService.create(
      metadata.organization,
      user.id,
      body,
      idempotencyKey,
      undefined,
      metadata,
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
    const { organization } = getPublicMetadata(user);
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
    const metadata = getPublicMetadata(user);
    const data = await this.postGroupsService.update(
      metadata.organization,
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
    const metadata = getPublicMetadata(user);
    const data = await this.postGroupsService.updateTarget(
      metadata.organization,
      user.id,
      id,
      targetId,
      body,
      metadata,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/cancel')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cancel(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.cancel(organization, user.id, id);
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/pause')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async pause(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.pause(organization, user.id, id);
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/resume')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resume(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.resume(organization, user.id, id);
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/series/pause')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async pauseSeries(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupRecurrenceService.pauseFuture(
      organization,
      user.id,
      id,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/series/resume')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resumeSeries(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupRecurrenceService.resumeFuture(
      organization,
      user.id,
      id,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/series/cancel-future')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cancelFutureSeries(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupRecurrenceService.cancelFuture(
      organization,
      user.id,
      id,
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
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupRecurrenceService.editFuture(
      organization,
      user.id,
      id,
      body,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }

  @Post(':id/publish-now')
  @RequiredScopes(ApiKeyScope.POSTS_PUBLISH)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async publishNow(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.postGroupsService.publishNow(
      organization,
      user.id,
      id,
    );
    return serializeSingle(req, ReleaseGroupSerializer, data);
  }
}
