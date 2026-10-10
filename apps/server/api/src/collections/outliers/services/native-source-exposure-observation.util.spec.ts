import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import {
  captureNativeSourceExposureObservation,
  loadNativeSourceExposurePublication,
  prepareNativeCollectedExposure,
} from '@api/collections/outliers/services/native-source-exposure-observation.util';
import type { CollectedSourcePost } from '@api/services/source-collector/source-collector.types';
import { Platform, SocialSourceType } from '@genfeedai/contracts';
import type {
  BreakoutOwnedProviderAttempt,
  BreakoutPublicationReference,
} from '@genfeedai/contracts/interfaces';
import type { LearningFormat } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { Prisma } from '@genfeedai/prisma';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reference: BreakoutPublicationReference = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  externalId: 'tweet-a',
  postId: null,
  nativeSourcePostId: 'native-a',
};
function fixture() {
  const evidence: CollectedSourcePost = {
    id: reference.externalId,
    platform: reference.platform,
    authorId: 'author-a',
    text: 'An original useful observation',
    contentType: 'tweet',
    nativeFormat: 'text',
    nativeAuthorVerified: true,
    attachmentMediaKeys: [],
    createdAt: new Date('2026-10-08T11:00:00Z'),
    isRepost: false,
    breakoutExposures: {
      impressions: {
        availability: 'observed',
        value: 0,
        scope: 'organic',
        source: 'twitter:post:organic_metrics.impression_count',
      },
    },
  };
  const post = {
    id: reference.nativeSourcePostId,
    sourceId: 'source-a',
    organizationId: reference.organizationId,
    brandId: reference.brandId,
    platform: reference.platform,
    externalId: reference.externalId,
    authorId: evidence.authorId,
    publishedAt: evidence.createdAt,
    text: evidence.text,
    contentType: evidence.contentType,
    mediaUrls: [] as string[],
    raw: { nativeFormat: 'text', attachmentMediaKeys: [] as string[] },
  };
  const attempt: BreakoutOwnedProviderAttempt = {
    organizationId: reference.organizationId,
    brandId: reference.brandId,
    credentialId: reference.credentialId,
    platform: reference.platform,
    provider: 'brand-oauth',
    sourceAttemptId: 'attempt-a',
    requestStartedAt: new Date('2026-10-08T12:00:00Z'),
    receivedAt: new Date('2026-10-08T12:00:01Z'),
  };
  const credential = {
    externalId: 'author-a',
    platform: 'TWITTER',
    posts: [] as { breakoutOutputId: string | null }[],
  };
  const findSource = vi.fn(
    async (): Promise<{ id: string } | null> => ({ id: 'source-a' }),
  );
  const findPost = vi.fn(async (): Promise<typeof post | null> => post);
  const findCredential = vi.fn(
    async (): Promise<typeof credential | null> => credential,
  );
  const findOrganization = vi.fn(
    async (): Promise<{ id: string } | null> => ({
      id: reference.organizationId,
    }),
  );
  const rows = new Map<string, Prisma.PostExposureObservationCreateManyInput>();
  const createMany = vi.fn(
    async ({
      data,
    }: {
      data: Prisma.PostExposureObservationCreateManyInput;
    }) => {
      if (rows.has(data.sourceAttemptId)) return { count: 0 };
      rows.set(data.sourceAttemptId, structuredClone(data));
      return { count: 1 };
    },
  );
  const tx = {
    $queryRaw: vi.fn(async () => []),
    sourcePost: { findFirst: findPost },
    socialSource: { findFirst: findSource },
    organization: { findFirst: findOrganization },
    brand: { findFirst: vi.fn(async () => ({ id: reference.brandId })) },
    credential: { findFirst: findCredential },
    postExposureObservation: {
      createMany,
      findFirst: vi.fn(
        async ({ where }: { where: { sourceAttemptId: string } }) => {
          const row = rows.get(where.sourceAttemptId);
          return row
            ? { id: 'observation-a', sourceFingerprint: row.sourceFingerprint }
            : null;
        },
      ),
    },
  } as unknown as Prisma.TransactionClient;
  async function collection() {
    const prepared = await prepareNativeCollectedExposure(
      tx,
      reference,
      attempt,
      evidence,
    );
    if (!prepared) throw new Error('Invalid native fixture');
    return prepared;
  }
  return {
    tx,
    post,
    evidence,
    attempt,
    credential,
    rows,
    createMany,
    findSource,
    findPost,
    findCredential,
    findOrganization,
    collection,
  };
}

