import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import {
  capturePostExposureObservation,
  loadPostExposurePublication,
  type PostExposureCollection,
  type PostExposureSourceInput,
} from '@api/collections/outliers/services/post-exposure-observation.util';
import {
  IngredientCategory,
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

const scope: PostExposureSourceInput = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  postId: 'post-a',
  externalId: 'tweet-a',
};
const publishedAt = new Date('2026-10-08T11:00:00Z');
const requestStartedAt = new Date('2026-10-08T12:00:00Z');
const receivedAt = new Date('2026-10-08T12:00:01Z');
function ingredient(id: string, category = IngredientCategory.IMAGE) {
  return {
    id,
    category,
    organizationId: scope.organizationId,
    brandId: scope.brandId,
    isDeleted: false,
    cdnUrl: `https://example.test/${id}`,
    s3Key: id,
    mimeType: category === IngredientCategory.VIDEO ? 'video/mp4' : 'image/png',
    fileSize: 100,
    version: 1,
  };
}
function harness() {
  const post = {
    ...scope,
    id: scope.postId,
    publishedAt,
    isDeleted: false,
    parentId: null,
    category: PostCategory.TEXT,
    format: PostFormat.STANDARD,
    visibility: PostVisibility.PUBLIC,
    targetExecutionState: TargetExecutionState.PUBLISHED,
    publishApprovalId: 'approval-a',
    reviewVersionPinId: 'pin-a',
    description: 'A confirmed original post',
    originalPostId: null,
    breakoutOutputId: null as string | null,
    quoteTweetId: null,
    order: 0,
    ingredients: [] as ReturnType<typeof ingredient>[],
    children: [] as Record<string, unknown>[],
  };
  const pin = { id: 'pin-a', contentDigest: '' };
  function pinCurrentMaterial() {
    pin.contentDigest = buildArtifactContentDigest({
      ...projectPostArtifactMaterial(readArtifactRecord(post)),
      children: post.children.map((child) =>
        projectPostArtifactMaterial(child),
      ),
    });
  }
  pinCurrentMaterial();
  const confirmed = {
    id: 'finalization-a',
    result: {
      success: true,
      executionState: TargetExecutionState.PUBLISHED,
      platform: Platform.TWITTER,
      externalId: scope.externalId,
    },
  };
  const rows = new Map<string, Prisma.PostExposureObservationCreateManyInput>();
  const query = vi.fn(async () => [{ id: post.id }]);
  const findPost = vi.fn(async () => post);
  const organization = vi.fn(async () => ({ id: scope.organizationId }));
  const brand = vi.fn(async () => ({ id: scope.brandId }));
  const credential = vi.fn(async () => ({
    id: scope.credentialId,
    platform: 'TWITTER',
  }));
  const approval = vi.fn(async () => ({
    id: 'approval-a',
    operationId: 'operation-a',
    scopeDigest: 'scope-a',
  }));
  const versionPin = vi.fn(async () => pin);
  const finalization = vi.fn(async () => confirmed);
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
  const findObservation = vi.fn(
    async ({ where }: { where: { sourceAttemptId: string } }) => {
      const row = rows.get(where.sourceAttemptId);
      return row && !row.isDeleted
        ? { id: 'observation-a', sourceFingerprint: row.sourceFingerprint }
        : null;
    },
  );
  const tx = {
    $queryRaw: query,
    post: { findFirst: findPost },
    organization: { findFirst: organization },
    brand: { findFirst: brand },
    credential: { findFirst: credential },
    publishApproval: { findFirst: approval },
    contentVersionPin: { findFirst: versionPin },
    postPublishFinalization: { findFirst: finalization },
    postExposureObservation: { createMany, findFirst: findObservation },
  } as unknown as Prisma.TransactionClient;
  async function collection(): Promise<PostExposureCollection> {
    const source = await loadPostExposurePublication(tx, scope);
    if (!source) throw new Error('Fixture publication is not eligible');
    return {
      source,
      sourceAttemptId: 'attempt-a',
      requestStartedAt,
      receivedAt,
      exposures: {
        impressions: {
          availability: 'observed',
          value: 0,
          source: 'organic_metrics.impression_count',
          scope: 'organic',
        },
      },
      isPinned: null,
      isPromoted: null,
    };
  }
  return {
    tx,
    post,
    pin,
    confirmed,
    rows,
    query,
    findPost,
    organization,
    brand,
    credential,
    approval,
    versionPin,
    finalization,
    createMany,
    findObservation,
    pinCurrentMaterial,
    collection,
  };
}

