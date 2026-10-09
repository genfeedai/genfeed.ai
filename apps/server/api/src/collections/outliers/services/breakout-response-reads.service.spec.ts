import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { BreakoutResponseReadsService } from '@api/collections/outliers/services/breakout-response-reads.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole, Platform } from '@genfeedai/contracts';
import type { BreakoutResponse, Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-publication-source.util',
  () => ({ loadBreakoutPublication: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-output-recovery.util',
  () => ({ readBreakoutOutputRecovery: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-live-capacity.util',
  () => ({ readBreakoutLiveCapacity: vi.fn() }),
);

const actor = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  actorId: 'user-a',
};
function fixture() {
  const now = new Date('2026-10-09T12:00:00Z');
  const response: BreakoutResponse = {
    id: 'response-a',
    organizationId: actor.organizationId,
    brandId: actor.brandId,
    credentialId: 'credential-a',
    platform: Platform.TWITTER,
    externalId: 'tweet-a',
    logicalPostId: 'logical-a',
    sourcePostId: null,
    nativeSourcePostId: 'native-a',
    triggerReceiptId: 'trigger-a',
    publicationFingerprint: 'publication-a',
    contentDigest: 'content-a',
    detectedAt: now,
    state: 'planned',
    heldReason: null,
    expiresAt: null,
    outputPlanFingerprint: 'plan-a',
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };
  const member = {
    role: { key: MemberRole.MEMBER },
    brands: [{ id: actor.brandId }],
  };
  const findMember = vi.fn(async (): Promise<typeof member | null> => member);
  const findResponse = vi.fn(
    async (): Promise<BreakoutResponse | null> => response,
  );
  const findResponses = vi.fn(async () => [response]);
  const slots = [{ id: 'output-a', ordinal: 1, kind: 'quote', format: 'text' }];
  const findOutputs = vi.fn(async () => slots);
  const receipt = {
    id: 'trigger-a',
    metric: 'impressions',
    format: 'text',
    evaluatedAt: now,
    evaluation: {
      status: 'breakout',
      ratio: 10,
      median: 100,
      sampleSize: 5,
      targetValue: 1000,
      source: 'twitter:post:organic_metrics.impression_count',
      exposureScope: 'organic' as
        | 'organic'
        | 'paid'
        | 'aggregate'
        | 'unknown'
        | undefined,
      timeBasis: 'collection_interval',
      prompts: 'must not escape',
      actorId: 'private-actor',
      costs: [{ value: 100 }],
    },
  };
  const findReceipt = vi.fn(
    async (): Promise<typeof receipt | null> => receipt,
  );
  const tx = {
    organization: {
      findFirst: vi.fn(async () => ({ id: actor.organizationId })),
    },
    brand: { findFirst: vi.fn(async () => ({ id: actor.brandId })) },
    member: { findFirst: findMember },
    breakoutResponse: {
      findFirst: findResponse,
      findMany: findResponses,
      count: vi.fn(async () => 1),
    },
    breakoutResponseOutput: { findMany: findOutputs },
    breakoutBaselineReceipt: { findFirst: findReceipt },
  } as unknown as Prisma.TransactionClient;
  const transaction = vi.fn(
    async <T>(work: (client: Prisma.TransactionClient) => Promise<T>) =>
      work(tx),
  );
  const service = new BreakoutResponseReadsService(
    { $transaction: transaction } as unknown as PrismaService,
    new BrandedGenerationReceiptAccessService(),
  );
  vi.mocked(loadBreakoutPublication).mockResolvedValue({
    version: 1,
    sourceKind: 'native_source_post',
    sourcePostId: 'native-a',
    organizationId: actor.organizationId,
    brandId: actor.brandId,
    credentialId: response.credentialId,
    platform: Platform.TWITTER,
    externalId: response.externalId,
    logicalPostId: response.logicalPostId,
    format: 'text',
    publishedAt: '2026-10-09T11:00:00Z',
    contentDigest: response.contentDigest,
    publicationFingerprint: response.publicationFingerprint,
    isResponse: false,
  });
  vi.mocked(readBreakoutOutputRecovery).mockResolvedValue({
    status: 'available',
    responseId: response.id,
    outputId: 'output-a',
    state: 'not_submitted',
    reason: 'not_dispatched',
    action: 'requires_admission',
    mayRepeatPaidRequest: false,
    postId: null,
    externalId: null,
  });
  return {
    service,
    tx,
    response,
    member,
    slots,
    receipt,
    findMember,
    findResponse,
    findResponses,
    findOutputs,
    findReceipt,
  };
}

describe('authorized bounded breakout status reads', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['organic', 'paid', 'aggregate', 'unknown', undefined] as const)(
    'exposes retained %s provenance without guessing legacy values',
    async (scope) => {
      const h = fixture();
      h.receipt.evaluation.exposureScope = scope;
      const view = await h.service.detail(actor, h.response.id);
      expect(view.trigger?.exposureScope).toBe(scope ?? null);
    },
  );

  it('checks the real manual membership/brand authority before reading retained status', async () => {
    const h = fixture();
    const view = await h.service.detail(actor, h.response.id);
    expect(h.findMember).toHaveBeenCalledWith({
      where: {
        userId: actor.actorId,
        organizationId: actor.organizationId,
        isDeleted: false,
        isActive: true,
      },
      include: { role: true, brands: { select: { id: true } } },
    });
    expect(h.findResponse).toHaveBeenCalledWith({
      where: {
        id: h.response.id,
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        isDeleted: false,
      },
    });
    expect(h.findMember.mock.invocationCallOrder[0]).toBeLessThan(
      h.findResponse.mock.invocationCallOrder[0],
    );
    expect(view).toMatchObject({
      source: { kind: 'native_source_post', id: 'native-a', status: 'current' },
      trigger: { ratio: 10, median: 100, sampleSize: 5 },
      outputRegistryStatus: 'current',
      outputs: [
        { recovery: { state: 'not_submitted', mayRepeatPaidRequest: false } },
      ],
      capacity: null,
    });
    expect(JSON.stringify(view)).not.toContain('must not escape');
    expect(view.trigger).not.toHaveProperty('actorId');
    expect(view.trigger).not.toHaveProperty('costs');
  });

  it('rejects missing membership or another assigned brand before response/source reads', async () => {
    const h = fixture();
    h.findMember.mockResolvedValueOnce(null);
    await expect(h.service.detail(actor, h.response.id)).rejects.toThrow(
      'receipt_access_denied',
    );
    h.member.brands = [{ id: 'other-brand' }];
    await expect(h.service.list(actor, {})).rejects.toThrow(
      'receipt_access_denied',
    );
    expect(h.findResponse).not.toHaveBeenCalled();
    expect(h.findResponses).not.toHaveBeenCalled();
    expect(loadBreakoutPublication).not.toHaveBeenCalled();
  });

  it('does not expose a foreign or deleted response', async () => {
    const h = fixture();
    h.findResponse.mockResolvedValue(null);
    await expect(h.service.detail(actor, 'foreign-response')).rejects.toThrow(
      'Breakout response',
    );
    expect(readBreakoutOutputRecovery).not.toHaveBeenCalled();
  });
  it.each([MemberRole.OWNER, MemberRole.ADMIN])(
    'consumes current unrestricted %s authority without pretending to grant it',
    async (role) => {
      const h = fixture();
      h.member.role.key = role;
      h.member.brands = [{ id: 'other-brand' }];
      expect((await h.service.detail(actor, h.response.id)).id).toBe(
        h.response.id,
      );
    },
  );

  it('bounds list reads and distinguishes omitted recovery from an empty plan', async () => {
    const h = fixture();
    const page = await h.service.list(actor, {
      page: 2,
      limit: 10,
      credentialId: 'credential-a',
    });
    expect(page).toMatchObject({
      page: 2,
      limit: 10,
      totalDocs: 1,
      docs: [{ outputs: null, outputRegistryStatus: 'not_loaded' }],
    });
    expect(h.findResponses).toHaveBeenCalledWith({
      where: {
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        isDeleted: false,
        credentialId: 'credential-a',
      },
      orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(readBreakoutOutputRecovery).not.toHaveBeenCalled();
    for (const query of [{ page: 0 }, { limit: 101 }, { page: 1.5 }])
      await expect(h.service.list(actor, query)).rejects.toThrow(
        'breakout_query_invalid',
      );
  });

  it('reports changed/unavailable sources and invalid trigger data without inferring expiry or causal lift', async () => {
    const h = fixture();
    vi.mocked(loadBreakoutPublication).mockResolvedValue(null);
    h.receipt.evaluation.sampleSize = -1;
    const view = await h.service.detail(actor, h.response.id);
    expect(view.source.status).toBe('changed_or_unavailable');
    expect(view.trigger).toBeNull();
    expect(view.state).toBe('planned');
    expect(view).not.toHaveProperty('lift');
  });

  it('reports an overfull/malformed output registry without silently hiding a sixth paid identity', async () => {
    const h = fixture();
    h.findOutputs.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        id: `output-${index}`,
        ordinal: index + 1,
        kind: 'follow_up',
        format: 'text',
      })),
    );
    const view = await h.service.detail(actor, h.response.id);
    expect(view).toMatchObject({
      outputRegistryStatus: 'conflict',
      outputs: [],
    });
    expect(h.findOutputs).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6 }),
    );
    expect(readBreakoutOutputRecovery).not.toHaveBeenCalled();
  });

  it('reads advisory capacity only for an explicitly selected scoped strategy', async () => {
    const h = fixture();
    vi.mocked(readBreakoutLiveCapacity).mockResolvedValue({
      status: 'held',
      reason: 'missing_strategy',
    });
    expect(
      (await h.service.detail(actor, h.response.id, 'strategy-a')).capacity,
    ).toEqual({ status: 'held', reason: 'missing_strategy' });
    expect(readBreakoutLiveCapacity).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        credentialId: h.response.credentialId,
        platform: Platform.TWITTER,
        strategyId: 'strategy-a',
      }),
    );
  });
});
