import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerationLineReservationService } from '@api/collections/credits/services/generation-line-reservation.service';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import type { GenerationLineReservationIntent } from '@api/helpers/utils/credits/generation-line-reservation.schema';
import {
  buildGenerationLineReservationIntent,
  generationLineIdentity,
  generationLineReservationKey,
  initialGenerationLineMetadata,
  validateGenerationLineReservationIntent,
} from '@api/helpers/utils/credits/generation-line-reservation.util';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { usesMeteredCredits } from '@genfeedai/config';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import { MEDIA_GENERATION_GROUP_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  usesMeteredCredits: vi.fn(() => true),
}));
function intent() {
  const quoted = quoteModelBillablePricing(
    billableProfile({ cost: 3 }),
    { modelKey: 'test/model', provider: 'replicate', requests: 1, outputs: 1 },
    1,
    '2026-09-30T00:00:00.000Z',
  );
  if (quoted.status !== 'priced') throw new Error(quoted.reason);
  const owner: GenerationLineReservationIntent['owner'] = {
    kind: 'storyboard-line',
    organizationId: 'org-a',
    brandId: 'brand-a',
    runId: 'run-a',
    operationId: 'operation-a',
    lineKey: 'shot-1',
    attempt: 1,
    actorUserId: 'user-a',
    quoteId: 'quote-a',
    sourceActionId: '',
    preparedHash: 'a'.repeat(64),
  };
  owner.sourceActionId = `storyboard-line-v1:${generationLineIdentity(owner)}`;
  return buildGenerationLineReservationIntent({
    version: 1,
    owner,
    modelQuote: quoted.snapshot,
    source: ActivitySource.IMAGE_GENERATION,
    description: 'Synthetic frozen line',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
}
function fixture() {
  const prepared = intent();
  function row() {
    return {
      id: 'hold-a',
      organizationId: prepared.owner.organizationId,
      actorUserId: prepared.owner.actorUserId,
      amount: prepared.modelQuote.credits,
      settledAmount: null as number | null,
      status: CreditReservationStatus.RESERVED,
      idempotencyKey: generationLineReservationKey(prepared),
      workloadId: prepared.owner.sourceActionId,
      workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
      description: prepared.description,
      source: prepared.source,
      metadata: initialGenerationLineMetadata(prepared) as Record<
        string,
        unknown
      >,
      expiresAt: new Date(prepared.expiresAt),
    };
  }
  let stored: ReturnType<typeof row> | null = null;
  let debits = 0;
  const reserveCredits = vi.fn(async () => {
    if (!stored) {
      stored = row();
      debits += prepared.modelQuote.credits;
    }
    return {
      ...structuredClone(stored),
      expiresAt: stored.expiresAt.toISOString(),
    };
  });
  const prisma = {
    creditReservation: {
      findFirst: vi.fn(async () => structuredClone(stored)),
      updateMany: vi.fn(
        async (input: { data: { metadata: Record<string, unknown> } }) => {
          if (stored) stored.metadata = input.data.metadata;
          return { count: 1 };
        },
      ),
    },
    $queryRaw: vi.fn(async () => []),
    ingredient: { updateMany: vi.fn() },
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) =>
      run(prisma),
    ),
  };
  const service = new GenerationLineReservationService(
    { reserveCredits } as unknown as CreditsUtilsService,
    prisma as unknown as PrismaService,
  );
  return {
    prepared,
    service,
    reserveCredits,
    prisma,
    row,
    seed: () => {
      stored = row();
      return stored;
    },
    read: () => stored,
    debits: () => debits,
    tx: prisma as unknown as Prisma.TransactionClient,
  };
}
beforeEach(() => {
  vi.mocked(usesMeteredCredits).mockReturnValue(true);
});
describe('stable positive frozen media-line funding', () => {
  it('uses one deterministic existing group hold and does not authorize submission', async () => {
    const f = fixture();
    expect(await f.service.reserveOrRecover(f.prepared)).toMatchObject({
      status: 'reserved',
      attachment: 'preparing',
      reservationId: 'hold-a',
      dispatchClosed: false,
    });
    expect(f.reserveCredits).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        amount: 3,
        idempotencyKey: generationLineReservationKey(f.prepared),
        workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
        workloadId: f.prepared.owner.sourceActionId,
        expiresAt: new Date(f.prepared.expiresAt),
        metadata: initialGenerationLineMetadata(f.prepared),
      }),
    );
    expect(f.debits()).toBe(3);
  });
  it('recovers the crash gap and concurrent retries through the same identity without a new debit', async () => {
    const f = fixture();
    const attempts = await Promise.all([
      f.service.reserveOrRecover(f.prepared),
      f.service.reserveOrRecover(f.prepared),
    ]);
    expect(attempts.map((a) => a.status)).toEqual(['reserved', 'reserved']);
    expect(f.debits()).toBe(3);
    const count = f.reserveCredits.mock.calls.length;
    expect(await f.service.readRecovery(f.prepared)).toMatchObject({
      status: 'reserved',
      attachment: 'preparing',
    });
    await f.service.reserveOrRecover(f.prepared);
    expect(f.reserveCredits).toHaveBeenCalledTimes(count);
  });
  it('read-only recovery cannot create missing funding', async () => {
    const f = fixture();
    expect(await f.service.readRecovery(f.prepared)).toEqual({
      status: 'missing',
    });
    expect(f.reserveCredits).not.toHaveBeenCalled();
  });
  it('cannot renew expired missing admission and recovers existing expired identity without reserve', async () => {
    const f = fixture();
    const old = { ...f.prepared, expiresAt: '2026-01-01T00:00:00.000Z' };
    const { intentHash: _, ...input } = old;
    const expired = buildGenerationLineReservationIntent(input);
    await expect(f.service.reserveOrRecover(expired)).rejects.toThrow();
    expect(f.reserveCredits).not.toHaveBeenCalled();
    const row = f.seed();
    row.expiresAt = new Date(expired.expiresAt);
    row.metadata = initialGenerationLineMetadata(expired);
    expect(await f.service.reserveOrRecover(expired)).toMatchObject({
      status: 'reserved',
      expiresAt: expired.expiresAt,
    });
    await expect(
      f.service.attachInTransaction(f.tx, {
        intent: expired,
        reservationId: row.id,
      }),
    ).rejects.toThrow();
    expect(f.reserveCredits).not.toHaveBeenCalled();
  });
  it.each([
    CreditReservationStatus.RELEASED,
    CreditReservationStatus.EXPIRED,
    CreditReservationStatus.SETTLED,
  ])('recovers terminal %s without a random retry hold', async (status) => {
    const f = fixture();
    const row = f.seed();
    row.status = status;
    if (status === CreditReservationStatus.SETTLED) row.settledAmount = 2;
    const result = await f.service.reserveOrRecover(f.prepared);
    expect(result.status).toBe(
      status === CreditReservationStatus.SETTLED ? 'settled' : 'ended',
    );
    expect(f.reserveCredits).not.toHaveBeenCalled();
    await expect(
      f.service.attachInTransaction(f.tx, {
        intent: f.prepared,
        reservationId: row.id,
      }),
    ).rejects.toThrow();
  });
  it.each([
    'actorUserId',
    'organizationId',
    'workloadId',
    'workloadType',
    'idempotencyKey',
    'description',
    'source',
    'amount',
    'expiresAt',
  ])(
    'rejects immutable reservation mismatch %s without creating a substitute',
    async (key) => {
      const f = fixture();
      const row = f.seed();
      const raw: Record<string, unknown> = row;
      raw[key] =
        key === 'amount'
          ? 100
          : key === 'expiresAt'
            ? new Date('2027-01-01')
            : 'changed';
      await expect(f.service.reserveOrRecover(f.prepared)).rejects.toThrow();
      expect(f.reserveCredits).not.toHaveBeenCalled();
    },
  );
  it('rejects changed frozen quote and missing explicit group evidence', async () => {
    const f = fixture();
    const row = f.seed();
    const modified = structuredClone(f.prepared.modelQuote);
    modified.rateVersion = 'changed';
    row.metadata.modelQuote = modified;
    await expect(f.service.readRecovery(f.prepared)).rejects.toThrow();
    row.metadata = initialGenerationLineMetadata(f.prepared);
    delete row.metadata.boundOutputIds;
    await expect(f.service.readRecovery(f.prepared)).rejects.toThrow();
  });
  it('constructs a nondeferred completion request from locked persisted funding; attachment retry is identical', async () => {
    const f = fixture();
    f.seed();
    const request = await f.service.attachInTransaction(f.tx, {
      intent: f.prepared,
      reservationId: 'hold-a',
    });
    expect(request).toMatchObject({
      creditsConfig: {
        amount: 3,
        modelQuote: f.prepared.modelQuote,
        reservationId: 'hold-a',
        settlement: 'completion',
        deferred: false,
        isByokBypass: false,
      },
      user: {
        id: 'user-a',
        userId: 'user-a',
        organizationId: 'org-a',
        brandId: 'brand-a',
      },
    });
    expect(f.read()?.metadata.lineFunding).toMatchObject({
      attachment: 'attached',
    });
    expect(
      await f.service.attachInTransaction(f.tx, {
        intent: f.prepared,
        reservationId: 'hold-a',
      }),
    ).toEqual(request);
    expect(f.prisma.creditReservation.updateMany).toHaveBeenCalledTimes(1);
  });
  it('rejects stale attachment CAS without returning a billing request', async () => {
    const f = fixture();
    f.seed();
    f.prisma.creditReservation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      f.service.attachInTransaction(f.tx, {
        intent: f.prepared,
        reservationId: 'hold-a',
      }),
    ).rejects.toThrow();
  });
  it('cannot attach after group closure', async () => {
    const f = fixture();
    f.seed().metadata.dispatchClosed = true;
    await expect(
      f.service.attachInTransaction(f.tx, {
        intent: f.prepared,
        reservationId: 'hold-a',
      }),
    ).rejects.toThrow();
    expect(f.prisma.creditReservation.updateMany).not.toHaveBeenCalled();
  });
  it('rejects OSS funding before the infinite stub can synthesize a hold', async () => {
    const f = fixture();
    vi.mocked(usesMeteredCredits).mockReturnValue(false);
    await expect(f.service.reserveOrRecover(f.prepared)).rejects.toThrow();
    expect(f.reserveCredits).not.toHaveBeenCalled();
  });
  it('requires actual persisted evidence even when the credits client returns an id', async () => {
    const f = fixture();
    const row = f.row();
    f.reserveCredits.mockImplementation(async () => ({
      ...row,
      expiresAt: row.expiresAt.toISOString(),
    }));
    await expect(f.service.reserveOrRecover(f.prepared)).rejects.toThrow();
  });
});
describe('whole frozen intent validation', () => {
  it('accepts and preserves an actual frozen reviewed conditional-rate quote', () => {
    const quoted = quoteModelBillablePricing(
      billableProfile({
        cost: 0,
        pricingType: 'per-second',
        requiresReviewedRates: true,
        requiredSelectorKeys: ['audio'],
        rateVersion: 'synthetic-reviewed-v1',
        reviewedPricing: {
          version: 'synthetic-reviewed-v1',
          currency: 'USD',
          sourceUrl: 'https://synthetic.invalid/pricing',
          verifiedAt: '2026-09-30T00:00:00.000Z',
          reviewStatus: 'approved',
          rates: [
            {
              component: 'video',
              unit: 'second',
              unitPriceUsd: 0.1,
              when: { audio: true },
            },
          ],
        },
      }),
      {
        modelKey: 'test/model',
        provider: 'replicate',
        requests: 1,
        outputs: 1,
        duration: 5,
        selectors: { audio: true },
      },
      1,
      '2026-09-30T00:00:00.000Z',
    );
    if (quoted.status !== 'priced') throw new Error(quoted.reason);
    const { intentHash: _, ...input } = intent();
    const prepared = buildGenerationLineReservationIntent({
      ...input,
      modelQuote: quoted.snapshot,
    });
    expect(
      validateGenerationLineReservationIntent(prepared).modelQuote,
    ).toEqual(quoted.snapshot);
  });
  it.each([
    'credits',
    'allocatedCredits',
    'providerCostUsd',
    'allocationBasis',
  ] as const)(
    'rejects tampered quote %s even with a recomputed intent hash',
    (key) => {
      const data = intent();
      if (key === 'credits') data.modelQuote.credits = 4;
      if (key === 'allocatedCredits') data.modelQuote.allocatedCredits = [4];
      if (key === 'providerCostUsd') data.modelQuote.providerCostUsd = 10;
      if (key === 'allocationBasis')
        data.modelQuote.allocationBasis =
          data.modelQuote.allocationBasis === 'request' ? 'output' : 'request';
      const { intentHash: _, ...preimage } = data;
      data.intentHash = quoteSnapshotHash(preimage);
      expect(() => validateGenerationLineReservationIntent(data)).toThrow();
    },
  );
  it('rejects unknown quote fields, a changed native source id, multi-output, zero and BYOK variants', () => {
    const data = intent();
    const { intentHash: _, ...input } = data;
    for (const modelQuote of [
      { ...data.modelQuote, unknownField: true },
      { ...data.modelQuote, quantities: { requests: 1, outputs: 2 } },
      { ...data.modelQuote, credits: 0 },
    ])
      expect(() =>
        buildGenerationLineReservationIntent({ ...input, modelQuote }),
      ).toThrow();
    expect(() =>
      buildGenerationLineReservationIntent({
        ...input,
        owner: { ...data.owner, sourceActionId: 'changed' },
      }),
    ).toThrow();
    const byok = { ...input, route: 'byok' };
    expect(() => buildGenerationLineReservationIntent(byok)).toThrow();
  });
});
describe('opt-in group funding cannot bypass the unavailable owner fence', () => {
  it.each(['preparing', 'attached', null])(
    'blocks both generic bindings for marker %s, even duplicate output ids',
    async (attachment) => {
      const f = fixture();
      const row = f.seed();
      row.metadata.lineFunding =
        attachment === null
          ? null
          : { ...(row.metadata.lineFunding as object), attachment };
      row.metadata.boundOutputIds = ['output-a'];
      const group = new GenerationQuoteGroupService(
        {} as CreditsUtilsService,
        f.prisma as unknown as PrismaService,
        {} as LoggerService,
      );
      const request = {
        creditsConfig: { reservationId: 'hold-a', description: 'synthetic' },
        user: {
          id: 'user-a',
          userId: 'user-a',
          organizationId: 'org-a',
          brandId: 'brand-a',
        },
      };
      await expect(group.bindOutput(request, 'output-a')).rejects.toThrow();
      await expect(
        group.bindOutputInTransaction(f.tx, request, 'output-a'),
      ).rejects.toThrow();
      expect(f.prisma.ingredient.updateMany).not.toHaveBeenCalled();
      expect(f.prisma.creditReservation.updateMany).not.toHaveBeenCalled();
    },
  );
  it('retains an explicitly empty protocol group after closure/expiry without a manufactured no-submit proof', async () => {
    const f = fixture();
    f.seed().metadata.dispatchClosed = true;
    const credits = { releaseReservation: vi.fn(), settleReservation: vi.fn() };
    const group = new GenerationQuoteGroupService(
      credits as unknown as CreditsUtilsService,
      f.prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await group.settleGroup('hold-a', 'org-a');
    expect(credits.releaseReservation).not.toHaveBeenCalled();
    expect(credits.settleReservation).not.toHaveBeenCalled();
  });
});