describe('prospective post exposure capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:10:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  it('resolves generated publications without passing native reference fields into the strict Post resolver', async () => {
    const h = harness();
    expect(
      await loadBreakoutPublication(h.tx, {
        ...scope,
        nativeSourcePostId: null,
      }),
    ).toEqual(await loadPostExposurePublication(h.tx, scope));
  });

  it('preserves generated-response lineage independently of ordinary quote fields', async () => {
    const h = harness();
    h.post.breakoutOutputId = 'output-a';
    const source = await loadPostExposurePublication(h.tx, scope);
    expect(source).toMatchObject({ isResponse: true });
  });

  it('binds confirmed material with explicit tenant, account and publication filters', async () => {
    const h = harness();
    const source = await loadPostExposurePublication(h.tx, scope);
    expect(source).toMatchObject({
      ...scope,
      version: 1,
      format: 'text',
      isResponse: false,
      publishedAt: publishedAt.toISOString(),
      contentDigest: h.pin.contentDigest,
    });
    expect(h.findPost).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: scope.postId,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          credentialId: scope.credentialId,
          isDeleted: false,
        },
      }),
    );
    expect(h.credential).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: scope.credentialId,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
          isConnected: true,
        },
      }),
    );
    expect(h.approval).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          postId: scope.postId,
          artifactVersionPinId: 'pin-a',
          status: 'published',
          invalidatedAt: null,
        }),
      }),
    );
  });
  it.each(['image', 'carousel', 'video', 'short', 'thread'] as const)(
    'keeps the %s format separate',
    async (format) => {
      const h = harness();
      if (format === 'image') h.post.ingredients = [ingredient('image-a')];
      if (format === 'carousel')
        h.post.ingredients = [ingredient('image-a'), ingredient('image-b')];
      if (format === 'video')
        h.post.ingredients = [
          ingredient('video-a', IngredientCategory.VIDEO),
          ingredient('cover-a'),
        ];
      if (format === 'short') h.post.category = PostCategory.REEL;
      if (format === 'thread') h.post.format = PostFormat.THREAD;
      h.pinCurrentMaterial();
      expect(await loadPostExposurePublication(h.tx, scope)).toMatchObject({
        format,
      });
    },
  );
  it('does not mistake an ordinary quote for a generated breakout response', async () => {
    const h = harness();
    Object.assign(h.post, { quoteTweetId: 'original-tweet' });
    h.pinCurrentMaterial();
    expect(await loadPostExposurePublication(h.tx, scope)).toMatchObject({
      isResponse: false,
    });
  });
  it.each([
    { description: 'Edited after publication' },
    { externalId: 'other-tweet' },
    { credentialId: 'other-account' },
    { organizationId: 'other-org' },
    { brandId: 'other-brand' },
    { isDeleted: true },
    { targetExecutionState: TargetExecutionState.PUBLISHING },
    { visibility: PostVisibility.PRIVATE },
  ])('rejects changed source %j', async (change) => {
    const h = harness(),
      input = await h.collection();
    Object.assign(h.post, change);
    expect(await capturePostExposureObservation(h.tx, input)).toEqual({
      status: 'source_changed',
    });
    expect(h.createMany).not.toHaveBeenCalled();
  });
  it('rejects changed media even when caption and external ID remain the same', async () => {
    const h = harness();
    h.post.ingredients = [ingredient('image-a')];
    h.pinCurrentMaterial();
    const input = await h.collection();
    h.post.ingredients[0].s3Key = 'changed-image';
    expect(await capturePostExposureObservation(h.tx, input)).toEqual({
      status: 'source_changed',
    });
    expect(h.createMany).not.toHaveBeenCalled();
  });
  it('rejects deleted and foreign media even when their material digest is unchanged', async () => {
    const h = harness();
    h.post.ingredients = [ingredient('image-a')];
    h.pinCurrentMaterial();
    h.post.ingredients[0].isDeleted = true;
    expect(await loadPostExposurePublication(h.tx, scope)).toBeNull();
    h.post.ingredients[0].isDeleted = false;
    h.post.ingredients[0].organizationId = 'foreign';
    expect(await loadPostExposurePublication(h.tx, scope)).toBeNull();
  });
  it('requires a provider-confirmed public result rather than a queued job', async () => {
    const h = harness();
    h.confirmed.result.executionState = TargetExecutionState.PUBLISHING;
    expect(await loadPostExposurePublication(h.tx, scope)).toBeNull();
  });
  it('appends observed zero and retains unknown promotion and pin flags', async () => {
    const h = harness(),
      input = await h.collection();
    expect(await capturePostExposureObservation(h.tx, input)).toEqual({
      status: 'captured',
      observationId: 'observation-a',
    });
    expect(h.query).toHaveBeenCalledOnce();
    expect(h.rows.get('attempt-a')).toMatchObject({
      exposures: input.exposures,
      isPinned: null,
      isPromoted: null,
      isResponse: false,
    });
  });
  it.each(['organic', 'paid', 'aggregate', 'unknown'] as const)(
    'persists and replays observed %s exposure without relabeling it',
    async (scope) => {
      const h = harness();
      const input = await h.collection();
      const impressions = input.exposures.impressions;
      if (!impressions) throw new Error('Missing fixture impressions');
      impressions.scope = scope;
      impressions.source = 'provider.impressions';
      input.isPromoted = scope === 'paid' ? true : null;
      expect(await capturePostExposureObservation(h.tx, input)).toEqual({
        status: 'captured',
        observationId: 'observation-a',
      });
      const retained = structuredClone(h.rows.get('attempt-a'));
      expect(retained).toMatchObject({
        exposures: input.exposures,
        isPromoted: input.isPromoted,
      });
      expect(await capturePostExposureObservation(h.tx, input)).toEqual({
        status: 'replayed',
        observationId: 'observation-a',
      });
      expect(h.rows.get('attempt-a')).toEqual(retained);
      impressions.scope = scope === 'organic' ? 'paid' : 'organic';
      expect(await capturePostExposureObservation(h.tx, input)).toEqual({
        status: 'attempt_conflict',
      });
      expect(h.rows.get('attempt-a')).toEqual(retained);
    },
  );
  it('replays an identical attempt without overwriting the original row', async () => {
    const h = harness(),
      input = await h.collection();
    await capturePostExposureObservation(h.tx, input);
    const before = structuredClone(h.rows.get('attempt-a'));
    expect(await capturePostExposureObservation(h.tx, input)).toEqual({
      status: 'replayed',
      observationId: 'observation-a',
    });
    expect(h.rows.size).toBe(1);
    expect(h.rows.get('attempt-a')).toEqual(before);
    const changed = structuredClone(input);
    const impressions = input.exposures.impressions;
    if (!impressions) throw new Error('Missing fixture impressions');
    changed.exposures.impressions = {
      ...impressions,
      value: 1000,
    };
    expect(await capturePostExposureObservation(h.tx, changed)).toEqual({
      status: 'attempt_conflict',
    });
    expect(h.rows.get('attempt-a')).toEqual(before);
  });
  it('returns one identity when competing calls meet an insert conflict', async () => {
    const h = harness(),
      input = await h.collection();
    const results = await Promise.all([
      capturePostExposureObservation(h.tx, input),
      capturePostExposureObservation(h.tx, input),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'captured',
      'replayed',
    ]);
    expect(h.rows.size).toBe(1);
  });
  it('retains unavailable exposure without converting it into observed zero', async () => {
    const h = harness(),
      input = await h.collection();
    input.exposures = {
      impressions: {
        availability: 'unauthorized',
        value: null,
        scope: 'unknown',
        source: 'organic_metrics.impression_count',
      },
    };
    await capturePostExposureObservation(h.tx, input);
    expect(h.rows.get('attempt-a')?.exposures).toEqual(input.exposures);
  });
  it.each(['before_publication', 'slow', 'future', 'invalid_count'] as const)(
    'rejects invalid collection %s',
    async (kind) => {
      const h = harness(),
        input = await h.collection();
      if (kind === 'before_publication')
        input.requestStartedAt = new Date(publishedAt.getTime() - 1);
      if (kind === 'slow')
        input.receivedAt = new Date(requestStartedAt.getTime() + 300_001);
      if (kind === 'future') input.receivedAt = new Date(Date.now() + 1);
      if (kind === 'invalid_count') {
        const impressions = input.exposures.impressions;
        if (!impressions) throw new Error('Missing fixture impressions');
        impressions.value = Number.NaN;
      }
      expect(await capturePostExposureObservation(h.tx, input)).toEqual({
        status: 'invalid_collection',
      });
      expect(h.query).not.toHaveBeenCalled();
      expect(h.createMany).not.toHaveBeenCalled();
    },
  );
  it('does not restore a soft-deleted observation on retry', async () => {
    const h = harness(),
      input = await h.collection();
    await capturePostExposureObservation(h.tx, input);
    const row = h.rows.get('attempt-a');
    if (!row) throw new Error('Missing fixture observation');
    row.isDeleted = true;
    expect(await capturePostExposureObservation(h.tx, input)).toEqual({
      status: 'attempt_conflict',
    });
    expect(h.rows.get('attempt-a')?.isDeleted).toBe(true);
  });
});
