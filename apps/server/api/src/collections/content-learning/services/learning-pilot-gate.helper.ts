import type {
  LearningGenerationInput,
  LearningResolution,
} from '@api/collections/content-learning/services/learning-decision-batch.helper';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningCanonicalHash } from '@api/collections/content-learning/services/learning-operation.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  LearningCellDescriptor,
  LearningGenerationReceipt,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { learningContribution } from '@genfeedai/harness';
import type {
  ContentLearningDecision,
  ContentLearningExperiment,
  ContentLearningPolicyVersion,
  ContentLearningScopeState,
  Prisma,
} from '@genfeedai/prisma';
import { readRecord } from '@genfeedai/utils/data/extract.util';

type PilotScope = Pick<
  ContentLearningScopeState,
  'organizationId' | 'brandId' | 'credentialId' | 'scopeKey' | 'epoch'
>;
type PilotPolicy = Pick<
  ContentLearningPolicyVersion,
  | 'id'
  | 'version'
  | 'organizationId'
  | 'brandId'
  | 'credentialId'
  | 'scopeKey'
  | 'epoch'
  | 'descriptorHash'
  | 'algorithm'
  | 'configVersion'
  | 'featureSchema'
  | 'synthetic'
>;

export async function readCurrentLearningPilotV1(
  tx: Prisma.TransactionClient,
  dependencies: Pick<LearningDependencyService, 'valid'>,
  scope: PilotScope,
  at: Date,
  window: 'assignment' | 'activation',
) {
  const { organizationId, brandId, credentialId, scopeKey, epoch } = scope;
  const experiments = await tx.contentLearningExperiment.findMany({
    where: scopedWhere(organizationId, {
      brandId,
      credentialId,
      cellKey: scopeKey,
      kind: 'private_pilot',
      status: 'sealed',
      sealedAt: { not: null },
      synthetic: false,
      isDeleted: false,
      endAt: { gt: at },
      ...(window === 'assignment' ? { startAt: { lte: at } } : {}),
    }),
    take: 2,
  });
  if (experiments.length !== 1) return null;
  const experiment = experiments[0];
  if (
    learningCanonicalHash(experiment.spec) !== experiment.specHash ||
    !experiment.candidatePolicyId
  )
    return null;
  const enrollment = await tx.contentLearningEnrollment.findFirst({
    where: {
      experimentId: experiment.id,
      organizationId,
      brandId,
      credentialId,
      accountEpoch: epoch,
      included: true,
      withdrawnAt: null,
      isDeleted: false,
    },
  });
  if (!enrollment) return null;
  const candidate = await tx.contentLearningPolicyVersion.findFirst({
    where: {
      id: experiment.candidatePolicyId,
      organizationId,
      brandId,
      credentialId,
      scopeKey,
      epoch,
      synthetic: false,
      isDeleted: false,
    },
  });
  if (
    !candidate ||
    !(await dependencies.valid(
      'experiment',
      experiment.id,
      tx,
      organizationId,
    )) ||
    !(await dependencies.valid('enrollment', enrollment.id, tx, organizationId))
  )
    return null;
  return { experiment, enrollment, candidate };
}

export function learningPilotPolicyLineageValid(
  candidate: PilotPolicy,
  policy: PilotPolicy,
): boolean {
  if (policy.synthetic) return false;
  if (policy.id === candidate.id) return true;
  return (
    policy.version > candidate.version &&
    policy.organizationId === candidate.organizationId &&
    policy.brandId === candidate.brandId &&
    policy.credentialId === candidate.credentialId &&
    policy.scopeKey === candidate.scopeKey &&
    policy.epoch === candidate.epoch &&
    policy.descriptorHash === candidate.descriptorHash &&
    policy.algorithm === candidate.algorithm &&
    policy.configVersion === candidate.configVersion &&
    policy.featureSchema === candidate.featureSchema
  );
}

