import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import {
  formatPlatformLabel,
  normalizeReviewDecision,
  ReviewDecision,
  TurboRunItemStatus,
} from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Review-queue tools (`list_review_queue`, `review_turbo_items`).
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentReviewToolHandler {
  constructor(
    @Optional()
    private readonly turboRunService?: TurboRunService,
  ) {}

  async listReviewQueue(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.turboRunService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const rawTurboRunId = params.turboRunId;
    const turboRunId = this.normalizeTurboRunIdParam(rawTurboRunId);
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(params.limit, 50))
        : 20;

    // Models often pass placeholders ("pending", "all", "null", empty) when the
    // operator asks for "the review queue" without a batch. Never hard-fail the
    // run — fall through to the brand/org review inbox instead.
    const hadInvalidTurboRunId =
      rawTurboRunId != null &&
      !(typeof rawTurboRunId === 'string' && rawTurboRunId.trim() === '') &&
      !turboRunId;

    if (turboRunId) {
      return this.listReviewQueueForTurboRun(turboRunId, params, ctx, limit);
    }

    return this.listReviewInbox(ctx, limit, hadInvalidTurboRunId);
  }

  private async listReviewQueueForTurboRun(
    turboRunId: string,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    limit: number,
  ): Promise<AgentToolResult> {
    if (!this.turboRunService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const turboRun = await this.turboRunService.getTurboRun(
      turboRunId,
      ctx.organizationId,
    );

    if (!turboRun) {
      return {
        creditsUsed: 0,
        error: `Batch ${turboRunId} not found`,
        success: false,
      };
    }

    const statusFilter = params.status as string | undefined;
    let items = turboRun.items || [];

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

    let approvedCount = 0;
    let changesRequestedCount = 0;
    let pendingCount = 0;
    let readyCount = 0;
    for (const item of items) {
      const decision = normalizeReviewDecision(item.reviewDecision);
      if (decision === ReviewDecision.APPROVED) {
        approvedCount += 1;
      } else if (decision === ReviewDecision.REQUEST_CHANGES) {
        changesRequestedCount += 1;
      } else if (decision === ReviewDecision.UNSET) {
        if (item.status === TurboRunItemStatus.COMPLETED) {
          readyCount += 1;
        } else if (
          item.status === TurboRunItemStatus.PENDING ||
          item.status === TurboRunItemStatus.PROCESSING
        ) {
          pendingCount += 1;
        }
      }
    }
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
        approvedCount,
        turboRunId: String(turboRun.id),
        turboRunStatus: turboRun.status,
        changesRequestedCount,
        items: visibleItems,
        pendingCount,
        readyCount,
        totalCount: turboRun.totalCount,
      },
      nextActions: [
        {
          id: `review-queue-${String(turboRun.id)}`,
          outcomeBullets,
          primaryCta: {
            href: `/publishing/review?run=${String(turboRun.id)}&filter=ready`,
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
    hadInvalidTurboRunId: boolean,
  ): Promise<AgentToolResult> {
    if (!this.turboRunService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const inbox = await this.turboRunService.getReviewInboxSummary(
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
        : `Review inbox: ${readyCount} ready for review, ${pendingCount} still generating${hadInvalidTurboRunId ? ' (ignored an invalid turboRun id from the model and loaded the full queue).' : '.'}`;

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
          turboRunId: item.turboRunId,
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

  async reviewTurboItems(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.turboRunService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const turboRunId = this.normalizeTurboRunIdParam(params.turboRunId);
    const itemIds = params.itemIds as string[];
    const action = params.action as string;

    if (!turboRunId || !itemIds?.length || !action) {
      return {
        creditsUsed: 0,
        error: 'turboRunId, itemIds, and action are required',
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
            id: `review-queue-approval-${turboRunId}`,
            primaryCta: {
              href: `/publishing/review?run=${turboRunId}&filter=ready`,
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

    await this.turboRunService.rejectItems(
      turboRunId,
      itemIds,
      ctx.organizationId,
    );

    return {
      creditsUsed: 1,
      data: {
        action,
        turboRunId,
        itemCount: itemIds.length,
      },
      success: true,
    };
  }

  private normalizeTurboRunIdParam(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value
      .trim()
      .replace(/^turboRun\s*id\s*/i, '')
      .replace(/^[:#\s-]+/, '')
      .trim();

    if (!normalized) {
      return undefined;
    }

    return isEntityId(normalized) ? normalized : undefined;
  }
}
