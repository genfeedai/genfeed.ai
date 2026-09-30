import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  type LearningRunControlInput,
  LearningRunControlService,
} from '@api/collections/content-learning/services/learning-run-control.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PlatformRole } from '@genfeedai/contracts';
import {
  type LearningRunDispatchReceiptV1,
  learningRunTerminalResult,
  validLearningRunDispatchReceipt,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  evaluateLearningPolicy,
  initializeLearningPolicy,
  LEARNING_ARMS,
  type LearningArmId,
  type LearningEvaluationRow,
  LearningEvidenceValidationError,
  learningProbabilities,
  solveLearningRidge,
  updateLearningPolicy,
  validLearningDistribution,
} from '@genfeedai/harness';
import {
  type ContentLearningDatasetEntry,
  type ContentLearningOperation,
  type ContentLearningRun,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
export interface LearningRunDispatchInput {
  runId: string;
  operationId: string;
  organizationId: string;
}
interface LearningRunClock {
  now: Date;
}
interface LearningRunClaim {
  run: ContentLearningRun;
  operation: ContentLearningOperation;
  receipt: LearningRunDispatchReceiptV1;
  token: Date;
}
export function parseLearningRunDispatch(
  value: unknown,
): LearningRunDispatchReceiptV1 | null {
  return validLearningRunDispatchReceipt(value) ? value : null;
}
const terminalStatuses = new Set([
  'completed',
  'insufficient_data',
  'failed',
  'cancelled',
  'invalidated',
]);
export function learningRunOperationStatus(status: string): string | null {
  return ['pending', 'running', ...terminalStatuses].includes(status)
    ? status === 'insufficient_data'
      ? 'completed'
      : status
    : null;
}
@Injectable()
export class LearningRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
    private readonly controls: LearningRunControlService,
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
  private async lockedDispatch(
    tx: Prisma.TransactionClient,
    input: LearningRunDispatchInput,
  ) {
    const operationWhere = {
      id: input.operationId,
      organizationId: input.organizationId,
      isDeleted: false,
      type: { in: ['dataset-train', 'dataset-evaluate'] },
    };
    const operation = await tx.contentLearningOperation.findFirst({
      where: operationWhere,
    });
    if (!operation)
      throw new NotFoundException('Scoped run dispatch not found');
    const raw = operation.resultReferences;
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      raw.runId !== input.runId
    )
      throw new ConflictException('Stored dispatch target mismatch');
    await tx.$queryRaw`SELECT id FROM content_learning_runs WHERE id = ${input.runId} AND "isDeleted" = false FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM content_learning_operations WHERE "organizationId" = ${input.organizationId} AND "isDeleted" = false AND "resultReferences"->>'runId' = ${input.runId} ORDER BY id FOR UPDATE`;
    const run = await tx.contentLearningRun.findFirst({
      where: { id: input.runId, isDeleted: false },
    });
    const current = await tx.contentLearningOperation.findFirst({
      where: operationWhere,
    });
    if (!run || !current) throw new NotFoundException('Run dispatch not found');
    return { run, operation: current, now: await this.clock(tx) };
  }
  private async writePair(
    tx: Prisma.TransactionClient,
    claim: LearningRunClaim,
    status: string,
    now: Date,
    data: Prisma.ContentLearningRunUpdateManyMutationInput = {},
    error: string | null = null,
    nextAttemptAt: Date | null = null,
  ) {
    const mappedStatus = learningRunOperationStatus(status);
    const writeAt = error === 'run_lease_expired' ? now : await this.clock(tx);
    if (
      error !== 'run_lease_expired' &&
      writeAt.getTime() >= claim.token.getTime() + 300000
    )
      throw new ConflictException('run_lease_expired');
    const result = terminalStatuses.has(status)
      ? learningRunTerminalResult(
          {
            status,
            error,
            report: data.report ?? claim.run.report,
            resultArtifactId:
              data.resultArtifactId ?? claim.run.resultArtifactId,
          },
          writeAt,
        )
      : null;
    if (!mappedStatus || (terminalStatuses.has(status) && !result))
      throw new ConflictException('dispatch_receipt_invalid');
    const updated = await tx.contentLearningRun.updateMany({
      where: {
        id: claim.run.id,
        isDeleted: false,
        status: 'running',
        startedAt: claim.token,
      },
      data: {
        ...data,
        status,
        error,
        completedAt: terminalStatuses.has(status) ? writeAt : null,
      },
    });
    const operation = await tx.contentLearningOperation.updateMany({
      where: {
        id: claim.operation.id,
        organizationId: claim.operation.organizationId,
        isDeleted: false,
        status: 'running',
        resultReferences: {
          path: ['claimedStartedAt'],
          equals: claim.token.toISOString(),
        },
      },
      data: {
        status: mappedStatus,
        error,
        resultReferences: toPrismaJson({
          ...claim.receipt,
          ...(result ? { terminalResult: result } : {}),
          nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
        }),
      },
    });
    if (updated.count !== 1 || operation.count !== 1)
      throw new ConflictException('Run claim changed');
  }
  async reconcileDispatch(
    input: LearningRunDispatchInput,
  ): Promise<{ operation: ContentLearningOperation; dispatchable: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
      const { run, operation, now } = await this.lockedDispatch(tx, input);
      if (terminalStatuses.has(operation.status))
        return { operation, dispatchable: false };
      let receipt = parseLearningRunDispatch(operation.resultReferences);
      if (!receipt) {
        if (
          operation.status === 'pending' &&
          run.status === 'pending' &&
          !run.startedAt &&
          operation.resultReferences !== null &&
          typeof operation.resultReferences === 'object' &&
          !Array.isArray(operation.resultReferences) &&
          !('dispatchVersion' in operation.resultReferences)
        ) {
          receipt = {
            dispatchVersion: 1,
            runId: run.id,
            datasetId: run.datasetId,
            retryOfOperationId: null,
            attemptCount: 0,
            nextAttemptAt: null,
            claimedStartedAt: null,
          };
          await tx.contentLearningOperation.updateMany({
            where: {
              id: operation.id,
              organizationId: input.organizationId,
              isDeleted: false,
              status: 'pending',
            },
            data: { resultReferences: toPrismaJson(receipt) },
          });
        } else {
          const freshLegacy =
            run.status === 'running' &&
            run.startedAt &&
            now.getTime() < run.startedAt.getTime() + 300000;
          if (freshLegacy) return { operation, dispatchable: false };
          const error =
            run.status === 'running'
              ? 'legacy_claim_unverifiable'
              : 'dispatch_receipt_invalid';
          await tx.contentLearningOperation.updateMany({
            where: {
              id: operation.id,
              organizationId: input.organizationId,
              isDeleted: false,
            },
            data: { status: 'failed', error },
          });
          if (['pending', 'running'].includes(run.status))
            await tx.contentLearningRun.updateMany({
              where: {
                id: run.id,
                isDeleted: false,
                status: run.status,
                startedAt: run.startedAt,
              },
              data: {
                status: 'failed',
                error,
                report: Prisma.DbNull,
                completedAt: now,
              },
            });
          return {
            operation: { ...operation, status: 'failed', error },
            dispatchable: false,
          };
        }
      }
      if (receipt.datasetId !== run.datasetId || receipt.runId !== run.id) {
        await tx.contentLearningOperation.updateMany({
          where: {
            id: operation.id,
            organizationId: input.organizationId,
            isDeleted: false,
            status: operation.status,
          },
          data: { status: 'failed', error: 'dispatch_receipt_invalid' },
        });
        return {
          operation: {
            ...operation,
            status: 'failed',
            error: 'dispatch_receipt_invalid',
          },
          dispatchable: false,
        };
      }
      if (terminalStatuses.has(run.status)) {
        const result =
          run.completedAt &&
          receipt.claimedStartedAt === run.startedAt?.toISOString()
            ? learningRunTerminalResult(run, run.completedAt)
            : null;
        const status = result
          ? learningRunOperationStatus(run.status)
          : 'failed';
        await tx.contentLearningOperation.updateMany({
          where: {
            id: operation.id,
            organizationId: input.organizationId,
            isDeleted: false,
            status: operation.status,
          },
          data: {
            status: status ?? 'failed',
            error: result ? run.error : 'dispatch_receipt_invalid',
            resultReferences: toPrismaJson({
              ...receipt,
              ...(result ? { terminalResult: result } : {}),
            }),
          },
        });
        return {
          operation: {
            ...operation,
            status: status ?? 'failed',
            error: result ? run.error : 'dispatch_receipt_invalid',
          },
          dispatchable: false,
        };
      }
      if (
        !(await this.actorActive(tx, operation.actorId)) ||
        !(await this.dependencies.valid('run', run.id, tx, null))
      ) {
        await tx.contentLearningRun.updateMany({
          where: {
            id: run.id,
            isDeleted: false,
            status: run.status,
            startedAt: run.startedAt,
          },
          data: {
            status: 'invalidated',
            error: 'authorization_or_source_withdrawn',
            report: Prisma.DbNull,
            completedAt: now,
          },
        });
        await tx.contentLearningOperation.updateMany({
          where: {
            id: operation.id,
            organizationId: input.organizationId,
            isDeleted: false,
            status: operation.status,
          },
          data: {
            status: 'invalidated',
            error: 'authorization_or_source_withdrawn',
            resultReferences: toPrismaJson({
              ...receipt,
              terminalResult: learningRunTerminalResult(
                {
                  ...run,
                  status: 'invalidated',
                  error: 'authorization_or_source_withdrawn',
                },
                now,
              ),
            }),
          },
        });
        return {
          operation: {
            ...operation,
            status: 'invalidated',
            error: 'authorization_or_source_withdrawn',
          },
          dispatchable: false,
        };
      }
      if (run.status === 'running') {
        if (
          !run.startedAt ||
          receipt.claimedStartedAt !== run.startedAt.toISOString() ||
          operation.status !== 'running'
        ) {
          await tx.contentLearningOperation.updateMany({
            where: {
              id: operation.id,
              organizationId: input.organizationId,
              isDeleted: false,
            },
            data: { status: 'failed', error: 'dispatch_receipt_invalid' },
          });
          return {
            operation: {
              ...operation,
              status: 'failed',
              error: 'dispatch_receipt_invalid',
            },
            dispatchable: false,
          };
        }
        const expiredAt = run.startedAt.getTime() + 300000;
        if (now.getTime() < expiredAt)
          return { operation, dispatchable: false };
        const status = receipt.attemptCount < 3 ? 'pending' : 'failed';
        const nextAttemptAt =
          status === 'pending'
            ? new Date(expiredAt + (receipt.attemptCount === 1 ? 5000 : 10000))
            : null;
        await this.writePair(
          tx,
          { run, operation, receipt, token: run.startedAt },
          status,
          now,
          { report: Prisma.DbNull },
          'run_lease_expired',
          nextAttemptAt,
        );
        return {
          operation: {
            ...operation,
            status,
            error: 'run_lease_expired',
            resultReferences: toPrismaJson({
              ...receipt,
              nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
            }),
          },
          dispatchable:
            status === 'pending' &&
            Boolean(nextAttemptAt && nextAttemptAt <= now),
        };
      }
      if (run.status === 'pending' && operation.status === 'running') {
        if (
          !run.startedAt ||
          receipt.claimedStartedAt !== run.startedAt.toISOString()
        ) {
          await tx.contentLearningOperation.updateMany({
            where: {
              id: operation.id,
              organizationId: input.organizationId,
              isDeleted: false,
            },
            data: { status: 'failed', error: 'dispatch_receipt_invalid' },
          });
          return {
            operation: {
              ...operation,
              status: 'failed',
              error: 'dispatch_receipt_invalid',
            },
            dispatchable: false,
          };
        }
        await tx.contentLearningOperation.updateMany({
          where: {
            id: operation.id,
            organizationId: input.organizationId,
            isDeleted: false,
            status: 'running',
          },
          data: { status: 'pending', resultReferences: toPrismaJson(receipt) },
        });
      }
      return {
        operation: {
          ...operation,
          status: 'pending',
          resultReferences: toPrismaJson(receipt),
        },
        dispatchable:
          receipt.attemptCount < 3 &&
          (!receipt.nextAttemptAt || new Date(receipt.nextAttemptAt) <= now),
      };
    });
  }
  private async claim(
    input: LearningRunDispatchInput,
  ): Promise<LearningRunClaim | null> {
    const repaired = await this.reconcileDispatch(input);
    if (!repaired.dispatchable) return null;
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
      const { run, operation, now } = await this.lockedDispatch(tx, input);
      const receipt = parseLearningRunDispatch(operation.resultReferences);
      if (
        !receipt ||
        operation.status !== 'pending' ||
        run.status !== 'pending' ||
        receipt.attemptCount >= 3 ||
        (receipt.nextAttemptAt && new Date(receipt.nextAttemptAt) > now)
      )
        return null;
      const cycles = await tx.contentLearningOperation.findMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          status: { in: ['pending', 'running'] },
          type: { in: ['dataset-train', 'dataset-evaluate'] },
          resultReferences: { path: ['runId'], equals: run.id },
        },
        orderBy: { id: 'asc' },
      });
      if (cycles.length !== 1 || cycles[0].id !== operation.id)
        throw new ConflictException('Another active run dispatch exists');
      if (
        !(await this.actorActive(tx, operation.actorId)) ||
        !(await this.dependencies.valid('run', run.id, tx, null))
      )
        return null;
      const token = new Date(
        Math.max(now.getTime(), (run.startedAt?.getTime() ?? -1) + 1),
      );
      const next: LearningRunDispatchReceiptV1 = {
        ...receipt,
        attemptCount: receipt.attemptCount + 1,
        claimedStartedAt: token.toISOString(),
        nextAttemptAt: null,
      };
      const claimedRun = await tx.contentLearningRun.updateMany({
        where: {
          id: run.id,
          isDeleted: false,
          status: 'pending',
          startedAt: run.startedAt,
        },
        data: {
          status: 'running',
          startedAt: token,
          progress: 0,
          error: null,
          completedAt: null,
          report: Prisma.DbNull,
        },
      });
      const claimedOperation = await tx.contentLearningOperation.updateMany({
        where: {
          id: operation.id,
          organizationId: input.organizationId,
          isDeleted: false,
          status: 'pending',
        },
        data: {
          status: 'running',
          error: null,
          resultReferences: toPrismaJson(next),
        },
      });
      if (claimedRun.count !== 1 || claimedOperation.count !== 1)
        throw new ConflictException('Run dispatch claim changed');
      return {
        run: { ...run, status: 'running', startedAt: token },
        operation: { ...operation, status: 'running' },
        receipt: next,
        token,
      };
    });
  }
  private async owned<T>(
    claim: LearningRunClaim,
    apply: (tx: Prisma.TransactionClient, now: Date) => Promise<T>,
  ): Promise<T | null> {
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
      const input = {
        runId: claim.run.id,
        operationId: claim.operation.id,
        organizationId: claim.operation.organizationId,
      };
      const { run, operation, now } = await this.lockedDispatch(tx, input);
      const receipt = parseLearningRunDispatch(operation.resultReferences);
      if (
        run.status !== 'running' ||
        operation.status !== 'running' ||
        run.startedAt?.getTime() !== claim.token.getTime() ||
        receipt?.claimedStartedAt !== claim.token.toISOString() ||
        now.getTime() >= claim.token.getTime() + 300000
      )
        return null;
      if (
        !(await this.actorActive(tx, operation.actorId)) ||
        !(await this.dependencies.valid('run', run.id, tx, null))
      ) {
        await this.writePair(
          tx,
          claim,
          'invalidated',
          now,
          { report: Prisma.DbNull },
          'authorization_or_source_withdrawn',
        );
        return null;
      }
      return apply(tx, now);
    });
  }
  private async failedAttempt(claim: LearningRunClaim, error: unknown) {
    const input = {
      runId: claim.run.id,
      operationId: claim.operation.id,
      organizationId: claim.operation.organizationId,
    };
    const deterministic =
      error instanceof LearningEvidenceValidationError ||
      error instanceof BadRequestException;
    const code =
      error instanceof LearningEvidenceValidationError
        ? `invalid_evidence:${error.path}`
        : error instanceof BadRequestException
          ? 'invalid_immutable_dataset'
          : 'run_attempt_failed';
    const result = await this.owned(claim, async (tx, now) => {
      const status =
        deterministic || claim.receipt.attemptCount >= 3 ? 'failed' : 'pending';
      const nextAttemptAt =
        status === 'pending'
          ? new Date(
              now.getTime() + (claim.receipt.attemptCount === 1 ? 5000 : 10000),
            )
          : null;
      await this.writePair(
        tx,
        claim,
        status,
        now,
        { report: Prisma.DbNull },
        code,
        nextAttemptAt,
      );
      return true;
    }).catch(async (failure: unknown) => {
      if (
        !(failure instanceof ConflictException) ||
        failure.message !== 'run_lease_expired'
      )
        throw failure;
      await this.reconcileDispatch(input);
      return null;
    });
    if (!result) await this.reconcileDispatch(input);
  }
  async request(input: {
    datasetId: string;
    actorId: string;
    organizationId: string;
    requestId: string;
    type: 'train' | 'evaluate';
    parentArtifactId?: string;
  }) {
    const dataset = await this.prisma.contentLearningDataset.findFirst({
      where: { id: input.datasetId, isDeleted: false },
    });
    if (
      !dataset ||
      !(await this.dependencies.valid('dataset', dataset.id, this.prisma, null))
    )
      throw new BadRequestException('Dataset unavailable or revoked');
    const key = learningHash([
        input.organizationId,
        input.actorId,
        input.requestId,
        input.type,
      ]),
      configHash = learningHash([
        'ridge-epsilon-v1',
        dataset.manifestHash,
        input.type,
        input.parentArtifactId,
      ]);
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
      if (
        !(await this.actorActive(tx, input.actorId)) ||
        !(await this.dependencies.valid('dataset', dataset.id, tx, null))
      )
        throw new ConflictException(
          'Dataset or operator authorization changed',
        );
      const prior = await tx.contentLearningRun.findFirst({
        where: { idempotencyKey: key, isDeleted: false },
      });
      if (prior) {
        if (prior.configHash !== configHash)
          throw new ConflictException('Run request key conflict');
        return prior;
      }
      const run = await tx.contentLearningRun.create({
        data: {
          datasetId: dataset.id,
          configHash,
          parentArtifactId: input.parentArtifactId,
          type: input.type,
          seed: dataset.manifestHash,
          idempotencyKey: key,
          synthetic: dataset.synthetic,
        },
      });
      await this.dependencies.link(
        tx,
        await this.dependencies.resolve('dataset', dataset.id, null, tx),
        await this.dependencies.resolve('run', run.id, null, tx),
      );
      await tx.contentLearningOperation.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          scope: 'global-admin',
          requestId: input.requestId,
          payloadHash: configHash,
          type: `dataset-${input.type}`,
          resultReferences: toPrismaJson({
            dispatchVersion: 1,
            runId: run.id,
            datasetId: dataset.id,
            retryOfOperationId: null,
            attemptCount: 0,
            nextAttemptAt: null,
            claimedStartedAt: null,
          }),
        },
      });
      return run;
    });
  }
  async execute(input: LearningRunDispatchInput) {
    const claim = await this.claim(input);
    if (!claim)
      return this.prisma.contentLearningOperation.findFirst({
        where: {
          id: input.operationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
    const run = claim.run,
      runId = run.id;
    const rows: ContentLearningDatasetEntry[] = [];
    try {
      const dataset = await this.prisma.contentLearningDataset.findFirst({
        where: { id: run.datasetId, isDeleted: false },
      });
      if (!dataset) {
        await this.owned(claim, async (tx, now) =>
          this.writePair(
            tx,
            claim,
            'invalidated',
            now,
            { report: Prisma.DbNull },
            'dataset_unavailable',
          ),
        );
        return null;
      }
      if (
        (await this.prisma.contentLearningDatasetEntry.count({
          where: { datasetId: dataset.id, isDeleted: false },
        })) > 100000
      )
        throw new BadRequestException('Oversized immutable dataset');
      let cursor: string | undefined;
      for (;;) {
        if (!(await this.owned(claim, async () => true))) {
          await this.reconcileDispatch(input);
          return null;
        }
        const page = await this.prisma.contentLearningDatasetEntry.findMany({
          where: { datasetId: dataset.id, isDeleted: false },
          orderBy: [{ decisionAt: 'asc' }, { id: 'asc' }],
          take: 1000,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        rows.push(...page);
        if (rows.length > 100000)
          throw new BadRequestException('Oversized immutable dataset');
        if (page.length < 1000) break;
        cursor = page[page.length - 1].id;
      }
      for (const [index, row] of rows.entries()) {
        if (!LEARNING_ARMS.includes(row.armId as LearningArmId))
          throw new LearningEvidenceValidationError(
            `dataset.entries[${index}].armId`,
          );
        if (!validLearningDistribution(row.probabilities))
          throw new LearningEvidenceValidationError(
            `dataset.entries[${index}].probabilities`,
          );
        if (
          row.features.length !== 9 ||
          row.features.some((value) => !Number.isFinite(value))
        )
          throw new LearningEvidenceValidationError(
            `dataset.entries[${index}].features`,
          );
        if (!Number.isFinite(row.reward) || Math.abs(row.reward) > 1)
          throw new LearningEvidenceValidationError(
            `dataset.entries[${index}].reward`,
          );
      }
      const training = rows.filter((row) => row.split === 'training');
      if (training.length < 30) {
        await this.owned(claim, async (tx, now) =>
          this.writePair(tx, claim, 'insufficient_data', now, {
            progress: 100,
            report: toPrismaJson({
              reason: 'minimum_training_30',
              count: training.length,
            }),
          }),
        );
        return null;
      }
      const groupCounts = new Map<string, number>();
      for (const row of training)
        groupCounts.set(
          row.accountGroup,
          (groupCounts.get(row.accountGroup) ?? 0) + 1,
        );
      const groups = [...groupCounts.keys()];
      const state = initializeLearningPolicy(undefined, 1);
      for (let i = 0; i < training.length; i++) {
        if (i % 1000 === 0) {
          if (
            !(await this.owned(claim, async (tx) => {
              const updated = await tx.contentLearningRun.updateMany({
                where: {
                  id: runId,
                  status: 'running',
                  startedAt: claim.token,
                  isDeleted: false,
                },
                data: { progress: Math.floor((80 * i) / training.length) },
              });
              return updated.count === 1;
            }))
          ) {
            await this.reconcileDispatch(input);
            return null;
          }
        }
        const row = training[i];
        if (!LEARNING_ARMS.includes(row.armId as LearningArmId))
          throw new Error('Invalid stored arm');
        updateLearningPolicy(
          state,
          row.armId as LearningArmId,
          row.features,
          row.reward,
          1 / (groupCounts.get(row.accountGroup) ?? 1),
        );
      }
      const coefficients = Object.fromEntries(
        LEARNING_ARMS.map((arm) => [arm, solveLearningRidge(state[arm])]),
      );
      if (run.type === 'train')
        return await this.owned(claim, async (tx, now) => {
          const prior = await tx.contentLearningSharedPolicy.findFirst({
            where: { cell: dataset.cell, isDeleted: false },
            orderBy: { version: 'desc' },
          });
          const artifact = await tx.contentLearningSharedPolicy.create({
            data: {
              cell: dataset.cell,
              version: (prior?.version ?? 0) + 1,
              runId,
              datasetId: dataset.id,
              featureSchema: 'numeric-nine-v1',
              coefficients: toPrismaJson(coefficients),
              directives: toPrismaJson({ armIds: LEARNING_ARMS }),
              validity: 'candidate',
              synthetic: dataset.synthetic,
            },
          });
          await this.dependencies.link(
            tx,
            await this.dependencies.resolve('run', runId, null, tx),
            await this.dependencies.resolve(
              'shared-policy',
              artifact.id,
              null,
              tx,
            ),
          );
          await this.writePair(tx, claim, 'completed', now, {
            progress: 100,
            resultArtifactId: artifact.id,
            report: toPrismaJson({
              manifestHash: dataset.manifestHash,
              armState: state,
              sourceAccountCount: groups.length,
              synthetic: dataset.synthetic,
            }),
          });
          return artifact;
        });
      const evaluationRows: LearningEvaluationRow[] = rows.map((row) => {
        const loggingProbabilities = validLearningDistribution(
          row.probabilities,
        )
          ? row.probabilities
          : null;
        const predictions = Object.fromEntries(
          LEARNING_ARMS.map((arm) => [
            arm,
            Math.max(
              -1,
              Math.min(
                1,
                coefficients[arm].reduce(
                  (sum: number, value: number, i: number) =>
                    sum + value * row.features[i],
                  0,
                ),
              ),
            ),
          ]),
        ) as Record<LearningArmId, number>;
        return {
          accountGroup: row.accountGroup,
          armId: row.armId as LearningArmId,
          reward: row.reward,
          loggingProbabilities,
          loggedProbability:
            loggingProbabilities?.[row.armId as LearningArmId] ?? null,
          candidateProbabilities: learningProbabilities(
            state,
            row.features,
            LEARNING_ARMS,
          ),
          predictions,
          split: row.split,
          decisionAt: row.decisionAt.toISOString(),
        };
      });
      if (!(await this.owned(claim, async () => true))) {
        await this.reconcileDispatch(input);
        return null;
      }
      const report = evaluateLearningPolicy(
        evaluationRows,
        dataset.manifestHash,
        {
          shared: true,
          synthetic: dataset.synthetic,
          differentialCensoring: 0,
          semanticChange: false,
        },
      );
      // Publication-denominator evidence must be supplied by the online validation report, never inferred from an outcome-only dataset.
      const fullReport = {
        ...report,
        status: 'inconclusive',
        reasons: [...report.reasons, 'assignment_denominators_required'],
        manifestHash: dataset.manifestHash,
        featureSchema: 'numeric-nine-v1',
        configVersion: 'rl-reward-v1-experimental',
        synthetic: dataset.synthetic,
      };
      return await this.owned(claim, async (tx, now) => {
        await this.writePair(tx, claim, 'completed', now, {
          progress: 100,
          report: toPrismaJson(fullReport),
        });
        return fullReport;
      });
    } catch (error) {
      await this.failedAttempt(claim, error);
      return this.prisma.contentLearningOperation.findFirst({
        where: {
          id: input.operationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
    } finally {
      rows.length = 0;
    }
  }
  async cancel(input: LearningRunControlInput) {
    return this.controls.cancel(input);
  }
  async retry(input: LearningRunControlInput) {
    return this.controls.retry(input);
  }
}
