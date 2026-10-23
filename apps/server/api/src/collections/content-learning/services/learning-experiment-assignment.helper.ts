import { createHash, createHmac } from 'node:crypto';
import type { LearningResolution } from '@api/collections/content-learning/services/learning-decision.service';
import type {
  LearningCandidateInput,
  learningCandidateIdentity,
} from '@api/collections/content-learning/services/learning-decision-batch.helper';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningPilotPolicyLineageValid,
  readCurrentLearningPilotV1,
} from '@api/collections/content-learning/services/learning-pilot-gate.helper';
import {
  type LearningPolicyService,
  parseLearningPolicy,
} from '@api/collections/content-learning/services/learning-policy.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  LearningArmExclusionV1,
  LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  LEARNING_ARMS,
  type LearningArmId,
  learningExecutionProbabilities,
  learningProbabilities,
  sampleLearningArm,
} from '@genfeedai/harness';
import {
  type ContentLearningAccount,
  type ContentLearningBaseline,
  type ContentLearningDecision,
  type ContentLearningOpportunity,
  type ContentLearningPolicyVersion,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import {
  extractString,
  extractStringArray,
  readRecord,
} from '@genfeedai/utils/data/extract.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { ConflictException, Logger } from '@nestjs/common';

const BASELINE: LearningArmId = 'baseline-v1';
const TREATMENT_PROBABILITY = 0.1;
const CONTROL_PROBABILITY = 0.9;
const DEADLINE_MS = 24 * 3_600_000;
const logger = new Logger('LearningExperimentAssignment');

type LearningDistribution = Record<LearningArmId, number>;
type LearningPilotGroup = 'treatment' | 'control';

export interface LearningPilotAssignmentDeps {
  tx: Prisma.TransactionClient;
  dependencies: Pick<LearningDependencyService, 'valid' | 'resolve' | 'link'>;
  policies: Pick<LearningPolicyService, 'current'>;
}
export interface LearningPilotAssignmentScope {
  /** True when the whole request is one candidate, the only supported shape. */
  isSingleCandidate: boolean;
  account: ContentLearningAccount;
  scope: LearningScope;
  scopeKey: string;
  baseline: Pick<ContentLearningBaseline, 'count' | 'validity'>;
  features: number[];
  decisionAt: Date;
  credentialId: string;
}
/** Decision columns the assignment decides; everything else stays baseline. */
export type LearningPilotDecisionFields = Required<
  Pick<
    Prisma.ContentLearningDecisionUncheckedCreateInput,
    | 'opportunityId'
    | 'eligibleArmIds'
    | 'probabilities'
    | 'executionProbabilities'
    | 'selectedArmId'
    | 'selectedProbability'
    | 'assignment'
    | 'assignmentProbability'
    | 'executionProbability'
  >
> &
  Pick<
    Prisma.ContentLearningDecisionUncheckedCreateInput,
    'accountPolicyId' | 'censorshipReason'
  >;
export interface LearningPilotAssignment {
  opportunity: ContentLearningOpportunity;
  experimentId: string;
  enrollmentId: string;
  policy: ContentLearningPolicyVersion | null;
  decisionFields: LearningPilotDecisionFields;
  /** Merged over the baseline context snapshot. */
  snapshot: Record<string, unknown>;
}

/**
 * Deterministic draw in [0, 1) from the committed pilot seed, so a recorded
 * assignment can be recomputed and audited. 52 bits keep the quotient exact.
 */
export function learningPilotDrawV1(
  seedHex: string,
  parts: ReadonlyArray<string | number>,
): number {
  const digest = createHmac('sha256', Buffer.from(seedHex, 'hex'))
    .update(JSON.stringify(parts))
    .digest('hex');
  return Number.parseInt(digest.slice(0, 13), 16) / 2 ** 52;
}

/**
 * The arms excluded from assignment. Unevaluated compatibility excludes every
 * non-baseline arm; the baseline arm can never be excluded.
 */
export function learningPilotExclusionsV1(
  exclusions: LearningArmExclusionV1[] | undefined,
): LearningArmExclusionV1[] {
  const source =
    exclusions ??
    LEARNING_ARMS.filter((armId) => armId !== BASELINE).map((armId) => ({
      armId,
      reasonCode: 'brand_compatibility_unknown',
    }));
  const byArm = new Map<string, LearningArmExclusionV1>();
  for (const exclusion of source)
    if (exclusion.armId !== BASELINE && !byArm.has(exclusion.armId))
      byArm.set(exclusion.armId, exclusion);
  return [...byArm.values()].sort((a, b) => (a.armId < b.armId ? -1 : 1));
}

/** Reads exclusions persisted on a decision snapshot; malformed rows yield none. */
export function learningPilotSnapshotExclusionsV1(
  snapshot: unknown,
): LearningArmExclusionV1[] {
  const value = readRecord(snapshot).armExclusions;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const record = readRecord(entry);
    const armId = extractString(record, 'armId');
    const reasonCode = extractString(record, 'reasonCode');
    return armId && reasonCode ? [{ armId, reasonCode }] : [];
  });
}

