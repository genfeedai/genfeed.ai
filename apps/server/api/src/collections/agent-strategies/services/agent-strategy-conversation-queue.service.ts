import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import { CONVERSATION_OPPORTUNITY_SOURCE_TYPE } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import {
  CONVERSATION_STATE_STATUS,
  type ConversationDraftContext,
  type ConversationIngestResult,
  type ConversationMetadata,
  type ConversationQueueItem,
  type ConversationReceipt,
  type ConversationScope,
  type ConversationSource,
} from '@api/collections/agent-strategies/services/agent-strategy-conversation-queue.types';
import {
  CONVERSATION_QUEUE_LIMIT,
  freshnessDeadline,
  isFresh,
  isSameScope,
  readConversation,
  scoreConversation,
  topicFor,
  toQueueItem,
} from '@api/collections/agent-strategies/services/agent-strategy-conversation-queue.util';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

interface QueueOwner {
  organizationId: string;
  scope: ConversationScope;
  strategyId: string;
}

/**
 * The human-reviewed queue of X posts a brand could reply to. It keeps the
 * posts it is given, ranks them, and records what the reviewer decides. It
 * reads nothing from X, spends no credits, and posts nothing: the caller hands
 * in posts it already has, and a reply is recorded only with the receipt of a
 * reply that was sent. The lifecycle is the strategy opportunity's, mapped as
 * new = queued, drafted = approved, replied = published, dismissed = discarded.
 */
@Injectable()
export class AgentStrategyConversationQueueService {
  constructor(
    private readonly opportunities: AgentStrategyOpportunitiesService,
  ) {}

  /**
   * Ranks the posts against the brand's topics and queues the best that fit.
   * A post already seen (queued, dismissed, answered or expired) is never
   * queued again.
   */
  async ingest(
    owner: QueueOwner & { ownHandle?: string; topics: string[] },
    posts: ConversationSource[],
    now: Date = new Date(),
  ): Promise<ConversationIngestResult> {
    const open = await this.listOpen(owner, now);
    const seen = await this.opportunities.listByStrategy(
      owner.strategyId,
      owner.organizationId,
      { isConversationQueue: true },
    );
    const seenIds = new Set(
      seen.map((row) => readConversation(row)?.source.id).filter(Boolean),
    );
    let room = Math.max(0, CONVERSATION_QUEUE_LIMIT - open.length);

    const ranked = posts
      .map((source) => ({
        score: scoreConversation(source, {
          now,
          ownHandle: owner.ownHandle,
          topics: owner.topics,
        }),
        source,
      }))
      .filter(
        (
          entry,
        ): entry is typeof entry & { score: NonNullable<typeof entry.score> } =>
          entry.score !== null,
      )
      .sort(
        (left, right) => right.score.priorityScore - left.score.priorityScore,
      );

    const result: ConversationIngestResult = {
      alreadySeen: 0,
      ineligible: posts.length - ranked.length,
      queued: 0,
      skippedForRoom: 0,
    };

    for (const { score, source } of ranked) {
      if (seenIds.has(source.id)) {
        result.alreadySeen += 1;
        continue;
      }
      if (room === 0) {
        result.skippedForRoom += 1;
        continue;
      }
      const metadata: ConversationMetadata = {
        scope: owner.scope,
        score,
        source,
      };
      await this.opportunities.createIfMissing({
        brandId: owner.scope.brandId,
        decisionReason: score.reason,
        estimatedCreditCost: 0,
        expectedTrafficScore: 0,
        expiresAt: freshnessDeadline(source),
        formatCandidates: ['reply'],
        metadata: { conversation: metadata },
        organizationId: owner.organizationId,
        platformCandidates: ['twitter'],
        priorityScore: score.priorityScore,
        relevanceScore: score.relevanceScore,
        sourceRef: `x:${source.id}`,
        sourceType: CONVERSATION_OPPORTUNITY_SOURCE_TYPE,
        strategyId: owner.strategyId,
        topic: topicFor(source),
      });
      result.queued += 1;
      room -= 1;
    }
    return result;
  }

  /**
   * The default queue: posts still to decide (new and drafted), best first.
   * Stale posts expire and posts queued under another brand or account are
   * discarded before the list is read.
   */
  async list(
    owner: QueueOwner,
    now: Date = new Date(),
  ): Promise<ConversationQueueItem[]> {
    return this.listOpen(owner, now);
  }

  /** The exact post and brand scope a reply draft is written from. */
  async prepareDraft(
    owner: Pick<QueueOwner, 'organizationId' | 'scope'>,
    opportunityId: string,
    now: Date = new Date(),
  ): Promise<ConversationDraftContext> {
    const { conversation, opportunity } = await this.requireDecidable(
      owner,
      opportunityId,
      now,
    );
    return {
      opportunityId: opportunity.id,
      reason: conversation.score.reason,
      scope: conversation.scope,
      source: conversation.source,
    };
  }

  /** The reviewed draft exists; nothing has been sent. */
  async recordDraft(
    owner: Pick<QueueOwner, 'organizationId' | 'scope'>,
    opportunityId: string,
    draft: { turboRunId: string },
    now: Date = new Date(),
  ): Promise<ConversationQueueItem> {
    const { conversation } = await this.requireDecidable(
      owner,
      opportunityId,
      now,
    );
    return this.transition(
      owner,
      opportunityId,
      ['queued', 'approved'],
      'approved',
      {
        ...conversation,
        draft,
      },
    );
  }

