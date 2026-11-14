import {
  type IScheduledReleaseBatchItemError,
  type IScheduledReleaseBatchPending,
  readScheduledReleaseBatch,
  SCHEDULED_RELEASE_BATCH_PREVIEW_MAX,
} from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { SchedulerClient } from '@mcp/services/client/scheduler.client';
import type { McpApprovalResource } from '@mcp/shared/interfaces/approval.interface';
import { mcpToolErrorResult } from '@mcp/tools/mcp-tool-error';

export type PreparedScheduledBatch =
  | {
      kind: 'ready';
      /** The call with the invalid releases removed. */
      args: Record<string, unknown>;
      invalid: IScheduledReleaseBatchItemError[];
    }
  | { kind: 'rejected'; result: ReturnType<typeof mcpToolErrorResult> };

/**
 * Checks every release of a batch call against the API's own rules before an
 * approval is queued (#10134). A release the API would refuse is named by its
 * position and left out; when none is left, nothing is queued.
 */
export async function prepareScheduledBatch(
  scheduler: Pick<SchedulerClient, 'validateScheduledReleaseBatch'>,
  args: Record<string, unknown>,
): Promise<PreparedScheduledBatch> {
  if (args.release !== undefined) {
    throw new Error('Pass either release or releases, not both');
  }
  const releases = Array.isArray(args.releases) ? args.releases : [];
  const invalid = await scheduler.validateScheduledReleaseBatch(releases);
  const invalidIndexes = new Set(invalid.map((entry) => entry.index));
  const valid = releases.filter((_, index) => !invalidIndexes.has(index));
  if (valid.length === 0) {
    return {
      kind: 'rejected',
      result: mcpToolErrorResult({
        code: 'validation_failed',
        errors: invalid.map((entry) => ({
          field: `releases[${entry.index}]`,
          message: entry.message,
        })),
        invalidReleases: invalid,
        message:
          'No release in this batch can be scheduled, so no approval was queued. Fix the releases named in errors and call again.',
      }),
    };
  }
  return { args: { ...args, releases: valid }, invalid, kind: 'ready' };
}

/**
 * What the person sees of a queued batch: the first posts in full and, past
 * {@link SCHEDULED_RELEASE_BATCH_PREVIEW_MAX}, the rest as a count with the
 * link to the web review. A larger batch is never approved from the chat.
 */
export async function buildBatchPending(
  scheduler: Pick<SchedulerClient, 'previewScheduledReleaseBatch'>,
  releases: readonly unknown[],
  invalid: IScheduledReleaseBatchItemError[],
): Promise<IScheduledReleaseBatchPending> {
  const isApprovableHere =
    releases.length <= SCHEDULED_RELEASE_BATCH_PREVIEW_MAX;
  const posts = await scheduler.previewScheduledReleaseBatch(
    releases.slice(0, SCHEDULED_RELEASE_BATCH_PREVIEW_MAX),
  );
  return { invalid, isApprovableHere, posts, total: releases.length };
}

/** The releases a queued batch approval carries. */
export function approvalReleases(approval: McpApprovalResource): unknown[] {
  const releases = approval.arguments?.releases;
  return Array.isArray(releases) ? releases : [];
}

/**
 * The outcome Genfeed recorded when a reviewer approved the batch on the web,
 * so a repeated call reports it instead of scheduling again.
 */
export function recordedBatchOutcome(
  approval: McpApprovalResource,
): string | null {
  const recorded = approval.result;
  // Written by the API on a web approval, or the tool result of a chat approval.
  const result =
    isRecord(recorded) &&
    !Array.isArray(recorded.created) &&
    isRecord(recorded.structuredContent)
      ? recorded.structuredContent.data
      : recorded;
  if (!isRecord(result) || !Array.isArray(result.created)) return null;
  const total = typeof result.total === 'number' ? result.total : undefined;
  const failed = Array.isArray(result.errors) ? result.errors.length : 0;
  const removed = Array.isArray(result.excludedIndexes)
    ? result.excludedIndexes.length
    : 0;
  const parts = [
    `Scheduled ${result.created.length}${total === undefined ? '' : ` of ${total}`} ${(total ?? result.created.length) === 1 ? 'post' : 'posts'}`,
    ...(removed ? [`${removed} removed by the reviewer`] : []),
    ...(failed ? [`${failed} could not be scheduled`] : []),
  ];
  return `${parts.join(', ')}. Nothing more is scheduled by calling again.`;
}

/** {@link prepareScheduledBatch} for a tool call; any other call passes through untouched. */
export async function prepareToolBatch(
  client: { scheduler: Pick<SchedulerClient, 'validateScheduledReleaseBatch'> },
  name: string,
  args: Record<string, unknown> | undefined,
): Promise<PreparedScheduledBatch> {
  if (!readScheduledReleaseBatch(name, args)) {
    return { args: args ?? {}, invalid: [], kind: 'ready' };
  }
  return prepareScheduledBatch(client.scheduler, args ?? {});
}

/**
 * What a repeated call to an already-queued batch reports, or null when the
 * approval is not a batch or still waits. Genfeed schedules an approved batch
 * itself, with the posts the reviewer kept, so it is never run again here.
 */
export function settledBatchText(approval: McpApprovalResource): string | null {
  if (!readScheduledReleaseBatch(approval.toolName, approval.arguments)) {
    return null;
  }
  const outcome = recordedBatchOutcome(approval);
  if (outcome) return outcome;
  return approval.status === 'APPROVED'
    ? 'This batch was approved in Genfeed and is being scheduled there. Check get_posts shortly; nothing more is needed from this call.'
    : null;
}

/**
 * The batch half of a pending result. Without a preview the person still gets
 * the review link, and a batch that cannot be shown in full is never approvable
 * from the chat. Undefined when the approval is not a batch.
 */
export async function batchPendingFor(
  client: { scheduler: Pick<SchedulerClient, 'previewScheduledReleaseBatch'> },
  approval: McpApprovalResource,
  invalid: IScheduledReleaseBatchItemError[],
  logger: { warn(message: string, error?: unknown): void },
): Promise<IScheduledReleaseBatchPending | undefined> {
  if (!readScheduledReleaseBatch(approval.toolName, approval.arguments)) {
    return undefined;
  }
  const releases = approvalReleases(approval);
  try {
    return await buildBatchPending(client.scheduler, releases, invalid);
  } catch (error: unknown) {
    logger.warn('Could not preview the scheduled release batch', error);
    return {
      invalid,
      isApprovableHere: false,
      posts: [],
      total: releases.length,
    };
  }
}

/**
 * A batch that ran with no approval (undated drafts) still names the releases
 * validation left out, by their position in the request.
 */
export function withOmittedReleases<T extends { content: unknown[] }>(
  result: T,
  invalid: IScheduledReleaseBatchItemError[],
): T {
  if (invalid.length === 0) return result;
  const omitted = invalid
    .map((entry) => `releases[${entry.index}]: ${entry.message}`)
    .join('\n');
  return {
    ...result,
    content: [
      ...result.content,
      { text: `Left out, not valid:\n${omitted}`, type: 'text' },
    ],
  };
}
