import { createHash } from 'node:crypto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

const MICRO_USD_COLUMN_MAX = 2_147_483_647;

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
      const created = await this.prisma.researchCollectionJob.create({
        data: {
          actorId: input.actorId,
          inflightRequestKey: input.requestKey,
          isDeleted: false,
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

  async markStarting(
    job: ResearchCollectionJobRecord,
    input: { scope: string; startAttemptedAt: Date },
  ): Promise<void> {
    await this.prisma.researchCollectionJob.updateMany({
      data: {
        scope: input.scope,
        startAttemptedAt: input.startAttemptedAt,
        status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
      },
      where: {
        id: job.id,
        isDeleted: false,
        organizationId: job.organizationId,
        status: RESEARCH_COLLECTION_JOB_STATUS.REQUESTED,
      },
    });
  }

  async attachReservation(
    job: ResearchCollectionJobRecord,
    reservation: {
      reservationKey: string;
      reservedMicroUsd: number;
      usageKey: string;
    },
  ): Promise<void> {
    await this.prisma.researchCollectionJob.updateMany({
      data: {
        reservationKey: reservation.reservationKey,
        reservedMicroUsd: microUsdColumn(reservation.reservedMicroUsd),
        usageKey: reservation.usageKey,
      },
      where: {
        id: job.id,
        isDeleted: false,
        organizationId: job.organizationId,
      },
    });
  }

  async attachRun(
    job: ResearchCollectionJobRecord,
    run: { datasetId: string; upstreamRunId: string },
  ): Promise<void> {
    await this.prisma.researchCollectionJob.updateMany({
      data: {
        datasetId: run.datasetId,
        status: RESEARCH_COLLECTION_JOB_STATUS.RUNNING,
        upstreamRunId: run.upstreamRunId,
      },
      where: {
        id: job.id,
        isDeleted: false,
        organizationId: job.organizationId,
        upstreamRunId: null,
      },
    });
  }

  async markAmbiguous(job: ResearchCollectionJobRecord): Promise<void> {
    await this.prisma.researchCollectionJob.updateMany({
      data: { status: RESEARCH_COLLECTION_JOB_STATUS.AMBIGUOUS },
      where: {
        id: job.id,
        isDeleted: false,
        organizationId: job.organizationId,
      },
    });
  }

  async finish(
    job: ResearchCollectionJobRecord,
    input: {
      actualCostMicroUsd?: number | null;
      reconciledAt?: Date | null;
      status: string;
      terminalReason?: string | null;
    },
  ): Promise<void> {
    await this.prisma.researchCollectionJob.updateMany({
      data: {
        actualCostMicroUsd: microUsdColumn(input.actualCostMicroUsd),
        inflightRequestKey: null,
        reconciledAt: input.reconciledAt ?? null,
        status: input.status,
        terminalReason: input.terminalReason ?? null,
      },
      where: {
        id: job.id,
        isDeleted: false,
        organizationId: job.organizationId,
      },
    });
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
