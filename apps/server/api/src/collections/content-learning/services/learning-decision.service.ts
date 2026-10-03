import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import {
  hasInsufficientBaselineLineage,
  readReplayBaseline,
} from '@api/collections/content-learning/services/learning-baseline-lineage.helper';
import { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import {
  LearningDependencyService,
  learningOrgFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentLearningMode,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  type LearningCellDescriptor,
  type LearningGenerationContext,
  type LearningGenerationReceipt,
  type LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  type ContentHarnessContribution,
  LEARNING_ARMS,
  type LearningArmId,
  learningDescriptorTuple,
  learningExecutionProbabilities,
  learningFeatures,
  learningRegisteredProfiles,
  validLearningDescriptor,
} from '@genfeedai/harness';
import {
  type ContentLearningAccount,
  type ContentLearningBaseline,
  type ContentLearningDecision,
  type ContentLearningExperiment,
  type ContentLearningPolicyVersion,
  type ContentLearningScopeState,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
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
type LearningDistribution = Record<LearningArmId, number>;
function distribution(value: unknown): LearningDistribution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const values = value as Record<string, unknown>;
  if (
    Object.keys(values).length !== LEARNING_ARMS.length ||
    LEARNING_ARMS.some(
      (arm) =>
        typeof values[arm] !== 'number' ||
        !Number.isFinite(values[arm]) ||
        Number(values[arm]) < 0 ||
        Number(values[arm]) > 1,
    )
  )
    return null;
  const result = values as LearningDistribution;
  return Math.abs(
    LEARNING_ARMS.reduce((sum, arm) => sum + result[arm], 0) - 1,
  ) <= 1e-12
    ? result
    : null;
}
@Injectable()
export class LearningDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: LearningAccountService,
    private readonly checkpoints: LearningCheckpointService,
    private readonly policies: LearningPolicyService,
    private readonly scopes: LearningScopeStateService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  private receipt(
    decision: ContentLearningDecision,
  ): LearningGenerationReceipt {
    const snapshot =
      decision.contextSnapshot &&
      typeof decision.contextSnapshot === 'object' &&
      !Array.isArray(decision.contextSnapshot)
        ? decision.contextSnapshot
        : {};
    return {
      decisionId: decision.id,
      credentialId: decision.credentialId,
      mode: decision.mode as ContentLearningMode,
      accountRevision: decision.accountRevision,
      epoch: decision.epoch,
      scopeRevision: decision.scopeRevision ?? undefined,
      cellDescriptor: validLearningDescriptor(decision.cellDescriptor)
        ? decision.cellDescriptor
        : undefined,
      descriptorHash: decision.descriptorHash ?? undefined,
      armId: decision.selectedArmId as LearningGenerationReceipt['armId'],
      probabilities: decision.probabilities as Record<string, number>,
      selectedProbability: decision.selectedProbability,
      assignment: decision.assignment as 'pilot' | 'control',
      assignmentProbability: decision.assignmentProbability,
      executionProbability: decision.executionProbability,
      executionProbabilities:
        distribution(decision.executionProbabilities) ?? undefined,
      treatmentProbabilities:
        distribution(snapshot.treatmentProbabilities) ?? undefined,
      controlProbabilities:
        distribution(snapshot.controlProbabilities) ?? undefined,
      policyVersionId: decision.accountPolicyId ?? undefined,
      sharedReleaseId: decision.sharedReleaseId ?? undefined,
      sharedReleaseRevision: decision.sharedReleaseRevision ?? undefined,
      baselineId: decision.baselineId ?? undefined,
      configVersion: decision.configVersion,
      synthetic: decision.synthetic,
      reason: decision.censorshipReason ?? undefined,
    };
  }
  private fallback(
    reason: string,
    mode: LearningGenerationReceipt['mode'] = 'unavailable',
    configVersion = 'rl-reward-v1-experimental',
  ): LearningResolution {
    return {
      receipt: { mode, reason, configVersion, synthetic: false },
      contribution: {},
    };
  }
  async previewForContext(
    input: LearningGenerationInput,
  ): Promise<LearningResolution> {
    const credentialId = input.context?.credentialId;
    if (!credentialId) return this.fallback('no_destination', 'no_destination');
    await this.accounts.credential(
      input.organizationId,
      credentialId,
      input.brandId,
    );
    const account = await this.prisma.contentLearningAccount.findFirst({
      where: {
        organizationId: input.organizationId,
        brandId: input.brandId,
        credentialId,
        isDeleted: false,
      },
    });
    const mode = account
      ? Object.values(ContentLearningMode).find(
          (value) => value === account.mode,
        )
      : ContentLearningMode.SHADOW;
    if (!mode) return this.fallback('account_state_unavailable');
    if (mode !== ContentLearningMode.LIVE) return this.fallback(mode, mode);
    if (!input.harnessEnabled || !input.compatible)
      return this.fallback(
        !input.harnessEnabled ? 'harness_off' : 'incompatible_intent',
        ContentLearningMode.LIVE,
      );
    return {
      receipt: {
        mode: ContentLearningMode.LIVE,
        credentialId,
        accountRevision: account?.revision ?? 0,
        epoch: account?.epoch ?? 0,
        configVersion: 'rl-reward-v1-experimental',
        synthetic: false,
        reason: account?.failureReason ?? 'experiment_assignment_unavailable',
      },
      contribution: {},
    };
  }
  private validReplayIdentity(
    input: LearningGenerationInput,
    decision: ContentLearningDecision,
    account: ContentLearningAccount,
    scope: ContentLearningScopeState,
    destinationKey: string,
    descriptor: LearningCellDescriptor,
  ): boolean {
    const context = input.context;
    if (!context) return false;
    if (
      decision.isDeleted ||
      decision.synthetic ||
      decision.organizationId !== input.organizationId ||
      decision.brandId !== input.brandId ||
      decision.credentialId !== context.credentialId ||
      decision.requestKey !== context.requestKey ||
      decision.candidateIndex !== context.candidateIndex ||
      decision.destinationKey !== destinationKey ||
      account.brandId !== input.brandId ||
      scope.brandId !== input.brandId ||
      !decision.descriptorHash ||
      !validLearningDescriptor(descriptor) ||
      descriptor.format !== input.format ||
      descriptor.objective !== (context.objective ?? 'awareness') ||
      descriptor.configVersion !== decision.configVersion ||
      learningHash(learningDescriptorTuple(descriptor)) !==
        decision.descriptorHash ||
      decision.descriptorHash !== scope.descriptorHash ||
      !validLearningDescriptor(scope.cellDescriptor) ||
      learningHash(learningDescriptorTuple(scope.cellDescriptor)) !==
        decision.descriptorHash ||
      learningScopeKey({
        organizationId: input.organizationId,
        brandId: input.brandId,
        credentialId: decision.credentialId,
        platform: descriptor.platform,
        format: descriptor.format,
        objective: descriptor.objective,
        rewardProfileId: decision.descriptorHash,
      }) !== decision.scopeKey ||
      !LEARNING_ARMS.includes(decision.selectedArmId as LearningArmId)
    )
      return false;
    return true;
  }
  private async replay(
    tx: Prisma.TransactionClient,
    input: LearningGenerationInput,
    decision: ContentLearningDecision,
    account: ContentLearningAccount | null,
    destinationKey: string,
    payloadHash: string,
  ): Promise<LearningResolution> {
    if (decision.payloadHash !== payloadHash)
      throw new ConflictException('Learning request key payload conflict');
    const suppressed = (reason: string): LearningResolution => ({
      receipt: { ...this.receipt(decision), reason },
      contribution: {},
    });
    if (!account) return suppressed('invalid_lineage');
    if (['disabled', 'shadow', 'paused'].includes(account.mode))
      return suppressed(account.mode);
    if (
      account.epoch !== decision.epoch ||
      account.revision !== decision.accountRevision
    )
      return suppressed('account_changed');
    const scope = await this.scopes.read(
      tx,
      input.organizationId,
      decision.credentialId,
      decision.scopeKey,
      account.epoch,
    );
    if (!scope || scope.revision !== decision.scopeRevision)
      return suppressed('scope_changed');
    if (!input.harnessEnabled || !input.compatible)
      return suppressed(
        !input.harnessEnabled ? 'harness_off' : 'incompatible_intent',
      );
    if (account.failureReason) return suppressed(account.failureReason);
    const context = input.context;
    if (!context) return suppressed('invalid_lineage');
    const descriptor = decision.cellDescriptor;
    if (
      !validLearningDescriptor(descriptor) ||
      !this.validReplayIdentity(
        input,
        decision,
        account,
        scope,
        destinationKey,
        descriptor,
      )
    )
      return suppressed('invalid_lineage');
    const credential = await tx.credential.findFirst({
      where: {
        id: decision.credentialId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        isDeleted: false,
      },
    });
    const brand = await tx.brand.findFirst({
      where: {
        id: input.brandId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
    });
    if (
      !credential ||
      !brand ||
      fromPrismaCredentialPlatform(credential.platform) !== descriptor.platform
    )
      return suppressed('invalid_lineage');
    const baseline = await readReplayBaseline(
      tx,
      input.organizationId,
      input.brandId,
      decision,
    );
    if (!baseline) return suppressed('invalid_lineage');
    const receipt = this.receipt(decision),
      qT = receipt.treatmentProbabilities,
      qC = receipt.controlProbabilities,
      marginal = receipt.executionProbabilities;
    if (!qT || !qC || !marginal) return suppressed('invalid_lineage');
    const isInsufficientControl =
      decision.selectedArmId === 'baseline-v1' &&
      decision.assignment === 'control' &&
      decision.assignmentProbability === 1 &&
      decision.selectedProbability === 1 &&
      decision.executionProbability === 1 &&
      !decision.accountPolicyId &&
      !decision.sharedReleaseId &&
      !decision.opportunityId &&
      LEARNING_ARMS.every(
        (arm) =>
          qT[arm] === Number(arm === 'baseline-v1') &&
          qC[arm] === Number(arm === 'baseline-v1') &&
          marginal[arm] === Number(arm === 'baseline-v1'),
      ) &&
      baseline.count < 20;
    if (isInsufficientControl)
      return suppressed(
        (await hasInsufficientBaselineLineage(
          tx,
          this.dependencies,
          decision,
          account,
          baseline,
        ))
          ? 'insufficient_baseline'
          : 'invalid_lineage',
      );
    if (
      !(await this.dependencies.valid(
        'decision',
        decision.id,
        tx,
        input.organizationId,
      )) ||
      !(await this.dependencies.valid(
        'baseline',
        baseline.id,
        tx,
        input.organizationId,
      ))
    )
      return suppressed('invalid_source');

    if (decision.selectedArmId === 'baseline-v1')
      return suppressed(
        baseline.count < 20
          ? 'insufficient_baseline'
          : (decision.censorshipReason ?? 'experiment_assignment_unavailable'),
      );
    return this.replayTreatment(
      tx,
      input,
      decision,
      account,
      scope,
      destinationKey,
      baseline,
      descriptor,
    );
  }
  private validTreatmentSpec(
    experiment: ContentLearningExperiment,
    policy: ContentLearningPolicyVersion,
    decision: ContentLearningDecision,
    descriptor: LearningCellDescriptor,
  ): boolean {
    const spec = experiment.spec;
    if (
      !spec ||
      typeof spec !== 'object' ||
      Array.isArray(spec) ||
      spec.kind !== 'private_pilot' ||
      spec.synthetic !== false ||
      spec.cellKey !== decision.scopeKey ||
      spec.rewardProfileId !== decision.descriptorHash ||
      spec.format !== descriptor.format ||
      spec.objective !== descriptor.objective ||
      spec.configVersion !== decision.configVersion ||
      spec.featureVersion !== descriptor.featureSchema ||
      spec.treatmentProbability !== 0.1 ||
      experiment.candidatePolicyId !== policy.id ||
      spec.candidateId !== policy.id ||
      spec.candidateHash !== policy.evidenceManifestHash ||
      !Array.isArray(spec.approvedArmIds) ||
      !spec.approvedArmIds.includes(decision.selectedArmId)
    )
      return false;
    return true;
  }
  private async replayTreatment(
    tx: Prisma.TransactionClient,
    input: LearningGenerationInput,
    decision: ContentLearningDecision,
    account: ContentLearningAccount,
    scope: ContentLearningScopeState,
    destinationKey: string,
    baseline: ContentLearningBaseline,
    descriptor: LearningCellDescriptor,
  ): Promise<LearningResolution> {
    const suppressed = (reason: string): LearningResolution => ({
      receipt: { ...this.receipt(decision), reason },
      contribution: {},
    });
    const receipt = this.receipt(decision),
      qT = receipt.treatmentProbabilities,
      qC = receipt.controlProbabilities,
      marginal = receipt.executionProbabilities;
    if (!qT || !qC || !marginal) return suppressed('invalid_lineage');
    if (
      !decision.accountPolicyId ||
      decision.sharedReleaseId ||
      !account.approvedArmIds.includes(decision.selectedArmId) ||
      (scope.pinnedPolicyId ?? scope.activePolicyId) !==
        decision.accountPolicyId
    )
      return suppressed('invalid_source');
    const policy = await this.policies.current(
      input.organizationId,
      decision.credentialId,
      decision.scopeKey,
      tx,
    );
    if (!policy || policy.id !== decision.accountPolicyId)
      return suppressed(
        scope.lastValidRewardAt &&
          scope.lastValidRewardAt.getTime() < Date.now() - 30 * 86400000
          ? 'expired_policy'
          : 'invalid_source',
      );
    if (baseline.count < 20 || baseline.validity !== 'valid')
      return suppressed('insufficient_baseline');
    if (!decision.opportunityId)
      return suppressed('experiment_assignment_unavailable');
    const opportunity = await tx.contentLearningOpportunity.findFirst({
      where: {
        id: decision.opportunityId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        credentialId: decision.credentialId,
        decisionId: decision.id,
        requestKey: decision.requestKey,
        destinationKey,
        candidateIndex: decision.candidateIndex,
        isDeleted: false,
      },
    });
    if (!opportunity) return suppressed('experiment_assignment_unavailable');
    const enrollment = await tx.contentLearningEnrollment.findFirst({
      where: {
        id: opportunity.enrollmentId,
        experimentId: opportunity.experimentId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        credentialId: decision.credentialId,
        accountEpoch: decision.epoch,
        included: true,
        withdrawnAt: null,
        isDeleted: false,
      },
    });
    const experiment = await tx.contentLearningExperiment.findFirst({
      where: {
        id: opportunity.experimentId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        credentialId: decision.credentialId,
        synthetic: false,
        isDeleted: false,
      },
    });
    const now = Date.now(),
      inWindow = (start: Date, end: Date, time: number) =>
        Number.isFinite(start.getTime()) &&
        Number.isFinite(end.getTime()) &&
        start.getTime() <= time &&
        time < end.getTime();
    if (
      !enrollment?.consentNoticeVersion ||
      !enrollment.ownerOperationId ||
      enrollment.consentAt.getTime() > opportunity.assignedAt.getTime() ||
      !inWindow(enrollment.startAt, enrollment.endAt, now) ||
      !inWindow(
        enrollment.startAt,
        enrollment.endAt,
        opportunity.assignedAt.getTime(),
      ) ||
      !experiment ||
      !experiment.sealedAt ||
      experiment.status === 'cancelled' ||
      !inWindow(experiment.startAt, experiment.endAt, now) ||
      !inWindow(
        experiment.startAt,
        experiment.endAt,
        opportunity.assignedAt.getTime(),
      ) ||
      opportunity.specHash !== experiment.specHash ||
      learningHash(experiment.spec) !== experiment.specHash ||
      opportunity.group !== 'treatment' ||
      opportunity.groupProbability !== 0.1 ||
      decision.assignment !== 'pilot' ||
      decision.assignmentProbability !== 0.1
    )
      return suppressed('experiment_assignment_unavailable');
    if (!this.validTreatmentSpec(experiment, policy, decision, descriptor))
      return suppressed('experiment_assignment_unavailable');
    const p = qT as LearningDistribution,
      c = qC as LearningDistribution;
    const expected = learningExecutionProbabilities(p, c, 0.1);
    if (
      LEARNING_ARMS.some(
        (arm) => Math.abs(expected[arm] - marginal[arm]) > 1e-12,
      ) ||
      Math.abs(
        decision.selectedProbability -
          p[decision.selectedArmId as LearningArmId],
      ) > 1e-12 ||
      Math.abs(
        decision.executionProbability -
          expected[decision.selectedArmId as LearningArmId],
      ) > 1e-12
    )
      return suppressed('invalid_source');
    for (const [kind, id] of [
      ['opportunity', opportunity.id],
      ['enrollment', enrollment.id],
      ['experiment', experiment.id],
    ] as const)
      if (!(await this.dependencies.valid(kind, id, tx, input.organizationId)))
        return suppressed('experiment_assignment_unavailable');
    // Existing assignment has no authoritative control/source projection writer.
    // Until that lineage can be proved, selected history remains immutable and inert.
    return suppressed('experiment_assignment_unavailable');
  }
  private async selectBaseline(
    tx: Prisma.TransactionClient,
    input: LearningGenerationInput,
    credentialId: string,
    platform: string,
    objective: LearningScope['objective'],
    decisionAt: Date,
    profiles: ReturnType<typeof learningRegisteredProfiles>,
  ) {
    let descriptor = profiles[0].descriptor;
    let scope: LearningScope = {
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: credentialId,
      platform,
      format: input.format,
      objective,
      rewardProfileId: learningHash(learningDescriptorTuple(descriptor)),
    };
    let baseline = await this.checkpoints.freeze(
      scope,
      decisionAt,
      descriptor,
      tx,
    );
    for (const profile of profiles.slice(1)) {
      if (baseline.count >= 20) break;
      const candidateScope = {
        ...scope,
        rewardProfileId: learningHash(
          learningDescriptorTuple(profile.descriptor),
        ),
      };
      const candidate = await this.checkpoints.freeze(
        candidateScope,
        decisionAt,
        profile.descriptor,
        tx,
      );
      if (candidate.count >= 20) {
        descriptor = profile.descriptor;
        scope = candidateScope;
        baseline = candidate;
        break;
      }
    }
    return { descriptor, scope, baseline };
  }
  private async linkBaselineDecisionSources(
    tx: Prisma.TransactionClient,
    decision: ContentLearningDecision,
    account: ContentLearningAccount,
    credentialId: string,
    organizationId: string,
    brandId: string,
    baselineId: string,
  ) {
    const derived = await this.dependencies.resolve(
      'decision',
      decision.id,
      organizationId,
      tx,
    );
    for (const [kind, id] of [
      ['account', account.id],
      ['credential', credentialId],
      ['brand', brandId],
      ['baseline', baselineId],
      ['config', account.activeConfigVersion],
    ] as const)
      await this.dependencies.link(
        tx,
        await this.dependencies.resolve(
          kind,
          id,
          kind === 'config' ? null : organizationId,
          tx,
        ),
        derived,
      );
  }
  async resolveForGeneration(
    input: LearningGenerationInput,
  ): Promise<LearningResolution> {
    const context = input.context;
    if (!context?.credentialId)
      return this.fallback('no_destination', 'no_destination');
    const credentialId = context.credentialId;
    if (
      !context.requestKey ||
      context.requestKey.length > 256 ||
      !Number.isInteger(context.candidateIndex) ||
      context.candidateIndex < 0
    )
      throw new BadRequestException('Invalid learning request identity');
    return this.prisma.$transaction(async (tx) => {
      await learningOrgFence(tx, input.organizationId, 'shared');
      const objective = context.objective ?? 'awareness',
        destinationKey = learningHash([credentialId, input.format, objective]);
      const payloadHash = learningHash([
        input.originalPrompt,
        input.harnessEnabled,
        input.compatible,
        context,
        input.format,
      ]);
      const identity = {
        organizationId: input.organizationId,
        requestKey: context.requestKey,
        destinationKey,
        candidateIndex: context.candidateIndex,
        isDeleted: false,
      };
      const existing = await tx.contentLearningDecision.findFirst({
        where: identity,
      });
      if (existing) {
        const currentAccount = await tx.contentLearningAccount.findFirst({
          where: {
            organizationId: input.organizationId,
            brandId: input.brandId,
            credentialId,
            isDeleted: false,
          },
        });
        return this.replay(
          tx,
          input,
          existing,
          currentAccount,
          destinationKey,
          payloadHash,
        );
      }
      const credential = await this.accounts.credential(
        input.organizationId,
        credentialId,
        input.brandId,
        tx,
      );
      const account = await this.accounts.ensure(
        input.organizationId,
        credentialId,
        tx,
      );
      const platform = fromPrismaCredentialPlatform(credential.platform) ?? '';
      if (account.mode === 'disabled')
        return this.fallback(
          'disabled',
          ContentLearningMode.DISABLED,
          account.activeConfigVersion,
        );
      await tx.$queryRaw`SELECT id FROM content_learning_accounts WHERE id = ${account.id} AND "organizationId" = ${input.organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
      const authoritative = await tx.contentLearningAccount.findFirst({
        where: {
          id: account.id,
          organizationId: input.organizationId,
          brandId: input.brandId,
          credentialId: credential.id,
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
        where: identity,
      });
      if (retry)
        return this.replay(
          tx,
          input,
          retry,
          authoritative,
          destinationKey,
          payloadHash,
        );
      const profiles = learningRegisteredProfiles(
        platform,
        input.format,
        objective,
      );
      if (!profiles.length) return this.fallback('unsupported_cell');
      const decisionAt = new Date();
      const { descriptor, scope, baseline } = await this.selectBaseline(
        tx,
        input,
        credential.id,
        platform,
        objective,
        decisionAt,
        profiles,
      );
      const scoped = await this.scopes.ensure(
          tx,
          scope,
          descriptor,
          account.epoch,
        ),
        scopeKey = learningScopeKey(scope);
      const followers = await tx.accountAnalyticsSnapshot.findFirst({
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
      const probabilities = Object.fromEntries(
        LEARNING_ARMS.map((arm) => [arm, Number(arm === 'baseline-v1')]),
      ) as LearningDistribution;
      const executionProbabilities = learningExecutionProbabilities(
        probabilities,
        probabilities,
        0,
      );
      const reason = ['shadow', 'paused'].includes(account.mode)
        ? account.mode
        : !input.harnessEnabled
          ? 'harness_off'
          : !input.compatible
            ? 'incompatible_intent'
            : (account.failureReason ??
              (baseline.count < 20
                ? 'insufficient_baseline'
                : 'experiment_assignment_unavailable'));
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
          scopeRevision: scoped.revision,
          cellDescriptor: toPrismaJson(descriptor),
          descriptorHash: scope.rewardProfileId,
          mode: account.mode,
          contextVector: features,
          contextSnapshot: toPrismaJson({
            platform,
            format: input.format,
            objective,
            rewardProfileId: scope.rewardProfileId,
            treatmentProbabilities: probabilities,
            controlProbabilities: probabilities,
          }),
          eligibleArmIds: ['baseline-v1'],
          probabilities: toPrismaJson(probabilities),
          executionProbabilities: toPrismaJson(executionProbabilities),
          selectedArmId: 'baseline-v1',
          selectedProbability: 1,
          assignment: 'control',
          assignmentProbability: 1,
          executionProbability: 1,
          configVersion: account.activeConfigVersion,
          baselineId: baseline.id,
          parentRequestId: context.parentRequestId,
          runId: context.runId,
          workflowExecutionId: context.workflowExecutionId,
          generationId: context.generationId,
          originalPromptHash: learningHash(input.originalPrompt),
          createdAt: decisionAt,
          censorshipReason: reason,
        },
      });
      await this.linkBaselineDecisionSources(
        tx,
        decision,
        account,
        credential.id,
        input.organizationId,
        input.brandId,
        baseline.id,
      );
      return { receipt: this.receipt(decision), contribution: {} };
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
      await learningOrgFence(tx, organizationId, 'shared');
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
      await learningOrgFence(tx, organizationId, 'shared');
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
          isDeleted: false,
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
