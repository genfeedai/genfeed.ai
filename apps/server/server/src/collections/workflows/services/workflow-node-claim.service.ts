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
 * Thrown when a durable node claim's owner-scoped write (renew or complete)
 * discovers this worker no longer owns the lease — another worker reclaimed
 * the stale-running row. Callers use `instanceof` to skip a redundant
 * stale-owner write instead of letting the error escape uncaught (#4307).
 */
export class WorkflowNodeClaimLeaseLostError extends Error {
  public readonly executionId: string;
  public readonly nodeId: string;

  constructor(lease: Pick<WorkflowNodeClaimLease, 'executionId' | 'nodeId'>) {
    super(
      `Workflow node claim lease lost for ${lease.executionId}/${lease.nodeId}`,
    );
    this.name = 'WorkflowNodeClaimLeaseLostError';
    this.executionId = lease.executionId;
    this.nodeId = lease.nodeId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

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
      throw new WorkflowNodeClaimLeaseLostError(params);
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

  /**
   * Runs `operation` while periodically renewing the durable node-claim
   * lease. A single renewal failure is tolerated (transient DB blip) as
   * long as a later renewal succeeds before the lease's own expiry would
   * have elapsed; once that window closes with no successful renewal, the
   * lease is considered lost, `operation`'s `AbortSignal` is aborted, and
   * this rejects with {@link WorkflowNodeClaimLeaseLostError} once
   * `operation` settles (#4307).
   */
  async runWithLeaseHeartbeat<Result>(
    lease: WorkflowNodeClaimLease,
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<Result> {
    let isLeaseLost = false;
    let lastRenewedAt = Date.now();
    let renewal: Promise<void> | undefined;
    const abortController = new AbortController();
    const markLeaseLost = () => {
      if (isLeaseLost) {
        return;
      }
      isLeaseLost = true;
      abortController.abort();
    };
    const heartbeat = setInterval(() => {
      if (renewal || isLeaseLost) {
        return;
      }
      renewal = this.renewLease(lease)
        .then((renewed) => {
          if (renewed) {
            lastRenewedAt = Date.now();
            return;
          }
          // The owner-scoped update matched no row: another worker already
          // reclaimed this node. This is definitive, unlike a transient
          // renewal failure below, so the lease is lost immediately.
          markLeaseLost();
        })
        .catch((error: unknown) => {
          this.logger.warn('Workflow node claim heartbeat failed', {
            ...lease,
            error: error instanceof Error ? error.message : String(error),
          });
          if (Date.now() - lastRenewedAt >= WORKFLOW_NODE_CLAIM_LEASE_MS) {
            markLeaseLost();
          }
        })
        .finally(() => {
          renewal = undefined;
        });
    }, WORKFLOW_NODE_CLAIM_HEARTBEAT_MS);

    try {
      const result = await operation(abortController.signal);
      await renewal;
      if (isLeaseLost) {
        throw new WorkflowNodeClaimLeaseLostError(lease);
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
