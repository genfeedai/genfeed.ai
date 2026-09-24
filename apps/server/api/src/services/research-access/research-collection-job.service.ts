import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

const MICRO_USD_COLUMN_MAX = 2_147_483_647;

/** How long the owner may resolve a token, reserve budget, and start the actor. */
export const RESEARCH_COLLECTION_LEASE_MS = 15 * 60 * 1000;

export const RESEARCH_COLLECTION_JOB_STATUS = {
  AMBIGUOUS: 'ambiguous',
  FAILED: 'failed',
  REQUESTED: 'requested',
  RUNNING: 'running',
  STARTING: 'starting',
  SUCCEEDED: 'succeeded',
  UNRECONCILED: 'unreconciled_start',
} as const;

export interface ResearchCollectionJobRecord {
  actualCostMicroUsd: number | null;
  actorId: string;
  datasetId: string | null;
  id: string;
  leaseExpiresAt: Date | null;
  leaseToken: string | null;
  organizationId: string;
  reconciledAt: Date | null;
  requestKey: string;
  reservationKey: string | null;
  reservedMicroUsd: number | null;
  scope: string;
  startAttemptedAt: Date | null;
  status: string;
  terminalReason: string | null;
  upstreamRunId: string | null;
  usageKey: string | null;
}

export interface ResearchCollectionClaim extends ResearchCollectionJobRecord {
  isRecovered: boolean;
}

export function buildResearchCollectionRequestKey(input: {
  actorId: string;
  input: object;
  organizationId: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        actorId: input.actorId,
        input: input.input,
        organizationId: input.organizationId,
      }),
    )
    .digest('hex');
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function microUsdColumn(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MICRO_USD_COLUMN_MAX
  ) {
    return null;
  }
  return value;
}

function readJob(
  row: ResearchCollectionJobRecord,
): ResearchCollectionJobRecord {
  return {
    actualCostMicroUsd: row.actualCostMicroUsd,
    actorId: row.actorId,
    datasetId: row.datasetId,
    id: row.id,
    leaseExpiresAt: row.leaseExpiresAt,
    leaseToken: row.leaseToken,
    organizationId: row.organizationId,
    reconciledAt: row.reconciledAt,
    requestKey: row.requestKey,
    reservationKey: row.reservationKey,
    reservedMicroUsd: row.reservedMicroUsd,
    scope: row.scope,
    startAttemptedAt: row.startAttemptedAt,
    status: row.status,
    terminalReason: row.terminalReason,
    upstreamRunId: row.upstreamRunId,
    usageKey: row.usageKey,
  };
}

