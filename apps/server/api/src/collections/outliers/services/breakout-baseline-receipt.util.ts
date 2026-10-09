import {
  buildArtifactContentDigest,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import {
  breakoutPublicationId,
  loadBreakoutPublication,
} from '@api/collections/outliers/services/breakout-publication-source.util';
import { isPlatform } from '@genfeedai/contracts';
import type {
  BreakoutBaselineReadInput,
  BreakoutBaselineReceiptResult,
  BreakoutExposureEvidence,
  BreakoutExposureMetric,
  BreakoutObservation,
  BreakoutPublicationSource,
} from '@genfeedai/contracts/interfaces';
import { evaluateComparableBreakout } from '@genfeedai/helpers';
import {
  type PostExposureObservation,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';

const MAX_CANDIDATE_ROWS = 2000;
const MAX_PRIOR_PUBLICATIONS = 50;
const FORMATS = [
  'text',
  'image',
  'carousel',
  'video',
  'short',
  'thread',
] as const;
const AVAILABILITIES = [
  'observed',
  'unavailable',
  'unauthorized',
  'expired',
  'failed',
] as const;
const EXPOSURE_SCOPES = ['organic', 'paid', 'aggregate', 'unknown'] as const;

function hash(value: unknown): string {
  return buildArtifactContentDigest({ evidence: value });
}
function observation(row: PostExposureObservation): BreakoutObservation | null {
  if (
    !isPlatform(row.platform) ||
    Boolean(row.postId) === Boolean(row.nativeSourcePostId)
  )
    return null;
  if (
    [
      row.publishedAt,
      row.requestStartedAt,
      row.receivedAt,
      ...(row.providerAsOf ? [row.providerAsOf] : []),
    ].some(
      (value) =>
        !(value instanceof Date) || !Number.isSafeInteger(value.getTime()),
    )
  )
    return null;
  const format = FORMATS.find((value) => value === row.format);
  if (!format) return null;
  const raw = readArtifactRecord(row.exposures);
  if (Object.keys(raw).some((key) => key !== 'views' && key !== 'impressions'))
    return null;
  const exposures: Partial<
    Record<BreakoutExposureMetric, BreakoutExposureEvidence>
  > = {};
  for (const metric of ['views', 'impressions'] as const) {
    if (raw[metric] === undefined) continue;
    const item = readArtifactRecord(raw[metric]);
    const availability = AVAILABILITIES.find(
      (value) => value === item.availability,
    );
    const scope = EXPOSURE_SCOPES.find((value) => value === item.scope);
    if (
      !availability ||
      !scope ||
      typeof item.source !== 'string' ||
      !item.source.trim() ||
      (availability === 'observed'
        ? typeof item.value !== 'number' ||
          !Number.isSafeInteger(item.value) ||
          item.value < 0
        : item.value !== null)
    )
      return null;
    const value = typeof item.value === 'number' ? item.value : null;
    exposures[metric] = { availability, scope, source: item.source, value };
  }
  if (
    row.exposures === null ||
    typeof row.exposures !== 'object' ||
    Array.isArray(row.exposures)
  )
    return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    brandId: row.brandId,
    credentialId: row.credentialId,
    platform: row.platform,
    format,
    logicalPostId: row.logicalPostId,
    sourceFingerprint: row.sourceFingerprint,
    contentDigest: row.contentDigest,
    publishedAtMs: row.publishedAt.getTime(),
    requestStartedAtMs: row.requestStartedAt.getTime(),
    receivedAtMs: row.receivedAt.getTime(),
    providerAsOfMs: row.providerAsOf?.getTime() ?? null,
    exposures,
    isPinned: row.isPinned,
    isPromoted: row.isPromoted,
    isResponse: row.isResponse,
    isDeleted: row.isDeleted,
    sourceValid: false,
  };
}
function inScope(
  row: PostExposureObservation,
  input: BreakoutBaselineReadInput,
): boolean {
  return (
    row.organizationId === input.organizationId &&
    row.brandId === input.brandId &&
    row.credentialId === input.credentialId &&
    row.platform === input.platform &&
    row.format === input.format &&
    !row.isDeleted
  );
}
function matchesPublication(
  row: PostExposureObservation,
  current: BreakoutPublicationSource | null,
): boolean {
  return (
    current !== null &&
    current.version === 1 &&
    current.organizationId === row.organizationId &&
    current.brandId === row.brandId &&
    current.credentialId === row.credentialId &&
    current.platform === row.platform &&
    current.format === row.format &&
    'postId' in current === Boolean(row.postId) &&
    breakoutPublicationId(current) === (row.postId ?? row.nativeSourcePostId) &&
    current.externalId === row.externalId &&
    current.logicalPostId === row.logicalPostId &&
    current.publishedAt === row.publishedAt.toISOString() &&
    current.contentDigest === row.contentDigest &&
    current.publicationFingerprint === row.publicationFingerprint &&
    current.isResponse === row.isResponse
  );
}
async function currentPublication(
  tx: Prisma.TransactionClient,
  row: PostExposureObservation,
) {
  if (!isPlatform(row.platform)) return null;
  return loadBreakoutPublication(tx, {
    organizationId: row.organizationId,
    brandId: row.brandId,
    credentialId: row.credentialId,
    platform: row.platform,
    postId: row.postId,
    nativeSourcePostId: row.nativeSourcePostId,
    externalId: row.externalId,
  });
}

/** Internal evidence operation. Run in a transaction; no paid work or publication is admitted here. */
export async function readBreakoutBaselineReceipt(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutBaselineReadInput>,
): Promise<BreakoutBaselineReceiptResult> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "post_exposure_observations"
    WHERE "id" = ${input.targetObservationId} AND "organizationId" = ${input.organizationId}
      AND "brandId" = ${input.brandId} AND "credentialId" = ${input.credentialId}
      AND "platform" = ${input.platform} AND "format" = ${input.format} AND "isDeleted" = false
    FOR SHARE
  `);
  const targetRow = await tx.postExposureObservation.findFirst({
    where: {
      id: input.targetObservationId,
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: input.credentialId,
      platform: input.platform,
      format: input.format,
      isDeleted: false,
    },
  });
  if (!targetRow) return { status: 'missing_target' };
  const target = observation(targetRow);
  if (
    !target ||
    targetRow.id !== input.targetObservationId ||
    !inScope(targetRow, input)
  )
    return { status: 'invalid_observation' };
  // Validate all window bounds before interpolating them into the database read.
  evaluateComparableBreakout({
    ...input,
    scope: input,
    target,
    observations: [],
    truncated: false,
  });
  if (target.receivedAtMs > input.nowMs)
    return { status: 'invalid_observation' };
  const lower = input.options.windowAgeMs - input.options.toleranceMs;
  const upper = input.options.windowAgeMs + input.options.toleranceMs;
  const rows = await tx.$queryRaw<PostExposureObservation[]>(Prisma.sql`
    SELECT o.* FROM "post_exposure_observations" o
    WHERE o."organizationId" = ${input.organizationId} AND o."brandId" = ${input.brandId}
      AND o."credentialId" = ${input.credentialId} AND o."platform" = ${input.platform}
      AND o."format" = ${input.format} AND o."isDeleted" = false
      AND o."logicalPostId" <> ${targetRow.logicalPostId} AND o."publishedAt" < ${targetRow.publishedAt}
      AND o."receivedAt" <= ${targetRow.receivedAt}
      AND EXTRACT(EPOCH FROM (COALESCE(o."providerAsOf", o."requestStartedAt") - o."publishedAt")) * 1000 >= ${lower}
      AND EXTRACT(EPOCH FROM (COALESCE(o."providerAsOf", o."receivedAt") - o."publishedAt")) * 1000 <= ${upper}
    ORDER BY o."publishedAt" DESC, o."id" ASC
    LIMIT ${MAX_CANDIDATE_ROWS + 1}
    FOR SHARE
  `);
  if (rows.some((row) => !inScope(row, input)))
    return { status: 'invalid_observation' };
  const priorPostIds = [
    ...new Set(
      rows.map((row) => JSON.stringify([row.postId, row.nativeSourcePostId])),
    ),
  ];
  const truncated =
    rows.length > MAX_CANDIDATE_ROWS ||
    priorPostIds.length > MAX_PRIOR_PUBLICATIONS;
  const relevant = [targetRow, ...(truncated ? [] : rows)];
  const postIds = [
    ...new Set(relevant.flatMap((row) => (row.postId ? [row.postId] : []))),
  ].sort();
  const nativeIds = [
    ...new Set(
      relevant.flatMap((row) =>
        row.nativeSourcePostId ? [row.nativeSourcePostId] : [],
      ),
    ),
  ].sort();
  if (postIds.length)
    await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "posts"
    WHERE "id" IN (${Prisma.join(postIds)}) AND "organizationId" = ${input.organizationId}
      AND "brandId" = ${input.brandId} AND "isDeleted" = false
    ORDER BY "id" FOR SHARE
  `);
  if (nativeIds.length)
    await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "source_posts" WHERE "id" IN (${Prisma.join(nativeIds)}) AND "organizationId" = ${input.organizationId}
      AND "brandId" = ${input.brandId} AND "isDeleted" = false ORDER BY "id" FOR SHARE
  `);
  const current = await currentPublication(tx, targetRow);
  if (!matchesPublication(targetRow, current))
    return { status: 'source_changed' };
  target.sourceValid = true;
  const candidates: BreakoutObservation[] = [];
  const currentByPost = new Map<string, BreakoutPublicationSource | null>();
  if (!truncated) {
    for (const row of rows) {
      const item = observation(row);
      if (!item) return { status: 'invalid_observation' };
      const referenceKey = JSON.stringify([row.postId, row.nativeSourcePostId]);
      if (!currentByPost.has(referenceKey))
        currentByPost.set(referenceKey, await currentPublication(tx, row));
      item.sourceValid = matchesPublication(
        row,
        currentByPost.get(referenceKey) ?? null,
      );
      candidates.push(item);
    }
  }
  const evaluation = evaluateComparableBreakout({
    ...input,
    scope: input,
    target,
    observations: candidates,
    truncated,
  });
  const optionsFingerprint = hash([
    'breakout-baseline-options-v2-provenance',
    input.options,
  ]);
  const idempotencyKey = hash([
    'breakout-baseline-receipt-v1',
    target.id,
    input.metric,
    optionsFingerprint,
  ]);
  const evidenceFingerprint = hash([
    'breakout-baseline-evidence-v1',
    input.organizationId,
    input.brandId,
    input.credentialId,
    input.platform,
    input.format,
    target,
    evaluation,
    candidates
      .map((row) => ({
        id: row.id,
        sourceFingerprint: row.sourceFingerprint,
        sourceValid: row.sourceValid,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    truncated
      ? { candidateRows: rows.length, priorPublications: priorPostIds.length }
      : null,
  ]);
  const inserted = await tx.breakoutBaselineReceipt.createMany({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: input.credentialId,
      targetObservationId: target.id,
      platform: input.platform,
      format: input.format,
      metric: input.metric,
      optionsFingerprint,
      evidenceFingerprint,
      idempotencyKey,
      evaluation: toPrismaJson(evaluation),
      evaluatedAt: targetRow.receivedAt,
    },
    skipDuplicates: true,
  });
  const retained = await tx.breakoutBaselineReceipt.findFirst({
    where: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: input.credentialId,
      idempotencyKey,
      isDeleted: false,
    },
    select: { id: true, evidenceFingerprint: true },
  });
  if (!retained || retained.evidenceFingerprint !== evidenceFingerprint)
    return { status: 'receipt_conflict' };
  return {
    status: inserted.count === 1 ? 'recorded' : 'replayed',
    receiptId: retained.id,
    evidenceFingerprint,
    evaluation,
  };
}
