import {
  formatPlatformLabel,
  isTerminalReviewDecision,
  normalizeReviewDecision,
} from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { Injectable, Optional } from '@nestjs/common';
import { isEntityId } from '@server/helpers/validation/entity-id.validator';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import { BatchGenerationService } from '@server/services/batch-generation/batch-generation.service';

/**
 * Review-queue tools (`list_review_queue`, `batch_approve_reject`).
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentReviewToolHandler {
  constructor(
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
  ) {}

  async listReviewQueue(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const rawBatchId = params.batchId;
    const batchId = this.normalizeBatchIdParam(rawBatchId);
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(params.limit, 50))
        : 20;

    // Models often pass placeholders ("pending", "all", "null", empty) when the
    // operator asks for "the review queue" without a batch. Never hard-fail the
    // run — fall through to the brand/org review inbox instead.
    const hadInvalidBatchId =
      rawBatchId != null &&
      !(typeof rawBatchId === 'string' && rawBatchId.trim() === '') &&
      !batchId;

    if (batchId) {
      return this.listReviewQueueForBatch(batchId, params, ctx, limit);
    }

    return this.listReviewInbox(ctx, limit, hadInvalidBatchId);
  }

  private async listReviewQueueForBatch(
    batchId: string,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    limit: number,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const batch = await this.batchGenerationService.getBatch(
      batchId,
      ctx.organizationId,
    );

    if (!batch) {
      return {
        creditsUsed: 0,
        error: `Batch ${batchId} not found`,
        success: false,
      };
    }

    const statusFilter = params.status as string | undefined;
    let items = batch.items || [];

    if (statusFilter) {
      items = items.filter(
        (item: unknown) =>
          (item as Record<string, unknown>).status === statusFilter,
      );
    }

    const visibleItems = items.slice(0, limit).map((item) => {
      const reviewItem = item as unknown as Record<string, unknown>;
      return {
        caption: reviewItem.caption,
        format: reviewItem.format,
        id: String(reviewItem.id),
        mediaUrl: reviewItem.mediaUrl,
        platform: reviewItem.platform,
        reviewDecision: normalizeReviewDecision(reviewItem.reviewDecision),
        scheduledDate: reviewItem.scheduledDate,
        status: reviewItem.status,
      };
    });

    const readyCount = items.filter((item: unknown) => {
      const reviewItem = item as Record<string, unknown>;
      return (
        !isTerminalReviewDecision(
          normalizeReviewDecision(reviewItem.reviewDecision),
        ) && reviewItem.status !== 'failed'
      );
    }).length;
    const summaryText =
      visibleItems.length === 0
        ? 'This batch does not have any items in the current filter.'
        : `Loaded ${visibleItems.length} item${visibleItems.length === 1 ? '' : 's'} from this batch. ${readyCount} item${readyCount === 1 ? ' is' : 's are'} ready for review right now.`;
    const outcomeBullets = visibleItems.slice(0, 4).map((item) => {
      const platformLabel = formatPlatformLabel(item.platform);
      const formatLabel = typeof item.format === 'string' ? item.format : null;
      const statusLabel =
        item.reviewDecision ??
        (typeof item.status === 'string' ? item.status : null);

      return [platformLabel, formatLabel, statusLabel]
        .filter((value): value is string => Boolean(value))
        .join(' · ');
    });

    return {
      creditsUsed: 0,
      data: {
        batchId: String(batch.id),
        batchStatus: batch.status,
        items: visibleItems,
        totalCount: batch.totalCount,
      },
      nextActions: [
        {
          id: `review-queue-${String(batch.id)}`,
          outcomeBullets,
          primaryCta: {
            href: `/publishing/review?batch=${String(batch.id)}&filter=ready`,
            label: 'Open reviews',
          },
          status: 'completed',
          summaryText,
          title: 'Reviews loaded',
          type: 'completion_summary_card',
        },
      ],
      success: true,
    };
  }

  private async listReviewInbox(
    ctx: ToolExecutionContext,
    limit: number,
    hadInvalidBatchId: boolean,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const inbox = await this.batchGenerationService.getReviewInboxSummary(
      ctx.organizationId,
      ctx.brandId,
      limit,
    );

    const recentItems = inbox.recentItems ?? [];
    const readyCount = inbox.readyCount ?? 0;
    const pendingCount = inbox.pendingCount ?? 0;
    const summaryText =
      readyCount === 0 && pendingCount === 0
        ? 'Nothing is waiting for review right now.'
        : `Review inbox: ${readyCount} ready for review, ${pendingCount} still generating${hadInvalidBatchId ? ' (ignored an invalid batch id from the model and loaded the full queue).' : '.'}`;

    const outcomeBullets = recentItems.slice(0, 4).map((item) => {
      const platformLabel = formatPlatformLabel(item.platform);
      const formatLabel = typeof item.format === 'string' ? item.format : null;
      const statusLabel =
        typeof item.status === 'string' ? item.status : 'ready';

      return [platformLabel, formatLabel, statusLabel]
        .filter((value): value is string => Boolean(value))
        .join(' · ');
    });

    return {
      creditsUsed: 0,
      data: {
        approvedCount: inbox.approvedCount,
        changesRequestedCount: inbox.changesRequestedCount,
        pendingCount,
        readyCount,
        recentItems: recentItems.map((item) => ({
          batchId: item.batchId,
          format: item.format,
          id: item.id,
          mediaUrl: item.mediaUrl,
          platform: item.platform,
          postId: item.postId,
          reviewDecision: item.reviewDecision,
          status: item.status,
          summary: item.summary,
        })),
        rejectedCount: inbox.rejectedCount,
        scope: ctx.brandId ? 'brand' : 'organization',
      },
      nextActions: [
        {
          id: `review-inbox-${ctx.brandId ?? ctx.organizationId}`,
          outcomeBullets:
            outcomeBullets.length > 0
              ? outcomeBullets
              : readyCount === 0
                ? ['Queue is empty']
                : [`${readyCount} ready for review`],
          primaryCta: {
            href: '/publishing/review?filter=ready',
            label: 'Open reviews',
          },
          status: 'completed',
          summaryText,
          title: 'Reviews loaded',
          type: 'completion_summary_card',
        },
      ],
      success: true,
    };
  }

  async batchApproveReject(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const batchId = this.normalizeBatchIdParam(params.batchId);
    const itemIds = params.itemIds as string[];
    const action = params.action as string;

    if (!batchId || !itemIds?.length || !action) {
      return {
        creditsUsed: 0,
        error: 'batchId, itemIds, and action are required',
        success: false,
      };
    }

    if (action === 'approve') {
      return {
        creditsUsed: 0,
        error:
          'Model and conversation actions cannot grant publish approval. Use the typed review control.',
        nextActions: [
          {
            id: `review-queue-approval-${batchId}`,
            primaryCta: {
              href: `/publishing/review?batch=${batchId}&filter=ready`,
              label: 'Review exact versions',
            },
            status: 'pending',
            summaryText:
              'Approval requires the authenticated version-bound review control.',
            title: 'Publish approval required',
            type: 'completion_summary_card',
          },
        ],
        success: false,
      };
    }

    await this.batchGenerationService.rejectItems(
      batchId,
      itemIds,
      ctx.organizationId,
    );

    return {
      creditsUsed: 1,
      data: {
        action,
        batchId,
        itemCount: itemIds.length,
      },
      success: true,
    };
  }

  private normalizeBatchIdParam(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value
      .trim()
      .replace(/^batch\s*id\s*/i, '')
      .replace(/^[:#\s-]+/, '')
      .trim();

    if (!normalized) {
      return undefined;
    }

    return isEntityId(normalized) ? normalized : undefined;
  }
}
