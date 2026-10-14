import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import { photoAnimationSnapshot } from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import { CreditReservationStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import { BrandRemixSceneBillingService } from './brand-remix-scene-billing.service';
import { initialScenePipeline } from './brand-remix-scene-state';
import type { BrandRemixSceneStoreService } from './brand-remix-scene-store.service';

describe('scene credit ownership', () => {
  it('separates new operation charges while keeping resume keys stable', () => {
    const service = new BrandRemixSceneBillingService(
      {} as CreditsUtilsService,
      {} as BrandRemixSceneStoreService,
    );
    const line = {
      key: 'run-captions-1',
      stage: 'captions' as const,
      model: 'whisper',
      credits: 1,
      billingMode: 'platform' as const,
      attempt: 1,
    };
    expect(service.key('run', 'operation-a', line)).toBe(
      service.key('run', 'operation-a', line),
    );
    expect(service.key('run', 'operation-a', line)).not.toBe(
      service.key('run', 'operation-b', line),
    );
  });
  it('adopts an image-owned reservation without reserving twice', async () => {
    const pipeline = {
      ...initialScenePipeline(),
      operation: {
        id: 'operation',
        quoteId: 'quote',
        revision: 1,
        cancellationGeneration: 0,
        startedAt: new Date().toISOString(),
        userId: 'user',
        sequence: 0,
      },
    };
    const config = { scenePipeline: pipeline };
    const credits = { reserveCredits: vi.fn() };
    const store = {
      fence: vi.fn().mockResolvedValue({ config }),
      save: vi.fn(),
    };
    const service = new BrandRemixSceneBillingService(
      credits as unknown as CreditsUtilsService,
      store as unknown as BrandRemixSceneStoreService,
    );
    await service.reserve(
      'org',
      'run',
      'operation',
      {
        key: 'scene-image-1',
        stage: 'image',
        model: 'image-model',
        credits: 2,
        billingMode: 'platform',
        attempt: 1,
      },
      'existing-reservation',
    );
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(store.save.mock.calls[0][3].scenePipeline.receipts[0].key).toBe(
      'generation:remix-run-operation-scene-image-1',
    );
  });
});

vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-store.service',
  () => ({ BrandRemixSceneStoreService: class {} }),
);
vi.mock('@api/collections/credits/services/credits.utils.service', () => ({
  CreditsUtilsService: class {},
}));

describe('pre-dispatch reservation compensation', () => {
  it('releases the deterministic hold if receipt CAS fails before dispatch', async () => {
    const config = {
      scenePipeline: {
        ...initialScenePipeline(),
        operation: { id: 'op', userId: 'user' },
      },
    };
    const credits = {
      reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation' }),
      releaseReservation: vi.fn(),
    };
    const store = {
      fence: vi.fn().mockResolvedValue({ config }),
      save: vi.fn().mockRejectedValue(new Error('CAS conflict')),
    };
    const service = new BrandRemixSceneBillingService(
      credits as unknown as CreditsUtilsService,
      store as unknown as BrandRemixSceneStoreService,
    );
    await expect(
      service.reserve('org', 'run', 'op', {
        key: 'run-analysis-1',
        stage: 'analysis',
        model: 'semantic',
        credits: 1,
        billingMode: 'platform',
        attempt: 1,
      }),
    ).rejects.toThrow('CAS conflict');
    expect(credits.releaseReservation).toHaveBeenCalledExactlyOnceWith({
      organizationId: 'org',
      reservationId: 'reservation',
    });
  });
  it('refuses to reuse a hold that was already released', async () => {
    const config = {
      scenePipeline: {
        ...initialScenePipeline(),
        operation: { id: 'op', userId: 'user' },
      },
    };
    const credits = {
      reserveCredits: vi.fn().mockResolvedValue({
        id: 'reservation',
        status: CreditReservationStatus.RELEASED,
      }),
      releaseReservation: vi.fn(),
    };
    const store = {
      fence: vi.fn().mockResolvedValue({ config }),
      save: vi.fn(),
    };
    const service = new BrandRemixSceneBillingService(
      credits as unknown as CreditsUtilsService,
      store as unknown as BrandRemixSceneStoreService,
    );
    await expect(
      service.reserve('org', 'run', 'op', {
        key: 'run-captions-1',
        stage: 'captions',
        model: 'whisper',
        credits: 1,
        billingMode: 'platform',
        attempt: 1,
      }),
    ).rejects.toThrow('new quote');
    expect(store.save).not.toHaveBeenCalled();
  });
  it('returns an image-owned hold when cancellation lands before its receipt', async () => {
    const credits = { reserveCredits: vi.fn(), releaseReservation: vi.fn() };
    const store = {
      fence: vi.fn().mockRejectedValue(new Error('cancelled')),
      save: vi.fn(),
    };
    const service = new BrandRemixSceneBillingService(
      credits as unknown as CreditsUtilsService,
      store as unknown as BrandRemixSceneStoreService,
    );
    await expect(
      service.reserve(
        'org',
        'run',
        'op',
        {
          key: 'scene-image-1',
          stage: 'image',
          model: 'image-model',
          credits: 2,
          billingMode: 'platform',
          attempt: 1,
        },
        'image-hold',
      ),
    ).rejects.toThrow('cancelled');
    expect(credits.releaseReservation).toHaveBeenCalledExactlyOnceWith({
      organizationId: 'org',
      reservationId: 'image-hold',
    });
  });
});

