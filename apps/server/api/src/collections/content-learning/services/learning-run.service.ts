import type {
  LearningRunClaim,
  LearningRunClock,
  LearningRunDispatchContext,
  LearningRunDispatchOutcome,
  LearningRunDispatchScope,
  LearningRunReceiptRecovery,
} from '@api/collections/content-learning/interfaces/learning-run-dispatch.interface';
import {
  LearningDependencyService,
  learningOrgFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  type LearningRunControlInput,
  LearningRunControlService,
} from '@api/collections/content-learning/services/learning-run-control.service';
import {
  scopedRunDispatch,
  storedJson,
} from '@api/collections/content-learning/services/learning-run-dispatch.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CONTENT_LEARNING_ACTIVE_STATUSES,
  ContentLearningOperationStatus as OperationStatus,
  PlatformRole,
  ContentLearningRunStatus as RunStatus,
} from '@genfeedai/contracts';
import {
  isLearningRunTerminal,
  type LearningRunDispatchReceiptV1,
  learningRunOperationStatus,
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
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
export type LearningRunDispatchInput = LearningRunDispatchScope;
export function parseLearningRunDispatch(
  value: unknown,
): LearningRunDispatchReceiptV1 | null {
  return validLearningRunDispatchReceipt(value) ? value : null;
}
@Traced()
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
    const where = {
      id: input.operationId,
      organizationId: input.organizationId,
      isDeleted: false,
      type: { in: ['dataset-train', 'dataset-evaluate'] },
    };
    const operation = await tx.contentLearningOperation.findFirst({ where });
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
    const current = await tx.contentLearningOperation.findFirst({ where });
    if (!run || !current) throw new NotFoundException('Run dispatch not found');
    return { run, operation: current, now: await this.clock(tx) };
  }
  private async writePair(
    tx: Prisma.TransactionClient,
    claim: LearningRunClaim,
    status: RunStatus,
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
    const result = isLearningRunTerminal(status)
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
    if (!mappedStatus || (isLearningRunTerminal(status) && !result))
      throw new ConflictException('dispatch_receipt_invalid');
    const updated = await tx.contentLearningRun.updateMany({
      where: {
        id: claim.run.id,
        isDeleted: false,
        status: RunStatus.RUNNING,
        startedAt: claim.token,
      },
      data: {
        ...data,
        status,
        error,
        completedAt: isLearningRunTerminal(status) ? writeAt : null,
      },
    });
    const operation = await tx.contentLearningOperation.updateMany({
      where: {
        id: claim.operation.id,
        organizationId: claim.operation.organizationId,
        isDeleted: false,
        status: OperationStatus.RUNNING,
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
  ): Promise<LearningRunDispatchOutcome> {
    return this.prisma.$transaction(async (tx) => {
      await learningOrgFence(tx, input.organizationId, 'shared');
      const { run, operation, now } = await this.lockedDispatch(tx, input);
      const ctx: LearningRunDispatchContext = { input, run, operation, now };
      if (isLearningRunTerminal(operation.status))
        return { operation, dispatchable: false };
      const recovery = await this.recoverReceipt(tx, ctx);
      if (recovery.outcome) return recovery.outcome;
      const receipt = recovery.receipt as LearningRunDispatchReceiptV1;
      if (receipt.datasetId !== run.datasetId || receipt.runId !== run.id)
        return this.failDispatchOperation(
          tx,
          ctx,
          'dispatch_receipt_invalid',
          operation.status,
        );
      if (isLearningRunTerminal(run.status))
        return this.settleTerminalRun(tx, ctx, receipt);
      if (
        !(await this.actorActive(tx, operation.actorId)) ||
        !(await this.dependencies.valid('run', run.id, tx, null))
      )
        return this.invalidateWithdrawn(tx, ctx, receipt);
      if (run.status === RunStatus.RUNNING)
        return this.reconcileRunningRun(tx, ctx, receipt);
      if (
        run.status === RunStatus.PENDING &&
        operation.status === OperationStatus.RUNNING
      ) {
        const invalid = await this.resetPendingClaim(tx, ctx, receipt);
        if (invalid) return invalid;
      }
      return {
        operation: {
          ...operation,
          status: OperationStatus.PENDING,
          resultReferences: storedJson(receipt),
        },
        dispatchable:
          receipt.attemptCount < 3 &&
          (!receipt.nextAttemptAt || new Date(receipt.nextAttemptAt) <= now),
      };
    });
  }
  private async failDispatchOperation(
    tx: Prisma.TransactionClient,
    ctx: LearningRunDispatchContext,
    error: string,
    statusGuard?: string,
  ): Promise<LearningRunDispatchOutcome> {
    await tx.contentLearningOperation.updateMany({
      where: {
        id: ctx.operation.id,
        organizationId: ctx.input.organizationId,
        isDeleted: false,
        status: statusGuard,
      },
      data: { status: OperationStatus.FAILED, error },
    });
    return {
      operation: { ...ctx.operation, status: OperationStatus.FAILED, error },
      dispatchable: false,
    };
  }
  private async recoverReceipt(
    tx: Prisma.TransactionClient,
    ctx: LearningRunDispatchContext,
  ): Promise<LearningRunReceiptRecovery> {
    const { input, run, operation, now } = ctx;
    const stored = parseLearningRunDispatch(operation.resultReferences);
    if (stored) return { receipt: stored, outcome: null };
    const isUnversionedPending =
      operation.status === OperationStatus.PENDING &&
      run.status === RunStatus.PENDING &&
      !run.startedAt &&
      operation.resultReferences !== null &&
      typeof operation.resultReferences === 'object' &&
      !Array.isArray(operation.resultReferences) &&
      !('dispatchVersion' in operation.resultReferences);
    if (isUnversionedPending) {
      const receipt: LearningRunDispatchReceiptV1 = {
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
          status: OperationStatus.PENDING,
        },
        data: { resultReferences: toPrismaJson(receipt) },
      });
      return { receipt, outcome: null };
    }
    const freshLegacy =
      run.status === RunStatus.RUNNING &&
      run.startedAt &&
      now.getTime() < run.startedAt.getTime() + 300000;
    if (freshLegacy)
      return { receipt: null, outcome: { operation, dispatchable: false } };
    const error =
      run.status === RunStatus.RUNNING
        ? 'legacy_claim_unverifiable'
        : 'dispatch_receipt_invalid';
    await tx.contentLearningOperation.updateMany({
      where: {
        id: operation.id,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: { status: OperationStatus.FAILED, error },
    });
    if (CONTENT_LEARNING_ACTIVE_STATUSES.includes(run.status))
      await tx.contentLearningRun.updateMany({
        where: {
          id: run.id,
          isDeleted: false,
          status: run.status,
          startedAt: run.startedAt,
        },
        data: {
          status: RunStatus.FAILED,
          error,
          report: Prisma.DbNull,
          completedAt: now,
        },
      });
    return {
      receipt: null,
      outcome: {
        operation: { ...operation, status: OperationStatus.FAILED, error },
        dispatchable: false,
      },
    };
  }
  private async settleTerminalRun(
    tx: Prisma.TransactionClient,
    ctx: LearningRunDispatchContext,
    receipt: LearningRunDispatchReceiptV1,
  ): Promise<LearningRunDispatchOutcome> {
    const { input, run, operation } = ctx;
    const result =
      run.completedAt &&
      receipt.claimedStartedAt === run.startedAt?.toISOString()
        ? learningRunTerminalResult(run, run.completedAt)
        : null;
    const status = result
      ? learningRunOperationStatus(run.status)
      : OperationStatus.FAILED;
    await tx.contentLearningOperation.updateMany({
      where: {
        id: operation.id,
        organizationId: input.organizationId,
        isDeleted: false,
        status: operation.status,
      },
      data: {
        status: status ?? OperationStatus.FAILED,
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
        status: status ?? OperationStatus.FAILED,
        error: result ? run.error : 'dispatch_receipt_invalid',
      },
      dispatchable: false,
    };
  }
  private async invalidateWithdrawn(
    tx: Prisma.TransactionClient,
    ctx: LearningRunDispatchContext,
    receipt: LearningRunDispatchReceiptV1,
  ): Promise<LearningRunDispatchOutcome> {
    const { input, run, operation, now } = ctx;
    const error = 'authorization_or_source_withdrawn';
    await tx.contentLearningRun.updateMany({
      where: {
        id: run.id,
        isDeleted: false,
        status: run.status,
        startedAt: run.startedAt,
      },
      data: {
        status: RunStatus.INVALIDATED,
        error,
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
        status: OperationStatus.INVALIDATED,
        error,
        resultReferences: toPrismaJson({
          ...receipt,
          terminalResult: learningRunTerminalResult(
            { ...run, status: RunStatus.INVALIDATED, error },
            now,
          ),
        }),
      },
    });
    return {
      operation: { ...operation, status: OperationStatus.INVALIDATED, error },
      dispatchable: false,
    };
  }
  private async reconcileRunningRun(
    tx: Prisma.TransactionClient,
    ctx: LearningRunDispatchContext,
    receipt: LearningRunDispatchReceiptV1,
  ): Promise<LearningRunDispatchOutcome> {
    const { run, operation, now } = ctx;
    if (
      !run.startedAt ||
      receipt.claimedStartedAt !== run.startedAt.toISOString() ||
      operation.status !== OperationStatus.RUNNING
    )
      return this.failDispatchOperation(tx, ctx, 'dispatch_receipt_invalid');
    const expiredAt = run.startedAt.getTime() + 300000;
    if (now.getTime() < expiredAt) return { operation, dispatchable: false };
    const status =
      receipt.attemptCount < 3 ? RunStatus.PENDING : RunStatus.FAILED;
    const nextAttemptAt =
      status === RunStatus.PENDING
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
        resultReferences: storedJson({
          ...receipt,
          nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
        }),
      },
      dispatchable:
        status === RunStatus.PENDING &&
        Boolean(nextAttemptAt && nextAttemptAt <= now),
    };
  }
  /** Returns an outcome only when the claim is invalid; null means reset to pending. */
  private async resetPendingClaim(
    tx: Prisma.TransactionClient,
    ctx: LearningRunDispatchContext,
    receipt: LearningRunDispatchReceiptV1,
  ): Promise<LearningRunDispatchOutcome | null> {
    const { input, run, operation } = ctx;
    if (
      !run.startedAt ||
      receipt.claimedStartedAt !== run.startedAt.toISOString()
    )
      return this.failDispatchOperation(tx, ctx, 'dispatch_receipt_invalid');
    await tx.contentLearningOperation.updateMany({
      where: {
        id: operation.id,
        organizationId: input.organizationId,
        isDeleted: false,
        status: OperationStatus.RUNNING,
      },
      data: {
        status: OperationStatus.PENDING,
        resultReferences: toPrismaJson(receipt),
      },
    });
    return null;
  }
  private async claim(
    input: LearningRunDispatchInput,
  ): Promise<LearningRunClaim | null> {
    const repaired = await this.reconcileDispatch(input);
    if (!repaired.dispatchable) return null;
    return this.prisma.$transaction(async (tx) => {
      await learningOrgFence(tx, input.organizationId, 'shared');
      const { run, operation, now } = await this.lockedDispatch(tx, input);
      const receipt = parseLearningRunDispatch(operation.resultReferences);
      if (
        !receipt ||
        operation.status !== OperationStatus.PENDING ||
        run.status !== RunStatus.PENDING ||
        receipt.attemptCount >= 3 ||
        (receipt.nextAttemptAt && new Date(receipt.nextAttemptAt) > now)
      )
        return null;
      const cycles = await tx.contentLearningOperation.findMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          status: {
            in: [OperationStatus.PENDING, OperationStatus.RUNNING],
          },
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
          status: RunStatus.PENDING,
          startedAt: run.startedAt,
        },
        data: {
          status: RunStatus.RUNNING,
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
          status: OperationStatus.PENDING,
        },
        data: {
          status: OperationStatus.RUNNING,
          error: null,
          resultReferences: toPrismaJson(next),
        },
      });
      if (claimedRun.count !== 1 || claimedOperation.count !== 1)
        throw new ConflictException('Run dispatch claim changed');
      return {
        run: { ...run, status: RunStatus.RUNNING, startedAt: token },
        operation: {
          ...operation,
          status: OperationStatus.RUNNING,
        },
        receipt: next,
        token,
      };
    });
  }
  private async owned<T>(
    claim: LearningRunClaim,
    apply: (tx: Prisma.TransactionClient, now: Date) => Promise<T>,
  ): Promise<T | null> {
    const input = scopedRunDispatch(claim);
    if (!input) return null;
    return this.prisma.$transaction(async (tx) => {
      await learningOrgFence(tx, input.organizationId, 'shared');
      const { run, operation, now } = await this.lockedDispatch(tx, input);
      const receipt = parseLearningRunDispatch(operation.resultReferences);
      if (
        run.status !== RunStatus.RUNNING ||
        operation.status !== OperationStatus.RUNNING ||
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
          RunStatus.INVALIDATED,
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
    const input = scopedRunDispatch(claim);
    if (!input) return;
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
        deterministic || claim.receipt.attemptCount >= 3
          ? RunStatus.FAILED
          : RunStatus.PENDING;
      const nextAttemptAt =
        status === RunStatus.PENDING
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
      select: { id: true, manifestHash: true, synthetic: true },
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
      await learningOrgFence(tx, input.organizationId, 'shared');
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
            RunStatus.INVALIDATED,
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
          this.writePair(tx, claim, RunStatus.INSUFFICIENT_DATA, now, {
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
                  status: RunStatus.RUNNING,
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
          await this.writePair(tx, claim, RunStatus.COMPLETED, now, {
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
        await this.writePair(tx, claim, RunStatus.COMPLETED, now, {
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
