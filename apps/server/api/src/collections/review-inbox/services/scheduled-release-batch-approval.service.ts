import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { expireStaleMcpApprovals } from '@api/collections/mcp-approvals/utils/mcp-approval-expiry.util';
import { PostGroupBatchService } from '@api/collections/post-groups/services/post-group-batch.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ApiKeyPublishingContext } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  type IScheduledReleaseBatchPost,
  type IScheduledReleaseBatchResult,
  type IScheduledReleaseBatchReview,
  MCP_APPROVAL_EXPIRED_REASON,
  MCP_APPROVAL_EXPIRY_DAYS,
  readScheduledReleaseBatch,
  type ScheduledReleaseBatchStatus,
} from '@genfeedai/contracts/interfaces';
import {
  type McpApproval,
  McpApprovalStatus,
  type Prisma,
} from '@genfeedai/prisma';
import {
  isRecord,
  readNonBlankStringOrNull as readString,
} from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

const MS_PER_DAY = 86_400_000;

/** How long an approved week may sit unscheduled before it is taken over. */
const STALLED_AFTER_MS = 2 * 60_000;

/** Where the reviewer's removed posts are kept on the approval, until it runs. */
const REVIEWED_EXCLUDED_KEY = 'reviewedExcludedIndexes';

/** What approving a batch recorded on its approval. */
interface RecordedBatchResult {
  created: Map<number, string>;
  errors: Map<number, string>;
  excluded: Set<number>;
}

/** The positions a reviewer removed, as kept on the approval. */
function readReviewedExcluded(args: unknown): number[] {
  const value = isRecord(args) ? args[REVIEWED_EXCLUDED_KEY] : null;
  return Array.isArray(value)
    ? value.filter((entry): entry is number => readIndex(entry) !== null)
    : [];
}

function readIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * The outcome recorded on an approval: written by the API when a reviewer
 * approved on the web, or the tool result the MCP server attached when the
 * requester approved in the chat.
 */
function readRecordedResult(
  recordedResult: unknown,
): RecordedBatchResult | null {
  const result =
    isRecord(recordedResult) &&
    !Array.isArray(recordedResult.created) &&
    isRecord(recordedResult.structuredContent)
      ? recordedResult.structuredContent.data
      : recordedResult;
  if (!isRecord(result) || !Array.isArray(result.created)) return null;
  const recorded: RecordedBatchResult = {
    created: new Map(),
    errors: new Map(),
    excluded: new Set(),
  };
  for (const entry of result.created) {
    const index = isRecord(entry) ? readIndex(entry.index) : null;
    const releaseId = isRecord(entry) ? readString(entry.releaseId) : null;
    if (index !== null && releaseId) recorded.created.set(index, releaseId);
  }
  for (const entry of Array.isArray(result.errors) ? result.errors : []) {
    const index = isRecord(entry) ? readIndex(entry.index) : null;
    const message = isRecord(entry) ? readString(entry.message) : null;
    if (index !== null && message) recorded.errors.set(index, message);
  }
  for (const entry of Array.isArray(result.excludedIndexes)
    ? result.excludedIndexes
    : []) {
    const index = readIndex(entry);
    if (index !== null) recorded.excluded.add(index);
  }
  return recorded;
}

/**
 * The week an MCP client scheduled with one approval (#10134). It reads every
 * post of the batch for the web review and, when a reviewer approves, creates
 * the releases itself so no second call from the agent is needed.
 */
