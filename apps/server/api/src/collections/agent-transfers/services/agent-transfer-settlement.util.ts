import { randomUUID } from 'node:crypto';
import { projectAgentTransferStatus } from '@api/collections/agent-transfers/services/agent-transfer-status.util';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentMessageRole,
  AgentTransferStatus,
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { readRecord, readString } from '@genfeedai/utils/data/extract.util';

/**
 * Projection of the agent-turn workflow result JSON that a transfer mirrors.
 *
 * `WorkflowExecution.result` is an untyped Json column, so the completion
 * fields are read defensively rather than cast.
 */
export function readAgentTurnResult(value: unknown): {
  artifactReferences: unknown[];
  artifactVersionPinIds: string[];
  summary: string | null;
} {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    artifactReferences: Array.isArray(record.artifactReferences)
      ? record.artifactReferences
      : [],
    artifactVersionPinIds: Array.isArray(record.artifactVersionPinIds)
      ? record.artifactVersionPinIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : [],
    summary:
      typeof record.summary === 'string' ? record.summary.slice(0, 500) : null,
  };
}

/** The execution fields a transfer mirrors. */
export interface SettlingExecution {
  completedAt: Date | null;
  error: string | null;
  id: string;
  progress: number;
  result: unknown;
  startedAt: Date | null;
  status: string;
}

const SETTLEABLE_STATUSES = [
  AgentTransferStatus.PENDING,
  AgentTransferStatus.QUEUED,
  AgentTransferStatus.RUNNING,
];

const FINISHED_STATUSES: readonly AgentTransferStatus[] = [
  AgentTransferStatus.COMPLETED,
  AgentTransferStatus.FAILED,
  AgentTransferStatus.CANCELLED,
];

/** The text of the system message a finished child leaves in its parent. */
export function buildTransferResultContent(input: {
  failureReason: string | null | undefined;
  status: AgentTransferStatus;
  summary: string | null;
  title: string | null | undefined;
}): string {
  const title = input.title?.trim() || 'Specialist handoff';
  if (input.status === AgentTransferStatus.COMPLETED) {
    return input.summary
      ? `${title} finished.\n\n${input.summary}`
      : `${title} finished.`;
  }
  if (input.status === AgentTransferStatus.CANCELLED) {
    return `${title} was cancelled.`;
  }
  return input.failureReason
    ? `${title} failed: ${input.failureReason}`
    : `${title} failed.`;
}

/** How a generated output's render ended, as far as is known now. */
export type MediaOutputOutcome = 'done' | 'failed' | 'pending';

/** The terminal signal the billing step announced for one output. */
export interface MediaOutputSignal {
  ingredientId: string;
  outcome: 'released' | 'settled';
}

