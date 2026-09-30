import { randomInt } from 'node:crypto';
import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import {
  LearningPolicyService,
  parseLearningPolicy,
} from '@api/collections/content-learning/services/learning-policy.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentLearningMode,
  fromPrismaCredentialPlatform,
  type LearningGenerationContext,
  type LearningGenerationReceipt,
  type LearningScope,
} from '@genfeedai/contracts';
import {
  type ContentHarnessContribution,
  initializeLearningPolicy,
  LEARNING_ARMS,
  type LearningArmId,
  learningContribution,
  learningFeatures,
  learningProbabilities,
  sampleLearningArm,
} from '@genfeedai/harness';
import { type ContentLearningDecision, toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
export interface LearningGenerationInput {
  organizationId: string;
  brandId: string;
  format: LearningScope['format'];
  context?: LearningGenerationContext;
  harnessEnabled: boolean;
  compatible: boolean;
  originalPrompt: string;
}
export interface LearningResolution {
  receipt: LearningGenerationReceipt;
  contribution: ContentHarnessContribution;
}
@Injectable()
export class LearningDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: LearningAccountService,
    private readonly checkpoints: LearningCheckpointService,
    private readonly policies: LearningPolicyService,
  ) {}
  private receipt(
    decision: ContentLearningDecision,
  ): LearningGenerationReceipt {
    return {
      decisionId: decision.id,
      credentialId: decision.credentialId,
      mode: decision.mode as ContentLearningMode,
      accountRevision: decision.accountRevision,
      epoch: decision.epoch,
      armId: decision.selectedArmId as LearningGenerationReceipt['armId'],
      probabilities: decision.probabilities as Record<string, number>,
      selectedProbability: decision.selectedProbability,
      assignment: decision.assignment as 'pilot' | 'control',
      assignmentProbability: decision.assignmentProbability,
      executionProbability: decision.executionProbability,
      policyVersionId: decision.accountPolicyId ?? undefined,
      sharedReleaseId: decision.sharedReleaseId ?? undefined,
      sharedReleaseRevision: decision.sharedReleaseRevision ?? undefined,
      baselineId: decision.baselineId ?? undefined,
      configVersion: decision.configVersion,
      synthetic: decision.synthetic,
      reason: decision.censorshipReason ?? undefined,
    };
  }
  async previewForContext(
    input: LearningGenerationInput,
  ): Promise<LearningResolution> {
    const credentialId = input.context?.credentialId;
    const fallback = (
      reason: string,
      mode: LearningGenerationReceipt['mode'] = 'unavailable',
    ): LearningResolution => ({
      receipt: {
        mode,
        reason,
        configVersion: 'rl-reward-v1-experimental',
        synthetic: false,
      },
      contribution: {},
    });
    if (!credentialId) return fallback('no_destination', 'no_destination');
    await this.accounts.credential(
      input.organizationId,
      credentialId,
      input.brandId,
    );
    const account = await this.accounts.read(
      input.organizationId,
      credentialId,
    );
    if (account.mode !== 'live')
      return fallback(account.mode, account.mode as ContentLearningMode);
    if (!input.harnessEnabled || !input.compatible)
      return fallback(
        !input.harnessEnabled ? 'harness_off' : 'incompatible_intent',
        ContentLearningMode.LIVE,
      );
    return {
      receipt: {
        mode: ContentLearningMode.LIVE,
        credentialId,
        accountRevision: account.revision,
        epoch: account.epoch,
        configVersion: 'rl-reward-v1-experimental',
        synthetic: false,
        reason: 'preview_no_sampling',
      },
      contribution: {
        guardrails: [
          'Learning strategies may apply only in the authorized 10% pilot and remain subordinate to explicit instructions and approved voice.',
        ],
      },
    };
  }
  async resolveForGeneration(
    input: LearningGenerationInput,
  ): Promise<LearningResolution> {
    const context = input.context;
    if (!context?.credentialId)
      return {
        receipt: {
          mode: 'no_destination',
          reason: 'no_destination',
          configVersion: 'rl-reward-v1-experimental',
          synthetic: false,
        },
        contribution: {},
      };
    if (
      !context.requestKey ||
      context.requestKey.length > 256 ||
      !Number.isInteger(context.candidateIndex) ||
      context.candidateIndex < 0
    )
      throw new BadRequestException('Invalid learning request identity');
    const credential = await this.accounts.credential(
      input.organizationId,
      context.credentialId,
      input.brandId,
    );
    const account = await this.accounts.ensure(
      input.organizationId,
      context.credentialId,
    );
    if (account.mode === 'disabled')
      return {
        receipt: {
          mode: ContentLearningMode.DISABLED,
          reason: 'disabled',
          configVersion: account.activeConfigVersion,
          synthetic: false,
        },
        contribution: {},
      };
    const objective = context.objective ?? 'awareness';
    const scope: LearningScope = {
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: context.credentialId,
      platform: fromPrismaCredentialPlatform(credential.platform) ?? '',
      format: input.format,
      objective,
      rewardProfileId: `${objective}-v1`,
    };
    const scopeKey = learningScopeKey(scope),
      destinationKey = learningHash([credential.id, input.format, objective]);
    const payloadHash = learningHash([
      input.originalPrompt,
      input.harnessEnabled,
      input.compatible,
      context,
      input.format,
    ]);
    const existing = await this.prisma.contentLearningDecision.findFirst({
      where: {
        organizationId: input.organizationId,
        requestKey: context.requestKey,
        destinationKey,
        candidateIndex: context.candidateIndex,
        isDeleted: false,
      },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new ConflictException('Learning request key payload conflict');
      return {
        receipt: this.receipt(existing),
        contribution: learningContribution(existing.selectedArmId),
      };
    }
    const decisionAt = new Date(),
      baseline = await this.checkpoints.freeze(scope, decisionAt);
    const followers = await this.prisma.accountAnalyticsSnapshot.findFirst({
      where: {
        organizationId: input.organizationId,
        brandId: input.brandId,
        credentialId: credential.id,
        date: { lte: decisionAt },
        isDeleted: false,
      },
      orderBy: { date: 'desc' },
    });
    const features = learningFeatures({
      followers: followers?.followers ?? followers?.subscribers,
      baselineMedianExposure:
        baseline.count >= 20 ? baseline.medianExposure : null,
      decisionAt,
    });
    const policy = await this.policies.current(
      input.organizationId,
      credential.id,
      scopeKey,
    );
    const state = policy
      ? parseLearningPolicy(policy.armState)
      : initializeLearningPolicy();
    const eligible: LearningArmId[] = ['baseline-v1'];
    const applicable =
      account.mode === 'live' &&
      baseline.validity === 'valid' &&
      input.harnessEnabled &&
      input.compatible &&
      !account.failureReason;
    if (applicable)
      for (const arm of LEARNING_ARMS)
        if (arm !== 'baseline-v1' && account.approvedArmIds.includes(arm))
          eligible.push(arm);
    const assignment =
      applicable && randomInt(1000000) < 100000 ? 'pilot' : 'control';
    const probabilities = learningProbabilities(
      state ?? initializeLearningPolicy(),
      features,
      assignment === 'pilot' ? eligible : ['baseline-v1'],
    );
    const selectedArmId = sampleLearningArm(
      probabilities,
      randomInt(0, 2147483647) / 2147483647,
    );
    const assignmentProbability = applicable
      ? assignment === 'pilot'
        ? 0.1
        : 0.9
      : 1;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM content_learning_accounts WHERE id = ${account.id} AND "organizationId" = ${input.organizationId} ORDER BY id FOR UPDATE`;
      const authoritative = await tx.contentLearningAccount.findFirst({
        where: {
          id: account.id,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
      if (
        !authoritative ||
        authoritative.revision !== account.revision ||
        authoritative.epoch !== account.epoch
      )
        throw new ConflictException(
          'Account changed during compilation; retry the request',
        );
      const retry = await tx.contentLearningDecision.findFirst({
        where: {
          organizationId: input.organizationId,
          requestKey: context.requestKey,
          destinationKey,
          candidateIndex: context.candidateIndex,
          isDeleted: false,
        },
      });
      if (retry) {
        if (retry.payloadHash !== payloadHash)
          throw new ConflictException('Learning request key payload conflict');
        return {
          receipt: this.receipt(retry),
          contribution: learningContribution(retry.selectedArmId),
        };
      }
      const decision = await tx.contentLearningDecision.create({
        data: {
          organizationId: input.organizationId,
          brandId: input.brandId,
          credentialId: credential.id,
          requestKey: context.requestKey,
          destinationKey,
          candidateIndex: context.candidateIndex,
          payloadHash,
          scopeKey,
          epoch: account.epoch,
          accountRevision: account.revision,
          mode: account.mode,
          contextVector: features,
          contextSnapshot: toPrismaJson({
            platform: scope.platform,
            format: input.format,
            objective,
            rewardProfileId: scope.rewardProfileId,
          }),
          eligibleArmIds: eligible,
          probabilities: toPrismaJson(probabilities),
          selectedArmId,
          selectedProbability: probabilities[selectedArmId],
          assignment,
          assignmentProbability,
          executionProbability:
            assignmentProbability * probabilities[selectedArmId],
          configVersion: account.activeConfigVersion,
          baselineId: baseline.id,
          accountPolicyId: policy?.id,
          parentRequestId: context.parentRequestId,
          runId: context.runId,
          workflowExecutionId: context.workflowExecutionId,
          generationId: context.generationId,
          originalPromptHash: learningHash(input.originalPrompt),
          createdAt: decisionAt,
          censorshipReason:
            baseline.count < 20
              ? 'insufficient_baseline'
              : !applicable
                ? 'baseline_only'
                : null,
        },
      });
      return {
        receipt: this.receipt(decision),
        contribution: learningContribution(selectedArmId),
      };
    });
  }
  async bindArtifact(
    organizationId: string,
    decisionId: string,
    payload: {
      text: string;
      ingredients: Array<{ id: string; version: string }>;
      credentialId: string;
      format: string;
      objective: string;
    },
  ) {
    const canonical = { ...payload, text: payload.text.replace(/\r\n/g, '\n') };
    const hash = learningHash(canonical);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM content_learning_decisions WHERE id = ${decisionId} AND "organizationId" = ${organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
      const decision = await tx.contentLearningDecision.findFirst({
        where: {
          id: decisionId,
          organizationId,
          credentialId: payload.credentialId,
          isDeleted: false,
        },
      });
      if (!decision)
        throw new ConflictException('Decision destination mismatch');
      if (decision.finalArtifactHash && decision.finalArtifactHash !== hash)
        throw new ConflictException(
          'Decision already bound to another artifact',
        );
      await tx.contentLearningDecision.updateMany({
        where: {
          id: decisionId,
          organizationId,
          isDeleted: false,
          finalArtifactHash: null,
        },
        data: { finalArtifactHash: hash, state: 'generated' },
      });
      return hash;
    });
  }
  async bindPublication(
    organizationId: string,
    decisionId: string,
    postId: string,
    payload: Parameters<LearningDecisionService['bindArtifact']>[2],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM content_learning_decisions WHERE id = ${decisionId} AND "organizationId" = ${organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM posts WHERE id = ${postId} AND "organizationId" = ${organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
      const decision = await tx.contentLearningDecision.findFirst({
        where: {
          id: decisionId,
          organizationId,
          credentialId: payload.credentialId,
          isDeleted: false,
        },
      });
      const account = decision
        ? await tx.contentLearningAccount.findFirst({
            where: {
              organizationId,
              credentialId: decision.credentialId,
              isDeleted: false,
            },
          })
        : null;
      const post = await tx.post.findFirst({
        where: {
          id: postId,
          organizationId,
          credentialId: payload.credentialId,
          isDeleted: false,
        },
      });
      const duplicate = await tx.post.findFirst({
        where: {
          organizationId,
          learningDecisionId: decisionId,
          id: { not: postId },
        },
      });
      const hash = learningHash({
        ...payload,
        text: payload.text.replace(/\r\n/g, '\n'),
      });
      if (
        duplicate ||
        (post?.learningDecisionId && post.learningDecisionId !== decisionId)
      )
        throw new ConflictException(
          'Publication already has immutable decision binding',
        );
      if (post?.learningDecisionId === decisionId) {
        if (decision?.finalArtifactHash !== hash)
          throw new ConflictException('Published artifact binding differs');
      }
      const reason =
        !post || !decision
          ? 'lineage_conflict'
          : decision.finalArtifactHash !== hash
            ? 'edited_artifact'
            : !account ||
                account.epoch !== decision.epoch ||
                account.revision !== decision.accountRevision
              ? 'invalidated_after_dispatch'
              : null;
      if (reason) {
        if (decision)
          await tx.contentLearningDecision.updateMany({
            where: { id: decisionId, organizationId, isDeleted: false },
            data: { state: 'censored', censorshipReason: reason },
          });
        return { valid: false, reason };
      }
      await tx.post.updateMany({
        where: { id: postId, organizationId, isDeleted: false },
        data: { learningDecisionId: decisionId },
      });
      await tx.contentLearningDecision.updateMany({
        where: { id: decisionId, organizationId, isDeleted: false },
        data: { state: 'published' },
      });
      return { valid: true };
    });
  }
}
