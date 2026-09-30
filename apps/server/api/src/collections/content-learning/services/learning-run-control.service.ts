import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PlatformRole } from '@genfeedai/contracts';
import {
  type LearningRunDispatchReceiptV1,
  validLearningRunDispatchReceipt,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  type ContentLearningRun,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';
export interface LearningRunControlInput {
  id: string;
  organizationId: string;
  actorId: string;
  requestId: string;
}
interface LearningRunClock {
  now: Date;
}
@Injectable()
export class LearningRunControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  private async clock(tx: Prisma.TransactionClient): Promise<Date> {
    const rows = await tx.$queryRaw<
      LearningRunClock[]
    >`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
    return rows[0].now;
  }
  private async actorActive(tx: Prisma.TransactionClient, actorId: string) {
    return Boolean(
      await tx.user.findFirst({
        where: {
          id: actorId,
          isDeleted: false,
          banned: false,
          platformRole: PlatformRole.SUPERADMIN,
        },
      }),
    );
  }
  private async control(
    input: LearningRunControlInput,
    action: 'cancel' | 'retry',
  ): Promise<ContentLearningRun> {
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'exclusive');
      await tx.$queryRaw`SELECT id FROM content_learning_runs WHERE id=${input.id} AND "isDeleted"=false FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM content_learning_operations WHERE "organizationId"=${input.organizationId} AND "isDeleted"=false AND "resultReferences"->>'runId'=${input.id} ORDER BY id FOR UPDATE`;
      const run = await tx.contentLearningRun.findFirst({
        where: { id: input.id, isDeleted: false },
      });
      const cycles = await tx.contentLearningOperation.findMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          type: { in: ['dataset-train', 'dataset-evaluate'] },
          resultReferences: { path: ['runId'], equals: input.id },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (!run || !cycles.length)
        throw new NotFoundException('Run dispatch not found');
      if (!(await this.actorActive(tx, input.actorId)))
        throw new ConflictException('Operator authority withdrawn');
      const scope = learningHash([input.organizationId, 'run-control', run.id]);
      const payloadHash = learningHash([
        input.organizationId,
        action,
        run.id,
        run.configHash,
      ]);
      const prior = await tx.contentLearningOperation.findFirst({
        where: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          scope,
          requestId: input.requestId,
          isDeleted: false,
        },
      });
      if (prior) {
        if (prior.payloadHash !== payloadHash)
          throw new ConflictException('Request key payload conflict');
        return run;
      }
      const now = await this.clock(tx);
      if (action === 'retry') {
        if (
          !['failed', 'cancelled'].includes(run.status) ||
          cycles.some((cycle) =>
            ['pending', 'running'].includes(cycle.status),
          ) ||
          !(await this.dependencies.valid('run', run.id, tx, null))
        )
          throw new ConflictException('Run cannot retry');
        const changed = await tx.contentLearningRun.updateMany({
          where: { id: run.id, isDeleted: false, status: run.status },
          data: {
            status: 'pending',
            progress: 0,
            error: null,
            report: Prisma.DbNull,
            completedAt: null,
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('Run state changed');
        const receipt: LearningRunDispatchReceiptV1 = {
          dispatchVersion: 1,
          runId: run.id,
          datasetId: run.datasetId,
          retryOfOperationId: cycles[0].id,
          attemptCount: 0,
          nextAttemptAt: null,
          claimedStartedAt: null,
        };
        await tx.contentLearningOperation.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            scope,
            requestId: input.requestId,
            payloadHash,
            type: `dataset-${run.type}`,
            status: 'pending',
            resultReferences: toPrismaJson(receipt),
          },
        });
      } else {
        if (!['pending', 'running', 'failed', 'cancelled'].includes(run.status))
          throw new ConflictException('Run cannot cancel');
        await tx.contentLearningRun.updateMany({
          where: { id: run.id, isDeleted: false, status: run.status },
          data: { status: 'cancelled', completedAt: now },
        });
        for (const cycle of cycles.filter((cycle) =>
          ['pending', 'running'].includes(cycle.status),
        )) {
          if (!validLearningRunDispatchReceipt(cycle.resultReferences))
            throw new ConflictException('dispatch_receipt_invalid');
          await tx.contentLearningOperation.updateMany({
            where: {
              id: cycle.id,
              organizationId: input.organizationId,
              isDeleted: false,
              status: cycle.status,
            },
            data: {
              status: 'cancelled',
              error: null,
              resultReferences: toPrismaJson({
                ...cycle.resultReferences,
                nextAttemptAt: null,
                terminalResult: {
                  runStatus: 'cancelled',
                  reasonCode: 'cancelled',
                  resultArtifactId: null,
                  completedAt: now.toISOString(),
                  trainingCount: null,
                  requiredTrainingCount: null,
                },
              }),
            },
          });
        }
        await tx.contentLearningOperation.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            scope,
            requestId: input.requestId,
            payloadHash,
            type: 'run-cancel',
            status: 'completed',
            resultReferences: toPrismaJson({
              runId: run.id,
              action,
              configHash: run.configHash,
            }),
          },
        });
      }
      return tx.contentLearningRun.findFirstOrThrow({
        where: { id: run.id, isDeleted: false },
      });
    });
  }
  async cancel(input: LearningRunControlInput): Promise<ContentLearningRun> {
    return this.control(input, 'cancel');
  }
  async retry(input: LearningRunControlInput): Promise<ContentLearningRun> {
    return this.control(input, 'retry');
  }
}