  async dismiss(
    owner: Pick<QueueOwner, 'organizationId'>,
    opportunityId: string,
  ): Promise<ConversationQueueItem> {
    const opportunity = await this.requireOpportunity(owner, opportunityId);
    if (opportunity.status === 'discarded') {
      return this.view(opportunity);
    }
    const updated = await this.opportunities.transitionStatus(
      opportunityId,
      owner.organizationId,
      ['queued', 'approved'],
      CONVERSATION_STATE_STATUS.dismissed,
      { decisionReason: 'Dismissed by the reviewer.' },
    );
    if (!updated) {
      throw new ConflictException(
        'This conversation has already been decided.',
      );
    }
    return this.view(updated);
  }

  /**
   * Records a reply that was sent. The receipt is the post X returned: without
   * it nothing is recorded, and a conversation that already has a reply refuses
   * a second one.
   */
  async recordReply(
    owner: Pick<QueueOwner, 'organizationId' | 'scope'>,
    opportunityId: string,
    receipt: Omit<ConversationReceipt, 'repliedAt'>,
    now: Date = new Date(),
  ): Promise<ConversationQueueItem> {
    if (!receipt.externalPostId?.trim()) {
      throw new BadRequestException(
        'A reply is recorded only with the id of the post that was sent.',
      );
    }
    const opportunity = await this.requireOpportunity(owner, opportunityId);
    const conversation = this.requireConversation(opportunity);
    if (opportunity.status === 'published') {
      throw new ConflictException('This conversation already has a reply.');
    }
    this.requireInScope(owner.scope, conversation);

    return this.transition(
      owner,
      opportunityId,
      ['queued', 'approved'],
      'published',
      { ...conversation, reply: { ...receipt, repliedAt: now.toISOString() } },
    );
  }

  private async listOpen(
    owner: QueueOwner,
    now: Date,
  ): Promise<ConversationQueueItem[]> {
    const rows = await this.opportunities.listByStrategy(
      owner.strategyId,
      owner.organizationId,
      {
        isConversationQueue: true,
        statuses: [
          CONVERSATION_STATE_STATUS.new,
          CONVERSATION_STATE_STATUS.drafted,
        ],
      },
    );

    const items: ConversationQueueItem[] = [];
    for (const row of rows) {
      const conversation = readConversation(row);
      if (!conversation) {
        continue;
      }
      if (!isSameScope(conversation.scope, owner.scope)) {
        await this.opportunities.updateStatus(
          row.id,
          owner.organizationId,
          CONVERSATION_STATE_STATUS.dismissed,
          { decisionReason: 'The brand or account changed.' },
        );
        continue;
      }
      if (!isFresh(conversation.source, now)) {
        await this.opportunities.updateStatus(
          row.id,
          owner.organizationId,
          CONVERSATION_STATE_STATUS.expired,
          { decisionReason: 'The conversation went stale.' },
        );
        continue;
      }
      const item = toQueueItem(row, now);
      if (item) {
        items.push(item);
      }
    }
    return items.sort(
      (left, right) =>
        right.priorityScore - left.priorityScore ||
        right.source.createdAt.localeCompare(left.source.createdAt),
    );
  }

  private async requireOpportunity(
    owner: Pick<QueueOwner, 'organizationId'>,
    opportunityId: string,
  ): Promise<AgentStrategyOpportunityDocument> {
    const opportunity = await this.opportunities.findById(
      opportunityId,
      owner.organizationId,
    );
    if (!opportunity || readConversation(opportunity) === null) {
      throw new NotFoundException('Conversation');
    }
    return opportunity;
  }

  private requireConversation(
    opportunity: AgentStrategyOpportunityDocument,
  ): ConversationMetadata {
    const conversation = readConversation(opportunity);
    if (!conversation) {
      throw new NotFoundException('Conversation');
    }
    return conversation;
  }

  /** A selection made under another brand or account, or gone stale, is void. */
  private requireInScope(
    scope: ConversationScope,
    conversation: ConversationMetadata,
  ): void {
    if (!isSameScope(scope, conversation.scope)) {
      throw new ConflictException(
        'This conversation was queued for another brand or account.',
      );
    }
  }

  private async requireDecidable(
    owner: Pick<QueueOwner, 'organizationId' | 'scope'>,
    opportunityId: string,
    now: Date,
  ): Promise<{
    conversation: ConversationMetadata;
    opportunity: AgentStrategyOpportunityDocument;
  }> {
    const opportunity = await this.requireOpportunity(owner, opportunityId);
    const conversation = this.requireConversation(opportunity);
    this.requireInScope(owner.scope, conversation);
    if (
      opportunity.status !== CONVERSATION_STATE_STATUS.new &&
      opportunity.status !== CONVERSATION_STATE_STATUS.drafted
    ) {
      throw new ConflictException('This conversation is no longer open.');
    }
    if (!isFresh(conversation.source, now)) {
      throw new ConflictException('This conversation went stale.');
    }
    return { conversation, opportunity };
  }

  private async transition(
    owner: Pick<QueueOwner, 'organizationId'>,
    opportunityId: string,
    from: Array<'approved' | 'queued'>,
    status: 'approved' | 'published',
    conversation: ConversationMetadata,
  ): Promise<ConversationQueueItem> {
    const current = await this.requireOpportunity(owner, opportunityId);
    const updated = await this.opportunities.transitionStatus(
      opportunityId,
      owner.organizationId,
      from,
      status,
      { metadata: { ...current.metadata, conversation } },
    );
    if (!updated) {
      throw new ConflictException(
        'This conversation has already been decided.',
      );
    }
    return this.view(updated);
  }

  private view(
    opportunity: AgentStrategyOpportunityDocument,
  ): ConversationQueueItem {
    const item = toQueueItem(opportunity, new Date());
    if (!item) {
      throw new NotFoundException('Conversation');
    }
    return item;
  }
}