describe('native own-account immutable exposure binding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:10:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('binds the actual provider author to the current connected own-account credential', async () => {
    const h = fixture();
    const source = await loadBreakoutPublication(h.tx, reference);
    expect(source).toMatchObject({
      sourceKind: 'native_source_post',
      sourcePostId: 'native-a',
      format: 'text',
      isResponse: false,
    });
    expect(source).not.toHaveProperty('postId');
    expect(source).not.toHaveProperty('actorId');
    expect(h.findSource).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'source-a',
          organizationId: reference.organizationId,
          brandId: reference.brandId,
          credentialId: reference.credentialId,
          platform: reference.platform,
          sourceType: SocialSourceType.OWN_ACCOUNT,
          isDeleted: false,
        },
      }),
    );
    expect(h.findCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: reference.credentialId,
          organizationId: reference.organizationId,
          brandId: reference.brandId,
          isDeleted: false,
          isConnected: true,
        },
      }),
    );
  });

  it.each([
    'text',
    'image',
    'carousel',
    'video',
    'short',
    'thread',
  ] as LearningFormat[])(
    'retains an explicit verified %s format without guessing another format',
    async (format) => {
      const h = fixture();
      h.post.raw.nativeFormat = format;
      h.evidence.nativeFormat = format;
      expect((await h.collection()).source.format).toBe(format);
    },
  );

  it('holds unknown native material format instead of treating a legacy tweet label as text', async () => {
    const h = fixture();
    h.post.raw.nativeFormat = 'unknown';
    h.evidence.nativeFormat = undefined;
    expect(
      await prepareNativeCollectedExposure(
        h.tx,
        reference,
        h.attempt,
        h.evidence,
      ),
    ).toBeNull();
  });

  it('captures observed zero once and forbids changing the same attempt evidence', async () => {
    const h = fixture();
    const input = await h.collection();
    expect(await captureNativeSourceExposureObservation(h.tx, input)).toEqual({
      status: 'captured',
      observationId: 'observation-a',
    });
    expect(await captureNativeSourceExposureObservation(h.tx, input)).toEqual({
      status: 'replayed',
      observationId: 'observation-a',
    });
    const row = [...h.rows.values()][0];
    expect(row).toMatchObject({
      postId: null,
      nativeSourcePostId: 'native-a',
      exposures: {
        impressions: { availability: 'observed', value: 0, scope: 'organic' },
      },
    });
    expect(
      await captureNativeSourceExposureObservation(h.tx, {
        ...input,
        exposures: {
          impressions: {
            availability: 'observed',
            value: 999,
            scope: 'organic',
            source: 'twitter:post:organic_metrics.impression_count',
          },
        },
      }),
    ).toEqual({ status: 'attempt_conflict' });
    expect(h.rows.size).toBe(1);
  });

  it.each(['app-bearer', 'app-api-key', 'apify', 'social-monitor'] as const)(
    'keeps %s fallback measurements from claiming organic authority',
    async (provider) => {
      const h = fixture();
      h.attempt.provider = provider;
      expect((await h.collection()).exposures.impressions).toMatchObject({
        availability: 'observed',
        value: 0,
        scope: 'unknown',
      });
    },
  );

  it('requires an actual author identifier for organic evidence rather than a username fallback', async () => {
    const h = fixture();
    h.evidence.nativeAuthorVerified = false;
    expect((await h.collection()).exposures.impressions?.scope).toBe('unknown');
    h.evidence.breakoutExposures = undefined;
    h.evidence.metrics = { impressions: 0 };
    expect((await h.collection()).exposures.impressions).toMatchObject({
      value: 0,
      scope: 'aggregate',
    });
    h.evidence.metrics = {};
    expect((await h.collection()).exposures.impressions).toMatchObject({
      availability: 'unavailable',
      value: null,
      scope: 'unknown',
    });
  });

  it.each(['organizationId', 'brandId', 'credentialId', 'platform'] as const)(
    'rejects a foreign attempt %s before resolving the publication',
    async (field) => {
      const h = fixture();
      expect(
        await prepareNativeCollectedExposure(
          h.tx,
          reference,
          { ...h.attempt, [field]: 'foreign' },
          h.evidence,
        ),
      ).toBeNull();
      expect(h.findPost).not.toHaveBeenCalled();
    },
  );

  it('holds wrong authors, deleted sources, disconnected credentials and deleted organizations', async () => {
    const h = fixture();
    h.credential.externalId = 'other-author';
    expect(
      await loadNativeSourceExposurePublication(h.tx, reference),
    ).toBeNull();
    h.credential.externalId = 'author-a';
    h.findSource.mockResolvedValueOnce(null);
    expect(
      await loadNativeSourceExposurePublication(h.tx, reference),
    ).toBeNull();
    h.findCredential.mockResolvedValueOnce(null);
    expect(
      await loadNativeSourceExposurePublication(h.tx, reference),
    ).toBeNull();
    h.findOrganization.mockResolvedValueOnce(null);
    expect(
      await loadNativeSourceExposurePublication(h.tx, reference),
    ).toBeNull();
  });

  it('rejects reposts, a mismatched external ID and provider material changed before persistence', async () => {
    const h = fixture();
    for (const evidence of [
      { ...h.evidence, isRepost: true },
      { ...h.evidence, id: 'other-tweet' },
      { ...h.evidence, text: 'Edited' },
      { ...h.evidence, createdAt: new Date('2026-10-08T11:01:00Z') },
    ]) {
      expect(
        await prepareNativeCollectedExposure(
          h.tx,
          reference,
          h.attempt,
          evidence,
        ),
      ).toBeNull();
    }
    const input = await h.collection();
    h.post.text = 'Changed after preparation';
    expect(await captureNativeSourceExposureObservation(h.tx, input)).toEqual({
      status: 'source_changed',
    });
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it.each(['root', 'thread_segment'] as const)(
    'retains %s response lineage from historical output links without treating tombstones as publication authority',
    async (kind) => {
      const h = fixture();
      h.credential.posts = [
        { breakoutOutputId: kind === 'root' ? 'output-a' : null },
      ];
      expect((await h.collection()).source.isResponse).toBe(true);
      expect(h.findCredential).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            posts: {
              where: {
                organizationId: reference.organizationId,
                brandId: reference.brandId,
                credentialId: reference.credentialId,
                platform: reference.platform,
                externalId: reference.externalId,
                OR: [
                  { breakoutOutputId: { not: null } },
                  {
                    parent: {
                      is: {
                        organizationId: reference.organizationId,
                        brandId: reference.brandId,
                        credentialId: reference.credentialId,
                        platform: reference.platform,
                        breakoutOutputId: { not: null },
                      },
                    },
                  },
                ],
              },
              select: { breakoutOutputId: true },
              take: 1,
            },
          }),
        }),
      );
    },
  );

  it('rejects two source references and invalid collection clocks without writing', async () => {
    const h = fixture();
    expect(
      await loadBreakoutPublication(h.tx, { ...reference, postId: 'post-a' }),
    ).toBeNull();
    const input = await h.collection();
    expect(
      await captureNativeSourceExposureObservation(h.tx, {
        ...input,
        receivedAt: new Date('2026-10-08T11:59:59Z'),
      }),
    ).toEqual({ status: 'invalid_collection' });
    expect(h.createMany).not.toHaveBeenCalled();
  });
});
