import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  SocialConversationAssignDto,
  SocialConversationStatusDto,
  SocialConversationTagsDto,
  SocialDmDto,
  SocialDraftDto,
  SocialDraftRejectDto,
  SocialReplyDto,
} from '@api/collections/social-inbox/dto/social-inbox-action.dto';
import { SocialInboxYoutubeIngestDto } from '@api/collections/social-inbox/dto/social-inbox-ingest.dto';
import {
  SocialInboxQueryDto,
  SocialMessagesQueryDto,
} from '@api/collections/social-inbox/dto/social-inbox-query.dto';
import {
  type SocialInboxScope,
  SocialInboxService,
} from '@api/collections/social-inbox/services/social-inbox.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Messages')
@AutoSwagger()
@ApiBearerAuth()
@Controller('messages')
export class SocialInboxController {
  constructor(private readonly socialInboxService: SocialInboxService) {}

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
  @ApiOperation({ summary: 'Sync recent YouTube comments into messages' })
  async syncYoutubeComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxYoutubeIngestDto,
  ): Promise<{
    conversationsCreated: number;
    messagesCreated: number;
  }> {
    const scope = this.buildScope(user);
    return this.socialInboxService.ingestYoutubeComments(scope, body);
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

  @Post(':conversationId/drafts/:messageId/approve')
  @ApiOperation({ summary: 'Approve and publish a draft reply or DM' })
  async approveDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.approveDraft(
      scope,
      conversationId,
      messageId,
    );
    return serializeSingle(request, SocialMessageSerializer, data);
  }

  @Post(':conversationId/drafts/:messageId/reject')
  @ApiOperation({ summary: 'Reject a draft reply or DM without publishing' })
  async rejectDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: SocialDraftRejectDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.rejectDraft(
      scope,
      conversationId,
      messageId,
      body.reason,
    );
    return serializeSingle(request, SocialMessageSerializer, data);
  }

  @Post(':conversationId/replies')
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

  @Patch(':conversationId/status')
  @ApiOperation({ summary: 'Update social conversation status' })
  async updateStatus(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Body() body: SocialConversationStatusDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.updateStatus(
      scope,
      conversationId,
      body.status,
    );
    return serializeSingle(request, SocialConversationSerializer, data);
  }

  @Patch(':conversationId/tags')
  @ApiOperation({ summary: 'Replace social conversation tags' })
  async updateTags(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Body() body: SocialConversationTagsDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.updateTags(
      scope,
      conversationId,
      body.tags,
    );
    return serializeSingle(request, SocialConversationSerializer, data);
  }

  @Patch(':conversationId/assignment')
  @ApiOperation({ summary: 'Assign or unassign a social conversation' })
  async assignOwner(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
    @Body() body: SocialConversationAssignDto,
  ): Promise<JsonApiSingleResponse> {
    const scope = this.buildScope(user);
    const data = await this.socialInboxService.assignOwner(
      scope,
      conversationId,
      body.assignedOwnerId,
    );
    return serializeSingle(request, SocialConversationSerializer, data);
  }

  private buildScope(user: User): SocialInboxScope {
    const publicMetadata = getPublicMetadata(user);
    if (!publicMetadata.organization) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }

    return {
      brandId: publicMetadata.brand,
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
    };
  }
}
