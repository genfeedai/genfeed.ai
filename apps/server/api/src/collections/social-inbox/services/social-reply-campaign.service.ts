import {
  boundLimit,
  boundPage,
  sanitizeBody,
  toPage,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import type {
  SocialInboxPage,
  SocialInboxScope,
} from '@api/collections/social-inbox/services/social-inbox.types';
import type {
  SocialReplyCampaignCreateInput,
  SocialReplyCampaignDocument,
  SocialReplyCampaignListQuery,
  SocialReplyCampaignRecipientDocument,
  SocialReplyCampaignRecipientListQuery,
  SocialReplyCampaignUpdateInput,
} from '@api/collections/social-inbox/services/social-reply-campaign.types';
import { buildSocialReplyCampaignWorkflowDefinition } from '@api/collections/social-inbox/services/social-reply-campaign-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  SocialMessageType,
  SocialReplyCampaignRecipientStatus,
  SocialReplyCampaignStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Transitions a campaign can be asked to make. `start` and `resume` differ only
 * in the state they are legal from — both bump the dispatch cursor and enqueue
 * a fresh tick.
 */
export type SocialReplyCampaignTransition =
  | 'cancel'
  | 'pause'
  | 'resume'
  | 'start';

const ACTIVE_RECIPIENT_STATUSES: string[] = [
  SocialReplyCampaignRecipientStatus.DISPATCHING,
  SocialReplyCampaignRecipientStatus.PENDING,
];

/**
 * Deterministic idempotency key shared with `social_messages`. A retried
 * dispatch reuses the reserved outbound message instead of double-posting, and
 * the recipient row carries the same value under its own unique index.
 */
export function buildRecipientIdempotencyKey(
  campaignId: string,
  conversationId: string,
): string {
  return `reply-campaign:${campaignId}:${conversationId}`;
}

@Injectable()
export class SocialReplyCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  async list(
    scope: SocialInboxScope,
    query: SocialReplyCampaignListQuery,
  ): Promise<SocialInboxPage<SocialReplyCampaignDocument>> {
    const page = boundPage(query.page);
    const limit = boundLimit(query.limit);
    const where = scopedWhere(
      scope.organizationId,
      this.buildCampaignFilters(scope, query),
    );

    const [docs, totalDocs] = await Promise.all([
      this.prisma.socialReplyCampaign.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.socialReplyCampaign.count({ where }),
    ]);

    return toPage(docs, totalDocs, page, limit);
  }

  async get(
    scope: SocialInboxScope,
    campaignId: string,
  ): Promise<SocialReplyCampaignDocument> {
    const campaign = await findOrThrow(
      this.prisma.socialReplyCampaign,
      { where: scopedWhere(scope.organizationId, { id: campaignId }) },
      'Social reply campaign',
      campaignId,
    );

    return campaign;
  }

  async create(
    scope: SocialInboxScope,
    input: SocialReplyCampaignCreateInput,
  ): Promise<SocialReplyCampaignDocument> {
    const bodyTemplate = sanitizeBody(input.bodyTemplate);
    const conversationIds = this.dedupeConversationIds(input.conversationIds);
    const conversations = await this.loadEnrollableConversations(
      scope,
      conversationIds,
      input.platform,
    );

    // Campaign + enrollment must land together. A partial create left orphan
    // campaigns with `totalRecipients: 0` that operators could never start.
    const withTotals = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.socialReplyCampaign.create({
        data: {
          bodyTemplate,
          brandId: scope.brandId ?? null,
          description: input.description ?? null,
          maxPerDay: input.maxPerDay ?? 50,
          maxPerHour: input.maxPerHour ?? 10,
          messageType: input.messageType ?? SocialMessageType.REPLY,
          minDelaySeconds: input.minDelaySeconds ?? 60,
          name: input.name,
          organizationId: scope.organizationId,
          platform: input.platform,
          status: SocialReplyCampaignStatus.DRAFT,
          userId: scope.userId ?? null,
        },
      });

      // Order is the caller's enrollment order: `position` freezes it so a
      // resumed campaign continues exactly where it stopped.
      const created = await tx.socialReplyCampaignRecipient.createMany({
        data: conversations.map((conversation, index) => ({
          campaignId: campaign.id,
          conversationId: conversation.id,
          idempotencyKey: buildRecipientIdempotencyKey(
            campaign.id,
            conversation.id,
          ),
          organizationId: scope.organizationId,
          position: index,
          status: SocialReplyCampaignRecipientStatus.PENDING,
        })),
        skipDuplicates: true,
      });

      return tx.socialReplyCampaign.update({
        data: { totalRecipients: created.count },
        where: scopedWhere(scope.organizationId, { id: campaign.id }),
      });
    });

    return withTotals;
  }

  async patch(
    scope: SocialInboxScope,
    campaignId: string,
    input: SocialReplyCampaignUpdateInput,
  ): Promise<SocialReplyCampaignDocument> {
    const campaign = await this.get(scope, campaignId);
    if (this.isTerminal(campaign.status)) {
      throw new BadRequestException(
        `A ${campaign.status} campaign can no longer be edited`,
      );
    }

    const data: Prisma.SocialReplyCampaignUpdateInput = {};
    if (input.bodyTemplate !== undefined) {
      data.bodyTemplate = sanitizeBody(input.bodyTemplate);
    }
    if (input.description !== undefined) {
      data.description = input.description;
    }
    if (input.maxPerDay !== undefined) {
      data.maxPerDay = input.maxPerDay;
    }
    if (input.maxPerHour !== undefined) {
      data.maxPerHour = input.maxPerHour;
    }
    if (input.minDelaySeconds !== undefined) {
      data.minDelaySeconds = input.minDelaySeconds;
    }
    if (input.name !== undefined) {
      data.name = input.name;
    }

    const updated = await this.prisma.socialReplyCampaign.update({
      data,
      where: scopedWhere(scope.organizationId, { id: campaign.id }),
    });

    return updated;
  }

  async remove(
    scope: SocialInboxScope,
    campaignId: string,
  ): Promise<SocialReplyCampaignDocument> {
    const campaign = await this.get(scope, campaignId);
    if (!this.isTerminal(campaign.status)) {
      await this.transition(scope, campaignId, 'cancel');
    }

    const removed = await this.prisma.socialReplyCampaign.update({
      data: { isDeleted: true },
      where: scopedWhere(scope.organizationId, { id: campaign.id }),
    });
    await this.prisma.socialReplyCampaignRecipient.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(scope.organizationId, { campaignId: campaign.id }),
    });

    return removed;
  }

  async listRecipients(
    scope: SocialInboxScope,
    campaignId: string,
    query: SocialReplyCampaignRecipientListQuery,
  ): Promise<SocialInboxPage<SocialReplyCampaignRecipientDocument>> {
    await this.get(scope, campaignId);

    const page = boundPage(query.page);
    const limit = boundLimit(query.limit);
    const where = scopedWhere(scope.organizationId, {
      campaignId,
      ...(query.status ? { status: query.status } : {}),
    });

    const [docs, totalDocs] = await Promise.all([
      this.prisma.socialReplyCampaignRecipient.findMany({
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.socialReplyCampaignRecipient.count({ where }),
    ]);

    return toPage(docs, totalDocs, page, limit);
  }

  /**
   * Lifecycle transitions. Pause and cancel work by flipping `status`: the tick
   * re-reads it before claiming a recipient, so an already-delayed job simply
   * no-ops when it lands instead of racing the operator.
   */
  async transition(
    scope: SocialInboxScope,
    campaignId: string,
    transition: SocialReplyCampaignTransition,
  ): Promise<SocialReplyCampaignDocument> {
    const campaign = await this.get(scope, campaignId);

    switch (transition) {
      case 'start':
        return this.activate(
          campaign,
          [SocialReplyCampaignStatus.DRAFT],
          transition,
        );
      case 'resume':
        return this.activate(
          campaign,
          [SocialReplyCampaignStatus.PAUSED],
          transition,
        );
      case 'pause':
        return this.pause(campaign);
      case 'cancel':
        return this.cancel(campaign);
      default: {
        // Exhaustiveness guard: a new transition must be handled above.
        const _exhaustive: never = transition;
        throw new BadRequestException(
          `Unsupported campaign transition: ${String(_exhaustive)}`,
        );
      }
    }
  }

  private async activate(
    campaign: SocialReplyCampaignDocument,
    allowedFrom: SocialReplyCampaignStatus[],
    transition: 'resume' | 'start',
  ): Promise<SocialReplyCampaignDocument> {
    const claimedStatus = campaign.status;
    if (!allowedFrom.includes(claimedStatus as SocialReplyCampaignStatus)) {
      throw new BadRequestException(
        `Cannot ${transition} a ${claimedStatus} campaign`,
      );
    }

    const pending = await this.prisma.socialReplyCampaignRecipient.count({
      where: scopedWhere(campaign.organizationId, {
        campaignId: campaign.id,
        status: SocialReplyCampaignRecipientStatus.PENDING,
      }),
    });
    if (pending === 0) {
      throw new BadRequestException(
        'Campaign has no pending recipients to dispatch',
      );
    }

    // Conditional update is the claim: two concurrent starts cannot both win
    // the cursor bump and double-enqueue a tick.
    const dispatchCursor = campaign.dispatchCursor + 1;
    const activated = await this.prisma.socialReplyCampaign.updateMany({
      data: {
        dispatchCursor,
        lastError: null,
        nextRunAt: new Date(),
        pausedAt: null,
        startedAt: campaign.startedAt ?? new Date(),
        status: SocialReplyCampaignStatus.RUNNING,
      },
      where: scopedWhere(campaign.organizationId, {
        dispatchCursor: campaign.dispatchCursor,
        id: campaign.id,
        status: { in: allowedFrom },
      }),
    });

    if (activated.count !== 1) {
      throw new BadRequestException(
        `Cannot ${transition} a ${claimedStatus} campaign`,
      );
    }

    const request = {
      campaignId: campaign.id,
      dispatchCursor,
      organizationId: campaign.organizationId,
    };
    const definition = buildSocialReplyCampaignWorkflowDefinition();
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        metadata: { campaignId: campaign.id, dispatchCursor },
        organizationId: campaign.organizationId,
        source: `social-reply-campaign-${transition}`,
        trigger: WorkflowExecutionTrigger.API,
        userId: campaign.userId ?? undefined,
      },
      `social-reply-campaign-${campaign.id}-${dispatchCursor}`,
      { replaceTerminalJob: true },
    );

    return this.get(
      {
        brandId: campaign.brandId ?? undefined,
        organizationId: campaign.organizationId,
        userId: campaign.userId ?? undefined,
      },
      campaign.id,
    );
  }

  private async pause(
    campaign: SocialReplyCampaignDocument,
  ): Promise<SocialReplyCampaignDocument> {
    if (campaign.status !== SocialReplyCampaignStatus.RUNNING) {
      throw new BadRequestException(
        `Cannot pause a ${campaign.status} campaign`,
      );
    }

    const paused = await this.prisma.socialReplyCampaign.updateMany({
      data: {
        nextRunAt: null,
        pausedAt: new Date(),
        status: SocialReplyCampaignStatus.PAUSED,
      },
      where: scopedWhere(campaign.organizationId, {
        id: campaign.id,
        status: SocialReplyCampaignStatus.RUNNING,
      }),
    });

    if (paused.count !== 1) {
      throw new BadRequestException(
        `Cannot pause a ${campaign.status} campaign`,
      );
    }

    return this.get(
      {
        brandId: campaign.brandId ?? undefined,
        organizationId: campaign.organizationId,
        userId: campaign.userId ?? undefined,
      },
      campaign.id,
    );
  }

  private async cancel(
    campaign: SocialReplyCampaignDocument,
  ): Promise<SocialReplyCampaignDocument> {
    if (this.isTerminal(campaign.status)) {
      throw new BadRequestException(
        `Campaign is already ${campaign.status.toLowerCase()}`,
      );
    }

    // Exclude terminal statuses so a concurrent complete/cancel cannot both
    // rewrite the row and double-count recipient releases.
    const cancelled = await this.prisma.socialReplyCampaign.updateMany({
      data: {
        completedAt: new Date(),
        nextRunAt: null,
        status: SocialReplyCampaignStatus.CANCELLED,
      },
      where: scopedWhere(campaign.organizationId, {
        id: campaign.id,
        status: {
          in: [
            SocialReplyCampaignStatus.DRAFT,
            SocialReplyCampaignStatus.PAUSED,
            SocialReplyCampaignStatus.RUNNING,
          ],
        },
      }),
    });

    if (cancelled.count !== 1) {
      throw new BadRequestException(
        `Campaign is already ${campaign.status.toLowerCase()}`,
      );
    }

    await this.prisma.socialReplyCampaignRecipient.updateMany({
      data: { status: SocialReplyCampaignRecipientStatus.CANCELLED },
      where: scopedWhere(campaign.organizationId, {
        campaignId: campaign.id,
        status: { in: ACTIVE_RECIPIENT_STATUSES },
      }),
    });
    return this.get(
      {
        brandId: campaign.brandId ?? undefined,
        organizationId: campaign.organizationId,
        userId: campaign.userId ?? undefined,
      },
      campaign.id,
    );
  }

  private isTerminal(status: string): boolean {
    return (
      status === SocialReplyCampaignStatus.CANCELLED ||
      status === SocialReplyCampaignStatus.COMPLETED ||
      status === SocialReplyCampaignStatus.FAILED
    );
  }

  private dedupeConversationIds(conversationIds: string[]): string[] {
    return [...new Set(conversationIds)];
  }

  private async loadEnrollableConversations(
    scope: SocialInboxScope,
    conversationIds: string[],
    platform: string,
  ): Promise<{ id: string }[]> {
    const conversations = await this.prisma.socialConversation.findMany({
      select: { id: true },
      where: scopedWhere(scope.organizationId, {
        id: { in: conversationIds },
        platform,
        ...(scope.brandId ? { brandId: scope.brandId } : {}),
      }),
    });

    if (conversations.length !== conversationIds.length) {
      throw new BadRequestException(
        `Some conversations are not available on ${platform} for this workspace`,
      );
    }

    // Restore the caller's enrollment order — `findMany` does not preserve the
    // order of an `in` filter.
    const found = new Map(conversations.map((row) => [row.id, row]));
    return conversationIds.map((id) => found.get(id) as { id: string });
  }

  /**
   * Optional filters only — the tenant keys are applied by `scopedWhere` at the
   * call site so the tenant-scope guard can prove them statically.
   */
  private buildCampaignFilters(
    scope: SocialInboxScope,
    query: SocialReplyCampaignListQuery,
  ): Prisma.SocialReplyCampaignWhereInput {
    const brandId = query.brandId ?? scope.brandId;
    return {
      ...(brandId ? { brandId } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
  }
}
