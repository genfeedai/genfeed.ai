import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import {
  fromPrismaCredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostFormat,
  PostVisibility,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  BreakoutAnyCaptureInput,
  BreakoutCaptureInput,
  BreakoutCaptureResult,
  BreakoutPublicationSource,
  BreakoutPublicationSourceInput,
  BreakoutPublicationSourceV1,
} from '@genfeedai/contracts/interfaces';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';

const ingredientSelect = {
  category: true,
  cdnUrl: true,
  fileSize: true,
  id: true,
  organizationId: true,
  brandId: true,
  isDeleted: true,
  mimeType: true,
  s3Key: true,
  version: true,
} satisfies Prisma.IngredientSelect & { cdnUrl?: boolean }; // cdnUrl is a Prisma result extension
const postInclude = {
  ingredients: { select: ingredientSelect },
  children: {
    where: { isDeleted: false },
    include: { ingredients: { select: ingredientSelect } },
  },
} satisfies Prisma.PostInclude;
type ExposurePost = Prisma.PostGetPayload<{ include: typeof postInclude }>;
type PublicationClient = Pick<
  Prisma.TransactionClient,
  | 'post'
  | 'organization'
  | 'brand'
  | 'credential'
  | 'publishApproval'
  | 'contentVersionPin'
  | 'postPublishFinalization'
>;
export type PostExposureSourceInput = BreakoutPublicationSourceInput;
/** Prepared before collection and checked again inside the persistence transaction. */
export type PostExposurePublication = BreakoutPublicationSourceV1;
export type PostExposureCollection = BreakoutCaptureInput;
export type PostExposureCaptureResult = BreakoutCaptureResult;

function digest(value: unknown): string {
  return buildArtifactContentDigest({ evidence: value });
}
function validId(value: string): boolean {
  return value.length > 0 && value.length <= 2048 && value.trim() === value;
}
function validDate(value: Date): boolean {
  return value instanceof Date && Number.isSafeInteger(value.getTime());
}
function exposureFormat(post: ExposurePost): PostExposurePublication['format'] {
  if (post.format === PostFormat.THREAD || post.children.length > 0)
    return 'thread';
  if (post.category === PostCategory.REEL) return 'short';
  if (
    post.category === PostCategory.VIDEO ||
    post.ingredients.some(
      (item) =>
        item.category === IngredientCategory.VIDEO ||
        item.category === IngredientCategory.VIDEO_EDIT,
    )
  )
    return 'video';
  const images = post.ingredients.filter(
    (item) =>
      item.category === IngredientCategory.IMAGE ||
      item.category === IngredientCategory.IMAGE_EDIT,
  );
  if (images.length > 1) return 'carousel';
  if (
    post.category === PostCategory.IMAGE ||
    post.category === PostCategory.STORY ||
    images.length > 0
  )
    return 'image';
  return 'text';
}

