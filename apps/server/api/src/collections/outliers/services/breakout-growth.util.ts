import { readBreakoutObservation } from '@api/collections/outliers/services/breakout-baseline-receipt.util';
import { breakoutPublicationId } from '@api/collections/outliers/services/breakout-publication-source.util';
import type {
  BreakoutExposureMetric,
  BreakoutGrowthResult,
  BreakoutObservation,
  BreakoutPublicationSource,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

export const BREAKOUT_GROWTH_FRESHNESS_MS = 15 * 60_000;
export const BREAKOUT_GROWTH_MAX_SPACING_MS = 2 * 60 * 60_000;

function measurementTime(row: BreakoutObservation): number {
  return row.providerAsOfMs ?? (row.requestStartedAtMs + row.receivedAtMs) / 2;
}

/** Prospective growth only. Post age is never an expiry or a substitute for fresh evidence. */
export async function readBreakoutGrowth(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    source: BreakoutPublicationSource;
    metric: BreakoutExposureMetric;
    nowMs: number;
  }>,
): Promise<BreakoutGrowthResult> {
  if (!Number.isSafeInteger(input.nowMs))
    throw new RangeError('A valid growth snapshot time is required');
  const { source, metric, nowMs } = input;
  if (source.isResponse) return { status: 'held', reason: 'growth_faded' };
  const rows = await tx.postExposureObservation.findMany({
    where: {
      organizationId: source.organizationId,
      brandId: source.brandId,
      credentialId: source.credentialId,
      platform: source.platform,
      externalId: source.externalId,
      isDeleted: false,
    },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: 3,
  });
  if (rows.length < 2)
    return { status: 'held', reason: 'growth_evidence_unavailable' };
  const observations: BreakoutObservation[] = [];
  for (const row of rows) {
    const observation = readBreakoutObservation(row);
    if (
      !observation ||
      row.organizationId !== source.organizationId ||
      row.brandId !== source.brandId ||
      row.credentialId !== source.credentialId ||
      row.platform !== source.platform ||
      row.format !== source.format ||
      row.externalId !== source.externalId ||
      row.logicalPostId !== source.logicalPostId ||
      (row.postId ?? row.nativeSourcePostId) !==
        breakoutPublicationId(source) ||
      Boolean(row.postId) !== 'postId' in source ||
      row.publicationFingerprint !== source.publicationFingerprint ||
      row.contentDigest !== source.contentDigest ||
      row.publishedAt.toISOString() !== source.publishedAt ||
      row.isDeleted ||
      row.isResponse ||
      row.isPinned === true ||
      observation.requestStartedAtMs < observation.publishedAtMs ||
      observation.receivedAtMs < observation.requestStartedAtMs ||
      observation.receivedAtMs > nowMs ||
      (observation.providerAsOfMs !== null &&
        (observation.providerAsOfMs < observation.publishedAtMs ||
          observation.providerAsOfMs > observation.receivedAtMs))
    )
      return { status: 'held', reason: 'growth_measurements_incomparable' };
    observations.push(observation);
  }
  const latest = observations[0];
  if (nowMs - measurementTime(latest) > BREAKOUT_GROWTH_FRESHNESS_MS)
    return { status: 'held', reason: 'growth_evidence_stale' };
  const evidence = latest.exposures[metric];
  if (evidence?.availability !== 'observed' || evidence.value === null)
    return { status: 'held', reason: 'growth_evidence_unavailable' };
  const increments: number[] = [];
  const rates: number[] = [];
  for (let index = 1; index < observations.length; index += 1) {
    const newer = observations[index - 1];
    const older = observations[index];
    const newEvidence = newer.exposures[metric];
    const oldEvidence = older.exposures[metric];
    const spacing = measurementTime(newer) - measurementTime(older);
    if (
      newEvidence?.availability !== 'observed' ||
      oldEvidence?.availability !== 'observed' ||
      newEvidence.value === null ||
      oldEvidence.value === null ||
      newEvidence.scope !== evidence.scope ||
      oldEvidence.scope !== evidence.scope ||
      newEvidence.source !== evidence.source ||
      oldEvidence.source !== evidence.source ||
      (newer.providerAsOfMs === null) !== (older.providerAsOfMs === null) ||
      spacing <= 0 ||
      spacing > BREAKOUT_GROWTH_MAX_SPACING_MS ||
      (newer.providerAsOfMs === null &&
        newer.requestStartedAtMs < older.receivedAtMs) ||
      newEvidence.value < oldEvidence.value
    )
      return { status: 'held', reason: 'growth_measurements_incomparable' };
    const increment = newEvidence.value - oldEvidence.value;
    increments.push(increment);
    rates.push((increment * 3_600_000) / spacing);
  }
  if (increments[0] <= 0 || (rates.length > 1 && rates[0] < rates[1]))
    return { status: 'held', reason: 'growth_faded' };
  return {
    status: 'growing',
    observationIds: observations.map((row) => row.id),
    measuredAt: new Date(measurementTime(latest)).toISOString(),
    increment: increments[0],
    ratePerHour: rates[0],
    resumed: increments.length > 1 && increments[1] === 0,
  };
}
