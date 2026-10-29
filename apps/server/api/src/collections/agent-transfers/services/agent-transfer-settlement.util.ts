import { randomUUID } from 'node:crypto';
import { projectAgentTransferStatus } from '@api/collections/agent-transfers/services/agent-transfer-status.util';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentMessageRole, AgentTransferStatus } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

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
  const failureReason = execution.error?.slice(0, 500);

  const moved = await prisma.agentTransfer.updateMany({
    data: {
      completedAt: execution.completedAt,
      completionSummary: turnResult.summary,
      failureReason,
      outputArtifactReferences:
        turnResult.artifactReferences as Prisma.InputJsonValue,
      outputArtifactVersionPinIds: turnResult.artifactVersionPinIds,
      progress: execution.progress,
      startedAt: execution.startedAt,
      status,
    },
    where: scopedWhere(organizationId, {
      destinationExecutionId: execution.id,
      id: transferId,
      status: { in: SETTLEABLE_STATUSES },
    }),
  });
  if (moved.count !== 1 || !FINISHED_STATUSES.includes(status)) {
    return false;
  }

  const transfer = await prisma.agentTransfer.findFirst({
    include: { destinationThread: { select: { title: true } } },
    where: scopedWhere(organizationId, { id: transferId }),
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
        summary: turnResult.summary,
        title: transfer.destinationThread.title,
      }),
      id: randomUUID(),
      isDeleted: false,
      metadata: {
        agentTransferResult: {
          destinationThreadId: transfer.destinationThreadId,
          status,
          transferId,
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