describe('stage settlement and failure compensation', () => {
  const imageLine = {
    key: 'scene-image-1',
    sceneId: 'scene',
    stage: 'image' as const,
    model: 'image-model',
    credits: 2,
    billingMode: 'platform' as const,
    attempt: 1,
  };
  function setup(receiptState: 'reserved' | 'settled') {
    let config = {
      scenePipeline: {
        ...initialScenePipeline(),
        operation: { id: 'op', userId: 'user' },
        receipts: [
          {
            key: 'generation:remix-run-op-scene-image-1',
            operationId: 'op',
            actorUserId: 'actor',
            amount: 2,
            billingMode: 'platform' as const,
            state: receiptState,
          },
        ],
      },
    };
    const credits = {
      settleReservation: vi.fn(),
      releaseReservation: vi.fn(),
    };
    const store = {
      read: vi.fn(async () => ({ config })),
      save: vi.fn(async (_org, _run, _old, next) => {
        config = next;
      }),
    };
    const service = new BrandRemixSceneBillingService(
      credits as unknown as CreditsUtilsService,
      store as unknown as BrandRemixSceneStoreService,
    );
    return {
      credits,
      service,
      receipt: () => config.scenePipeline.receipts[0],
    };
  }
  it('settles the image-owned hold under its generation key once', async () => {
    const { credits, service, receipt } = setup('reserved');
    await service.settle('org', 'run', 'op', imageLine, true);
    await service.settle('org', 'run', 'op', imageLine, true);
    expect(credits.settleReservation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        actorUserId: 'actor',
        actualAmount: 2,
        idempotencyKey: 'generation:remix-run-op-scene-image-1',
      }),
    );
    expect(receipt().state).toBe('settled');
  });
  it('records an expired hold as released instead of charging or failing', async () => {
    const { credits, service, receipt } = setup('reserved');
    credits.settleReservation.mockRejectedValueOnce(
      new UnsettleableReservationException('EXPIRED'),
    );
    await service.settle('org', 'run', 'op', imageLine, true);
    expect(receipt().state).toBe('released');
  });
  it('releases a failed stage hold but never a settled charge', async () => {
    const reserved = setup('reserved');
    await reserved.service.release('org', 'run', 'op', imageLine, true);
    expect(reserved.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org',
      idempotencyKey: 'generation:remix-run-op-scene-image-1',
    });
    expect(reserved.receipt().state).toBe('released');
    const settled = setup('settled');
    await settled.service.release('org', 'run', 'op', imageLine, true);
    expect(settled.credits.releaseReservation).not.toHaveBeenCalled();
    expect(settled.receipt().state).toBe('settled');
  });
});

