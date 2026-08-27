import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type DurableNodeClaimOutcome =
  | { action: 'claimed' }
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

  async tryClaim(params: {
    organizationId: string;
    executionId: string;
    nodeId: string;
  }): Promise<DurableNodeClaimOutcome> {
    try {
      await this.prisma.workflowNodeClaim.create({
        data: {
          executionId: params.executionId,
          nodeId: params.nodeId,
          organizationId: params.organizationId,
          status: 'running',
        },
      });
      return { action: 'claimed' };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.workflowNodeClaim.findFirst({
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
          return { action: 'claimed' };
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
  }): Promise<void> {
    await this.prisma.workflowNodeClaim.updateMany({
      data: {
        error: params.error ?? null,
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
      },
    });
  }
}
