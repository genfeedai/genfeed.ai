import type {
  SocialConversationDocument,
  SocialMessageDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import type {
  InboundSocialMessageInput,
  SocialActionInput,
  SocialConversationPatch,
  SocialInboxListQuery,
  SocialInboxPage,
  SocialInboxScope,
  SocialInboxUnreadCount,
  SocialInboxUnreadCountQuery,
  XPostRepliesIngestInput,
  XPostRepliesIngestResult,
} from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxActionService } from '@api/collections/social-inbox/services/social-inbox-action.service';
import { SocialInboxIngestionService } from '@api/collections/social-inbox/services/social-inbox-ingestion.service';
import { SocialInboxQueryService } from '@api/collections/social-inbox/services/social-inbox-query.service';
import { SocialInboxReadStateService } from '@api/collections/social-inbox/services/social-inbox-read-state.service';
import type {
  SocialInboxAgentContextRecord,
  SocialInboxReference,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

export type {
  InboundSocialMessageInput,
  SocialActionInput,
  SocialConversationPatch,
  SocialInboxListQuery,
  SocialInboxPage,
  SocialInboxScope,
  XPostRepliesIngestInput,
  XPostRepliesIngestResult,
  XReplyTargetPost,
} from '@api/collections/social-inbox/services/social-inbox.types';

@Injectable()
export class SocialInboxService {
  constructor(
    private readonly queryService: SocialInboxQueryService,
    private readonly ingestionService: SocialInboxIngestionService,
    private readonly actionService: SocialInboxActionService,
    private readonly readStateService: SocialInboxReadStateService,
  ) {}

  listConversations(
    scope: SocialInboxScope,
    query: SocialInboxListQuery,
  ): Promise<SocialInboxPage<SocialConversationDocument>> {
    return this.queryService.listConversations(scope, query);
  }

  countUnreadConversations(
    scope: SocialInboxScope,
    query: SocialInboxUnreadCountQuery,
  ): Promise<SocialInboxUnreadCount> {
    return this.queryService.countUnreadConversations(scope, query);
  }

  getConversation(
    scope: SocialInboxScope,
    conversationId: string,
  ): Promise<SocialConversationDocument> {
    return this.queryService.getConversation(scope, conversationId);
  }

  markConversationRead(
    scope: SocialInboxScope,
    conversationId: string,
  ): Promise<SocialConversationDocument> {
    return this.readStateService.markConversationRead(scope, conversationId);
  }

  listMessages(
    scope: SocialInboxScope,
    conversationId: string,
    options: { cursor?: string; limit?: number; page?: number } = {},
  ): Promise<SocialInboxPage<SocialMessageDocument>> {
    return this.queryService.listMessages(scope, conversationId, options);
  }

  authorizeAgentContextReferences(
    scope: SocialInboxScope,
    references: readonly SocialInboxReference[],
  ): Promise<SocialInboxReference[]> {
    return this.queryService.authorizeAgentContextReferences(scope, references);
  }

  resolveAgentContextReferences(
    scope: SocialInboxScope,
    references: readonly SocialInboxReference[],
  ): Promise<{
    context: SocialInboxAgentContextRecord[];
    references: SocialInboxReference[];
  }> {
    return this.queryService.resolveAgentContextReferences(scope, references);
  }

  ingestInboundMessage(
    input: InboundSocialMessageInput,
  ): Promise<SocialMessageDocument> {
    return this.ingestionService.ingestInboundMessage(input);
  }

  createDraft(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    return this.actionService.createDraft(scope, conversationId, input);
  }

  async approveDraft(
    scope: SocialInboxScope,
    conversationId: string,
    messageId: string,
  ): Promise<SocialMessageDocument> {
    const sent = await this.actionService.approveDraft(
      scope,
      conversationId,
      messageId,
    );
    await this.readStateService.clearReplyNotifications(scope, conversationId);
    return sent;
  }

  rejectDraft(
    scope: SocialInboxScope,
    conversationId: string,
    messageId: string,
    reason?: string,
  ): Promise<SocialMessageDocument> {
    return this.actionService.rejectDraft(
      scope,
      conversationId,
      messageId,
      reason,
    );
  }

  async postReply(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    const sent = await this.actionService.postReply(
      scope,
      conversationId,
      input,
    );
    await this.readStateService.clearReplyNotifications(scope, conversationId);
    return sent;
  }

  sendDm(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    return this.actionService.sendDm(scope, conversationId, input);
  }

  async updateConversation(
    scope: SocialInboxScope,
    conversationId: string,
    patch: SocialConversationPatch,
  ): Promise<SocialConversationDocument> {
    const updated = await this.actionService.updateConversation(
      scope,
      conversationId,
      patch,
    );
    if (patch.status === 'resolved') {
      await this.readStateService.clearReplyNotifications(
        scope,
        conversationId,
      );
    }
    return updated;
  }

  ingestYoutubeComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    return this.ingestionService.ingestYoutubeComments(scope, options);
  }

  ingestInstagramComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    return this.ingestionService.ingestInstagramComments(scope, options);
  }

  ingestInstagramDms(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    return this.ingestionService.ingestInstagramDms(scope, options);
  }

  ingestXComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    return this.ingestionService.ingestXComments(scope, options);
  }

  ingestXPostReplies(
    scope: SocialInboxScope,
    input: XPostRepliesIngestInput,
  ): Promise<XPostRepliesIngestResult> {
    return this.ingestionService.ingestXPostReplies(scope, input);
  }

  ingestXDms(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    return this.ingestionService.ingestXDms(scope, options);
  }

  ingestLinkedInComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    return this.ingestionService.ingestLinkedInComments(scope, options);
  }

  ingestLinkedInDms(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    return this.ingestionService.ingestLinkedInDms(scope, options);
  }
}
