import {
  buildArtifactContentDigest,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import {
  persistBreakoutExposureObservation,
  validBreakoutCollection,
} from '@api/collections/outliers/services/post-exposure-observation.util';
import type { CollectedSourcePost } from '@api/services/source-collector/source-collector.types';
import {
  fromPrismaCredentialPlatform,
  SocialSourceType,
} from '@genfeedai/contracts';
import type {
  BreakoutCaptureResult,
  BreakoutExposureEvidence,
  BreakoutExposureMetric,
  BreakoutNativeCaptureInput,
  BreakoutNativeMaterialInput,
  BreakoutNativePublicationSourceV1,
  BreakoutOwnedProviderAttempt,
  BreakoutPublicationReference,
  LearningFormat,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';

const formats: LearningFormat[] = [
  'text',
  'image',
  'carousel',
  'video',
  'short',
  'thread',
];
function digest(value: unknown): string {
  return buildArtifactContentDigest({ evidence: value });
}

/** Provider publication binding, not an acting principal or permission to publish. */
export async function loadNativeSourceExposurePublication(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutPublicationReference>,
): Promise<BreakoutNativePublicationSourceV1 | null> {
  if (input.postId !== null || !input.nativeSourcePostId) return null;
  const { organizationId, brandId, credentialId, platform, externalId } = input;
  const post = await tx.sourcePost.findFirst({
    where: {
      id: input.nativeSourcePostId,
      organizationId,
      brandId,
      platform,
      externalId,
      isDeleted: false,
    },
  });
  if (
    !post?.authorId ||
    !post.publishedAt ||
    !Number.isSafeInteger(post.publishedAt.getTime())
  )
    return null;
  const source = await tx.socialSource.findFirst({
    where: {
      id: post.sourceId,
      organizationId,
      brandId,
      credentialId,
      platform,
      sourceType: SocialSourceType.OWN_ACCOUNT,
      isDeleted: false,
    },
    select: { id: true },
  });
  const brand = await tx.brand.findFirst({
    where: { id: brandId, organizationId, isDeleted: false, isActive: true },
    select: { id: true },
  });
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, isDeleted: false },
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
    select: {
      externalId: true,
      platform: true,
      // Historical identity metadata only: the output link survives tombstones.
      // Never treat these related rows as current publication/actor authority.
      posts: {
        where: {
          organizationId,
          brandId,
          credentialId,
          platform,
          externalId,
          OR: [
            { breakoutOutputId: { not: null } },
            {
              parent: {
                is: {
                  organizationId,
                  brandId,
                  credentialId,
                  platform,
                  breakoutOutputId: { not: null },
                },
              },
            },
          ],
        },
        select: { breakoutOutputId: true },
        take: 1,
      },
    },
  });
  if (
    !source ||
    !organization ||
    !brand ||
    !credential ||
    credential.externalId !== post.authorId ||
    fromPrismaCredentialPlatform(credential.platform) !== platform
  )
    return null;
  const raw = readArtifactRecord(post.raw);
  const format = formats.find(
    (value) => value === (raw.nativeFormat ?? post.contentType),
  );
  if (!format) return null;
  const publishedAt = post.publishedAt.toISOString();
  const keys = raw.attachmentMediaKeys;
  if (
    keys !== undefined &&
    (!Array.isArray(keys) ||
      keys.some((key) => typeof key !== 'string' || !key))
  )
    return null;
  const contentDigest = nativeExposureContentDigest({
    attachmentMediaKeys: Array.isArray(keys)
      ? keys.filter((key): key is string => typeof key === 'string')
      : [],
    nativeFormat: formats.find((value) => value === raw.nativeFormat),
    text: post.text,
    mediaUrls: post.mediaUrls,
    contentType: post.contentType,
    authorId: post.authorId,
  });
  return {
    version: 1,
    sourceKind: 'native_source_post',
    sourcePostId: post.id,
    organizationId,
    brandId,
    credentialId,
    platform,
    externalId,
    format,
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
      'native-own-publication-v1',
      source.id,
      post.id,
      organizationId,
      brandId,
      credentialId,
      platform,
      externalId,
      post.authorId,
      publishedAt,
      contentDigest,
    ]),
    isResponse: credential.posts.length > 0,
  };
}
export async function captureNativeSourceExposureObservation(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutNativeCaptureInput>,
): Promise<BreakoutCaptureResult> {
  if (!validBreakoutCollection(input)) return { status: 'invalid_collection' };
  const source = input.source;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "source_posts" WHERE "id" = ${source.sourcePostId} AND "organizationId" = ${source.organizationId}
      AND "brandId" = ${source.brandId} AND "isDeleted" = false FOR SHARE
  `);
  const current = await loadNativeSourceExposurePublication(tx, {
    ...source,
    postId: null,
    nativeSourcePostId: source.sourcePostId,
  });
  if (!current || digest(current) !== digest(source))
    return { status: 'source_changed' };
  return persistBreakoutExposureObservation(tx, current, input);
}

export function nativeExposureContentDigest(
  material: Readonly<BreakoutNativeMaterialInput>,
): string {
  return digest({
    nativeFormat: material.nativeFormat ?? null,
    text: material.text,
    mediaUrls: material.mediaUrls,
    contentType: material.contentType,
    authorId: material.authorId,
    attachmentMediaKeys: material.attachmentMediaKeys,
  });
}

export async function prepareNativeCollectedExposure(
  tx: Prisma.TransactionClient,
  reference: Readonly<BreakoutPublicationReference>,
  attempt: Readonly<BreakoutOwnedProviderAttempt>,
  evidence: Readonly<CollectedSourcePost>,
): Promise<BreakoutNativeCaptureInput | null> {
  if (
    attempt.organizationId !== reference.organizationId ||
    attempt.brandId !== reference.brandId ||
    attempt.credentialId !== reference.credentialId ||
    attempt.platform !== reference.platform ||
    evidence.id !== reference.externalId ||
    evidence.isRepost ||
    !evidence.authorId ||
    !(evidence.createdAt instanceof Date) ||
    !Number.isSafeInteger(evidence.createdAt.getTime())
  )
    return null;
  const source = await loadNativeSourceExposurePublication(tx, reference);
  if (
    !source ||
    source.publishedAt !== evidence.createdAt.toISOString() ||
    source.contentDigest !==
      nativeExposureContentDigest({
        nativeFormat: evidence.nativeFormat,
        text: evidence.text ?? null,
        contentType: evidence.contentType ?? 'post',
        authorId: evidence.authorId,
        mediaUrls: evidence.mediaUrls ?? [],
        attachmentMediaKeys: evidence.attachmentMediaKeys ?? [],
      })
  )
    return null;
  const exposures: Partial<
    Record<BreakoutExposureMetric, BreakoutExposureEvidence>
  > = {};
  for (const metric of ['views', 'impressions'] as const) {
    const supplied = evidence.breakoutExposures?.[metric];
    const value = evidence.metrics?.[metric];
    exposures[metric] = supplied
      ? (attempt.provider !== 'brand-oauth' ||
          evidence.nativeAuthorVerified !== true) &&
        supplied.scope === 'organic'
        ? { ...supplied, scope: 'unknown' }
        : supplied
      : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? {
            availability: 'observed',
            value,
            scope: 'aggregate',
            source: `native:${attempt.provider}:${metric}`,
          }
        : {
            availability: 'unavailable',
            value: null,
            scope: 'unknown',
            source: `native:${attempt.provider}:${metric}`,
          };
  }
  return {
    source,
    ...attempt,
    exposures,
    providerAsOf: null,
    isPinned: evidence.isPinned ?? null,
    isPromoted: evidence.isPromoted ?? null,
  };
}