const DONE_INGREDIENT_STATUSES: ReadonlySet<string> = new Set<string>([
  IngredientStatus.ARCHIVED,
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);
const FAILED_INGREDIENT_STATUSES: ReadonlySet<string> = new Set<string>([
  IngredientStatus.FAILED,
  IngredientStatus.REJECTED,
]);

export const MEDIA_RENDER_FAILED_REASON =
  'The generated media failed to render.';

/**
 * Where one output's render stands. A persisted ingredient status wins; while
 * it still reads in progress, the billing step's signal or the credit hold
 * says how it ended, because a release can land before the failure is saved.
 * An output whose ingredient is gone counts as failed.
 */
export function classifyMediaOutput(input: {
  ingredientStatus: string | null | undefined;
  reservationStatus?: string | null;
  signal?: MediaOutputSignal['outcome'];
}): MediaOutputOutcome {
  const { ingredientStatus, reservationStatus, signal } = input;
  if (!ingredientStatus) {
    return 'failed';
  }
  if (DONE_INGREDIENT_STATUSES.has(ingredientStatus)) {
    return 'done';
  }
  if (FAILED_INGREDIENT_STATUSES.has(ingredientStatus)) {
    return 'failed';
  }
  if (signal) {
    return signal === 'settled' ? 'done' : 'failed';
  }
  if (reservationStatus === CreditReservationStatus.SETTLED) {
    return 'done';
  }
  if (
    reservationStatus === CreditReservationStatus.RELEASED ||
    reservationStatus === CreditReservationStatus.EXPIRED
  ) {
    return 'failed';
  }
  return 'pending';
}

/** The ingredient ids among a transfer's outputs. */
export function readIngredientOutputIds(outputs: unknown[]): string[] {
  return [
    ...new Set(
      outputs.flatMap((item: unknown) => {
        const record = readRecord(item);
        const recordId = readString(record.recordId);
        return record.kind === 'ingredient' && recordId ? [recordId] : [];
      }),
    ),
  ];
}

/**
 * A finished child's outputs without the renders that failed. A child whose
 * every output failed to render has not done its work, so it fails.
 */
export function applyMediaOutcomes(input: {
  failedIngredientIds: ReadonlySet<string>;
  failureReason: string | null | undefined;
  outputs: unknown[];
  status: AgentTransferStatus;
}): {
  failureReason: string | null | undefined;
  outputs: unknown[];
  status: AgentTransferStatus;
} {
  const outputs = input.outputs.filter((item: unknown) => {
    const record = readRecord(item);
    const recordId = readString(record.recordId);
    return !(
      record.kind === 'ingredient' &&
      recordId &&
      input.failedIngredientIds.has(recordId)
    );
  });
  if (
    input.status === AgentTransferStatus.COMPLETED &&
    input.outputs.length > 0 &&
    outputs.length === 0
  ) {
    return {
      failureReason: MEDIA_RENDER_FAILED_REASON,
      outputs,
      status: AgentTransferStatus.FAILED,
    };
  }
  return { failureReason: input.failureReason, outputs, status: input.status };
}

async function readMediaOutcomes(
  prisma: PrismaService,
  organizationId: string,
  outputs: unknown[],
  signal?: MediaOutputSignal,
): Promise<{ failed: Set<string>; pending: Set<string> }> {
  const ids = readIngredientOutputIds(outputs);
  const failed = new Set<string>();
  const pending = new Set<string>();
  if (ids.length === 0) {
    return { failed, pending };
  }
  const ingredients = await prisma.ingredient.findMany({
    select: { id: true, status: true },
    where: scopedWhere(organizationId, { id: { in: ids } }),
  });
  const statusById = new Map<string, string>(
    ingredients.map((ingredient) => [ingredient.id, ingredient.status]),
  );
  const unsettled = ids.filter(
    (id) =>
      classifyMediaOutput({ ingredientStatus: statusById.get(id) }) ===
      'pending',
  );
  const holds =
    unsettled.length > 0
      ? await prisma.creditReservation.findMany({
          select: { status: true, workloadId: true },
          where: scopedWhere(organizationId, {
            workloadId: { in: unsettled },
            workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
          }),
        })
      : [];
  const holdById = new Map<string, string>(
    holds.flatMap((hold) =>
      hold.workloadId ? [[hold.workloadId, hold.status]] : [],
    ),
  );
  for (const id of ids) {
    const outcome = classifyMediaOutput({
      ingredientStatus: statusById.get(id),
      reservationStatus: holdById.get(id),
      signal: signal?.ingredientId === id ? signal.outcome : undefined,
    });
    if (outcome === 'failed') failed.add(id);
    if (outcome === 'pending') pending.add(id);
  }
  return { failed, pending };
}

/**
 * Move a transfer to a finished status and, if this call made the move, tell
 * the source (master) thread. The status guard makes the move happen once.
 */
async function finishTransfer(
  prisma: PrismaService,
  input: {
    data: Omit<
      Prisma.AgentTransferUpdateManyMutationInput,
      'failureReason' | 'outputArtifactReferences' | 'status'
    >;
    executionId: string;
    failureReason: string | null | undefined;
    organizationId: string;
    outputs: unknown[];
    status: AgentTransferStatus;
    summary: string | null;
    transferId: string;
  },
): Promise<boolean> {
  const { executionId, failureReason, organizationId, outputs, status } = input;
  const moved = await prisma.agentTransfer.updateMany({
    data: {
      ...input.data,
      failureReason,
      outputArtifactReferences: outputs as Prisma.InputJsonValue,
      status,
    },
    where: scopedWhere(organizationId, {
      destinationExecutionId: executionId,
      id: input.transferId,
      status: { in: SETTLEABLE_STATUSES },
    }),
  });
  if (moved.count !== 1 || !FINISHED_STATUSES.includes(status)) {
    return false;
  }

  const transfer = await prisma.agentTransfer.findFirst({
    include: { destinationThread: { select: { title: true } } },
    where: scopedWhere(organizationId, { id: input.transferId }),
  });
  if (!transfer) {
    return false;
  }
  await prisma.agentMessage.create({
    data: {
      brandId: transfer.sourceBrandId,
      content: buildTransferResultContent({
        failureReason,
        status,
        summary: input.summary,
        title: transfer.destinationThread.title,
      }),
      id: randomUUID(),
      isDeleted: false,
      metadata: {
        agentTransferResult: {
          destinationThreadId: transfer.destinationThreadId,
          outputArtifactReferences: outputs as Prisma.InputJsonValue,
          status,
          transferId: input.transferId,
        },
      },
      organizationId,
      role: AgentMessageRole.SYSTEM,
      threadId: transfer.sourceThreadId,
      userId: transfer.userId,
    },
  });
  return true;
}

/**
 * Mirror a child's agent-turn execution onto its `AgentTransfer` row, and, the
 * first time the child finishes, tell the source (master) thread (#8527).
 *
 * Both writers call this: the queue step (when the execution has already left
 * PENDING by the time it is acknowledged) and the terminal-event listener
 * (when it ends later). The status guard makes the transition happen once, so
 * only the caller that moves the transfer to a finished status posts the
 * message. The execution id in the guard ignores a superseded execution after
 * a retry.
 *
 * A media tool answers before its render ends, so a child can finish while
 * its image or video is still rendering. Such a transfer stays RUNNING with
 * its outputs recorded, and `settleAgentTransferMediaOutput` finishes it when
 * the last render ends. Renders that failed are left out of the outputs.
 *
 * @returns whether this call moved the transfer to a finished status.
 */
export async function settleAgentTransferFromExecution(
  prisma: PrismaService,
  input: {
    execution: SettlingExecution;
    organizationId: string;
    transferId: string;
  },
): Promise<boolean> {
  const { execution, organizationId, transferId } = input;
  const turnResult = readAgentTurnResult(execution.result);
  const status = projectAgentTransferStatus(execution.status);
  const data = {
    completedAt: execution.completedAt,
    completionSummary: turnResult.summary,
    outputArtifactVersionPinIds: turnResult.artifactVersionPinIds,
    progress: execution.progress,
    startedAt: execution.startedAt,
  };
  const finish = (failed: ReadonlySet<string>) =>
    finishTransfer(prisma, {
      data,
      executionId: execution.id,
      organizationId,
      summary: turnResult.summary,
      transferId,
      ...applyMediaOutcomes({
        failedIngredientIds: failed,
        failureReason: execution.error?.slice(0, 500),
        outputs: turnResult.artifactReferences,
        status,
      }),
    });

  if (status !== AgentTransferStatus.COMPLETED) {
    return finish(new Set());
  }
  const media = await readMediaOutcomes(
    prisma,
    organizationId,
    turnResult.artifactReferences,
  );
  if (media.pending.size === 0) {
    return finish(media.failed);
  }

  await prisma.agentTransfer.updateMany({
    data: {
      ...data,
      completedAt: null,
      outputArtifactReferences:
        turnResult.artifactReferences as Prisma.InputJsonValue,
      status: AgentTransferStatus.RUNNING,
    },
    where: scopedWhere(organizationId, {
      destinationExecutionId: execution.id,
      id: transferId,
      status: { in: SETTLEABLE_STATUSES },
    }),
  });
  // A render that ended between the read above and this write announced
  // itself before the transfer listed it, so read once more.
  const recheck = await readMediaOutcomes(
    prisma,
    organizationId,
    turnResult.artifactReferences,
  );
  return recheck.pending.size === 0 ? finish(recheck.failed) : false;
}

/**
 * Finish the transfers waiting on this output's render once every render they
 * produced has ended (see `settleAgentTransferFromExecution`).
 *
 * @returns how many transfers this call finished.
 */
export async function settleAgentTransferMediaOutput(
  prisma: PrismaService,
  signal: MediaOutputSignal & { organizationId: string },
): Promise<number> {
  const { organizationId } = signal;
  const transfers = await prisma.agentTransfer.findMany({
    select: {
      completionSummary: true,
      destinationExecutionId: true,
      failureReason: true,
      id: true,
      outputArtifactReferences: true,
    },
    take: 20,
    where: scopedWhere(organizationId, {
      outputArtifactReferences: {
        array_contains: [{ kind: 'ingredient', recordId: signal.ingredientId }],
      },
      status: AgentTransferStatus.RUNNING,
    }),
  });

  let finished = 0;
  for (const transfer of transfers) {
    if (!transfer.destinationExecutionId) continue;
    const execution = await prisma.workflowExecution.findFirst({
      select: { status: true },
      where: scopedWhere(organizationId, {
        id: transfer.destinationExecutionId,
      }),
    });
    if (
      !execution ||
      projectAgentTransferStatus(execution.status) !==
        AgentTransferStatus.COMPLETED
    ) {
      continue;
    }
    const outputs = Array.isArray(transfer.outputArtifactReferences)
      ? (transfer.outputArtifactReferences as unknown[])
      : [];
    const media = await readMediaOutcomes(
      prisma,
      organizationId,
      outputs,
      signal,
    );
    if (media.pending.size > 0) continue;
    const moved = await finishTransfer(prisma, {
      data: { completedAt: new Date() },
      executionId: transfer.destinationExecutionId,
      organizationId,
      summary: transfer.completionSummary,
      transferId: transfer.id,
      ...applyMediaOutcomes({
        failedIngredientIds: media.failed,
        failureReason: transfer.failureReason,
        outputs,
        status: AgentTransferStatus.COMPLETED,
      }),
    });
    if (moved) finished += 1;
  }
  return finished;
}
