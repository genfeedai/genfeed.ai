import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { buildSocialInboxScope } from '@api/collections/social-inbox/controllers/social-inbox-scope.util';
import {
  SocialConversationReadDto,
  SocialConversationUpdateDto,
  SocialDmDto,
  SocialDraftDto,
  SocialDraftUpdateDto,
  SocialReplyDto,
} from '@api/collections/social-inbox/dto/social-inbox-action.dto';
import {
  SocialInboxQueryDto,
  SocialInboxUnreadCountQueryDto,
  SocialMessagesQueryDto,
} from '@api/collections/social-inbox/dto/social-inbox-query.dto';
import { SocialSuggestedReplyParamsDto } from '@api/collections/social-inbox/dto/social-suggested-reply.dto';
import { SuggestedReplyCreditsGuard } from '@api/collections/social-inbox/guards/suggested-reply-credits.guard';
import {
  type SocialInboxScope,
  SocialInboxService,
} from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialInboxSuggestedReplyService } from '@api/collections/social-inbox/services/social-inbox-suggested-reply.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  SocialConversationSerializer,
  SocialInboxUnreadCountSerializer,
  SocialMessageSerializer,
  SocialSuggestedReplySerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Messages')
@AutoSwagger()
@ApiBearerAuth()
@OrganizationModule('messages')
@Controller('messages')
@UseGuards(RolesGuard)
export class SocialInboxController {
  constructor(
    private readonly socialInboxService: SocialInboxService,
    private readonly suggestedReplyService: SocialInboxSuggestedReplyService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List social inbox conversations' })
  async listConversations(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SocialInboxQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const scope = this.buildScope(user, query, request);
    const data = await this.socialInboxService.listConversations(scope, query);
    return serializeCollection(request, SocialConversationSerializer, data);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Count social inbox conversations with unread messages',
  })
  async countUnreadConversations(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SocialInboxUnreadCountQueryDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user, query, request);
    const data = await this.socialInboxService.countUnreadConversations(
      scope,
      query,
    );
    return serializeSingle(request, SocialInboxUnreadCountSerializer, data);
  }

  @TenantReadPolicy('selected')
  @Get(':conversationId')
  @ApiOperation({ summary: 'Inspect one social conversation' })
  async getConversation(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(
      user,
      {},
      request,
      resolveTenantReadScope(user),
    );
    const data = await this.socialInboxService.getConversation(
      scope,
      conversationId,
    );
    return serializeSingle(request, SocialConversationSerializer, data);
  }

  @TenantReadPolicy('selected')
  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'List messages in a social conversation' })
  async listMessages(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Query() query: SocialMessagesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const scope = this.buildScope(
      user,
      {},
      request,
      resolveTenantReadScope(user),
    );
    const data = await this.socialInboxService.listMessages(
      scope,
      conversationId,
      query,
    );
    return serializeCollection(request, SocialMessageSerializer, data);
  }

  @OrganizationModule('messages', 'read')
  @Patch(':conversationId/read')
  @RequiredScopes(
    ApiKeyScope.POSTS_DRAFT,
    ApiKeyScope.POSTS_APPROVE,
    ApiKeyScope.POSTS_PUBLISH,
    ApiKeyScope.ADMIN,
  )
  @ApiOperation({
    summary: 'Mark a social conversation read for the current user',
  })
  async markConversationRead(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Body() body: SocialConversationReadDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.markConversationRead(
      scope,
      conversationId,
      body.seenInboundSequence,
    );
    return serializeSingle(request, SocialConversationSerializer, data);
  }

  @Post(':conversationId/suggested-reply')
  @HttpCode(200)
  @RequiredScopes(ApiKeyScope.POSTS_DRAFT)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @UseGuards(SuggestedReplyCreditsGuard)
  @ApiOperation({ summary: 'Suggest a reply without saving or sending it' })
  async suggestedReply(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param() params: SocialSuggestedReplyParamsDto,
  ): Promise<JsonApiSingleResponse> {
    const data = await this.suggestedReplyService.suggestReply(
      this.buildScope(user),
      params.conversationId,
    );
    return serializeSingle(request, SocialSuggestedReplySerializer, data);
  }

  @Post(':conversationId/drafts')
  @RequiredScopes(ApiKeyScope.POSTS_DRAFT)
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
  @RequiredScopes(
    ApiKeyScope.POSTS_DRAFT,
    ApiKeyScope.POSTS_APPROVE,
    ApiKeyScope.POSTS_PUBLISH,
    ApiKeyScope.ADMIN,
  )
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

  private buildScope(
    user: User,
    query: Pick<SocialInboxQueryDto, 'organizationId' | 'brandId'> = {},
    request?: Request,
    readScope?: ITenantReadScope,
  ): SocialInboxScope {
    return buildSocialInboxScope(user, query, request, readScope);
  }
}
