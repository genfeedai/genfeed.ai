import { randomUUID } from 'node:crypto';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentMessageRole,
  AgentTransferStatus,
  IngredientStatus,
  projectAgentTransferStatus,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_HOLD_TTL_MS } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { readRecord, readString } from '@genfeedai/utils/data/extract.util';
import { traced } from '@libs/tracing/traced';

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
  droppedRenders?: number;
  failureReason: string | null | undefined;
  status: AgentTransferStatus;
  summary: string | null;
  title: string | null | undefined;
}): string {
  const title = input.title?.trim() || 'Specialist handoff';
  if (input.status === AgentTransferStatus.COMPLETED) {
    const dropped = input.droppedRenders ?? 0;
    return [
      `${title} finished.`,
      ...(input.summary ? [input.summary] : []),
      ...(dropped > 0
        ? [
            dropped === 1
              ? '1 render failed and was left out of its outputs.'
              : `${dropped} renders failed and were left out of its outputs.`,
          ]
        : []),
    ].join('\n\n');
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
  outcome: 'expired' | 'released' | 'settled';
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

/** A child stopped before this long ago is checked by the recovery sweep. */
const RECOVERY_GRACE_MS = 2 * 60 * 1000;
const TRANSFER_BATCH = 50;

export const MEDIA_RENDER_FAILED_REASON =
  'The generated media failed to render.';

/**
 * Where one output's render stands. A persisted ingredient status wins. While
 * it still reads in progress, the billing step's own signal for this output
 * decides, because a failed render's hold is released before its failure is
 * saved. A hold that only expired proves nothing: the render can still land.
 * An output whose ingredient is gone counts as failed.
 */
export function classifyMediaOutput(input: {
  ingredientStatus: string | null | undefined;
  signal?: MediaOutputSignal['outcome'];
}): MediaOutputOutcome {
  const { ingredientStatus, signal } = input;
  if (!ingredientStatus) {
    return 'failed';
  }
  if (DONE_INGREDIENT_STATUSES.has(ingredientStatus)) {
    return 'done';
  }
  if (FAILED_INGREDIENT_STATUSES.has(ingredientStatus)) {
    return 'failed';
  }
  if (signal === 'settled') {
    return 'done';
  }
  if (signal === 'released') {
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
  droppedRenders: number;
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
  const droppedRenders = input.outputs.length - outputs.length;
  if (
    input.status === AgentTransferStatus.COMPLETED &&
    input.outputs.length > 0 &&
    outputs.length === 0
  ) {
    return {
      droppedRenders,
      failureReason: MEDIA_RENDER_FAILED_REASON,
      outputs,
      status: AgentTransferStatus.FAILED,
    };
  }
  return {
    droppedRenders,
    failureReason: input.failureReason,
    outputs,
    status: input.status,
  };
}

async function readMediaOutcomes(
  prisma: PrismaService,
  organizationId: string,
  outputs: unknown[],
  options: { isWaitOver?: boolean; signal?: MediaOutputSignal } = {},
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
  for (const id of ids) {
    const outcome = classifyMediaOutput({
      ingredientStatus: statusById.get(id),
      signal:
        options.signal?.ingredientId === id
          ? options.signal.outcome
          : undefined,
    });
    // Past the wait ceiling a render that never ended is not coming.
    if (outcome === 'failed' || (outcome === 'pending' && options.isWaitOver))
      failed.add(id);
    else if (outcome === 'pending') pending.add(id);
  }
  return { failed, pending };
}

/**
 * Move a transfer to a finished status and, if this call made the move, tell
 * the source (master) thread. The status guard makes the move happen once,
 * and the move and the note commit together, so a failed note leaves the
 * transfer open for the recovery sweep.
 */
function finishTransfer(
  prisma: PrismaService,
  input: {
    data: Omit<
      Prisma.AgentTransferUpdateManyMutationInput,
      'failureReason' | 'outputArtifactReferences' | 'status'
    >;
    droppedRenders: number;
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
  return prisma.$transaction(async (tx) => {
    const moved = await tx.agentTransfer.updateMany({
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

    const transfer = await tx.agentTransfer.findFirst({
      include: { destinationThread: { select: { title: true } } },
      where: scopedWhere(organizationId, { id: input.transferId }),
    });
    if (!transfer) {
      return false;
    }
    await tx.agentMessage.create({
      data: {
        brandId: transfer.sourceBrandId,
        content: buildTransferResultContent({
          droppedRenders: input.droppedRenders,
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
            ...(input.droppedRenders > 0
              ? { droppedRenderCount: input.droppedRenders }
              : {}),
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
  });
}

/**
 * Mirror a child's agent-turn execution onto its `AgentTransfer` row, and, the
 * first time the child finishes, tell the source (master) thread (#8527).
 *
 * Three writers call this: the queue step (when the execution has already
 * left PENDING by the time it is acknowledged), the terminal-event listener
 * (when it ends later), and the recovery sweep. The status guard makes the
 * transition happen once, so only the caller that moves the transfer to a
 * finished status posts the message. The execution id in the guard ignores a
 * superseded execution after a retry.
 *
 * A media tool answers before its render ends, so a child can finish while
 * its image or video is still rendering. Such a transfer stays RUNNING with
 * its outputs recorded, and `settleAgentTransferMediaOutput` finishes it when
 * the last render ends. Renders that failed are left out of the outputs.
 * `isMediaWaitOver` counts a render still running as failed.
 *
 * @returns whether this call moved the transfer to a finished status.
 */
export async function settleAgentTransferFromExecution(
  prisma: PrismaService,
  input: {
    execution: SettlingExecution;
    isMediaWaitOver?: boolean;
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
  const read = () =>
    readMediaOutcomes(prisma, organizationId, turnResult.artifactReferences, {
      isWaitOver: input.isMediaWaitOver,
    });

  if (status !== AgentTransferStatus.COMPLETED) {
    return finish(new Set());
  }
  const media = await read();
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
  const recheck = await read();
  return recheck.pending.size === 0 ? finish(recheck.failed) : false;
}

/**
 * Finish the transfers waiting on this output's render once every render they
 * produced has ended (see `settleAgentTransferFromExecution`).
 *
 * @returns how many transfers this call finished.
 */
export const settleAgentTransferMediaOutput = traced(
  'settleAgentTransferMediaOutput',
  async (
    prisma: PrismaService,
    signal: MediaOutputSignal & { organizationId: string },
  ): Promise<number> => {
    const { organizationId } = signal;
    let finished = 0;
    let cursor: string | undefined;
    for (;;) {
      const transfers = await prisma.agentTransfer.findMany({
        orderBy: { id: 'asc' },
        select: {
          completionSummary: true,
          destinationExecutionId: true,
          failureReason: true,
          id: true,
          outputArtifactReferences: true,
        },
        take: TRANSFER_BATCH,
        where: scopedWhere(organizationId, {
          ...(cursor ? { id: { gt: cursor } } : {}),
          outputArtifactReferences: {
            array_contains: [
              { kind: 'ingredient', recordId: signal.ingredientId },
            ],
          },
          status: AgentTransferStatus.RUNNING,
        }),
      });
      for (const transfer of transfers) {
        if (
          await finishWaitingTransfer(prisma, organizationId, transfer, signal)
        )
          finished += 1;
      }
      if (transfers.length < TRANSFER_BATCH) return finished;
      cursor = transfers[transfers.length - 1].id;
    }
  },
);

async function finishWaitingTransfer(
  prisma: PrismaService,
  organizationId: string,
  transfer: {
    completionSummary: string | null;
    destinationExecutionId: string | null;
    failureReason: string | null;
    id: string;
    outputArtifactReferences: unknown;
  },
  signal: MediaOutputSignal,
): Promise<boolean> {
  if (!transfer.destinationExecutionId) return false;
  const execution = await prisma.workflowExecution.findFirst({
    select: { status: true },
    where: scopedWhere(organizationId, { id: transfer.destinationExecutionId }),
  });
  if (
    !execution ||
    projectAgentTransferStatus(execution.status) !==
      AgentTransferStatus.COMPLETED
  ) {
    return false;
  }
  const outputs = Array.isArray(transfer.outputArtifactReferences)
    ? (transfer.outputArtifactReferences as unknown[])
    : [];
  const media = await readMediaOutcomes(prisma, organizationId, outputs, {
    signal,
  });
  if (media.pending.size > 0) return false;
  return finishTransfer(prisma, {
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
}

/**
 * Backstop for hand-offs whose child stopped but whose transfer never
 * finished: a lost event, a failed note, or a render that ended without one.
 * Each transfer is settled again from its execution, and a render still
 * running past the media hold's lifetime counts as failed.
 *
 * @returns how many transfers were finished, and how many could not be.
 */
export const recoverStalledAgentTransfers = traced(
  'recoverStalledAgentTransfers',
  async (
    prisma: PrismaService,
    options: {
      now?: Date;
      onError?: (error: unknown, transferId: string) => void;
    } = {},
  ): Promise<{ failed: number; recovered: number }> => {
    const now = options.now ?? new Date();
    const settledBefore = new Date(now.getTime() - RECOVERY_GRACE_MS);
    const waitOverBefore = now.getTime() - MEDIA_GENERATION_HOLD_TTL_MS;
    const counts = { failed: 0, recovered: 0 };
    let cursor: string | undefined;
    for (;;) {
      // tenant-scope-ignore: platform sweep; each transfer is settled in its own organization
      const transfers = await prisma.agentTransfer.findMany({
        orderBy: { id: 'asc' },
        select: {
          destinationExecutionId: true,
          id: true,
          organizationId: true,
        },
        take: TRANSFER_BATCH,
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          destinationExecution: { completedAt: { lt: settledBefore } },
          isDeleted: false,
          status: { in: SETTLEABLE_STATUSES },
        },
      });
      for (const transfer of transfers) {
        try {
          const execution = transfer.destinationExecutionId
            ? await prisma.workflowExecution.findFirst({
                select: {
                  completedAt: true,
                  error: true,
                  id: true,
                  progress: true,
                  result: true,
                  startedAt: true,
                  status: true,
                },
                where: scopedWhere(transfer.organizationId, {
                  id: transfer.destinationExecutionId,
                }),
              })
            : null;
          if (
            execution &&
            (await settleAgentTransferFromExecution(prisma, {
              execution,
              isMediaWaitOver:
                (execution.completedAt?.getTime() ?? now.getTime()) <
                waitOverBefore,
              organizationId: transfer.organizationId,
              transferId: transfer.id,
            }))
          )
            counts.recovered += 1;
        } catch (error: unknown) {
          counts.failed += 1;
          options.onError?.(error, transfer.id);
        }
      }
      if (transfers.length < TRANSFER_BATCH) return counts;
      cursor = transfers[transfers.length - 1].id;
    }
  },
);