@Injectable()
export class ResearchCollectionJobService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(input: {
    actorId: string;
    organizationId: string;
    requestKey: string;
  }): Promise<ResearchCollectionClaim> {
    const existing = await this.findInflight(
      input.organizationId,
      input.requestKey,
    );
    if (existing) return { ...existing, isRecovered: true };
    try {
      const now = new Date();
      const created = await this.prisma.researchCollectionJob.create({
        data: {
          actorId: input.actorId,
          inflightRequestKey: input.requestKey,
          isDeleted: false,
          leaseExpiresAt: new Date(
            now.getTime() + RESEARCH_COLLECTION_LEASE_MS,
          ),
          leaseToken: randomUUID(),
          organizationId: input.organizationId,
          requestKey: input.requestKey,
          scope: 'pending',
          status: RESEARCH_COLLECTION_JOB_STATUS.REQUESTED,
        },
      });
      return { ...readJob(created), isRecovered: false };
    } catch (error: unknown) {
      if (!isUniqueConflict(error)) throw error;
      const winner = await this.findInflight(
        input.organizationId,
        input.requestKey,
      );
      if (!winner) throw error;
      return { ...winner, isRecovered: true };
    }
  }

  /**
   * Move REQUESTED to STARTING only while this owner still holds an
   * unexpired lease. A zero count means another caller finished or
   * replaced the row; the caller must not start an actor.
   */
  async markStarting(
    job: ResearchCollectionJobRecord,
    input: { scope: string; startAttemptedAt: Date },
  ): Promise<boolean> {
    if (!job.leaseToken) return false;
    const updated = await this.prisma.researchCollectionJob.updateMany({
      data: {
        leaseExpiresAt: new Date(
          input.startAttemptedAt.getTime() + RESEARCH_COLLECTION_LEASE_MS,
        ),
        scope: input.scope,
        startAttemptedAt: input.startAttemptedAt,
        status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
      },
      where: {
        id: job.id,
        isDeleted: false,
        leaseExpiresAt: { gt: input.startAttemptedAt },
        leaseToken: job.leaseToken,
        organizationId: job.organizationId,
        status: RESEARCH_COLLECTION_JOB_STATUS.REQUESTED,
      },
    });
    return updated.count === 1;
  }

  async attachReservation(
    job: ResearchCollectionJobRecord,
    reservation: {
      reservationKey: string;
      reservedMicroUsd: number;
      usageKey: string;
    },
  ): Promise<boolean> {
    if (!job.leaseToken) return false;
    const updated = await this.prisma.researchCollectionJob.updateMany({
      data: {
        reservationKey: reservation.reservationKey,
        reservedMicroUsd: microUsdColumn(reservation.reservedMicroUsd),
        usageKey: reservation.usageKey,
      },
      where: {
        id: job.id,
        isDeleted: false,
        leaseToken: job.leaseToken,
        organizationId: job.organizationId,
        status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
        upstreamRunId: null,
      },
    });
    return updated.count === 1;
  }

  async attachRun(
    job: ResearchCollectionJobRecord,
    run: { datasetId: string; upstreamRunId: string },
  ): Promise<boolean> {
    if (!job.leaseToken) return false;
    const updated = await this.prisma.researchCollectionJob.updateMany({
      data: {
        datasetId: run.datasetId,
        status: RESEARCH_COLLECTION_JOB_STATUS.RUNNING,
        upstreamRunId: run.upstreamRunId,
      },
      where: {
        id: job.id,
        isDeleted: false,
        leaseToken: job.leaseToken,
        organizationId: job.organizationId,
        status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
        upstreamRunId: null,
      },
    });
    return updated.count === 1;
  }

  /**
   * The owner is still inside the start call. Refresh the lease so a
   * duplicate that has not seen a run cannot finish the row.
   */
  async markAmbiguous(job: ResearchCollectionJobRecord): Promise<Date | null> {
    if (!job.leaseToken) return null;
    const leaseExpiresAt = new Date(Date.now() + RESEARCH_COLLECTION_LEASE_MS);
    const updated = await this.prisma.researchCollectionJob.updateMany({
      data: {
        leaseExpiresAt,
        status: RESEARCH_COLLECTION_JOB_STATUS.AMBIGUOUS,
      },
      where: {
        id: job.id,
        isDeleted: false,
        leaseToken: job.leaseToken,
        organizationId: job.organizationId,
        status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
        upstreamRunId: null,
      },
    });
    return updated.count === 1 ? leaseExpiresAt : null;
  }

  async finish(
    job: ResearchCollectionJobRecord,
    input: {
      actualCostMicroUsd?: number | null;
      reconciledAt?: Date | null;
      status: string;
      terminalReason?: string | null;
    },
  ): Promise<boolean> {
    const legacyLeaseToken = job.leaseToken === null ? randomUUID() : null;
    const updated = await this.prisma.researchCollectionJob.updateMany({
      data: {
        actualCostMicroUsd: microUsdColumn(input.actualCostMicroUsd),
        inflightRequestKey: null,
        reconciledAt: input.reconciledAt ?? null,
        status: input.status,
        terminalReason: input.terminalReason ?? null,
        ...(legacyLeaseToken
          ? { leaseExpiresAt: new Date(), leaseToken: legacyLeaseToken }
          : {}),
      },
      where: {
        id: job.id,
        inflightRequestKey: job.requestKey,
        isDeleted: false,
        leaseToken: job.leaseToken,
        organizationId: job.organizationId,
        upstreamRunId: job.upstreamRunId,
      },
    });
    return updated.count === 1;
  }

  /**
   * Finish a start that never recorded a run, and only after its lease has
   * expired. A still-active owner does not match this update.
   */
  async finishExpiredUnrecorded(
    job: ResearchCollectionJobRecord,
    now: Date,
  ): Promise<boolean> {
    const legacyLeaseToken = job.leaseToken === null ? randomUUID() : null;
    const updated = await this.prisma.researchCollectionJob.updateMany({
      data: {
        actualCostMicroUsd: 0,
        inflightRequestKey: null,
        reconciledAt: now,
        status: RESEARCH_COLLECTION_JOB_STATUS.FAILED,
        terminalReason: 'start_not_recorded',
        ...(legacyLeaseToken
          ? { leaseExpiresAt: now, leaseToken: legacyLeaseToken }
          : {}),
      },
      where: {
        id: job.id,
        inflightRequestKey: job.requestKey,
        isDeleted: false,
        leaseToken: job.leaseToken,
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        organizationId: job.organizationId,
        status: {
          in: [
            RESEARCH_COLLECTION_JOB_STATUS.AMBIGUOUS,
            RESEARCH_COLLECTION_JOB_STATUS.REQUESTED,
            RESEARCH_COLLECTION_JOB_STATUS.STARTING,
          ],
        },
        upstreamRunId: null,
      },
    });
    return updated.count === 1;
  }

  private async findInflight(
    organizationId: string,
    requestKey: string,
  ): Promise<ResearchCollectionJobRecord | null> {
    const row = await this.prisma.researchCollectionJob.findFirst({
      where: {
        inflightRequestKey: requestKey,
        isDeleted: false,
        organizationId,
      },
    });
    return row ? readJob(row) : null;
  }
}
