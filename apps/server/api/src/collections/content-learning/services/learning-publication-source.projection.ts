import { isDeepStrictEqual } from 'node:util';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  type LearningPublicationApprovalRow,
  type LearningPublicationAssociationV1,
  type LearningPublicationBrandRow,
  type LearningPublicationCredentialRow,
  type LearningPublicationFinalizationRow,
  type LearningPublicationOrganizationRow,
  type LearningPublicationPinRow,
  type LearningPublicationPostRow,
  type LearningPublicationPostVersionInputV1,
  type LearningPublicationSourceV1,
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
import { learningRegisteredProfiles } from '@genfeedai/harness';
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
export const LEARNING_PUBLICATION_CONFIG = 'rl-reward-v1-experimental';
const RAW_HASH = /^[0-9a-f]{64}$/;
const PIN_HASH = /^sha256:v1:[0-9a-f]{64}$/;
const keySets = new WeakMap<readonly string[], ReadonlySet<string>>();
function keySet(keys: readonly string[]) {
  let set = keySets.get(keys);
  if (!set) {
    set = new Set(keys);
    keySets.set(keys, set);
  }
  return set;
}
export function dataProperties(
  value: unknown,
  keys?: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const ownKeys = Reflect.ownKeys(value);
  const allowed = keys && keySet(keys);
  if (keys && ownKeys.length !== keys.length) return null;
  const result: Record<string, unknown> = {};
  for (const key of ownKeys) {
    if (typeof key !== 'string' || (allowed && !allowed.has(key))) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return null;
    // Plain assignment is safe except for the prototype setter on `__proto__`.
    if (key === '__proto__')
      Object.defineProperty(result, key, {
        value: descriptor.value,
        enumerable: true,
      });
    else result[key] = descriptor.value;
  }
  return result;
}
export function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
export function id(value: unknown): value is string {
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
export function realDate(value: unknown): value is Date {
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
  if (
    !source ||
    !LEARNING_REGISTERED_CONFIG_VERSIONS.includes(LEARNING_PUBLICATION_CONFIG)
  )
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
    {
      kind: 'config',
      id: LEARNING_PUBLICATION_CONFIG,
      organizationId: null,
      version: LEARNING_PUBLICATION_CONFIG,
    },
  ];
}
export function supportedPost(post: LearningPublicationPostRow): boolean {
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

export function learningPublicationPostEligible(
  post: LearningPublicationPostRow | null,
  organizationId: string,
  postId: string,
): post is LearningPublicationPostRow {
  return !(
    !post ||
    post.id !== postId ||
    post.organizationId !== organizationId ||
    !supportedPost(post) ||
    !id(post.credentialId) ||
    !id(post.publishApprovalId) ||
    !id(post.reviewVersionPinId)
  );
}

export function learningPublicationOrganizationEligible(
  organization: LearningPublicationOrganizationRow | null,
  organizationId: string,
): organization is LearningPublicationOrganizationRow {
  return !(
    !organization ||
    organization.id !== organizationId ||
    organization.isDeleted
  );
}

export function learningPublicationBrandEligible(
  brand: LearningPublicationBrandRow | null,
  organizationId: string,
  post: LearningPublicationPostRow,
): brand is LearningPublicationBrandRow {
  return !(
    !brand ||
    brand.id !== post.brandId ||
    brand.organizationId !== organizationId ||
    brand.isDeleted ||
    !brand.isActive
  );
}

export function learningPublicationCredentialEligible(
  credential: LearningPublicationCredentialRow | null,
  organizationId: string,
  post: LearningPublicationPostRow,
): credential is LearningPublicationCredentialRow {
  return !(
    !credential ||
    credential.id !== post.credentialId ||
    credential.organizationId !== organizationId ||
    credential.brandId !== post.brandId ||
    credential.isDeleted ||
    !credential.isConnected
  );
}

export function learningPublicationApprovalEligible(
  approval: LearningPublicationApprovalRow | null,
  organizationId: string,
  postId: string,
  post: LearningPublicationPostRow,
): approval is LearningPublicationApprovalRow {
  return !(
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
  );
}

export function learningPublicationPinEligible(
  pin: LearningPublicationPinRow | null,
  organizationId: string,
  postId: string,
  post: LearningPublicationPostRow,
): pin is LearningPublicationPinRow {
  return !(
    !pin ||
    pin.id !== post.reviewVersionPinId ||
    pin.organizationId !== organizationId ||
    pin.brandId !== post.brandId ||
    pin.recordKind !== 'post' ||
    pin.recordId !== postId ||
    !pinHash(pin.contentDigest)
  );
}

export function learningPublicationPlatform(
  post: LearningPublicationPostRow,
  credential: LearningPublicationCredentialRow,
): Platform | null {
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
  return platform;
}

export type LearningPublicationContextRowsV1 = {
  post: LearningPublicationPostRow | null;
  organization: LearningPublicationOrganizationRow | null;
  brand: LearningPublicationBrandRow | null;
  credential: LearningPublicationCredentialRow | null;
  approval: LearningPublicationApprovalRow | null;
  pin: LearningPublicationPinRow | null;
};
export type LearningPublicationSourceRowsV1 =
  LearningPublicationContextRowsV1 & {
    finalization: LearningPublicationFinalizationRow | null;
  };
export type LearningPublicationContextV1 = {
  post: LearningPublicationPostRow;
  approval: LearningPublicationApprovalRow;
  pin: LearningPublicationPinRow;
  platform: Platform;
};
export function projectLearningPublicationContextV1(
  organizationId: string,
  postId: string,
  rows: LearningPublicationContextRowsV1,
): LearningPublicationContextV1 | null {
  const { post, organization, brand, credential, approval, pin } = rows;
  if (
    !id(organizationId) ||
    !id(postId) ||
    !learningPublicationPostEligible(post, organizationId, postId)
  )
    return null;
  if (
    !learningPublicationOrganizationEligible(organization, organizationId) ||
    !learningPublicationBrandEligible(brand, organizationId, post) ||
    !learningPublicationCredentialEligible(credential, organizationId, post)
  )
    return null;
  const platform = learningPublicationPlatform(post, credential);
  if (
    !platform ||
    !learningPublicationApprovalEligible(
      approval,
      organizationId,
      postId,
      post,
    ) ||
    !learningPublicationPinEligible(pin, organizationId, postId, post)
  )
    return null;
  return { post, approval, pin, platform };
}
export function projectAssociation(
  context: LearningPublicationContextV1,
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
export function projectLearningPublicationSourceV1(
  organizationId: string,
  postId: string,
  rows: LearningPublicationSourceRowsV1,
): LearningPublicationSourceV1 | null {
  const context = projectLearningPublicationContextV1(
    organizationId,
    postId,
    rows,
  );
  if (!context || context.approval.status !== PublishApprovalStatus.PUBLISHED)
    return null;
  const association = projectAssociation(context);
  if (!association) return null;
  const finalization = rows.finalization;
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
