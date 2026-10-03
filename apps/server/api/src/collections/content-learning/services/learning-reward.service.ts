import {
  learningArtifactPostSelect,
  learningDecisionDescriptorValid,
  learningPostArtifactHashV1,
} from '@api/collections/content-learning/services/learning-artifact-binding.helper';
import { parseLearningMeasurement } from '@api/collections/content-learning/services/learning-checkpoint.service';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { validLearningCheckpointPublicationV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LearningObjective } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  computeLearningReward,
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import {
  type ContentLearningCheckpoint,
  type ContentLearningDecision,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
export type LearningRewardCommitResult =
  | {
      status: 'committed';
      rewardId: string;
      rewardStatus: string;
      decisionId: string;
      scopeKey: string;
    }
  | { status: 'unavailable'; reason: string };
type LearningPreparedReward = Exclude<
  Awaited<ReturnType<LearningRewardService['prepareReward']>>,
  { reason: string }
>;
@Injectable()
export class LearningRewardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  /**
   * Commits the reward for a valid 48h checkpoint of a publication bound to
   * an unchanged, decision-generated artifact, against the baseline frozen
   * at decision time. Any broken join returns `unavailable` and writes nothing.
   */
  async commitForCheckpoint(
    organizationId: string,
    checkpointId: string,
  ): Promise<LearningRewardCommitResult> {
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'exclusive');
      const prepared = await this.prepareReward(
        tx,
        organizationId,
        checkpointId,
      );
      if ('reason' in prepared)
        return { status: 'unavailable', reason: prepared.reason };
      const reward = await this.persistReward(
        tx,
        organizationId,
        prepared.objective,
        prepared,
      );
      return {
        status: 'committed',
        rewardId: reward.id,
        rewardStatus: reward.status,
        decisionId: prepared.decision.id,
        scopeKey: prepared.decision.scopeKey,
      };
    });
  }
  private async prepareReward(
    tx: Prisma.TransactionClient,
    organizationId: string,
    checkpointId: string,
  ) {
    const unavailable = (reason: string) => ({ reason });
    const checkpoint = await tx.contentLearningCheckpoint.findFirst({
      where: { id: checkpointId, organizationId, isDeleted: false },
    });
    if (
      checkpoint?.validity !== 'valid' ||
      checkpoint.windowId !== '48h-v1' ||
      checkpoint.format !== 'text' ||
      !(await validLearningCheckpointPublicationV1(tx, checkpoint))
    )
      return unavailable('checkpoint_unavailable');
    const post = await tx.post.findFirst({
      where: {
        id: checkpoint.postId,
        organizationId,
        brandId: checkpoint.brandId,
        credentialId: checkpoint.credentialId,
        isDeleted: false,
      },
      select: { ...learningArtifactPostSelect, publishedAt: true },
    });
    if (
      !post?.learningDecisionId ||
      post.publishedAt?.getTime() !== checkpoint.publishedAt.getTime()
    )
      return unavailable('decision_unbound');
    const decision = await tx.contentLearningDecision.findFirst({
      where: {
        id: post.learningDecisionId,
        organizationId,
        brandId: checkpoint.brandId,
        credentialId: checkpoint.credentialId,
        isDeleted: false,
        synthetic: false,
      },
    });
    const descriptor = decision?.cellDescriptor;
    if (
      decision?.state !== 'published' ||
      decision.generationId !== post.id ||
      !decision.baselineId ||
      !learningDecisionDescriptorValid(decision) ||
      !validLearningDescriptor(descriptor) ||
      descriptor.format !== checkpoint.format ||
      descriptor.windowId !== checkpoint.windowId ||
      decision.scopeKey !==
        learningScopeKey({
          organizationId,
          brandId: decision.brandId,
          credentialId: decision.credentialId,
          platform: descriptor.platform,
          format: descriptor.format,
          objective: descriptor.objective,
          rewardProfileId: decision.descriptorHash ?? '',
        }) ||
      !(await this.dependencies.valid(
        'decision',
        decision.id,
        tx,
        organizationId,
      ))
    )
      return unavailable('invalid_lineage');
    const account = await tx.contentLearningAccount.findFirst({
      where: {
        organizationId,
        brandId: decision.brandId,
        credentialId: decision.credentialId,
        isDeleted: false,
      },
    });
    if (!account) return unavailable('account_unavailable');
    if (account.epoch !== decision.epoch) return unavailable('epoch_changed');
    if (account.mode === 'disabled') return unavailable('disabled');
    if (
      learningPostArtifactHashV1(post, decision) !== decision.finalArtifactHash
    )
      return unavailable('artifact_changed');
    const measurement = this.profileMeasurement(checkpoint, decision);
    if (!measurement) return unavailable('profile_unavailable');
    const frozen = await this.frozenBaseline(tx, organizationId, decision);
    if ('reason' in frozen) return unavailable(frozen.reason);
    const { baseline, samples } = frozen;
    const objective = descriptor.objective;
    const result = computeLearningReward(measurement, samples, objective);
    const status = !(await this.dependencies.valid(
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
      decisionId: decision.id,
      checkpointId: checkpoint.id,
      decision,
      checkpoint,
      baseline,
      measurement,
      result,
      status,
      sourceFingerprint,
      objective,
    };
  }
  /** The checkpoint measurement of the decision's exact descriptor profile. */
  private profileMeasurement(
    checkpoint: ContentLearningCheckpoint,
    decision: ContentLearningDecision,
  ) {
    const raw = checkpoint.measurement,
      descriptor = decision.cellDescriptor;
    if (
      !validLearningDescriptor(descriptor) ||
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      !Array.isArray(raw.profiles)
    )
      return null;
    const profile = raw.profiles.find(
      (value) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value.profileId === decision.descriptorHash &&
        validLearningDescriptor(value.descriptor) &&
        learningHash(learningDescriptorTuple(value.descriptor)) ===
          decision.descriptorHash,
    );
    const measurement =
      profile && typeof profile === 'object' && !Array.isArray(profile)
        ? parseLearningMeasurement(profile.measurement)
        : null;
    return !measurement ||
      (descriptor.retention &&
        measurement.averageWatchTimeSeconds === undefined)
      ? null
      : measurement;
  }
  /** The baseline frozen at decision time, with every sample parsed. */
  private async frozenBaseline(
    tx: Prisma.TransactionClient,
    organizationId: string,
    decision: ContentLearningDecision,
  ) {
    const descriptor = decision.cellDescriptor;
    const baseline =
      decision.baselineId && validLearningDescriptor(descriptor)
        ? await tx.contentLearningBaseline.findFirst({
            where: {
              id: decision.baselineId,
              organizationId,
              brandId: decision.brandId,
              credentialId: decision.credentialId,
              isDeleted: false,
            },
          })
        : null;
    if (
      !baseline ||
      !validLearningDescriptor(descriptor) ||
      baseline.descriptorHash !== decision.descriptorHash ||
      baseline.scopeKey !== decision.scopeKey ||
      baseline.configVersion !== descriptor.configVersion ||
      baseline.cutoff.getTime() !== decision.createdAt.getTime() ||
      baseline.validity !== 'valid' ||
      baseline.count < 20
    )
      return { reason: 'insufficient_baseline' };
    const samples = [];
    for (const value of Array.isArray(baseline.samples)
      ? baseline.samples
      : []) {
      const sample = parseLearningMeasurement(value);
      if (!sample) return { reason: 'invalid_baseline' };
      samples.push(sample);
    }
    if (
      samples.length !== baseline.count ||
      baseline.contributorCheckpointIds.length !== baseline.count
    )
      return { reason: 'invalid_baseline' };
    return { baseline, samples };
  }
  private async persistReward(
    tx: Prisma.TransactionClient,
    organizationId: string,
    objective: LearningObjective,
    prepared: LearningPreparedReward,
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
    await this.dependencies.link(
      tx,
      await this.dependencies.resolve(
        'decision',
        decision.id,
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
