import { parseLearningMeasurement } from '@api/collections/content-learning/services/learning-checkpoint.service';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LearningObjective } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { computeLearningReward } from '@genfeedai/harness';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
@Injectable()
export class LearningRewardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async commit(
    organizationId: string,
    decisionId: string,
    checkpointId: string,
    objective: LearningObjective,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'exclusive');
      const prepared = await this.prepareReward(
        tx,
        organizationId,
        decisionId,
        checkpointId,
        objective,
      );
      if (!prepared) return null;
      return this.persistReward(tx, organizationId, objective, prepared);
    });
  }
  private async prepareReward(
    tx: Prisma.TransactionClient,
    organizationId: string,
    decisionId: string,
    checkpointId: string,
    objective: LearningObjective,
  ) {
    const decision = await tx.contentLearningDecision.findFirst({
      where: { id: decisionId, organizationId, isDeleted: false },
    });
    if (!decision?.baselineId || decision.state !== 'published') return null;
    const checkpoint = await tx.contentLearningCheckpoint.findFirst({
      where: {
        id: checkpointId,
        organizationId,
        credentialId: decision.credentialId,
        isDeleted: false,
      },
    });
    const baseline = await tx.contentLearningBaseline.findFirst({
      where: {
        id: decision.baselineId,
        organizationId,
        credentialId: decision.credentialId,
        isDeleted: false,
      },
    });
    if (!checkpoint || !baseline) return null;
    const raw = checkpoint.measurement,
      measurement = parseLearningMeasurement(
        raw &&
          typeof raw === 'object' &&
          !Array.isArray(raw) &&
          'measurement' in raw
          ? raw.measurement
          : null,
      );
    const samples = Array.isArray(baseline.samples)
      ? baseline.samples.flatMap((value) => {
          const parsed = parseLearningMeasurement(value);
          return parsed ? [parsed] : [];
        })
      : [];
    if (!measurement) return null;
    const result = computeLearningReward(measurement, samples, objective);
    const status =
      checkpoint.validity !== 'valid'
        ? checkpoint.validity
        : !(await this.dependencies.valid(
              'baseline',
              baseline.id,
              tx,
              organizationId,
            ))
          ? 'invalid_baseline'
          : result.status;
    const sourceFingerprint = learningHash([
      decision.id,
      checkpoint.id,
      checkpoint.revision,
      baseline.fingerprint,
      result,
      status,
    ]);
    return {
      decisionId,
      checkpointId,
      decision,
      checkpoint,
      baseline,
      measurement,
      result,
      status,
      sourceFingerprint,
    };
  }
  private async persistReward(
    tx: Prisma.TransactionClient,
    organizationId: string,
    objective: LearningObjective,
    prepared: NonNullable<
      Awaited<ReturnType<LearningRewardService['prepareReward']>>
    >,
  ) {
    const {
      decisionId,
      checkpointId,
      decision,
      checkpoint,
      baseline,
      measurement,
      result,
      status,
      sourceFingerprint,
    } = prepared;
    const prior = await tx.contentLearningReward.findFirst({
      where: { organizationId, decisionId, isDeleted: false },
      orderBy: { version: 'desc' },
    });
    if (prior?.sourceFingerprint === sourceFingerprint) return prior;
    const reward = await tx.contentLearningReward.create({
      data: {
        organizationId,
        brandId: decision.brandId,
        credentialId: decision.credentialId,
        decisionId,
        version: (prior?.version ?? 0) + 1,
        checkpointId,
        baselineId: baseline.id,
        rawComponents: toPrismaJson({
          rawQuality: result.rawQuality,
          exposureRatio: result.exposureRatio,
        }),
        boundedComponents: toPrismaJson({
          quality: result.quality,
          distribution: result.distribution,
        }),
        composite: status === 'valid' ? result.composite : null,
        confidence: toPrismaJson({
          baselineCount: baseline.count,
          exposure: measurement.exposure,
          observationAgeDelta:
            checkpoint.receivedAt.getTime() - checkpoint.dueAt.getTime(),
          objective,
          organic: checkpoint.organicProvenance,
        }),
        status,
        reasons: status === 'valid' ? [] : [status],
        sourceFingerprint,
        supersedesId: prior?.id,
      },
    });
    if (prior)
      await this.dependencies.invalidate(
        'reward',
        prior.id,
        tx,
        organizationId,
      );
    await this.dependencies.link(
      tx,
      await this.dependencies.resolve(
        'checkpoint',
        checkpoint.id,
        organizationId,
        tx,
      ),
      await this.dependencies.resolve('reward', reward.id, organizationId, tx),
    );
    await this.dependencies.link(
      tx,
      await this.dependencies.resolve(
        'baseline',
        baseline.id,
        organizationId,
        tx,
      ),
      await this.dependencies.resolve('reward', reward.id, organizationId, tx),
    );
    await tx.contentLearningAccount.updateMany({
      where: {
        organizationId,
        credentialId: decision.credentialId,
        isDeleted: false,
      },
      data: { evidenceRevision: { increment: 1 } },
    });
    return reward;
  }
}
