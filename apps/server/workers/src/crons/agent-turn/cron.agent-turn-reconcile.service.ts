import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { AgentRunStatus } from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import type { AgentRunJobData } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

const AGENT_TURN_PICKUP_STALE_MS = 2 * 60 * 1000;
const AGENT_TURN_RECONCILE_LIMIT = 100;

type StrandedAgentTurn = {
  config: unknown;
  id: string;
  metadata: unknown;
  organizationId: string;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readDurableQueuePayload(
  run: StrandedAgentTurn,
): AgentRunJobData | null {
  const payload = readRecord(readRecord(run.config).durableQueuePayload);
  const request = readRecord(payload.request);
  if (
    payload.kind !== 'agent-chat-turn' ||
    payload.runId !== run.id ||
    payload.organizationId !== run.organizationId ||
    typeof payload.userId !== 'string' ||
    typeof payload.clientRequestId !== 'string' ||
    typeof payload.threadId !== 'string' ||
    typeof request.content !== 'string' ||
    request.clientRequestId !== payload.clientRequestId ||
    request.threadId !== payload.threadId
  ) {
    return null;
  }
  return payload as unknown as AgentRunJobData;
}

/**
 * Re-enqueues accepted agent turns whose API process died after persistence
 * but before BullMQ durably reserved the job.
 */
@Injectable()
export class CronAgentTurnReconcileService {
  private readonly context = 'CronAgentTurnReconcileService';

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly queueService: AgentRunQueueService,
  ) {}

  async reconcileStrandedTurns(): Promise<void> {
    const staleBefore = new Date(Date.now() - AGENT_TURN_PICKUP_STALE_MS);

    // tenant-scope-ignore: platform maintenance sweep — every candidate carries
    // its organizationId and all writes and queue payloads are revalidated and
    // scoped to that tenant before dispatch.
    const candidates = await this.prisma.agentRun.findMany({
      orderBy: { updatedAt: 'asc' },
      select: {
        config: true,
        id: true,
        metadata: true,
        organizationId: true,
      },
      take: AGENT_TURN_RECONCILE_LIMIT,
      where: {
        config: {
          not: Prisma.DbNull,
          path: ['durableQueuePayload'],
        },
        isDeleted: false,
        status: AgentRunStatus.PENDING,
        updatedAt: { lt: staleBefore },
      },
    });

    let reconciledCount = 0;
    for (const candidate of candidates) {
      const payload = readDurableQueuePayload(candidate);
      if (!payload) {
        await this.prisma.agentRun.updateMany({
          data: {
            completedAt: new Date(),
            error: 'Durable agent turn recovery payload is invalid.',
            metadata: {
              ...readRecord(candidate.metadata),
              requestState: 'recovery_failed',
            } as Prisma.InputJsonValue,
            status: AgentRunStatus.FAILED,
          },
          where: {
            id: candidate.id,
            isDeleted: false,
            organizationId: candidate.organizationId,
            status: AgentRunStatus.PENDING,
          },
        });
        this.logger.error(
          `${this.context} rejected invalid durable queue payload`,
          {
            organizationId: candidate.organizationId,
            runId: candidate.id,
          },
        );
        continue;
      }

      try {
        await this.queueService.queueRun(payload);
        await this.prisma.agentRun.updateMany({
          data: {
            metadata: {
              ...readRecord(candidate.metadata),
              reconciledAt: new Date().toISOString(),
              requestState: 'reconciled',
            } as Prisma.InputJsonValue,
          },
          where: {
            id: candidate.id,
            isDeleted: false,
            organizationId: candidate.organizationId,
            status: AgentRunStatus.PENDING,
          },
        });
        reconciledCount += 1;
      } catch (error: unknown) {
        this.logger.error(`${this.context} failed to re-queue agent turn`, {
          error: error instanceof Error ? error.message : String(error),
          organizationId: candidate.organizationId,
          runId: candidate.id,
        });
      }
    }

    this.logger.log(`${this.context} completed`, {
      reconciledCount,
      strandedCount: candidates.length,
    });
  }
}
