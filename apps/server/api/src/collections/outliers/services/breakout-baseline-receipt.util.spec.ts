import { readBreakoutBaselineReceipt } from '@api/collections/outliers/services/breakout-baseline-receipt.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { Platform } from '@genfeedai/contracts';
import type {
  BreakoutBaselineReadInput,
  BreakoutPublicationSource,
} from '@genfeedai/contracts/interfaces';
import type { PostExposureObservation, Prisma } from '@genfeedai/prisma';

vi.mock(
  '@api/collections/outliers/services/breakout-publication-source.util',
  () => ({
    loadBreakoutPublication: vi.fn(),
    breakoutPublicationId: (source: BreakoutPublicationSource) =>
      'postId' in source ? source.postId : source.sourcePostId,
  }),
);

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 8, 12);
const input: BreakoutBaselineReadInput = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  format: 'text',
  targetObservationId: 'target',
  metric: 'impressions',
  nowMs: NOW + HOUR,
  options: {
    windowAgeMs: HOUR,
    toleranceMs: 600_000,
    windowSize: 20,
    minimumSampleSize: 5,
    breakoutThreshold: 10,
  },
};
function observation(id: string, index = 0): PostExposureObservation {
  const publishedAt = new Date(NOW - HOUR - index * 86_400_000);
  return {
    id,
    ...input,
    postId: `post-${id}`,
    nativeSourcePostId: null,
    externalId: `external-${id}`,
    logicalPostId: `logical-${id}`,
    publishedAt,
    contentDigest: `content-${id}`,
    publicationFingerprint: `publication-${id}`,
    sourceAttemptId: `attempt-${id}`,
    sourceFingerprint: `fingerprint-${id}`,
    requestStartedAt: new Date(publishedAt.getTime() + HOUR - 1000),
    receivedAt: new Date(publishedAt.getTime() + HOUR),
    providerAsOf: null,
    exposures: {
      impressions: {
        value: id === 'target' ? 1000 : 100,
        availability: 'observed',
        source: 'twitter:post:organic_metrics.impression_count',
        scope: 'organic',
      },
    },
    isPinned: null,
    isPromoted: null,
    isResponse: false,
    isDeleted: false,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}
function publication(row: PostExposureObservation): BreakoutPublicationSource {
  const identity = row.postId
    ? { postId: row.postId }
    : row.nativeSourcePostId
      ? {
          sourceKind: 'native_source_post' as const,
          sourcePostId: row.nativeSourcePostId,
        }
      : null;
  if (!identity) throw new Error('Missing fixture publication identity');
  return {
    ...identity,
    organizationId: row.organizationId,
    brandId: row.brandId,
    credentialId: row.credentialId,
    platform: Platform.TWITTER,
    format: 'text',
    externalId: row.externalId,
    version: 1,
    publishedAt: row.publishedAt.toISOString(),
    contentDigest: row.contentDigest,
    publicationFingerprint: row.publicationFingerprint,
    logicalPostId: row.logicalPostId,
    isResponse: row.isResponse,
  };
}
function harness() {
  const target = observation('target');
  let candidates = Array.from({ length: 5 }, (_, index) =>
    observation(`prior-${index}`, index + 1),
  );
  const bindings = new Map(
    [target, ...candidates].map((row) => [
      row.postId ?? row.nativeSourcePostId,
      publication(row),
    ]),
  );
  vi.mocked(loadBreakoutPublication).mockImplementation(
    async (_tx, scope) =>
      bindings.get(scope.postId ?? scope.nativeSourcePostId) ?? null,
  );
  const rows = new Map<string, Prisma.BreakoutBaselineReceiptCreateManyInput>();
  let queryIndex = 0;
  const query = vi.fn(async () => {
    queryIndex += 1;
    return queryIndex % 3 === 2 ? candidates : [];
  });
  const findTarget = vi.fn(
    async (): Promise<PostExposureObservation | null> => target,
  );
  const createMany = vi.fn(
    async ({
      data,
    }: {
      data: Prisma.BreakoutBaselineReceiptCreateManyInput;
    }) => {
      if (rows.has(data.idempotencyKey)) return { count: 0 };
      rows.set(data.idempotencyKey, structuredClone(data));
      return { count: 1 };
    },
  );
  const findReceipt = vi.fn(
    async ({ where }: { where: { idempotencyKey: string } }) => {
      const row = rows.get(where.idempotencyKey);
      return row && !row.isDeleted ? { ...row, id: 'receipt-a' } : null;
    },
  );
  const tx = {
    $queryRaw: query,
    postExposureObservation: { findFirst: findTarget },
    breakoutBaselineReceipt: { createMany, findFirst: findReceipt },
  } as unknown as Prisma.TransactionClient;
  return {
    tx,
    target,
    bindings,
    rows,
    query,
    findTarget,
    createMany,
    findReceipt,
    get candidates() {
      return candidates;
    },
    set candidates(value: PostExposureObservation[]) {
      candidates = value;
    },
  };
}

describe('bounded immutable breakout baseline receipts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('compares imported publications through the same immutable evidence receipt', async () => {
    const h = harness();
    h.bindings.clear();
    for (const row of [h.target, ...h.candidates]) {
      row.nativeSourcePostId = row.postId;
      row.postId = null;
      h.bindings.set(row.nativeSourcePostId, publication(row));
    }
    expect(await readBreakoutBaselineReceipt(h.tx, input)).toMatchObject({
      status: 'recorded',
      evaluation: { status: 'breakout', ratio: 10, sampleSize: 5 },
    });
    expect(loadBreakoutPublication).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        postId: null,
        nativeSourcePostId: h.target.nativeSourcePostId,
      }),
    );
  });

  it.each([false, true])(
    'rejects an observation with zero or two publication references (%s)',
    async (both) => {
      const h = harness();
      h.target.postId = both ? 'post-target' : null;
      h.target.nativeSourcePostId = both ? 'native-target' : null;
      expect(await readBreakoutBaselineReceipt(h.tx, input)).toEqual({
        status: 'invalid_observation',
      });
      expect(h.createMany).not.toHaveBeenCalled();
    },
  );

  it('retains the same-age baseline and retries to the same receipt without overwriting', async () => {
    const h = harness();
    const first = await readBreakoutBaselineReceipt(h.tx, input);
    expect(first).toMatchObject({
      status: 'recorded',
      receiptId: 'receipt-a',
      evaluation: { status: 'breakout', median: 100, ratio: 10, sampleSize: 5 },
    });
    const second = await readBreakoutBaselineReceipt(h.tx, input);
    expect(second).toEqual({ ...first, status: 'replayed' });
    expect(h.rows.size).toBe(1);
    expect(loadBreakoutPublication).toHaveBeenCalledTimes(12);
    expect(h.findTarget).toHaveBeenCalledWith({
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
    expect(h.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    const retained = [...h.rows.values()][0];
    expect(retained.evaluatedAt).toEqual(h.target.receivedAt);
    expect(retained.evaluation).toMatchObject({
      contributors: expect.arrayContaining([
        expect.objectContaining({
          observationId: 'prior-0',
          sourceFingerprint: 'fingerprint-prior-0',
        }),
      ]),
    });
  });

  it.each([
    'organizationId',
    'brandId',
    'credentialId',
    'platform',
    'format',
  ] as const)(
    'holds a foreign target %s before any source resolution or receipt write',
    async (field) => {
      const h = harness();
      Object.assign(h.target, { [field]: 'foreign' });
      expect(await readBreakoutBaselineReceipt(h.tx, input)).toEqual({
        status: 'invalid_observation',
      });
      expect(loadBreakoutPublication).not.toHaveBeenCalled();
      expect(h.createMany).not.toHaveBeenCalled();
    },
  );

  it('holds a missing target', async () => {
    const h = harness();
    h.findTarget.mockResolvedValueOnce(null);
    expect(await readBreakoutBaselineReceipt(h.tx, input)).toEqual({
      status: 'missing_target',
    });
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it.each([
    'contentDigest',
    'publicationFingerprint',
    'logicalPostId',
    'publishedAt',
  ] as const)(
    'holds changed target %s even when the observation still exists',
    async (field) => {
      const h = harness();
      const current = h.bindings.get(h.target.postId);
      if (!current) throw new Error('Missing fixture publication');
      current[field] =
        field === 'publishedAt' ? new Date(NOW).toISOString() : 'changed';
      expect(await readBreakoutBaselineReceipt(h.tx, input)).toEqual({
        status: 'source_changed',
      });
      expect(h.createMany).not.toHaveBeenCalled();
    },
  );

  it('excludes an edited prior publication from the baseline', async () => {
    const h = harness();
    h.bindings.delete(h.candidates[0].postId);
    expect(await readBreakoutBaselineReceipt(h.tx, input)).toMatchObject({
      status: 'recorded',
      evaluation: {
        status: 'insufficient_data',
        sampleSize: 4,
        exclusions: expect.arrayContaining([
          { observationId: 'prior-0', reasons: ['unverified_source'] },
        ]),
      },
    });
  });

  it('holds a changed baseline instead of overwriting the original receipt', async () => {
    const h = harness();
    const first = await readBreakoutBaselineReceipt(h.tx, input);
    const retained = structuredClone([...h.rows.values()]);
    h.bindings.delete(h.candidates[0].postId);
    expect(await readBreakoutBaselineReceipt(h.tx, input)).toEqual({
      status: 'receipt_conflict',
    });
    expect([...h.rows.values()]).toEqual(retained);
    expect(first.status).toBe('recorded');
  });

  it('does not revive a soft-deleted receipt on retry', async () => {
    const h = harness();
    await readBreakoutBaselineReceipt(h.tx, input);
    for (const row of h.rows.values()) row.isDeleted = true;
    expect(await readBreakoutBaselineReceipt(h.tx, input)).toEqual({
      status: 'receipt_conflict',
    });
    expect([...h.rows.values()][0].isDeleted).toBe(true);
  });

  it('withholds a positive signal at the 2000-row saturation boundary', async () => {
    const h = harness();
    h.candidates = Array.from({ length: 2001 }, (_, index) =>
      observation(`extra-${index}`, index + 1),
    );
    expect(await readBreakoutBaselineReceipt(h.tx, input)).toMatchObject({
      status: 'recorded',
      evaluation: { status: 'truncated', ratio: null, sampleSize: 0 },
    });
    expect(loadBreakoutPublication).toHaveBeenCalledTimes(1);
  });

  it('bounds canonical prior-source resolutions at fifty distinct posts', async () => {
    const h = harness();
    h.candidates = Array.from({ length: 51 }, (_, index) =>
      observation(`extra-${index}`, index + 1),
    );
    expect(await readBreakoutBaselineReceipt(h.tx, input)).toMatchObject({
      status: 'recorded',
      evaluation: { status: 'truncated', ratio: null },
    });
    expect(loadBreakoutPublication).toHaveBeenCalledTimes(1);
  });

  it('resolves a prior post once even with repeated measurements', async () => {
    const h = harness();
    h.candidates.push({
      ...h.candidates[0],
      id: 'repeated',
      sourceFingerprint: 'repeat-fingerprint',
    });
    expect(await readBreakoutBaselineReceipt(h.tx, input)).toMatchObject({
      status: 'recorded',
      evaluation: { status: 'breakout', sampleSize: 5 },
    });
    expect(loadBreakoutPublication).toHaveBeenCalledTimes(6);
  });

  it('holds malformed stored exposure rather than treating it as an observed zero', async () => {
    const h = harness();
    h.target.exposures = {
      impressions: { availability: 'observed', value: null },
    };
    expect(await readBreakoutBaselineReceipt(h.tx, input)).toEqual({
      status: 'invalid_observation',
    });
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it('retains unavailable views separately from an organic impression breakout', async () => {
    const h = harness();
    expect(
      await readBreakoutBaselineReceipt(h.tx, { ...input, metric: 'views' }),
    ).toMatchObject({
      status: 'recorded',
      evaluation: { status: 'invalid_target', targetValue: null, ratio: null },
    });
  });

  it('does not create a new receipt just because wall time advanced', async () => {
    const h = harness();
    await readBreakoutBaselineReceipt(h.tx, input);
    expect(
      await readBreakoutBaselineReceipt(h.tx, {
        ...input,
        nowMs: NOW + 2 * HOUR,
      }),
    ).toMatchObject({ status: 'replayed' });
    expect(h.rows.size).toBe(1);
  });
});