/** True when the account is inside a current included pilot enrollment window. */
export async function hasCurrentLearningPilotEnrollmentV1(
  client: Pick<Prisma.TransactionClient, 'contentLearningEnrollment'>,
  scope: { organizationId: string; brandId: string; credentialId: string },
  at: Date,
): Promise<boolean> {
  const { organizationId, brandId, credentialId } = scope;
  const enrollment = await client.contentLearningEnrollment.findFirst({
    where: scopedWhere(organizationId, {
      brandId,
      credentialId,
      included: true,
      withdrawnAt: null,
      startAt: { lte: at },
      endAt: { gt: at },
    }),
    select: { id: true },
  });
  return enrollment !== null;
}

/** The frozen pilot spec still describes the treatment this decision drew. */
function validTreatmentSpec(
  experiment: ContentLearningExperiment,
  candidate: ContentLearningPolicyVersion,
  policy: ContentLearningPolicyVersion,
  decision: ContentLearningDecision,
  descriptor: LearningCellDescriptor,
): boolean {
  const spec = readRecord(experiment.spec);
  const approvedArmIds = spec.approvedArmIds;
  return (
    spec.kind === 'private_pilot' &&
    spec.synthetic === false &&
    spec.cellKey === decision.scopeKey &&
    spec.rewardProfileId === decision.descriptorHash &&
    spec.format === descriptor.format &&
    spec.objective === descriptor.objective &&
    spec.configVersion === decision.configVersion &&
    spec.featureVersion === descriptor.featureSchema &&
    spec.treatmentProbability === 0.1 &&
    experiment.candidatePolicyId === candidate.id &&
    spec.candidateId === candidate.id &&
    spec.candidateHash === candidate.evidenceManifestHash &&
    learningPilotPolicyLineageValid(candidate, policy) &&
    Array.isArray(approvedArmIds) &&
    approvedArmIds.includes(decision.selectedArmId)
  );
}

/**
 * The last gate before a drawn treatment becomes a real contribution: the
 * frozen pilot spec and policy lineage must still hold, and the approved brand
 * must have been checked and must not exclude the drawn arm. Approved brand
 * truth always outranks learning. Anything short of that is a suppressed
 * resolution with an empty contribution.
 */
export async function appliedLearningPilotV1(
  tx: Prisma.TransactionClient,
  ctx: {
    input: Pick<LearningGenerationInput, 'organizationId' | 'armExclusions'>;
    decision: ContentLearningDecision;
    experiment: ContentLearningExperiment;
    policy: ContentLearningPolicyVersion;
    descriptor: LearningCellDescriptor;
    receipt: LearningGenerationReceipt;
  },
): Promise<LearningResolution> {
  const { input, decision, experiment, policy, descriptor, receipt } = ctx;
  const { armExclusions } = input;
  const suppressed = (reason: string): LearningResolution => ({
    receipt: { ...receipt, reason },
    contribution: {},
    ...(armExclusions ? { exclusions: armExclusions } : {}),
  });
  const candidate =
    policy.id === experiment.candidatePolicyId
      ? policy
      : await tx.contentLearningPolicyVersion.findFirst({
          where: scopedWhere(input.organizationId, {
            id: experiment.candidatePolicyId ?? undefined,
            brandId: decision.brandId,
            credentialId: decision.credentialId,
            scopeKey: decision.scopeKey,
            epoch: decision.epoch,
            synthetic: false,
          }),
        });
  if (
    !candidate ||
    !validTreatmentSpec(experiment, candidate, policy, decision, descriptor)
  )
    return suppressed('experiment_assignment_unavailable');
  if (!armExclusions) return suppressed('brand_compatibility_unknown');
  if (armExclusions.some(({ armId }) => armId === decision.selectedArmId))
    return suppressed('learning_incompatible');
  return {
    receipt,
    contribution: learningContribution(decision.selectedArmId),
    exclusions: armExclusions,
  };
}