function baselineDistribution(): LearningDistribution {
  return Object.fromEntries(
    LEARNING_ARMS.map((arm) => [arm, Number(arm === BASELINE)]),
  ) as LearningDistribution;
}

function committedSeed(
  experiment: { id: string; organizationId: string; encryptedSeed: string },
  seedCommitment: string | undefined,
): string | null {
  try {
    const seedHex = EncryptionUtil.decrypt(experiment.encryptedSeed);
    if (createHash('sha256').update(seedHex).digest('hex') === seedCommitment)
      return seedHex;
  } catch {
    // Reported below with ids only.
  }
  logger.warn(
    `pilot seed commitment unverifiable experiment=${experiment.id} organization=${experiment.organizationId}`,
  );
  return null;
}

async function treatmentDistribution(
  deps: LearningPilotAssignmentDeps,
  ctx: LearningPilotAssignmentScope,
  input: LearningCandidateInput,
  candidate: ContentLearningPolicyVersion,
  eligible: LearningArmId[],
  control: LearningDistribution,
) {
  const policy = await deps.policies.current(
    input.organizationId,
    ctx.credentialId,
    ctx.scopeKey,
    deps.tx,
  );
  const unavailable = (reason: string) => ({
    policy: null,
    reason,
    treatment: control,
  });
  if (!policy || !learningPilotPolicyLineageValid(candidate, policy))
    return unavailable('experiment_candidate_unavailable');
  try {
    const state = parseLearningPolicy(policy.armState);
    if (!state) return unavailable('experiment_candidate_invalid');
    return {
      policy,
      reason: null,
      treatment: learningProbabilities(state, ctx.features, eligible),
    };
  } catch {
    return unavailable('experiment_candidate_invalid');
  }
}

/**
 * Assigns one opportunity of an enrolled, current private pilot and writes its
 * opportunity row. Returns null whenever the request is not eligible, so the
 * caller keeps the unchanged baseline path. The assignment only records what
 * was drawn; applying a learned arm is gated separately at replay.
 */
export async function openLearningPilotAssignment(
  deps: LearningPilotAssignmentDeps,
  ctx: LearningPilotAssignmentScope,
  input: LearningCandidateInput,
  identity: ReturnType<typeof learningCandidateIdentity>,
): Promise<LearningPilotAssignment | null> {
  const { tx } = deps;
  const { account, baseline } = ctx;
  if (
    !ctx.isSingleCandidate ||
    account.mode !== 'live' ||
    account.failureReason ||
    !input.harnessEnabled ||
    !input.compatible ||
    baseline.count < 20 ||
    baseline.validity !== 'valid'
  )
    return null;
  const pilot = await readCurrentLearningPilotV1(
    tx,
    deps.dependencies,
    {
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: ctx.credentialId,
      scopeKey: ctx.scopeKey,
      epoch: account.epoch,
    },
    ctx.decisionAt,
    'assignment',
  );
  if (!pilot) return null;
  const { experiment, enrollment, candidate } = pilot;
  const spec = readRecord(experiment.spec);
  if (
    extractString(spec, 'format') !== ctx.scope.format ||
    extractString(spec, 'objective') !== ctx.scope.objective ||
    extractString(spec, 'rewardProfileId') !== ctx.scope.rewardProfileId ||
    spec.treatmentProbability !== TREATMENT_PROBABILITY
  )
    return null;
  const seed = committedSeed(experiment, extractString(spec, 'seedCommitment'));
  if (!seed) return null;

  const exclusions = learningPilotExclusionsV1(input.armExclusions);
  const excluded = new Set(exclusions.map(({ armId }) => armId));
  const approved = extractStringArray(spec, 'approvedArmIds').filter((armId) =>
    account.approvedArmIds.includes(armId),
  );
  const eligible = LEARNING_ARMS.filter(
    (arm) => arm === BASELINE || (approved.includes(arm) && !excluded.has(arm)),
  ).sort();
  const control = baselineDistribution();
  const {
    policy,
    reason: treatmentUnavailableReason,
    treatment,
  } = await treatmentDistribution(
    deps,
    ctx,
    input,
    candidate,
    eligible,
    control,
  );
  const marginal = learningExecutionProbabilities(
    treatment,
    control,
    TREATMENT_PROBABILITY,
  );
  const drawParts = [
    experiment.id,
    input.organizationId,
    identity.requestKey,
    identity.destinationKey,
    identity.candidateIndex,
  ];
  const groupDraw = learningPilotDrawV1(seed, ['group', ...drawParts]);
  const group: LearningPilotGroup =
    groupDraw < TREATMENT_PROBABILITY ? 'treatment' : 'control';
  const conditional = group === 'treatment' ? treatment : control;
  const selected = sampleLearningArm(
    conditional,
    learningPilotDrawV1(seed, ['arm', ...drawParts]),
  );
  const groupProbability =
    group === 'treatment' ? TREATMENT_PROBABILITY : CONTROL_PROBABILITY;
  const { context } = input;
  const opportunity = await tx.contentLearningOpportunity.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: ctx.credentialId,
      experimentId: experiment.id,
      enrollmentId: enrollment.id,
      requestKey: identity.requestKey,
      destinationKey: identity.destinationKey,
      candidateIndex: identity.candidateIndex,
      assignedAt: ctx.decisionAt,
      group,
      groupProbability,
      assignmentDraw: groupDraw,
      specHash: experiment.specHash,
      policyManifest: toPrismaJson({
        candidatePolicyId: candidate.id,
        accountPolicyId: policy?.id ?? null,
        eligibleArmIds: eligible,
        treatmentUnavailableReason,
      }),
      parentRequestId: context.parentRequestId,
      runId: context.runId,
      workflowExecutionId: context.workflowExecutionId,
      postId: context.generationId,
      deadlineAt: new Date(ctx.decisionAt.getTime() + DEADLINE_MS),
      state: 'assigned',
    },
  });
  return {
    opportunity,
    experimentId: experiment.id,
    enrollmentId: enrollment.id,
    policy,
    decisionFields: {
      opportunityId: opportunity.id,
      eligibleArmIds: eligible,
      probabilities: toPrismaJson(conditional),
      executionProbabilities: toPrismaJson(marginal),
      selectedArmId: selected,
      selectedProbability: conditional[selected],
      assignment: group === 'treatment' ? 'pilot' : 'control',
      assignmentProbability: groupProbability,
      executionProbability: marginal[selected],
      accountPolicyId: policy?.id,
      censorshipReason:
        group === 'control'
          ? 'experiment_control'
          : selected === BASELINE
            ? (treatmentUnavailableReason ?? 'experiment_treatment_baseline')
            : null,
    },
    snapshot: {
      experimentId: experiment.id,
      treatmentProbabilities: treatment,
      controlProbabilities: control,
      armExclusions: exclusions,
      treatmentUnavailableReason,
    },
  };
}

