import { agentSourceKey } from '@api/collections/agent-strategies/sources/agent-source-candidates';
import { resolveAgentSourcePolicy } from '@api/collections/agent-strategies/sources/agent-source-policy';
import {
  type ReadSavedAdSourcesInput,
  readSavedAdSourcePage,
} from '@api/collections/agent-strategies/sources/agent-source-saved-ad-reader';
import type { PrismaClient, SavedAd } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const now = '2026-10-01T12:00:00.000Z';
const cutoff = '2026-09-24T12:00:00.000Z';
const scope = { organizationId: 'orgA', brandId: 'brandA' };
function input(
  extra: Partial<ReadSavedAdSourcesInput> = {},
): ReadSavedAdSourcesInput {
  return {
    scope,
    now,
    policy: resolveAgentSourcePolicy(undefined, 7 * 24 * 60 * 60 * 1000),
    blockedSourceKeys: new Set(),
    pagination: { pageSize: 2, maxPageSize: 10 },
    ...extra,
  };
}
function ad(id: string, extra: Partial<SavedAd> = {}): SavedAd {
  return {
    ...scope,
    id,
    userId: 'userA',
    source: 'my_accounts',
    platform: 'meta',
    sourceAdId: `external-${id}`,
    sourceRecordId: null,
    channel: 'all',
    credentialId: null,
    adAccountId: null,
    loginCustomerId: null,
    advertiserId: null,
    advertiserName: null,
    title: 'Opaque title',
    headline: null,
    body: null,
    cta: null,
    explanation: '',
    landingPageUrl: null,
    previewUrl: null,
    imageUrls: [],
    videoUrls: [],
    metrics: { engagement: 'untrusted', outlierRatio: 99999 },
    patternSummary: [],
    usagePolicy: 'remix_allowed',
    firstSeenAt: null,
    lastSeenAt: null,
    capturedAt: new Date(now),
    note: null,
    isDeleted: false,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...extra,
  };
}
function delegate(rows: SavedAd[] = []) {
  const findMany = vi
    .fn<PrismaClient['savedAd']['findMany']>()
    .mockResolvedValue(rows);
  return { findMany } satisfies Pick<PrismaClient['savedAd'], 'findMany'>;
}

