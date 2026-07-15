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
} from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxActionService } from '@api/collections/social-inbox/services/social-inbox-action.service';
import { SocialInboxIngestionService } from '@api/collections/social-inbox/services/social-inbox-ingestion.service';
import { SocialInboxQueryService } from '@api/collections/social-inbox/services/social-inbox-query.service';
import type {
  SocialInboxAgentContextRecord,
  SocialInboxReference,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

export type {
  InboundSocialMessageInput,
  SocialActionInput,
  SocialConversationPatch,
  SocialInboxListQuery,
  SocialInboxPage,
  SocialInboxScope,
} from '@api/collections/social-inbox/services/social-inbox.types';

@Injectable()
export class SocialInboxService {
  constructor(
    private readonly queryService: SocialInboxQueryService,
    private readonly ingestionService: SocialInboxIngestionService,
    private readonly actionService: SocialInboxActionService,
  ) {}

  listConversations(
    scope: SocialInboxScope,
    query: SocialInboxListQuery,
  ): Promise<SocialInboxPage<SocialConversationDocument>> {
    return this.queryService.listConversations(scope, query);
  }

  getConversation(
    scope: SocialInboxScope,
    conversationId: string,
  ): Promise<SocialConversationDocument> {
    return this.queryService.getConversation(scope, conversationId);
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

  approveDraft(
    scope: SocialInboxScope,
    conversationId: string,
    messageId: string,
  ): Promise<SocialMessageDocument> {
    return this.actionService.approveDraft(scope, conversationId, messageId);
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

  postReply(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    return this.actionService.postReply(scope, conversationId, input);
  }

  sendDm(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    return this.actionService.sendDm(scope, conversationId, input);
  }

  updateConversation(
    scope: SocialInboxScope,
    conversationId: string,
    patch: SocialConversationPatch,
  ): Promise<SocialConversationDocument> {
    return this.actionService.updateConversation(scope, conversationId, patch);
  }

  ingestYoutubeComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    return this.ingestionService.ingestYoutubeComments(scope, options);
  }
}