/**
 * Back-links the opportunity to its decision and records the dependency edges
 * that make the decision invalid when its experiment, enrollment, opportunity
 * or policy is invalidated.
 */
export async function closeLearningPilotAssignment(
  deps: LearningPilotAssignmentDeps,
  assignment: LearningPilotAssignment,
  decision: ContentLearningDecision,
): Promise<void> {
  const { tx, dependencies } = deps;
  const { organizationId } = decision;
  const { opportunity } = assignment;
  const linked = await tx.contentLearningOpportunity.updateMany({
    where: {
      id: opportunity.id,
      organizationId,
      decisionId: null,
      isDeleted: false,
    },
    data: { decisionId: decision.id },
  });
  if (linked.count !== 1)
    throw new ConflictException('Learning opportunity already assigned');
  const edges = [
    ['experiment', assignment.experimentId, 'opportunity', opportunity.id],
    ['enrollment', assignment.enrollmentId, 'opportunity', opportunity.id],
    ['opportunity', opportunity.id, 'decision', decision.id],
    ...(assignment.policy
      ? [['policy', assignment.policy.id, 'decision', decision.id] as const]
      : []),
  ] as const;
  for (const [sourceKind, sourceId, derivedKind, derivedId] of edges)
    await dependencies.link(
      tx,
      await dependencies.resolve(sourceKind, sourceId, organizationId, tx),
      await dependencies.resolve(derivedKind, derivedId, organizationId, tx),
    );
}

/**
 * Adds the opportunity provenance and persisted arm exclusions to the replayed
 * resolution of a decision that was assigned inside a pilot.
 */
export async function attachLearningOpportunity(
  tx: Prisma.TransactionClient,
  decision: ContentLearningDecision,
  resolution: LearningResolution,
): Promise<LearningResolution> {
  const opportunity = await tx.contentLearningOpportunity.findFirst({
    where: scopedWhere(decision.organizationId, {
      id: decision.opportunityId,
      credentialId: decision.credentialId,
      decisionId: decision.id,
    }),
  });
  if (!opportunity)
    return {
      receipt: {
        ...resolution.receipt,
        reason: 'experiment_assignment_unavailable',
      },
      contribution: {},
    };
  return {
    ...resolution,
    receipt: {
      ...resolution.receipt,
      opportunityId: opportunity.id,
      experimentId: opportunity.experimentId,
    },
    exclusions: learningPilotSnapshotExclusionsV1(decision.contextSnapshot),
  };
}