/** This generic publication binding is independent of experimental learning eligibility. */
export async function loadPostExposurePublication(
  tx: PublicationClient,
  input: Readonly<PostExposureSourceInput>,
): Promise<PostExposurePublication | null> {
  if (Object.values(input).some((value) => !validId(value))) return null;
  const {
    organizationId,
    brandId,
    credentialId,
    platform,
    postId,
    externalId,
  } = input;
  const post = await tx.post.findFirst({
    where: {
      id: postId,
      organizationId,
      brandId,
      credentialId,
      isDeleted: false,
    },
    include: postInclude,
  });
  if (
    !post ||
    post.id !== postId ||
    post.organizationId !== organizationId ||
    post.brandId !== brandId ||
    post.credentialId !== credentialId ||
    post.isDeleted ||
    post.platform !== platform ||
    post.externalId !== externalId ||
    post.parentId !== null ||
    post.targetExecutionState !== TargetExecutionState.PUBLISHED ||
    post.visibility !== PostVisibility.PUBLIC ||
    !post.publishedAt ||
    !validDate(post.publishedAt) ||
    !post.publishApprovalId ||
    !post.reviewVersionPinId
  )
    return null;
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, isDeleted: false },
    select: { id: true },
  });
  const brand = await tx.brand.findFirst({
    where: { id: brandId, organizationId, isDeleted: false, isActive: true },
    select: { id: true },
  });
  const credential = await tx.credential.findFirst({
    where: {
      id: credentialId,
      organizationId,
      brandId,
      isDeleted: false,
      isConnected: true,
    },
    select: { id: true, platform: true },
  });
  if (
    !organization ||
    !brand ||
    !credential ||
    fromPrismaCredentialPlatform(credential.platform) !== platform
  )
    return null;
  const approval = await tx.publishApproval.findFirst({
    where: {
      id: post.publishApprovalId,
      organizationId,
      brandId,
      postId,
      artifactVersionPinId: post.reviewVersionPinId,
      status: PublishApprovalStatus.PUBLISHED,
      invalidatedAt: null,
    },
    select: { id: true, operationId: true, scopeDigest: true },
  });
  const pin = await tx.contentVersionPin.findFirst({
    where: {
      id: post.reviewVersionPinId,
      organizationId,
      brandId,
      recordKind: 'post',
      recordId: postId,
    },
    select: { id: true, contentDigest: true },
  });
  if (!approval || !pin) return null;
  if (
    [
      ...post.ingredients,
      ...post.children.flatMap((child) => child.ingredients),
    ].some(
      (item) =>
        !validId(item.id) ||
        item.isDeleted ||
        item.organizationId !== organizationId ||
        item.brandId !== brandId,
    ) ||
    post.children.some(
      (child) =>
        child.organizationId !== organizationId ||
        child.brandId !== brandId ||
        child.parentId !== postId,
    )
  )
    return null;
  const material = {
    ...projectPostArtifactMaterial(readArtifactRecord(post)),
    children: [...post.children]
      .sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id),
      )
      .map((child) => projectPostArtifactMaterial(readArtifactRecord(child))),
  };
  const contentDigest = buildArtifactContentDigest(material);
  if (contentDigest !== pin.contentDigest) return null;
  const finalization = await tx.postPublishFinalization.findFirst({
    where: { organizationId, postId },
    select: { id: true, result: true },
  });
  const confirmed = readArtifactRecord(finalization?.result);
  if (
    !finalization ||
    confirmed.success !== true ||
    confirmed.isProviderDraft === true ||
    confirmed.executionState !== TargetExecutionState.PUBLISHED ||
    confirmed.platform !== platform ||
    confirmed.externalId !== externalId
  )
    return null;
  const publishedAt = post.publishedAt.toISOString();
  return {
    ...input,
    version: 1,
    format: exposureFormat(post),
    publishedAt,
    contentDigest,
    logicalPostId: digest([
      'own-publication-v1',
      organizationId,
      credentialId,
      platform,
      externalId,
    ]),
    publicationFingerprint: digest([
      'post-exposure-publication-v1',
      input,
      publishedAt,
      contentDigest,
      approval.id,
      approval.operationId,
      approval.scopeDigest,
      pin.id,
      finalization.id,
      confirmed.platform,
      confirmed.externalId,
    ]),
    // The immutable output link survives response/output tombstones. Ordinary
    // quotes without this lineage remain independent eligible publications.
    isResponse: post.breakoutOutputId != null,
  };
}

export function validBreakoutCollection(
  input: Readonly<BreakoutAnyCaptureInput>,
): boolean {
  if (
    !validId(input.sourceAttemptId) ||
    input.sourceAttemptId.length > 256 ||
    !validDate(input.requestStartedAt) ||
    !validDate(input.receivedAt) ||
    (input.providerAsOf != null && !validDate(input.providerAsOf)) ||
    ![null, false, true].includes(input.isPinned) ||
    ![null, false, true].includes(input.isPromoted)
  )
    return false;
  const published = Date.parse(input.source.publishedAt);
  const started = input.requestStartedAt.getTime(),
    received = input.receivedAt.getTime();
  if (
    !Number.isSafeInteger(published) ||
    started < published ||
    received < started ||
    received - started > 300_000 ||
    received > Date.now() ||
    (input.providerAsOf != null &&
      (input.providerAsOf.getTime() < published ||
        input.providerAsOf.getTime() > received))
  )
    return false;
  return Object.entries(input.exposures).every(
    ([key, metric]) =>
      (key === 'views' || key === 'impressions') &&
      metric != null &&
      typeof metric === 'object' &&
      ['observed', 'unavailable', 'unauthorized', 'expired', 'failed'].includes(
        metric.availability,
      ) &&
      ['organic', 'paid', 'aggregate', 'unknown'].includes(metric.scope) &&
      typeof metric.source === 'string' &&
      validId(metric.source) &&
      (metric.availability === 'observed'
        ? typeof metric.value === 'number' &&
          Number.isSafeInteger(metric.value) &&
          metric.value >= 0
        : metric.value === null),
  );
}

