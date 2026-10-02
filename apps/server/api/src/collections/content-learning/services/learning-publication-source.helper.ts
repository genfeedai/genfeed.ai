import { isDeepStrictEqual } from 'node:util';
import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  type LearningPublicationAssociationV1,
  type LearningPublicationPostRow,
  type LearningPublicationPostVersionInputV1,
  type LearningPublicationSourceV1,
  learningPublicationApprovalSelect,
  learningPublicationBrandSelect,
  learningPublicationCredentialSelect,
  learningPublicationFinalizationSelect,
  learningPublicationOrganizationSelect,
  learningPublicationPinSelect,
  learningPublicationPostSelect,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import {
  fromPrismaCredentialPlatform,
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  LEARNING_REGISTERED_CONFIG_VERSIONS,
  type LearningDependencyRefV1,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  checkpointValidity,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import type { ContentLearningCheckpoint, Prisma } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

const ASSOCIATION_KEYS = [
  'version',
  'organizationId',
  'brandId',
  'credentialId',
  'postId',
  'approvalId',
  'approvalOperationId',
  'versionPinId',
  'platform',
  'externalId',
  'publishedAt',
  'contentDigest',
  'postSourceVersion',
];
const SOURCE_KEYS = [
  ...ASSOCIATION_KEYS,
  'finalizationId',
  'finalizationVersion',
  'approvalVersion',
];
const CONFIG = 'rl-reward-v1-experimental';
const RAW_HASH = /^[0-9a-f]{64}$/;
const PIN_HASH = /^sha256:v1:[0-9a-f]{64}$/;
function dataProperties(
  value: unknown,
  keys?: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== 'string') ||
    (keys &&
      (ownKeys.length !== keys.length ||
        ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))))
  )
    return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (!('value' in descriptor)) return null;
    const item: unknown = descriptor.value;
    Object.defineProperty(result, key, { value: item, enumerable: true });
  }
  return result;
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function id(value: unknown): value is string {
  return text(value, 256);
}
function platformValue(value: unknown): value is Platform {
  return Object.values(Platform).some((platform) => platform === value);
}
function rawHash(value: unknown): value is string {
  return typeof value === 'string' && RAW_HASH.test(value);
}
function pinHash(value: unknown): value is string {
  return typeof value === 'string' && PIN_HASH.test(value);
}
function canonicalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function realDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}
function invalidSource(): never {
  throw new BadRequestException('Invalid learning publication source');
}
function parseAssociation(
  value: unknown,
): LearningPublicationAssociationV1 | null {
  const row = dataProperties(value, ASSOCIATION_KEYS);
  if (!row) return null;
  const {
    version,
    organizationId,
    brandId,
    credentialId,
    postId,
    approvalId,
    approvalOperationId,
    versionPinId,
    platform,
    externalId,
    publishedAt,
    contentDigest,
    postSourceVersion,
  } = row;
  if (
    version !== 1 ||
    !id(organizationId) ||
    !id(brandId) ||
    !id(credentialId) ||
    !id(postId) ||
    !id(approvalId) ||
    !id(approvalOperationId) ||
    !id(versionPinId) ||
    !platformValue(platform) ||
    !text(externalId, 2048) ||
    !canonicalDate(publishedAt) ||
    !pinHash(contentDigest) ||
    !rawHash(postSourceVersion)
  )
    return null;
  return {
    version,
    organizationId,
    brandId,
    credentialId,
    postId,
    approvalId,
    approvalOperationId,
    versionPinId,
    platform,
    externalId,
    publishedAt,
    contentDigest,
    postSourceVersion,
  };
}
export function learningPublicationPostVersionV1(
  input: LearningPublicationPostVersionInputV1,
): string {
  const row = dataProperties(input, [
    'organizationId',
    'brandId',
    'credentialId',
    'postId',
    'platform',
    'externalId',
    'publishedAt',
    'description',
  ]);
  if (
    !row ||
    !id(row.organizationId) ||
    !id(row.brandId) ||
    !id(row.credentialId) ||
    !id(row.postId) ||
    !platformValue(row.platform) ||
    !text(row.externalId, 2048) ||
    !canonicalDate(row.publishedAt) ||
    !text(row.description, 65536)
  )
    invalidSource();
  return learningHash([
    'learning-publication-post-v1',
    row.organizationId,
    row.brandId,
    row.credentialId,
    row.postId,
    row.platform,
    row.externalId,
    row.publishedAt,
    'text',
    row.description,
  ]);
}
export function learningPublicationFinalizationVersionV1(
  input: LearningPublicationAssociationV1,
): string {
  const row = parseAssociation(input);
  if (!row) invalidSource();
  return learningHash([
    'learning-publication-finalization-v1',
    1,
    row.organizationId,
    row.brandId,
    row.credentialId,
    row.postId,
    row.approvalId,
    row.approvalOperationId,
    row.versionPinId,
    row.platform,
    row.externalId,
    row.publishedAt,
    row.contentDigest,
    row.postSourceVersion,
  ]);
}
export function parseLearningPublicationSourceV1(
  value: unknown,
): LearningPublicationSourceV1 | null {
  const row = dataProperties(value, SOURCE_KEYS);
  if (!row) return null;
  const association = parseAssociation({
    version: row.version,
    organizationId: row.organizationId,
    brandId: row.brandId,
    credentialId: row.credentialId,
    postId: row.postId,
    approvalId: row.approvalId,
    approvalOperationId: row.approvalOperationId,
    versionPinId: row.versionPinId,
    platform: row.platform,
    externalId: row.externalId,
    publishedAt: row.publishedAt,
    contentDigest: row.contentDigest,
    postSourceVersion: row.postSourceVersion,
  });
  if (
    !association ||
    !id(row.finalizationId) ||
    !rawHash(row.finalizationVersion) ||
    !rawHash(row.approvalVersion) ||
    row.finalizationVersion !==
      learningPublicationFinalizationVersionV1(association)
  )
    return null;
  return {
    ...association,
    finalizationId: row.finalizationId,
    finalizationVersion: row.finalizationVersion,
    approvalVersion: row.approvalVersion,
  };
}
export function learningPublicationDependencyRefsV1(
  input: LearningPublicationSourceV1,
): LearningDependencyRefV1[] {
  const source = parseLearningPublicationSourceV1(input);
  if (!source || !LEARNING_REGISTERED_CONFIG_VERSIONS.includes(CONFIG))
    invalidSource();
  const organizationId = source.organizationId;
  return [
    {
      kind: 'organization',
      id: source.organizationId,
      organizationId,
      version: source.organizationId,
    },
    {
      kind: 'brand',
      id: source.brandId,
      organizationId,
      version: source.brandId,
    },
    {
      kind: 'credential',
      id: source.credentialId,
      organizationId,
      version: source.credentialId,
    },
    {
      kind: 'post',
      id: source.postId,
      organizationId,
      version: source.postSourceVersion,
    },
    {
      kind: 'post_publish_finalization',
      id: source.finalizationId,
      organizationId,
      version: source.finalizationVersion,
    },
    {
      kind: 'publish_approval',
      id: source.approvalId,
      organizationId,
      version: source.approvalVersion,
    },
    {
      kind: 'content_version_pin',
      id: source.versionPinId,
      organizationId,
      version: source.contentDigest,
    },
    { kind: 'config', id: CONFIG, organizationId: null, version: CONFIG },
  ];
}
function supportedPost(post: LearningPublicationPostRow): boolean {
  return (
    !post.isDeleted &&
    post.targetExecutionState === TargetExecutionState.PUBLISHED &&
    post.visibility === PostVisibility.PUBLIC &&
    post.parentId === null &&
    post.format === PostFormat.STANDARD &&
    (post.category === PostCategory.TEXT ||
      post.category === PostCategory.POST) &&
    text(post.description, 65536) &&
    post._count.ingredients === 0 &&
    post._count.children === 0 &&
    Array.isArray(post.targetAttachments) &&
    post.targetAttachments.length === 0 &&
    post.quoteTweetId === null &&
    post.entityArticleId === null &&
    post.entityIngredientId === null &&
    post.entityModel === null &&
    id(post.brandId) &&
    id(post.credentialId) &&
    id(post.publishApprovalId) &&
    id(post.reviewVersionPinId) &&
    text(post.externalId, 2048) &&
    realDate(post.publishedAt)
  );
}
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
  if (
    !post ||
    post.id !== postId ||
    post.organizationId !== organizationId ||
    !supportedPost(post) ||
    !id(post.credentialId) ||
    !id(post.publishApprovalId) ||
    !id(post.reviewVersionPinId)
  )
    return null;
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, isDeleted: false },
    select: learningPublicationOrganizationSelect,
  });
  if (
    !organization ||
    organization.id !== organizationId ||
    organization.isDeleted
  )
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
  if (
    !brand ||
    brand.id !== post.brandId ||
    brand.organizationId !== organizationId ||
    brand.isDeleted ||
    !brand.isActive
  )
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
  if (
    !credential ||
    credential.id !== post.credentialId ||
    credential.organizationId !== organizationId ||
    credential.brandId !== post.brandId ||
    credential.isDeleted ||
    !credential.isConnected
  )
    return null;
  const platform = fromPrismaCredentialPlatform(credential.platform);
  if (
    !platform ||
    post.platform !== platform ||
    ![
      Platform.TWITTER,
      Platform.FACEBOOK,
      Platform.THREADS,
      Platform.LINKEDIN,
    ].includes(platform) ||
    !learningRegisteredProfiles(platform, 'text', 'engagement').length
  )
    return null;
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
    !approval ||
    approval.id !== post.publishApprovalId ||
    approval.organizationId !== organizationId ||
    approval.brandId !== post.brandId ||
    approval.postId !== postId ||
    approval.artifactVersionPinId !== post.reviewVersionPinId ||
    approval.invalidatedAt !== null ||
    !id(approval.operationId) ||
    !text(approval.scopeDigest, Number.MAX_SAFE_INTEGER) ||
    ![PublishApprovalStatus.EXECUTING, PublishApprovalStatus.PUBLISHED].some(
      (status) => approval.status === status,
    )
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
  if (
    !pin ||
    pin.id !== post.reviewVersionPinId ||
    pin.organizationId !== organizationId ||
    pin.brandId !== post.brandId ||
    pin.recordKind !== 'post' ||
    pin.recordId !== postId ||
    !pinHash(pin.contentDigest)
  )
    return null;
  return { post, approval, pin, platform };
}
function projectAssociation(
  context: NonNullable<Awaited<ReturnType<typeof readContext>>>,
): LearningPublicationAssociationV1 | null {
  const { post, approval, pin, platform } = context;
  if (
    !id(post.credentialId) ||
    !text(post.externalId, 2048) ||
    !realDate(post.publishedAt)
  )
    return null;
  return parseAssociation({
    version: 1,
    organizationId: post.organizationId,
    brandId: post.brandId,
    credentialId: post.credentialId,
    postId: post.id,
    approvalId: approval.id,
    approvalOperationId: approval.operationId,
    versionPinId: pin.id,
    platform,
    externalId: post.externalId,
    publishedAt: post.publishedAt.toISOString(),
    contentDigest: pin.contentDigest,
    postSourceVersion: learningPublicationPostVersionV1({
      organizationId: post.organizationId,
      brandId: post.brandId,
      credentialId: post.credentialId,
      postId: post.id,
      platform,
      externalId: post.externalId,
      publishedAt: post.publishedAt.toISOString(),
      description: post.description,
    }),
  });
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
  const association = projectAssociation(context);
  if (!association) return null;
  const finalization = await tx.postPublishFinalization.findFirst({
    where: { organizationId, postId },
    select: learningPublicationFinalizationSelect,
  });
  if (
    !finalization ||
    !id(finalization.id) ||
    finalization.organizationId !== organizationId ||
    finalization.postId !== postId
  )
    return null;
  const result = dataProperties(finalization.result);
  if (
    result?.success !== true ||
    result.isProviderDraft === true ||
    result.executionState !== TargetExecutionState.PUBLISHED ||
    result.platform !== context.platform ||
    result.externalId !== association.externalId
  )
    return null;
  const stored = parseAssociation(result.learningPublication);
  if (!stored || !isDeepStrictEqual(stored, association)) return null;
  return {
    ...association,
    finalizationId: finalization.id,
    finalizationVersion: learningPublicationFinalizationVersionV1(association),
    approvalVersion: learningHash([
      'learning-publication-approval-v1',
      organizationId,
      association.brandId,
      postId,
      context.approval.id,
      context.approval.operationId,
      context.pin.id,
      context.pin.contentDigest,
      context.approval.scopeDigest,
    ]),
  };
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
      derivedId: CONFIG,
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