@Traced()
@Injectable()
export class ScheduledReleaseBatchApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpApprovals: McpApprovalsService,
    private readonly postGroupBatch: PostGroupBatchService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Refuses a decision that would schedule nothing, or that a brand-limited key
   * may not make (#9130): the key may approve only a week whose releases, channel
   * accounts and media all sit in its brands, exactly what opening the review
   * requires. It runs before the approval is resolved, so a refused request
   * leaves the approval pending.
   */
  async assertCanApprove(
    approval: Pick<McpApproval, 'toolName' | 'arguments' | 'organizationId'>,
    excludedIndexes: readonly number[],
    allowedBrandIds: readonly string[] | undefined,
  ): Promise<void> {
    const releases = readScheduledReleaseBatch(
      approval.toolName,
      approval.arguments,
    );
    if (!releases) return;
    this.keptPosts(releases, excludedIndexes);
    await this.postGroupBatch.assertBrandAccess(
      approval.organizationId,
      releases,
      allowedBrandIds,
    );
  }

  private keptPosts(
    releases: readonly unknown[],
    excludedIndexes: readonly number[],
  ): { excluded: number[]; indexes: number[] } {
    const excluded = [
      ...new Set(
        excludedIndexes.filter(
          (index) =>
            Number.isInteger(index) && index >= 0 && index < releases.length,
        ),
      ),
    ];
    const indexes = releases.flatMap((_, index) =>
      excluded.includes(index) ? [] : [index],
    );
    if (indexes.length === 0) {
      throw new BadRequestException(
        'Every post was removed. Decline the batch instead.',
      );
    }
    return { excluded, indexes };
  }

  /**
   * Keeps the posts a reviewer removed on the approval, before it is approved,
   * so a run that stops after the approval can be resumed with the same kept
   * posts instead of scheduling the removed ones.
   */
  async recordReview(
    approval: Pick<
      McpApproval,
      'arguments' | 'id' | 'organizationId' | 'toolName'
    >,
    excludedIndexes: readonly number[],
  ): Promise<void> {
    const releases = readScheduledReleaseBatch(
      approval.toolName,
      approval.arguments,
    );
    if (!releases || !isRecord(approval.arguments)) return;
    const { excluded } = this.keptPosts(releases, excludedIndexes);
    await this.prisma.mcpApproval.updateMany({
      data: {
        arguments: {
          ...approval.arguments,
          [REVIEWED_EXCLUDED_KEY]: excluded,
        } as Prisma.InputJsonObject,
      },
      where: scopedWhere(approval.organizationId, {
        id: approval.id,
        status: McpApprovalStatus.PENDING,
      }),
    });
  }

  /**
   * Creates the posts a reviewer kept and records the outcome on the approval.
   * Null when the approval is not a batch, or another run already claimed it.
   */
  async schedule(
    approval: McpApproval,
    excludedIndexes: readonly number[],
    apiKeyContext: ApiKeyPublishingContext,
  ): Promise<IScheduledReleaseBatchResult | null> {
    const releases = readScheduledReleaseBatch(
      approval.toolName,
      approval.arguments,
    );
    if (!releases) return null;
    const { excluded, indexes } = this.keptPosts(releases, excludedIndexes);
    const isClaimed = await this.mcpApprovals.claimExecution(
      approval.id,
      approval.organizationId,
    );
    if (!isClaimed) return null;
    return this.createAndRecord(
      approval,
      releases,
      excluded,
      indexes,
      apiKeyContext,
    );
  }

  /**
   * Finishes an approved week whose run stopped before it recorded an outcome
   * (the server failed after the approval, or during creation). It schedules
   * the posts the reviewer kept, and each release is keyed by its position, so
   * the ones already created are returned, not made twice. Null when there is
   * nothing to resume: not a batch, still running, or already recorded.
   */
  async resumeStalled(
    organizationId: string,
    approvalId: string,
    apiKeyContext: ApiKeyPublishingContext,
    allowedBrandIds: readonly string[] | undefined,
    now: Date = new Date(),
  ): Promise<IScheduledReleaseBatchResult | null> {
    const approval = await this.prisma.mcpApproval.findFirst({
      where: scopedWhere(organizationId, {
        id: approvalId,
        status: McpApprovalStatus.APPROVED,
      }),
    });
    const releases = approval
      ? readScheduledReleaseBatch(approval.toolName, approval.arguments)
      : null;
    if (
      !approval ||
      !releases ||
      approval.status !== McpApprovalStatus.APPROVED ||
      approval.result !== null
    ) {
      return null;
    }
    try {
      await this.postGroupBatch.assertBrandAccess(
        organizationId,
        releases,
        allowedBrandIds,
      );
      const { excluded, indexes } = this.keptPosts(
        releases,
        readReviewedExcluded(approval.arguments),
      );
      const isClaimed = await this.mcpApprovals.reclaimStaleExecution(
        approval.id,
        organizationId,
        new Date(now.getTime() - STALLED_AFTER_MS),
      );
      if (!isClaimed) return null;
      return await this.createAndRecord(
        approval,
        releases,
        excluded,
        indexes,
        apiKeyContext,
      );
    } catch (error: unknown) {
      this.logger.error('Could not resume the scheduled release batch', {
        approvalId,
        error: error instanceof Error ? error.stack : String(error),
      });
      return null;
    }
  }

  private async createAndRecord(
    approval: McpApproval,
    releases: readonly unknown[],
    excluded: number[],
    indexes: number[],
    apiKeyContext: ApiKeyPublishingContext,
  ): Promise<IScheduledReleaseBatchResult> {
    const result = await this.postGroupBatch.create(
      approval.organizationId,
      approval.userId,
      releases,
      { apiKeyContext, indexes, keyBase: approval.id },
    );
    await this.mcpApprovals.attachResult(approval.id, approval.organizationId, {
      created: result.created,
      errors: result.errors,
      excludedIndexes: excluded,
      total: releases.length,
    });
    return result;
  }

  /** Every post of a batch approval, for the web review. */
  async getReview(
    organizationId: string,
    approvalId: string,
    allowedBrandIds: readonly string[] | undefined,
  ): Promise<IScheduledReleaseBatchReview> {
    await expireStaleMcpApprovals(this.prisma.mcpApproval, organizationId);
    const approval = await this.prisma.mcpApproval.findFirst({
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
      },
      where: scopedWhere(organizationId, { id: approvalId }),
    });
    const releases = approval
      ? readScheduledReleaseBatch(approval.toolName, approval.arguments)
      : null;
    if (!approval || !releases) {
      throw new NotFoundException('Scheduled release batch');
    }
    const {
      brandIds,
      brandLabel,
      posts: described,
    } = await this.postGroupBatch.describe(organizationId, releases);
    if (
      allowedBrandIds &&
      brandIds.some((id) => !allowedBrandIds.includes(id))
    ) {
      throw new NotFoundException('Scheduled release batch');
    }
    const recorded = readRecordedResult(approval.result);
    const posts = described.map(
      (post): IScheduledReleaseBatchPost => ({
        ...post,
        error: recorded?.errors.get(post.index) ?? null,
        isRemoved: recorded?.excluded.has(post.index) ?? false,
        releaseId: recorded?.created.get(post.index) ?? null,
      }),
    );
    const requester = [approval.user?.firstName, approval.user?.lastName]
      .map((part) => readString(part))
      .filter((part): part is string => part !== null)
      .join(' ');
    return {
      approvalId: approval.id,
      brandLabel,
      expiresAt:
        approval.status === McpApprovalStatus.PENDING
          ? new Date(
              approval.createdAt.getTime() +
                MCP_APPROVAL_EXPIRY_DAYS * MS_PER_DAY,
            ).toISOString()
          : null,
      posts,
      requestedAt: approval.createdAt.toISOString(),
      requestedByLabel: requester || readString(approval.user?.email) || null,
      status: this.resolveStatus(approval, recorded),
      total: posts.length,
    };
  }

  private resolveStatus(
    approval: McpApproval,
    recorded: RecordedBatchResult | null,
  ): ScheduledReleaseBatchStatus {
    if (approval.status === McpApprovalStatus.PENDING) return 'pending';
    if (approval.status === McpApprovalStatus.DECLINED) {
      return isRecord(approval.result) &&
        approval.result.reason === MCP_APPROVAL_EXPIRED_REASON
        ? 'expired'
        : 'declined';
    }
    if (!recorded) return 'scheduling';
    return recorded.errors.size > 0 ? 'partially_scheduled' : 'scheduled';
  }
}