/** Call in a transaction. An attempt cannot overwrite evidence or become a second observation. */
export async function capturePostExposureObservation(
  tx: Prisma.TransactionClient,
  input: Readonly<PostExposureCollection>,
): Promise<PostExposureCaptureResult> {
  if (!validBreakoutCollection(input)) return { status: 'invalid_collection' };
  const { source } = input;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "posts"
    WHERE "id" = ${source.postId} AND "organizationId" = ${source.organizationId}
      AND "brandId" = ${source.brandId} AND "isDeleted" = false
    FOR SHARE
  `);
  const current = await loadPostExposurePublication(tx, {
    organizationId: source.organizationId,
    brandId: source.brandId,
    credentialId: source.credentialId,
    platform: source.platform,
    postId: source.postId,
    externalId: source.externalId,
  });
  if (!current || digest(current) !== digest(source))
    return { status: 'source_changed' };
  return persistBreakoutExposureObservation(tx, current, input);
}

/** Persist only a source already revalidated under its row lock. */
export async function persistBreakoutExposureObservation(
  tx: Prisma.TransactionClient,
  current: Readonly<BreakoutPublicationSource>,
  input: Readonly<BreakoutAnyCaptureInput>,
): Promise<BreakoutCaptureResult> {
  const exposures = Object.fromEntries(
    Object.entries(input.exposures).map(([key, metric]) => [
      key,
      {
        availability: metric.availability,
        value: metric.value,
        source: metric.source,
        scope: metric.scope,
      },
    ]),
  );
  const fingerprint = digest([
    'post-exposure-observation-v1',
    current.publicationFingerprint,
    input.sourceAttemptId,
    input.requestStartedAt.toISOString(),
    input.receivedAt.toISOString(),
    input.providerAsOf?.toISOString() ?? null,
    ['views', 'impressions'].map((metric) => exposures[metric] ?? null),
    input.isPinned,
    input.isPromoted,
  ]);
  const where = {
    organizationId: current.organizationId,
    credentialId: current.credentialId,
    platform: current.platform,
    externalId: current.externalId,
    sourceAttemptId: input.sourceAttemptId,
  };
  const inserted = await tx.postExposureObservation.createMany({
    data: {
      ...where,
      brandId: current.brandId,
      postId: 'postId' in current ? current.postId : null,
      nativeSourcePostId:
        'sourcePostId' in current ? current.sourcePostId : null,
      format: current.format,
      logicalPostId: current.logicalPostId,
      contentDigest: current.contentDigest,
      publicationFingerprint: current.publicationFingerprint,
      publishedAt: new Date(current.publishedAt),
      sourceFingerprint: fingerprint,
      requestStartedAt: input.requestStartedAt,
      receivedAt: input.receivedAt,
      providerAsOf: input.providerAsOf ?? null,
      exposures: toPrismaJson(exposures),
      isPinned: input.isPinned,
      isPromoted: input.isPromoted,
      isResponse: current.isResponse,
    },
    skipDuplicates: true,
  });
  const stored = await tx.postExposureObservation.findFirst({
    where: { ...where, brandId: current.brandId, isDeleted: false },
    select: { id: true, sourceFingerprint: true },
  });
  if (!stored || stored.sourceFingerprint !== fingerprint)
    return { status: 'attempt_conflict' };
  return {
    status: inserted.count === 1 ? 'captured' : 'replayed',
    observationId: stored.id,
  };
}
