import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  SocialConversationUpdateDto,
  SocialDmDto,
  SocialDraftDto,
  SocialDraftUpdateDto,
  SocialReplyDto,
} from '@api/collections/social-inbox/dto/social-inbox-action.dto';
import { SocialInboxIngestDto } from '@api/collections/social-inbox/dto/social-inbox-ingest.dto';
import {
  SocialInboxQueryDto,
  SocialMessagesQueryDto,
} from '@api/collections/social-inbox/dto/social-inbox-query.dto';
import {
  type SocialInboxScope,
  SocialInboxService,
} from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialInboxSyncWorkflowService } from '@api/collections/social-inbox/services/social-inbox-sync-workflow.service';
import type {
  SocialInboxSyncConversationType,
  SocialInboxSyncPlatform,
} from '@api/collections/social-inbox/services/social-inbox-sync-workflow-definition';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  ApiKeyScope,
  MemberRole,
  Platform,
  SocialConversationType,
} from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  SocialConversationSerializer,
  SocialMessageSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Messages')
@AutoSwagger()
@ApiBearerAuth()
@Controller('messages')
@UseGuards(RolesGuard)
export class SocialInboxController {
  constructor(
    private readonly socialInboxService: SocialInboxService,
    private readonly syncWorkflowService: SocialInboxSyncWorkflowService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List social inbox conversations' })
  async listConversations(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SocialInboxQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.listConversations(scope, query);
    return serializeCollection(request, SocialConversationSerializer, data);
  }

  @Post('youtube/sync')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent YouTube comments',
  })
  async syncYoutubeComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.YOUTUBE,
      SocialConversationType.COMMENT,
    );
  }

  @Post('instagram/sync')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent Instagram comments',
  })
  async syncInstagramComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.INSTAGRAM,
      SocialConversationType.COMMENT,
    );
  }

  @Post('instagram/dms/sync')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent Instagram direct messages',
  })
  async syncInstagramDms(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.INSTAGRAM,
      SocialConversationType.DM,
    );
  }

  @Post('x/sync')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent X mentions and replies',
  })
  async syncXComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.TWITTER,
      SocialConversationType.COMMENT,
    );
  }

  @Post('x/dms/sync')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent X direct messages',
  })
  async syncXDms(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.TWITTER,
      SocialConversationType.DM,
    );
  }

  @Post('linkedin/sync')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent LinkedIn comments',
  })
  async syncLinkedInComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.LINKEDIN,
      SocialConversationType.COMMENT,
    );
  }

  @Post('linkedin/dms/sync')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary:
      'Enqueue a background sync of LinkedIn DMs when the connected account permits it',
  })
  async syncLinkedInDms(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.LINKEDIN,
      SocialConversationType.DM,
    );
  }

  @Get(':conversationId')
  @ApiOperation({ summary: 'Inspect one social conversation' })
  async getConversation(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.getConversation(
      scope,
      conversationId,
    );
    return serializeSingle(request, SocialConversationSerializer, data);
  }

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'List messages in a social conversation' })
  async listMessages(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Query() query: SocialMessagesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.listMessages(
      scope,
      conversationId,
      query,
    );
    return serializeCollection(request, SocialMessageSerializer, data);
  }

  @Post(':conversationId/drafts')
  @RequiredScopes(ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_CREATE)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({ summary: 'Create a local reply draft for review' })
  async createDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Body() body: SocialDraftDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.createDraft(
      scope,
      conversationId,
      body,
    );
    return serializeSingle(request, SocialMessageSerializer, data);
  }

  @Patch(':conversationId/drafts/:messageId')
  @RequiredScopes(ApiKeyScope.POSTS_APPROVE)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({ summary: 'Approve (and publish) or reject a draft reply/DM' })
  async updateDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: SocialDraftUpdateDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data =
      body.status === 'approved'
        ? await this.socialInboxService.approveDraft(
            scope,
            conversationId,
            messageId,
          )
        : await this.socialInboxService.rejectDraft(
            scope,
            conversationId,
            messageId,
            body.reason,
          );
    return serializeSingle(request, SocialMessageSerializer, data);
  }

  @Post(':conversationId/replies')
  @RequiredScopes(ApiKeyScope.POSTS_PUBLISH)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({ summary: 'Post a reply through the connected account' })
  async postReply(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Body() body: SocialReplyDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.postReply(
      scope,
      conversationId,
      body,
    );
    return serializeSingle(request, SocialMessageSerializer, data);
  }

  @Post(':conversationId/dms')
  @RequiredScopes(ApiKeyScope.POSTS_PUBLISH)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({ summary: 'Send a DM through a supported connected account' })
  async sendDm(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Body() body: SocialDmDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.sendDm(
      scope,
      conversationId,
      body,
    );
    return serializeSingle(request, SocialMessageSerializer, data);
  }

  @Patch(':conversationId')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({
    summary: 'Update a social conversation (status, tags, and/or assignment)',
  })
  async updateConversation(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Body() body: SocialConversationUpdateDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.updateConversation(
      scope,
      conversationId,
      {
        assignedOwnerId: body.assignedOwnerId,
        status: body.status,
        tags: body.tags,
      },
    );
    return serializeSingle(request, SocialConversationSerializer, data);
  }

  /**
   * Ingestion is a triple-nested sweep (credentials x posts x comments) that
   * can blow past the request timeout, so every sync route hands the work to
   * the background worker instead of running it on the request thread. The
   * platform and surface travel on the job rather than the body, so the route
   * stays the only place that names them.
   */
  private async enqueueSync(
    user: User,
    body: SocialInboxIngestDto,
    platform: SocialInboxSyncPlatform,
    conversationType: SocialInboxSyncConversationType,
  ): Promise<{ jobId: string | undefined; status: string }> {
    const scope = this.buildScope(user);
    const jobId = await this.syncWorkflowService.enqueue({
      brandId: scope.brandId,
      conversationType,
      credentialId: body.credentialId,
      limit: body.limit,
      organizationId: scope.organizationId,
      platform,
      userId: scope.userId,
    });

    return { jobId, status: 'queued' };
  }

  private buildScope(user: User): SocialInboxScope {
    if (!user.organizationId) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }

    return {
      brandId: user.brandId,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };
  }
}
