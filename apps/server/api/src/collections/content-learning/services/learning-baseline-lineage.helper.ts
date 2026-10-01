import { parseLearningMeasurement } from '@api/collections/content-learning/services/learning-checkpoint.service';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  isLearningGlobalDependencyKind,
  validLearningDependencyKind,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import type {
  ContentLearningAccount,
  ContentLearningBaseline,
  ContentLearningDecision,
  ContentLearningDependency,
  Prisma,
} from '@genfeedai/prisma';

export async function hasInsufficientBaselineLineage(
  tx: Prisma.TransactionClient,
  dependencies: LearningDependencyService,
  decision: ContentLearningDecision,
  account: ContentLearningAccount,
  baseline: ContentLearningBaseline,
): Promise<boolean> {
  if (
    baseline.validity !== 'insufficient_baseline' ||
    !Number.isInteger(baseline.count) ||
    baseline.count < 0 ||
    baseline.count >= 20 ||
    !Array.isArray(baseline.samples) ||
    baseline.samples.length !== baseline.count ||
    baseline.contributorCheckpointIds.length !== baseline.count ||
    baseline.contributorRevisions.length !== baseline.count ||
    new Set(baseline.contributorCheckpointIds).size !== baseline.count ||
    !Number.isFinite(baseline.cutoff.getTime()) ||
    baseline.cutoff.getTime() > Date.now()
  )
    return false;
  const descriptor = decision.cellDescriptor;
  if (!validLearningDescriptor(descriptor)) return false;
  const expectedFingerprint = learningHash([
    decision.scopeKey,
    decision.descriptorHash,
    baseline.cutoff.toISOString(),
    baseline.contributorCheckpointIds.map((id, index) => [
      id,
      baseline.contributorRevisions[index],
    ]),
  ]);
  if (baseline.fingerprint !== expectedFingerprint) return false;
  const checkpointEdges = await tx.contentLearningDependency.findMany({
    where: {
      derivedKind: 'baseline',
      derivedId: baseline.id,
      derivedOrganizationId: decision.organizationId,
      sourceKind: 'checkpoint',
      isDeleted: false,
    },
    orderBy: { id: 'asc' },
  });
  if (checkpointEdges.length !== baseline.count) return false;
  if (
    !(await validBaselineContributors(
      tx,
      dependencies,
      decision,
      baseline,
      checkpointEdges,
    ))
  )
    return false;
  return validDecisionDependencies(
    tx,
    dependencies,
    decision,
    account,
    baseline,
  );
}

async function validBaselineContributors(
  tx: Prisma.TransactionClient,
  dependencies: LearningDependencyService,
  decision: ContentLearningDecision,
  baseline: ContentLearningBaseline,
  checkpointEdges: ContentLearningDependency[],
): Promise<boolean> {
  const descriptor = decision.cellDescriptor;
  if (!validLearningDescriptor(descriptor)) return false;
  const posts = new Set<string>();
  for (let index = 0; index < baseline.count; index++) {
    const id = baseline.contributorCheckpointIds[index],
      revision = baseline.contributorRevisions[index],
      sample = parseLearningMeasurement(baseline.samples[index]);
    if (
      !Number.isInteger(revision) ||
      revision < 0 ||
      !sample ||
      (descriptor.retention && sample.averageWatchTimeSeconds === undefined)
    )
      return false;
    const checkpoint = await tx.contentLearningCheckpoint.findFirst({
      where: {
        id,
        organizationId: decision.organizationId,
        brandId: decision.brandId,
        credentialId: decision.credentialId,
        format: descriptor.format,
        windowId: descriptor.windowId,
        revision,
        validity: 'valid',
        isDeleted: false,
        receivedAt: {
          lte: baseline.cutoff,
          gte: new Date(
            Math.max(
              baseline.cutoff.getTime() - 90 * 86400000,
              Date.now() - 90 * 86400000,
            ),
          ),
        },
      },
    });
    if (
      !checkpoint ||
      posts.has(checkpoint.postId) ||
      !(await dependencies.valid('checkpoint', id, tx, decision.organizationId))
    )
      return false;
    posts.add(checkpoint.postId);
    const raw = checkpoint.measurement;
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      !Array.isArray(raw.profiles)
    )
      return false;
    const matching = raw.profiles.find(
      (value) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value.profileId === decision.descriptorHash &&
        validLearningDescriptor(value.descriptor) &&
        learningHash(learningDescriptorTuple(value.descriptor)) ===
          decision.descriptorHash,
    );
    if (
      !matching ||
      typeof matching !== 'object' ||
      Array.isArray(matching) ||
      learningHash(parseLearningMeasurement(matching.measurement)) !==
        learningHash(sample)
    )
      return false;
    if (
      !checkpointEdges.some(
        (edge) =>
          edge.valid &&
          edge.sourceId === id &&
          edge.sourceOrganizationId === decision.organizationId &&
          edge.sourceVersion === String(revision),
      )
    )
      return false;
  }
  return true;
}

async function validDecisionDependencies(
  tx: Prisma.TransactionClient,
  dependencies: LearningDependencyService,
  decision: ContentLearningDecision,
  account: ContentLearningAccount,
  baseline: ContentLearningBaseline,
): Promise<boolean> {
  const edges = await tx.contentLearningDependency.findMany({
    where: {
      derivedKind: 'decision',
      derivedId: decision.id,
      derivedOrganizationId: decision.organizationId,
      isDeleted: false,
    },
    orderBy: { id: 'asc' },
  });
  if (
    !edges.some(
      (edge) =>
        edge.sourceKind === 'baseline' &&
        edge.sourceId === baseline.id &&
        edge.sourceOrganizationId === decision.organizationId &&
        edge.sourceVersion === baseline.fingerprint &&
        edge.valid,
    )
  )
    return false;
  for (const [kind, id] of [
    ['account', account.id],
    ['credential', decision.credentialId],
    ['brand', decision.brandId],
  ] as const)
    if (
      !edges.some(
        (edge) =>
          edge.sourceKind === kind &&
          edge.sourceId === id &&
          edge.sourceOrganizationId === decision.organizationId &&
          edge.valid,
      )
    )
      return false;
  for (const edge of edges) {
    if (
      !edge.valid ||
      !validLearningDependencyKind(edge.sourceKind) ||
      edge.sourceVersion === 'current'
    )
      return false;
    if (edge.sourceKind === 'baseline') {
      if (
        edge.sourceId !== baseline.id ||
        edge.sourceOrganizationId !== decision.organizationId ||
        edge.sourceVersion !== baseline.fingerprint
      )
        return false;
      continue;
    }
    const sourceOrg = isLearningGlobalDependencyKind(edge.sourceKind)
      ? null
      : decision.organizationId;
    if (
      edge.sourceOrganizationId !== sourceOrg ||
      !(await dependencies.valid(edge.sourceKind, edge.sourceId, tx, sourceOrg))
    )
      return false;
    const ref = await dependencies.resolve(
      edge.sourceKind,
      edge.sourceId,
      sourceOrg,
      tx,
    );
    if (ref.version !== edge.sourceVersion) return false;
  }
  return true;
}
