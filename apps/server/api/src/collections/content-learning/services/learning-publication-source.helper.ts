import { isDeepStrictEqual } from 'node:util';
import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import {
  dataProperties,
  id,
  LEARNING_PUBLICATION_CONFIG,
  learningPublicationApprovalEligible,
  learningPublicationBrandEligible,
  learningPublicationCredentialEligible,
  learningPublicationDependencyRefsV1,
  learningPublicationOrganizationEligible,
  learningPublicationPinEligible,
  learningPublicationPlatform,
  learningPublicationPostEligible,
  projectAssociation,
  projectLearningPublicationSourceV1,
  realDate,
} from '@api/collections/content-learning/services/learning-publication-source.projection';
import {
  type LearningPublicationAssociationV1,
  type LearningPublicationSourceV1,
  learningPublicationApprovalSelect,
  learningPublicationBrandSelect,
  learningPublicationCredentialSelect,
  learningPublicationFinalizationSelect,
  learningPublicationOrganizationSelect,
  learningPublicationPinSelect,
  learningPublicationPostSelect,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import { PublishApprovalStatus } from '@genfeedai/contracts';
import type { LearningDependencyRefV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { checkpointValidity } from '@genfeedai/harness';
import type { ContentLearningCheckpoint, Prisma } from '@genfeedai/prisma';

export {
  learningPublicationDependencyRefsV1,
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
  parseLearningPublicationSourceV1,
} from '@api/collections/content-learning/services/learning-publication-source.projection';

async function readContext(
  tx: Prisma.TransactionClient,
  organizationId: string,
  postId: string,
) {
  if (!id(organizationId) || !id(postId)) return null;
  const post = await tx.post.findFirst({
    where: { id: postId, organizationId, isDeleted: false },
    select: learningPublicationPostSelect,
  });
  if (!learningPublicationPostEligible(post, organizationId, postId))
    return null;
  if (
    !id(post.credentialId) ||
    !id(post.publishApprovalId) ||
    !id(post.reviewVersionPinId)
  )
    return null;
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, isDeleted: false },
    select: learningPublicationOrganizationSelect,
  });
  if (!learningPublicationOrganizationEligible(organization, organizationId))
    return null;
  const brand = await tx.brand.findFirst({
    where: {
      id: post.brandId,
      organizationId,
      isDeleted: false,
      isActive: true,
    },
    select: learningPublicationBrandSelect,
  });
  if (!learningPublicationBrandEligible(brand, organizationId, post))
    return null;
  const credential = await tx.credential.findFirst({
    where: {
      id: post.credentialId,
      organizationId,
      brandId: post.brandId,
      isDeleted: false,
      isConnected: true,
    },
    select: learningPublicationCredentialSelect,
  });
  if (!learningPublicationCredentialEligible(credential, organizationId, post))
    return null;
  const platform = learningPublicationPlatform(post, credential);
  if (!platform) return null;
  const approval = await tx.publishApproval.findFirst({
    where: {
      id: post.publishApprovalId,
      organizationId,
      brandId: post.brandId,
      postId,
      artifactVersionPinId: post.reviewVersionPinId,
    },
    select: learningPublicationApprovalSelect,
  });
  if (
    !learningPublicationApprovalEligible(approval, organizationId, postId, post)
  )
    return null;
  const pin = await tx.contentVersionPin.findFirst({
    where: {
      id: post.reviewVersionPinId,
      organizationId,
      brandId: post.brandId,
      recordKind: 'post',
      recordId: postId,
    },
    select: learningPublicationPinSelect,
  });
  if (!learningPublicationPinEligible(pin, organizationId, postId, post))
    return null;
  return { post, organization, brand, credential, approval, pin, platform };
}
export async function loadLearningPublicationAssociationV1(
  tx: Prisma.TransactionClient,
  organizationId: string,
  postId: string,
): Promise<LearningPublicationAssociationV1 | null> {
  const context = await readContext(tx, organizationId, postId);
  if (!context) return null;
  const material = {
    ...projectPostArtifactMaterial(
      readArtifactRecord({ ...context.post, ingredients: [] }),
    ),
    children: [],
  };
  if (buildArtifactContentDigest(material) !== context.pin.contentDigest)
    return null;
  return projectAssociation(context);
}
export async function resolveLearningPublicationSourceV1(
  tx: Prisma.TransactionClient,
  organizationId: string,
  postId: string,
): Promise<LearningPublicationSourceV1 | null> {
  const context = await readContext(tx, organizationId, postId);
  if (!context || context.approval.status !== PublishApprovalStatus.PUBLISHED)
    return null;
  if (!projectAssociation(context)) return null;
  const finalization = await tx.postPublishFinalization.findFirst({
    where: { organizationId, postId },
    select: learningPublicationFinalizationSelect,
  });
  return projectLearningPublicationSourceV1(organizationId, postId, {
    ...context,
    finalization,
  });
}
function validCheckpointInput(row: ContentLearningCheckpoint): boolean {
  return (
    id(row.id) &&
    id(row.organizationId) &&
    id(row.brandId) &&
    id(row.credentialId) &&
    id(row.postId) &&
    !row.isDeleted &&
    Number.isInteger(row.revision) &&
    row.revision >= 0 &&
    row.revision <= 2147483647 &&
    [row.publishedAt, row.dueAt, row.requestStartedAt, row.receivedAt].every(
      realDate,
    ) &&
    (row.providerAsOf === null || realDate(row.providerAsOf))
  );
}
function observationTuple(row: ContentLearningCheckpoint): readonly unknown[] {
  return [
    row.id,
    row.isDeleted,
    row.organizationId,
    row.brandId,
    row.credentialId,
    row.postId,
    row.windowId,
    row.revision,
    row.format,
    row.validity,
    row.publishedAt.getTime(),
    row.dueAt.getTime(),
    row.requestStartedAt.getTime(),
    row.receivedAt.getTime(),
    row.providerAsOf?.getTime() ?? null,
    row.sourceAttemptId,
    row.sourceAnalyticsId,
    row.sourceFingerprint,
    row.supersedesId,
    row.measurement,
    row.organicProvenance,
    row.attestation,
  ];
}
function observedCheckpoint(row: ContentLearningCheckpoint): boolean {
  const measurement = dataProperties(row.measurement);
  const collection = dataProperties(measurement?.collection);
  const organic = dataProperties(row.organicProvenance);
  return (
    row.validity === 'valid' &&
    row.windowId === '48h-v1' &&
    row.format === 'text' &&
    row.dueAt.getTime() === row.publishedAt.getTime() + 48 * 3600000 &&
    checkpointValidity(row) === null &&
    collection?.version === 1 &&
    collection.outcome === 'observed' &&
    (collection.reasonCode === null ||
      typeof collection.reasonCode === 'string') &&
    organic?.isPaid === false &&
    organic.isPinned === false &&
    organic.source === 'provider'
  );
}
async function validEdges(
  tx: Prisma.TransactionClient,
  checkpoint: ContentLearningCheckpoint,
  refs: LearningDependencyRefV1[],
): Promise<boolean> {
  const edges = await tx.contentLearningDependency.findMany({
    where: {
      derivedKind: 'checkpoint',
      derivedId: checkpoint.id,
      derivedOrganizationId: checkpoint.organizationId,
      isDeleted: false,
    },
    orderBy: { id: 'asc' },
    take: 9,
  });
  if (edges.length !== 8) return false;
  const remaining = [...refs];
  for (const edge of edges) {
    if (
      !edge.valid ||
      edge.isDeleted ||
      edge.derivedKind !== 'checkpoint' ||
      edge.derivedId !== checkpoint.id ||
      edge.derivedOrganizationId !== checkpoint.organizationId
    )
      return false;
    const index = remaining.findIndex(
      (ref) =>
        ref.kind === edge.sourceKind &&
        ref.id === edge.sourceId &&
        ref.organizationId === edge.sourceOrganizationId &&
        ref.version === edge.sourceVersion,
    );
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  const scopedParents = await tx.contentLearningDependency.findMany({
    where: {
      derivedOrganizationId: checkpoint.organizationId,
      isDeleted: false,
      OR: refs
        .filter((ref) => ref.organizationId !== null)
        .map((ref) => ({ derivedKind: ref.kind, derivedId: ref.id })),
    },
    take: 1,
  });
  if (scopedParents.length) return false;
  const configParents = await tx.contentLearningDependency.findMany({
    where: {
      derivedKind: 'config',
      derivedId: LEARNING_PUBLICATION_CONFIG,
      derivedOrganizationId: null,
      isDeleted: false,
    },
    take: 1,
  });
  return configParents.length === 0;
}
export async function validLearningCheckpointPublicationV1(
  tx: Prisma.TransactionClient,
  checkpoint: ContentLearningCheckpoint,
): Promise<boolean> {
  if (!validCheckpointInput(checkpoint)) return false;
  const where = {
    id: checkpoint.id,
    organizationId: checkpoint.organizationId,
    brandId: checkpoint.brandId,
    credentialId: checkpoint.credentialId,
    postId: checkpoint.postId,
    isDeleted: false,
  };
  const candidateObservation = structuredClone(observationTuple(checkpoint));
  const current = await tx.contentLearningCheckpoint.findFirst({ where });
  if (
    !current ||
    !validCheckpointInput(current) ||
    !isDeepStrictEqual(candidateObservation, observationTuple(current)) ||
    !observedCheckpoint(current)
  )
    return false;
  const currentObservation = structuredClone(observationTuple(current));
  const source = await resolveLearningPublicationSourceV1(
    tx,
    current.organizationId,
    current.postId,
  );
  if (
    !source ||
    source.organizationId !== current.organizationId ||
    source.brandId !== current.brandId ||
    source.credentialId !== current.credentialId ||
    source.postId !== current.postId ||
    source.publishedAt !== current.publishedAt.toISOString()
  )
    return false;
  if (
    !(await validEdges(
      tx,
      current,
      learningPublicationDependencyRefsV1(source),
    ))
  )
    return false;
  const final = await tx.contentLearningCheckpoint.findFirst({ where });
  return (
    final !== null &&
    validCheckpointInput(final) &&
    isDeepStrictEqual(currentObservation, observationTuple(final)) &&
    observedCheckpoint(final)
  );
}
