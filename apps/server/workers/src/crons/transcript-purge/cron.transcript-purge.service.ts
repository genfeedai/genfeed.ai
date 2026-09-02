import { scopedWhere } from '@api/index';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import { TRANSCRIPT_PURGE_RETENTION_DAYS } from '@workers/crons/transcript-purge/transcript-purge.constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EMPTY_JSON = {} as Prisma.InputJsonValue;

const EXPIRED_THREAD_WIPE = {
  config: EMPTY_JSON,
  systemPrompt: null,
  title: null,
} as const;

const EXPIRED_MESSAGE_WIPE = {
  content: null,
  metadata: Prisma.DbNull,
  toolCalls: Prisma.DbNull,
  toolResults: Prisma.DbNull,
} as const;

export type TranscriptPurgeTotals = {
  agentMessages: number;
  agentThreadEvents: number;
  agentThreadSnapshots: number;
  agentThreads: number;
  organizations: number;
  threadContextStates: number;
};

/**
 * Time-bounded wipe of prompt/transcript text on soft-deleted agent rows.
 *
 * Live (`isDeleted: false`) threads stay intact so conversation history still
 * works. Tombstone instant is `updatedAt` (there is no `deletedAt`). Follow-up
 * from ADR prompt-moderation stance (#3012) / issue #3030.
 */
@Injectable()
export class CronTranscriptPurgeService {
  private readonly context = 'CronTranscriptPurgeService';

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  async purgeExpiredTranscripts(
    now = new Date(),
  ): Promise<TranscriptPurgeTotals> {
    const cutoff = CronTranscriptPurgeService.cutoffFrom(now);
    const organizationIds = await this.listOrganizationIds(cutoff);
    const totals = emptyTotals();
    totals.organizations = organizationIds.length;

    for (const organizationId of organizationIds) {
      try {
        const purged = await this.purgeOrganization(organizationId, cutoff);
        addTotals(totals, purged);
      } catch (error: unknown) {
        this.logger.error('Transcript purge failed for organization', {
          context: this.context,
          error: getErrorMessage(error),
          organizationId,
        });
      }
    }

    this.logger.log('CronTranscriptPurgeService completed', {
      ...totals,
      context: this.context,
      cutoff: cutoff.toISOString(),
      retentionDays: TRANSCRIPT_PURGE_RETENTION_DAYS,
    });

    return totals;
  }

  static cutoffFrom(now: Date): Date {
    return new Date(
      now.getTime() - TRANSCRIPT_PURGE_RETENTION_DAYS * MS_PER_DAY,
    );
  }

  private async listOrganizationIds(cutoff: Date): Promise<string[]> {
    const expiredTombstone = {
      isDeleted: true,
      updatedAt: { lt: cutoff },
    };

    const [threads, messages, events, snapshots, contexts] = await Promise.all([
      this.prisma.agentThread.findMany({
        distinct: ['organizationId'],
        select: { organizationId: true },
        where: expiredTombstone,
      }),
      this.prisma.agentMessage.findMany({
        distinct: ['organizationId'],
        select: { organizationId: true },
        where: expiredTombstone,
      }),
      this.prisma.agentThreadEvent.findMany({
        distinct: ['organizationId'],
        select: { organizationId: true },
        where: expiredTombstone,
      }),
      this.prisma.agentThreadSnapshot.findMany({
        distinct: ['organizationId'],
        select: { organizationId: true },
        where: expiredTombstone,
      }),
      this.prisma.threadContextState.findMany({
        distinct: ['organizationId'],
        select: { organizationId: true },
        where: expiredTombstone,
      }),
    ]);

    return [
      ...new Set(
        [...threads, ...messages, ...events, ...snapshots, ...contexts].map(
          (row) => row.organizationId,
        ),
      ),
    ];
  }

  private async purgeOrganization(
    organizationId: string,
    cutoff: Date,
  ): Promise<Omit<TranscriptPurgeTotals, 'organizations'>> {
    const expiredRow = scopedWhere(organizationId, {
      isDeleted: true,
      updatedAt: { lt: cutoff },
    });
    const expiredThreadIds = (
      await this.prisma.agentThread.findMany({
        select: { id: true },
        where: expiredRow,
      })
    ).map((row) => row.id);
    const expiredThreadChildren =
      expiredThreadIds.length > 0
        ? {
            organizationId,
            threadId: { in: expiredThreadIds },
          }
        : null;

    const [
      expiredThreads,
      expiredMessages,
      threadMessages,
      expiredEvents,
      threadEvents,
      expiredSnapshots,
      threadSnapshots,
      expiredContexts,
      threadContexts,
    ] = await this.prisma.$transaction(
      (tx) =>
        Promise.all([
          tx.agentThread.updateMany({
            data: EXPIRED_THREAD_WIPE,
            where: expiredRow,
          }),
          tx.agentMessage.updateMany({
            data: EXPIRED_MESSAGE_WIPE,
            where: expiredRow,
          }),
          expiredThreadChildren
            ? tx.agentMessage.updateMany({
                data: EXPIRED_MESSAGE_WIPE,
                where: expiredThreadChildren,
              })
            : noRows,
          tx.agentThreadEvent.updateMany({
            data: { data: Prisma.DbNull },
            where: expiredRow,
          }),
          expiredThreadChildren
            ? tx.agentThreadEvent.updateMany({
                data: { data: Prisma.DbNull },
                where: expiredThreadChildren,
              })
            : noRows,
          tx.agentThreadSnapshot.updateMany({
            data: { data: EMPTY_JSON },
            where: expiredRow,
          }),
          expiredThreadChildren
            ? tx.agentThreadSnapshot.updateMany({
                data: { data: EMPTY_JSON },
                where: expiredThreadChildren,
              })
            : noRows,
          tx.threadContextState.updateMany({
            data: { data: EMPTY_JSON },
            where: expiredRow,
          }),
          expiredThreadChildren
            ? tx.threadContextState.updateMany({
                data: { data: EMPTY_JSON },
                where: expiredThreadChildren,
              })
            : noRows,
        ]),
      { maxWait: 10_000, timeout: 180_000 },
    );

    return {
      agentMessages: expiredMessages.count + threadMessages.count,
      agentThreadEvents: expiredEvents.count + threadEvents.count,
      agentThreadSnapshots: expiredSnapshots.count + threadSnapshots.count,
      agentThreads: expiredThreads.count,
      threadContextStates: expiredContexts.count + threadContexts.count,
    };
  }
}

const noRows = Promise.resolve({ count: 0 });

function emptyTotals(): TranscriptPurgeTotals {
  return {
    agentMessages: 0,
    agentThreadEvents: 0,
    agentThreadSnapshots: 0,
    agentThreads: 0,
    organizations: 0,
    threadContextStates: 0,
  };
}

function addTotals(
  target: TranscriptPurgeTotals,
  increment: Omit<TranscriptPurgeTotals, 'organizations'>,
): void {
  target.agentMessages += increment.agentMessages;
  target.agentThreadEvents += increment.agentThreadEvents;
  target.agentThreadSnapshots += increment.agentThreadSnapshots;
  target.agentThreads += increment.agentThreads;
  target.threadContextStates += increment.threadContextStates;
}
