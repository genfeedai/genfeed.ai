import { randomUUID } from 'node:crypto';

import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import {
  WORKFLOW_NODE_CLAIM_HEARTBEAT_MS,
  WORKFLOW_NODE_CLAIM_LEASE_MS,
} from '@server/collections/workflows/services/workflow-executor.constants';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

export interface WorkflowNodeClaimLease {
  executionId: string;
  leaseOwnerId: string;
  nodeId: string;
  organizationId: string;
}

export interface WorkflowNodeClaimOptions {
  executionId: string;
  isStaleRunningReclaimEnabled?: boolean;
  nodeId: string;
  organizationId: string;
}

export type DurableNodeClaimOutcome =
  | { action: 'claimed'; lease: WorkflowNodeClaimLease }
  | {
      action: 'skip';
      status: 'completed' | 'failed' | 'running';
      output?: unknown;
      error?: string;
    };

/**
 * Durable (executionId, nodeId) claims for workflow side-effect nodes (#2359).
 *
 * Insert-before-dispatch: first writer wins. A Prisma P2002 on the unique
 * pair means another worker or a BullMQ retry already owns the node — load
 * the stored row and re-emit instead of re-executing publish/DM/credits.
 */
@Injectable()
export class WorkflowNodeClaimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async tryClaim(
    params: WorkflowNodeClaimOptions,
  ): Promise<DurableNodeClaimOutcome> {
    const lease = this.createLease(params);
    const leaseExpiresAt = this.getLeaseExpiration();
    try {
      await this.prisma.workflowNodeClaim.create({
        data: {
          executionId: params.executionId,
          leaseExpiresAt,
          leaseOwnerId: lease.leaseOwnerId,
          nodeId: params.nodeId,
          organizationId: params.organizationId,
          status: 'running',
        },
      });
      return { action: 'claimed', lease };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        let existing = await this.prisma.workflowNodeClaim.findFirst({
          where: {
            executionId: params.executionId,
            nodeId: params.nodeId,
            organizationId: params.organizationId,
          },
        });
        if (!existing) {
          this.logger.warn(
            'Workflow node claim unique conflict but row missing',
            params,
          );
          throw new Error(
            `Workflow node claim ${params.executionId}/${params.nodeId} disappeared after a unique conflict`,
          );
        }
        // Older rows have no explicit lease expiry, so `updatedAt` remains the
        // compatibility fallback until every in-flight legacy claim settles.
        const now = new Date();
        const staleBefore = new Date(Date.now() - WORKFLOW_NODE_CLAIM_LEASE_MS);
        const isFailed = existing.status === 'failed';
        const isStaleRunning =
          params.isStaleRunningReclaimEnabled !== false &&
          existing.status === 'running' &&
          (existing.leaseExpiresAt
            ? existing.leaseExpiresAt <= now
            : existing.updatedAt < staleBefore);
        if (isFailed || isStaleRunning) {
          const reclaimed = await this.prisma.workflowNodeClaim.updateMany({
            data: {
              error: null,
              leaseExpiresAt,
              leaseOwnerId: lease.leaseOwnerId,
              output: Prisma.DbNull,
              status: 'running',
            },
            where: {
              executionId: params.executionId,
              nodeId: params.nodeId,
              organizationId: params.organizationId,
              status: isFailed ? 'failed' : 'running',
              ...(isStaleRunning
                ? existing.leaseExpiresAt
                  ? { leaseExpiresAt: { lte: now } }
                  : {
                      leaseExpiresAt: null,
                      updatedAt: { lt: staleBefore },
                    }
                : {}),
            },
          });
          if (reclaimed.count === 1) {
            return { action: 'claimed', lease };
          }
          existing = await this.prisma.workflowNodeClaim.findFirst({
            where: {
              executionId: params.executionId,
              nodeId: params.nodeId,
              organizationId: params.organizationId,
            },
          });
          if (!existing) {
            throw new Error(
              `Workflow node claim ${params.executionId}/${params.nodeId} disappeared during reclaim`,
            );
          }
        }
        return {
          action: 'skip',
          error: existing.error ?? undefined,
          output: existing.output ?? undefined,
          status:
            existing.status === 'failed'
              ? 'failed'
              : existing.status === 'running'
                ? 'running'
                : 'completed',
        };
      }
      throw error;
    }
  }

  async complete(params: {
    organizationId: string;
    executionId: string;
    nodeId: string;
    status: 'completed' | 'failed';
    output?: unknown;
    error?: string;
    leaseOwnerId?: string;
  }): Promise<void> {
    const completed = await this.prisma.workflowNodeClaim.updateMany({
      data: {
        error: params.error ?? null,
        leaseExpiresAt: null,
        leaseOwnerId: null,
        output:
          params.output === undefined
            ? undefined
            : (params.output as Prisma.InputJsonValue),
        status: params.status,
      },
      where: {
        executionId: params.executionId,
        nodeId: params.nodeId,
        organizationId: params.organizationId,
        ...(params.leaseOwnerId
          ? { leaseOwnerId: params.leaseOwnerId, status: 'running' }
          : {}),
      },
    });
    if (params.leaseOwnerId && completed.count !== 1) {
      throw new Error(
        `Workflow node claim lease lost for ${params.executionId}/${params.nodeId}`,
      );
    }
  }

  async renewLease(lease: WorkflowNodeClaimLease): Promise<boolean> {
    const renewed = await this.prisma.workflowNodeClaim.updateMany({
      data: { leaseExpiresAt: this.getLeaseExpiration() },
      where: {
        executionId: lease.executionId,
        leaseOwnerId: lease.leaseOwnerId,
        nodeId: lease.nodeId,
        organizationId: lease.organizationId,
        status: 'running',
      },
    });
    return renewed.count === 1;
  }

  async runWithLeaseHeartbeat<Result>(
    lease: WorkflowNodeClaimLease,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    let isLeaseLost = false;
    let renewal: Promise<void> | undefined;
    const heartbeat = setInterval(() => {
      if (renewal || isLeaseLost) {
        return;
      }
      renewal = this.renewLease(lease)
        .then((renewed) => {
          if (!renewed) {
            isLeaseLost = true;
          }
        })
        .catch((error: unknown) => {
          this.logger.warn('Workflow node claim heartbeat failed', {
            ...lease,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          renewal = undefined;
        });
    }, WORKFLOW_NODE_CLAIM_HEARTBEAT_MS);

    try {
      const result = await operation();
      await renewal;
      if (isLeaseLost) {
        throw new Error(
          `Workflow node claim lease lost for ${lease.executionId}/${lease.nodeId}`,
        );
      }
      return result;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private createLease(
    params: Pick<
      WorkflowNodeClaimOptions,
      'executionId' | 'nodeId' | 'organizationId'
    >,
  ): WorkflowNodeClaimLease {
    return {
      executionId: params.executionId,
      leaseOwnerId: randomUUID(),
      nodeId: params.nodeId,
      organizationId: params.organizationId,
    };
  }

  private getLeaseExpiration(): Date {
    return new Date(Date.now() + WORKFLOW_NODE_CLAIM_LEASE_MS);
  }
}
