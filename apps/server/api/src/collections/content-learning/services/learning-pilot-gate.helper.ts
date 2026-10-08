import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningCanonicalHash } from '@api/collections/content-learning/services/learning-operation.service';
import type {
  ContentLearningPolicyVersion,
  ContentLearningScopeState,
  Prisma,
} from '@genfeedai/prisma';

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
    where: {
      organizationId,
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
    },
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
