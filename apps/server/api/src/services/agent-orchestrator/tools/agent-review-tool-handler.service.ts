import { formatAgentPlatformLabel } from '@api/services/agent-orchestrator/tools/agent-platform-label.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { Injectable, Optional } from '@nestjs/common';

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

    const batchId = this.normalizeBatchIdParam(params.batchId);
    const limit = (params.limit as number) || 20;

    if (params.batchId != null && !batchId) {
      return {
        creditsUsed: 0,
        error: 'batchId must be a 24 character hex string',
        success: false,
      };
    }

    if (batchId) {
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
          reviewDecision:
            typeof reviewItem.reviewDecision === 'string'
              ? reviewItem.reviewDecision
              : undefined,
          scheduledDate: reviewItem.scheduledDate,
          status: reviewItem.status,
        };
      });

      const readyCount = items.filter((item: unknown) => {
        const reviewItem = item as Record<string, unknown>;
        return (
          reviewItem.reviewDecision !== 'approved' &&
          reviewItem.reviewDecision !== 'rejected' &&
          reviewItem.status !== 'failed'
        );
      }).length;
      const summaryText =
        visibleItems.length === 0
          ? 'This batch does not have any items in the current filter.'
          : `Loaded ${visibleItems.length} item${visibleItems.length === 1 ? '' : 's'} from this batch. ${readyCount} item${readyCount === 1 ? ' is' : 's are'} ready for review right now.`;
      const outcomeBullets = visibleItems.slice(0, 4).map((item) => {
        const platformLabel = formatAgentPlatformLabel(item.platform);
        const formatLabel =
          typeof item.format === 'string' ? item.format : null;
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
              href: `/posts/review?batch=${String(batch.id)}&filter=ready`,
              label: 'Open review queue',
            },
            status: 'completed',
            summaryText,
            title: 'Review queue loaded',
            type: 'completion_summary_card',
          },
        ],
        success: true,
      };
    }

    const result = await this.batchGenerationService.getBatches(
      ctx.organizationId,
      { limit },
    );

    return {
      creditsUsed: 0,
      data: {
        batches: result.items.map((b) => ({
          completedCount: b.completedCount,
          failedCount: b.failedCount,
          id: b.id,
          pendingCount: b.pendingCount,
          status: b.status,
          totalCount: b.totalCount,
        })),
        total: result.total,
      },
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
              href: `/posts/review?batch=${batchId}&filter=ready`,
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

    return normalized;
  }
}
