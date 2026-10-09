import { readArtifactRecord } from '@api/agent-artifacts/agent-artifact-material.util';
import { readBreakoutGrowth } from '@api/collections/outliers/services/breakout-growth.util';
import { Platform } from '@genfeedai/contracts';
import type { BreakoutPublicationSourceV1 } from '@genfeedai/contracts/interfaces';
import type { PostExposureObservation, Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const nowMs = Date.parse('2026-10-09T12:00:00Z');
const source: BreakoutPublicationSourceV1 = {
  version: 1,
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'account-a',
  platform: Platform.TWITTER,
  postId: 'post-a',
  externalId: 'external-a',
  logicalPostId: 'logical-a',
  format: 'text',
  publishedAt: '2026-09-01T00:00:00Z',
  contentDigest: 'digest-a',
  publicationFingerprint: 'publication-a',
  isResponse: false,
};
function fixture(values = [1300, 1000, 1000]) {
  const rows: PostExposureObservation[] = values.map((value, index) => ({
    id: `sample-${index}`,
    organizationId: source.organizationId,
    brandId: source.brandId,
    credentialId: source.credentialId,
    platform: source.platform,
    postId: source.postId,
    nativeSourcePostId: null,
    externalId: source.externalId,
    logicalPostId: source.logicalPostId,
    format: source.format,
    publishedAt: new Date(source.publishedAt),
    contentDigest: source.contentDigest,
    publicationFingerprint: source.publicationFingerprint,
    sourceAttemptId: `attempt-${index}`,
    sourceFingerprint: 'fingerprint-a',
    requestStartedAt: new Date(nowMs - index * 600_000 - 1000),
    receivedAt: new Date(nowMs - index * 600_000),
    providerAsOf: null,
    exposures: {
      views: {
        availability: 'observed',
        scope: 'unknown',
        source: 'post.views',
        value,
      },
    },
    isPinned: null,
    isPromoted: null,
    isResponse: false,
    isDeleted: false,
    createdAt: new Date(nowMs),
    updatedAt: new Date(nowMs),
  }));
  const findMany = vi.fn(async () => rows);
  const findComparison = vi.fn(
    async (
      _query: Prisma.BreakoutBaselineReceiptFindFirstArgs,
    ): Promise<{ evaluation: Prisma.JsonValue } | null> => {
      const exposure = readArtifactRecord(
        readArtifactRecord(rows[0].exposures).views,
      );
      return {
        evaluation: {
          version: 1,
          status: 'breakout',
          targetObservationId: rows[0].id,
          metric: 'views',
          source: String(exposure.source),
          exposureScope: String(exposure.scope),
          timeBasis: rows[0].providerAsOf
            ? 'provider_as_of'
            : 'collection_interval',
          targetValue: Number(exposure.value),
          median: 100,
          ratio: Number(exposure.value) / 100,
          sampleSize: 5,
        },
      };
    },
  );
  const tx = {
    postExposureObservation: { findMany },
    outlierConfiguration: { findFirst: vi.fn(async () => null) },
    breakoutBaselineReceipt: { findFirst: findComparison },
  } as unknown as Prisma.TransactionClient;
  const input = { source, metric: 'views' as const, nowMs };
  return { rows, findMany, findComparison, tx, input };
}
describe('fresh prospective breakout growth', () => {
  it('requires a fresh positive comparison under current policy instead of carrying a historic trigger forward', async () => {
    const h = fixture();
    h.findComparison.mockResolvedValueOnce(null);
    expect(await readBreakoutGrowth(h.tx, h.input)).toEqual({
      status: 'held',
      reason: 'growth_evidence_unavailable',
    });
    expect(h.findComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetObservationId: h.rows[0].id,
          metric: 'views',
          optionsFingerprint: expect.any(String),
          organizationId: source.organizationId,
          brandId: source.brandId,
          credentialId: source.credentialId,
          isDeleted: false,
        }),
      }),
    );
  });
  it.each([
    'scope',
    'provider',
    'value',
    'observation',
    'below_threshold',
  ] as const)('rejects a current comparison mismatch (%s)', async (reason) => {
    const h = fixture();
    h.findComparison.mockResolvedValueOnce({
      evaluation: {
        version: 1,
        status: reason === 'below_threshold' ? 'below_threshold' : 'breakout',
        targetObservationId:
          reason === 'observation' ? 'historic' : h.rows[0].id,
        metric: 'views',
        source: reason === 'provider' ? 'other' : 'post.views',
        exposureScope: reason === 'scope' ? 'organic' : 'unknown',
        timeBasis: 'collection_interval',
        targetValue: reason === 'value' ? 1400 : 1300,
        median: 100,
        ratio: 13,
        sampleSize: 5,
      },
    });
    expect(await readBreakoutGrowth(h.tx, h.input)).toEqual({
      status: 'held',
      reason: 'growth_evidence_unavailable',
    });
  });
  it('allows a month-old publication when fresh growth resumes, without an age expiry', async () => {
    const h = fixture();
    expect(await readBreakoutGrowth(h.tx, h.input)).toMatchObject({
      status: 'growing',
      increment: 300,
      ratePerHour: 1800,
      resumed: true,
      observationIds: ['sample-0', 'sample-1', 'sample-2'],
    });
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: source.organizationId,
          brandId: source.brandId,
          credentialId: source.credentialId,
          externalId: source.externalId,
          isDeleted: false,
        }),
        take: 3,
      }),
    );
  });
  it.each([{ values: [2000, 2000, 1000] }, { values: [2100, 2000, 1000] }])(
    'stops when growth is flat or its measured rate fades ($values)',
    async ({ values }) => {
      const h = fixture(values);
      expect(await readBreakoutGrowth(h.tx, h.input)).toEqual({
        status: 'held',
        reason: 'growth_faded',
      });
    },
  );
  it('requires another prospective measurement rather than using one cumulative outlier', async () => {
    const h = fixture([100000]);
    expect(await readBreakoutGrowth(h.tx, h.input)).toEqual({
      status: 'held',
      reason: 'growth_evidence_unavailable',
    });
  });
  it('holds stale latest evidence, even with a high lifetime count', async () => {
    const h = fixture();
    expect(
      await readBreakoutGrowth(h.tx, { ...h.input, nowMs: nowMs + 900_001 }),
    ).toEqual({ status: 'held', reason: 'growth_evidence_stale' });
  });
  it.each([
    'scope',
    'provider',
    'time_basis',
    'overlap',
    'regression',
    'material',
    'account',
    'response',
    'pinned',
    'unavailable',
  ] as const)('holds incomparable evidence (%s)', async (reason) => {
    const h = fixture();
    if (reason === 'scope')
      h.rows[1].exposures = {
        views: {
          availability: 'observed',
          scope: 'organic',
          source: 'post.views',
          value: 1000,
        },
      };
    if (reason === 'provider')
      h.rows[1].exposures = {
        views: {
          availability: 'observed',
          scope: 'unknown',
          source: 'other.views',
          value: 1000,
        },
      };
    if (reason === 'time_basis') h.rows[1].providerAsOf = h.rows[1].receivedAt;
    if (reason === 'overlap')
      h.rows[0].requestStartedAt = h.rows[1].requestStartedAt;
    if (reason === 'regression')
      h.rows[0].exposures = {
        views: {
          availability: 'observed',
          scope: 'unknown',
          source: 'post.views',
          value: 999,
        },
      };
    if (reason === 'material') h.rows[0].contentDigest = 'changed';
    if (reason === 'account') h.rows[0].credentialId = 'foreign';
    if (reason === 'response') h.rows[0].isResponse = true;
    if (reason === 'pinned') h.rows[0].isPinned = true;
    if (reason === 'unavailable')
      h.rows[1].exposures = {
        views: {
          availability: 'unavailable',
          scope: 'unknown',
          source: 'post.views',
          value: null,
        },
      };
    expect(await readBreakoutGrowth(h.tx, h.input)).toEqual({
      status: 'held',
      reason: 'growth_measurements_incomparable',
    });
  });
  it.each(['organic', 'paid', 'aggregate', 'unknown'])(
    'retains matching %s provenance as eligible',
    async (scope) => {
      const h = fixture();
      h.rows.forEach((row, index) => {
        row.isPromoted = true;
        row.exposures = {
          views: {
            availability: 'observed',
            scope,
            source: 'post.views',
            value: [1300, 1000, 1000][index],
          },
        };
      });
      expect(await readBreakoutGrowth(h.tx, h.input)).toMatchObject({
        status: 'growing',
      });
    },
  );
});