describe('per-second clip settlement (#6933)', () => {
  // $0.0385/s at 3.33x: a 12 s clip holds 154 credits, 8 s costs 103, 20 s 257.
  const videoLine = {
    key: 'scene-video-1',
    sceneId: 'scene',
    stage: 'video' as const,
    model: 'heygen/avatar',
    credits: 154,
    billingMode: 'platform' as const,
    attempt: 1,
  };
  const receiptKey = 'remix-run-op-scene-video-1';
  const durationQuote = {
    estimatedSeconds: 12,
    snapshot: photoAnimationSnapshot(12),
  };
  function setup() {
    let config = {
      scenePipeline: {
        ...initialScenePipeline(),
        operation: { id: 'op', userId: 'user' },
        receipts: [
          {
            key: receiptKey,
            reservationId: 'hold-1',
            operationId: 'op',
            actorUserId: 'actor',
            amount: 154,
            billingMode: 'platform' as const,
            state: 'reserved' as 'reserved' | 'settled' | 'released',
          },
        ],
      },
    };
    let hold = {
      amount: 154,
      id: 'hold-1',
      metadata: { avatarDurationQuote: durationQuote } as unknown,
      settledAmount: null as number | null,
      status: CreditReservationStatus.RESERVED,
    };
    const credits = {
      deductCreditsFromOrganization: vi.fn(),
      findReservationForWorkload: vi.fn(async () => hold),
      reserveCredits: vi.fn(async () => ({
        id: 'hold-1',
        status: CreditReservationStatus.RESERVED,
      })),
      releaseReservation: vi.fn(),
      settleReservation: vi.fn(async ({ actualAmount }) => {
        hold = {
          ...hold,
          settledAmount: actualAmount,
          status: CreditReservationStatus.SETTLED,
        };
      }),
    };
    const store = {
      fence: vi.fn(async () => ({ brandId: 'brand', config })),
      read: vi.fn(async () => ({ brandId: 'brand', config })),
      save: vi.fn(async (_org, _run, _old, next) => {
        config = next;
      }),
    };
    const service = new BrandRemixSceneBillingService(
      credits as unknown as CreditsUtilsService,
      store as unknown as BrandRemixSceneStoreService,
    );
    return {
      credits,
      service,
      receipt: () => config.scenePipeline.receipts[0],
      setReceiptState: (state: 'reserved') => {
        config.scenePipeline.receipts[0].state = state;
      },
    };
  }

  it('keeps the frozen per-second quote on the clip hold', async () => {
    const { credits, service } = setup();
    await service.reserve(
      'org',
      'run',
      'op',
      videoLine,
      undefined,
      durationQuote,
    );
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 154,
        metadata: { avatarDurationQuote: durationQuote },
        workloadId: receiptKey,
        workloadType: 'brand-remix-scene',
      }),
    );
  });

  it('refunds the unused hold when the clip ran shorter', async () => {
    const { credits, service, receipt } = setup();
    await service.settle('org', 'run', 'op', videoLine, false, 8);
    expect(credits.settleReservation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ actualAmount: 103, reservationId: 'hold-1' }),
    );
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
    expect(receipt()).toMatchObject({ settledAmount: 103, state: 'settled' });
  });

  it('tops up a longer clip once, even when settlement is retried', async () => {
    const { credits, service, receipt, setReceiptState } = setup();
    await service.settle('org', 'run', 'op', videoLine, false, 20);
    // A crash before the receipt write retries the same settlement.
    setReceiptState('reserved');
    await service.settle('org', 'run', 'op', videoLine, false, 20);

    expect(credits.settleReservation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ actualAmount: 154 }),
    );
    const topUps = credits.deductCreditsFromOrganization.mock.calls;
    expect(topUps).toHaveLength(2);
    expect(new Set(topUps.map((call) => call[5]?.idempotencyKey))).toEqual(
      new Set(['reservation-duration-topup:hold-1']),
    );
    expect(topUps[0]?.[2]).toBe(103);
    expect(receipt()).toMatchObject({ settledAmount: 257, state: 'settled' });
  });

  it('settles a retry that lost its length at the amount it already charged', async () => {
    const { credits, service, receipt, setReceiptState } = setup();
    await service.settle('org', 'run', 'op', videoLine, false, 8);
    setReceiptState('reserved');
    await service.settle('org', 'run', 'op', videoLine, false, undefined);

    expect(credits.settleReservation).toHaveBeenCalledOnce();
    expect(receipt()).toMatchObject({ settledAmount: 103, state: 'settled' });
  });
});