describe('Saved-ad source reader', () => {
  it('queries only exact live remix scope and inclusive capturedAt interval with minimal projection', async () => {
    const savedAd = delegate([
      ad('internal', { capturedAt: new Date(cutoff) }),
    ]);
    const page = await readSavedAdSourcePage(savedAd, input());
    expect(savedAd.findMany).toHaveBeenCalledExactlyOnceWith({
      select: {
        id: true,
        organizationId: true,
        brandId: true,
        capturedAt: true,
        isDeleted: true,
        usagePolicy: true,
      },
      where: {
        ...scope,
        isDeleted: false,
        usagePolicy: 'remix_allowed',
        capturedAt: { gte: new Date(cutoff), lte: new Date(now) },
      },
      orderBy: [{ capturedAt: 'desc' }, { id: 'asc' }],
      take: 3,
    });
    expect(page.candidates).toEqual([
      {
        scope,
        sourceKind: 'saved_ad',
        sourceId: 'internal',
        selector: { kind: 'saved_ad', savedAdId: 'internal' },
        observedAt: cutoff,
        isDeleted: false,
        usageAllowed: true,
      },
    ]);
    expect(page).toMatchObject({
      scannedCount: 1,
      hasMore: false,
      nextCursor: null,
    });
    expect(Object.keys(savedAd)).toEqual(['findMany']);
  });
  it('reuses canonical filtering for foreign, deleted, stale and disallowed persisted rows', async () => {
    const rows = [
      ad('org', { organizationId: 'other' }),
      ad('brand', { brandId: 'other' }),
      ad('deleted', { isDeleted: true }),
      ad('disclosure', { usagePolicy: 'disclosure_only' }),
      ad('unknown', { usagePolicy: 'unknown' }),
      ad('stale', { capturedAt: new Date(Date.parse(cutoff) - 1) }),
      ad('allowed', { capturedAt: new Date(cutoff) }),
    ];
    const page = await readSavedAdSourcePage(
      delegate(rows),
      input({ pagination: { pageSize: 10, maxPageSize: 10 } }),
    );
    expect(page.candidates.map((candidate) => candidate.sourceId)).toEqual([
      'allowed',
    ]);
  });
  it('rejects a future row from a broken delegate instead of yielding an eligible source', async () => {
    await expect(
      readSavedAdSourcePage(
        delegate([ad('future', { capturedAt: new Date(Date.parse(now) + 1) })]),
        input(),
      ),
    ).rejects.toThrow('Future source timestamp');
  });
  it('skips persistence when saved ads are disabled and filters blocked membership', async () => {
    const savedAd = delegate([ad('blocked')]);
    const disabled = await readSavedAdSourcePage(
      savedAd,
      input({ policy: resolveAgentSourcePolicy({ enabledKinds: [] }, 1000) }),
    );
    expect(disabled).toEqual({
      candidates: [],
      scannedCount: 0,
      hasMore: false,
      nextCursor: null,
    });
    expect(savedAd.findMany).not.toHaveBeenCalled();
    const page = await readSavedAdSourcePage(
      savedAd,
      input({
        blockedSourceKeys: new Set([
          agentSourceKey({ sourceKind: 'saved_ad', sourceId: 'blocked' }),
        ]),
      }),
    );
    expect(page.candidates).toEqual([]);
  });
  it('continues equal timestamps by internal ID without skipping lookahead or blocked rows', async () => {
    const savedAd = delegate();
    savedAd.findMany
      .mockResolvedValueOnce([ad('a'), ad('b'), ad('c')])
      .mockResolvedValueOnce([ad('c'), ad('d')]);
    const request = input({
      blockedSourceKeys: new Set(['["saved_ad","a"]', '["saved_ad","b"]']),
    });
    const first = await readSavedAdSourcePage(savedAd, request);
    expect(first).toEqual({
      candidates: [],
      scannedCount: 2,
      hasMore: true,
      nextCursor: { capturedAt: now, id: 'b' },
    });
    const second = await readSavedAdSourcePage(savedAd, {
      ...request,
      pagination: {
        ...request.pagination,
        after: first.nextCursor ?? undefined,
      },
    });
    expect(savedAd.findMany.mock.calls[1]?.[0]?.where).toEqual({
      ...scope,
      isDeleted: false,
      usagePolicy: 'remix_allowed',
      capturedAt: { gte: new Date(cutoff), lte: new Date(now) },
      OR: [
        { capturedAt: { lt: new Date(now) } },
        { capturedAt: new Date(now), id: { gt: 'b' } },
      ],
    });
    expect(second.candidates.map((candidate) => candidate.sourceId)).toEqual([
      'c',
      'd',
    ]);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });
  it('returns immutable canonical candidates and captures scope, time and blocks before awaiting', async () => {
    const savedAd = delegate([ad('a'), ad('b'), ad('c')]);
    const blocks = new Set<string>();
    const request = input({ scope: { ...scope }, blockedSourceKeys: blocks });
    const pending = readSavedAdSourcePage(savedAd, request);
    Reflect.set(request.scope, 'brandId', 'evil');
    Reflect.set(request, 'now', 'invalid');
    blocks.add('["saved_ad","a"]');
    const page = await pending;
    expect(page.candidates.map((candidate) => candidate.sourceId)).toEqual([
      'a',
      'b',
    ]);
    expect(page.candidates[0]?.scope).toEqual(scope);
    for (const value of [
      page,
      page.candidates,
      page.candidates[0],
      page.candidates[0]?.scope,
      page.candidates[0]?.selector,
      page.nextCursor,
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });
  it('rejects malformed scope, time, freshness, pagination and cursors before all reads', async () => {
    const bad: unknown[] = [
      { scope: undefined },
      { scope: { organizationId: 'orgA' } },
      { scope: { ...scope, brandId: '' } },
      { scope: { ...scope, organizationId: 'org A' } },
      { now: NaN },
      { now: Infinity },
      { now: 'invalid' },
      { now: '2026-02-30T12:00:00Z' },
      ...[undefined, 0, -1, NaN, Infinity, 1e30].map((freshnessWindowMs) => ({
        policy: { ...input().policy, freshnessWindowMs },
      })),
      ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 11].map(
        (pageSize) => ({ pagination: { pageSize, maxPageSize: 10 } }),
      ),
      { pagination: undefined },
      { pagination: { pageSize: 1 } },
      { pagination: { pageSize: 1, maxPageSize: 0 } },
      {
        pagination: {
          pageSize: 1,
          maxPageSize: 10,
          after: { id: '', capturedAt: now },
        },
      },
      ...['invalid', '2026-10-02T12:00:00Z', '2026-09-24T11:59:59Z'].map(
        (capturedAt) => ({
          pagination: {
            pageSize: 1,
            maxPageSize: 10,
            after: { id: 'a', capturedAt },
          },
        }),
      ),
    ];
    for (const extra of bad) {
      const savedAd = delegate();
      await expect(
        readSavedAdSourcePage(savedAd, {
          ...input(),
          ...(extra as Partial<ReadSavedAdSourcesInput>),
        }),
      ).rejects.toThrow();
      expect(savedAd.findMany).not.toHaveBeenCalled();
    }
  });
  it('preserves persistence failures without claiming an empty eligible result', async () => {
    const savedAd = delegate();
    savedAd.findMany.mockRejectedValueOnce(new Error('unavailable'));
    await expect(readSavedAdSourcePage(savedAd, input())).rejects.toThrow(
      'unavailable',
    );
  });
});
