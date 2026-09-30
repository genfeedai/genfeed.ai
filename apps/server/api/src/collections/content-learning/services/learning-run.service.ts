import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  evaluateLearningPolicy,
  initializeLearningPolicy,
  LEARNING_ARMS,
  type LearningArmId,
  type LearningEvaluationRow,
  learningProbabilities,
  solveLearningRidge,
  updateLearningPolicy,
} from '@genfeedai/harness';
import { toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
@Injectable()
export class LearningRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
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
    if (!dataset || !(await this.dependencies.valid('dataset', dataset.id)))
      throw new BadRequestException('Dataset unavailable or revoked');
    const key = learningHash([input.actorId, input.requestId, input.type]),
      configHash = learningHash([
        'ridge-epsilon-v1',
        dataset.manifestHash,
        input.type,
        input.parentArtifactId,
      ]);
    return this.prisma.$transaction(async (tx) => {
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
        'dataset',
        dataset.id,
        dataset.manifestHash,
        'run',
        run.id,
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
            runId: run.id,
            datasetId: dataset.id,
          }),
        },
      });
      return run;
    });
  }
  async execute(runId: string) {
    const run = await this.prisma.contentLearningRun.findFirst({
      where: { id: runId, isDeleted: false },
    });
    if (!run || ['completed', 'cancelled', 'invalidated'].includes(run.status))
      return run;
    const dataset = await this.prisma.contentLearningDataset.findFirst({
      where: { id: run.datasetId, isDeleted: false },
    });
    if (!dataset || !(await this.dependencies.valid('run', runId))) {
      await this.prisma.contentLearningRun.updateMany({
        where: { id: runId, isDeleted: false },
        data: { status: 'invalidated' },
      });
      return null;
    }
    const claimed = await this.prisma.contentLearningRun.updateMany({
      where: {
        id: runId,
        status: { in: ['pending', 'failed'] },
        isDeleted: false,
      },
      data: { status: 'running', startedAt: new Date(), error: null },
    });
    if (claimed.count !== 1)
      return this.prisma.contentLearningRun.findFirst({
        where: { id: runId, isDeleted: false },
      });
    const started = Date.now(),
      rows = await this.prisma.contentLearningDatasetEntry.findMany({
        where: { datasetId: dataset.id, isDeleted: false },
        orderBy: [{ decisionAt: 'asc' }, { id: 'asc' }],
        take: 100001,
      });
    if (rows.length > 100000)
      throw new BadRequestException('Oversized immutable dataset');
    try {
      const training = rows.filter((row) => row.split === 'training');
      if (training.length < 30) {
        await this.prisma.contentLearningRun.updateMany({
          where: { id: runId, isDeleted: false },
          data: {
            status: 'insufficient_data',
            completedAt: new Date(),
            report: toPrismaJson({
              reason: 'minimum_training_30',
              count: training.length,
            }),
          },
        });
        return null;
      }
      const groups = [...new Set(training.map((row) => row.accountGroup))];
      const groupCounts = new Map(
        groups.map((group) => [
          group,
          training.filter((row) => row.accountGroup === group).length,
        ]),
      );
      const state = initializeLearningPolicy(undefined, 1);
      for (let i = 0; i < training.length; i++) {
        if (i % 1000 === 0) {
          const current = await this.prisma.contentLearningRun.findFirst({
            where: { id: runId, isDeleted: false },
          });
          if (
            current?.status !== 'running' ||
            !(await this.dependencies.valid('run', runId))
          )
            return null;
          if (Date.now() - started > 300000)
            throw new Error('Training exceeded five-minute limit');
          await this.prisma.contentLearningRun.updateMany({
            where: { id: runId, status: 'running', isDeleted: false },
            data: { progress: Math.floor((80 * i) / training.length) },
          });
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
        return this.prisma.$transaction(async (tx) => {
          if (!(await this.dependencies.valid('run', runId, tx))) return null;
          const current = await tx.contentLearningRun.findFirst({
            where: { id: runId, status: 'running', isDeleted: false },
          });
          if (!current) return null;
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
            'run',
            runId,
            run.configHash,
            'shared-policy',
            artifact.id,
          );
          return tx.contentLearningRun.updateMany({
            where: { id: runId, status: 'running', isDeleted: false },
            data: {
              status: 'completed',
              progress: 100,
              resultArtifactId: artifact.id,
              report: toPrismaJson({
                manifestHash: dataset.manifestHash,
                armState: state,
                sourceAccountCount: groups.length,
                synthetic: dataset.synthetic,
              }),
              completedAt: new Date(),
            },
          });
        });
      const evaluationRows: LearningEvaluationRow[] = rows.map((row) => {
        const logging =
          typeof row.probabilities === 'object' &&
          row.probabilities &&
          !Array.isArray(row.probabilities)
            ? row.probabilities
            : null;
        const loggingProbabilities = logging
          ? (Object.fromEntries(
              LEARNING_ARMS.map((arm) => [
                arm,
                typeof logging[arm] === 'number' ? logging[arm] : NaN,
              ]),
            ) as Record<LearningArmId, number>)
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
      return this.prisma.$transaction(async (tx) => {
        if (!(await this.dependencies.valid('run', runId, tx))) return null;
        return tx.contentLearningRun.updateMany({
          where: { id: runId, status: 'running', isDeleted: false },
          data: {
            status: 'completed',
            progress: 100,
            report: toPrismaJson(fullReport),
            completedAt: new Date(),
          },
        });
      });
    } catch (error) {
      await this.prisma.contentLearningRun.updateMany({
        where: { id: runId, status: 'running', isDeleted: false },
        data: {
          status: 'failed',
          error:
            error instanceof Error
              ? error.message.slice(0, 256)
              : 'training_failed',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }
  async cancel(id: string) {
    return this.prisma.contentLearningRun.updateMany({
      where: {
        id,
        status: { in: ['pending', 'running', 'failed'] },
        isDeleted: false,
      },
      data: { status: 'cancelled', completedAt: new Date() },
    });
  }
  async retry(id: string) {
    const run = await this.prisma.contentLearningRun.findFirst({
      where: { id, isDeleted: false },
    });
    if (
      !run ||
      !['failed', 'cancelled'].includes(run.status) ||
      !(await this.dependencies.valid('run', id))
    )
      throw new ConflictException('Run cannot retry');
    await this.prisma.contentLearningRun.updateMany({
      where: { id, status: run.status, isDeleted: false },
      data: { status: 'pending', progress: 0, error: null },
    });
    return run;
  }
}
