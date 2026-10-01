import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import type { CrunTaskStatusResponse } from '@api/services/integrations/crun/crun-response.schema';
import { CrunTaskFinalizationService } from '@api/services/integrations/crun/crun-task-finalization.service';
import { ActivitySource, IngredientStatus } from '@genfeedai/contracts';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { CrunGenerationTask } from '@genfeedai/prisma';

function fixture() {
  const priced = quoteModelBillablePricing(
    billableProfile({
      key: 'crun/google/nano-banana-pro',
      provider: 'crun',
      cost: 3,
    }),
    {
      modelKey: 'crun/google/nano-banana-pro',
      provider: 'crun',
      outputs: 1,
      requests: 1,
    },
    1,
    new Date().toISOString(),
  );
  if (priced.status !== 'priced') throw new Error('Fixture pricing invalid');
  const snapshot = {
    ...priced.snapshot,
    providerQuote: {
      provider: 'crun',
      estimated: false,
      providerCreditsPerTask: '8',
      quoteHash: 'a'.repeat(64),
      inputHash: 'b'.repeat(64),
      contractVersion: 'v1',
      creditsPerUsd: '1000',
      acquisitionRateVersion: 'rate-original',
      credentialSource: 'hosted',
      credentialId: null,
      credentialFingerprint: 'c'.repeat(64),
    },
  };
  const row = {
    id: 'task',
    ingredientId: 'image',
    organizationId: 'org',
    userId: 'user',
    modelKey: 'crun/google/nano-banana-pro',
    providerTaskId: 'opaque',
    state: 'provider-success',
    reservationId: 'hold',
    fundingBinding: { kind: 'reservation' },
    quoteSnapshot: snapshot,
    credentialSource: 'hosted',
    terminalReceipt: { status: 'success', credits: '8' },
    mediaPersistedAt: null,
    vendorCostRecordedAt: null,
    billingRecordedAt: null,
    copyAttemptCount: 0,
  } as unknown as CrunGenerationTask;
  const ingredient = {
    id: 'image',
    s3Key: null as string | null,
    status: IngredientStatus.PROCESSING as IngredientStatus,
    generationBilling: null as unknown,
  };
  const hold = { status: 'RESERVED' };
  const prisma = {
    crunGenerationTask: {
      findFirst: vi.fn(async () => row),
      findFirstOrThrow: vi.fn(async () => row),
      updateMany: vi.fn(async ({ data }) => {
        Object.assign(row, data);
        if (data.copyAttemptCount) row.copyAttemptCount = 1;
        return { count: 1 };
      }),
    },
    ingredient: {
      findFirst: vi.fn(async () => ingredient),
      updateMany: vi.fn(async ({ data }) => {
        Object.assign(ingredient, data);
        return { count: 1 };
      }),
    },
    creditReservation: { findFirst: vi.fn(async () => hold) },
    creditTransaction: {
      findFirst: vi.fn(async () => null as { id: string } | null),
    },
    model: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  const media = {
    processMediaForIngredient: vi.fn(async () => {
      ingredient.s3Key = 'owned/image.png';
      ingredient.status = IngredientStatus.GENERATED;
    }),
  };
  const billing = {
    settleOutput: vi.fn(async () => {
      hold.status = 'SETTLED';
    }),
    releaseOutput: vi.fn(async () => {
      hold.status = 'RELEASED';
    }),
    recordProviderFailure: vi.fn(async () => undefined),
  };
  const ledger = { record: vi.fn(async () => undefined) };
  const logger = { warn: vi.fn() };
  const service = new CrunTaskFinalizationService(
    prisma as never,
    media as never,
    billing as never,
    ledger as never,
    logger as never,
  );
  const info: CrunTaskStatusResponse = {
    taskId: 'opaque',
    provider: 'google',
    modelVersion: 'v1',
    status: 'success',
    credits: '8',
    createdAtSeconds: 1,
    mediaCount: 1,
    mediaUrls: ['https://fixture.test/private?signature=secret'],
    recoveryCode: null,
  };
  return {
    row,
    ingredient,
    hold,
    prisma,
    media,
    billing,
    ledger,
    logger,
    service,
    info,
    snapshot,
  };
}

describe('Crun authenticated finalization phases', () => {
  it('copies owned output, freezes actual cost, confirms funding, and does not repeat after restart', async () => {
    const f = fixture();
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.state).toBe('finalized');
    expect(f.row.mediaPersistedAt).toBeInstanceOf(Date);
    expect(f.row.billingRecordedAt).toBeInstanceOf(Date);
    expect(f.ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorCostMicros: 8000,
        costEvidence: 'observed',
        pricingSnapshot: expect.objectContaining({
          providerCredits: '8',
          creditsPerUsd: '1000',
          acquisitionRateVersion: 'rate-original',
        }),
      }),
    );
    expect(JSON.stringify(f.ledger.record.mock.calls)).not.toContain(
      'signature',
    );
    await f.service.finalize('org', 'task', f.info);
    expect(f.media.processMediaForIngredient).toHaveBeenCalledTimes(1);
    expect(f.billing.settleOutput).toHaveBeenCalledTimes(1);
    expect(f.ledger.record).toHaveBeenCalledTimes(1);
  });
  it('retains output and holds on successful credit discrepancy while disabling admission', async () => {
    const f = fixture();
    f.row.terminalReceipt = { status: 'success', credits: '9' };
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.mediaPersistedAt).toBeInstanceOf(Date);
    expect(f.row.vendorCostRecordedAt).toBeInstanceOf(Date);
    expect(f.row.recoveryCode).toBe('CRUN_FINAL_CREDITS_MISMATCH');
    expect(f.prisma.model.updateMany).toHaveBeenCalled();
    expect(f.billing.settleOutput).not.toHaveBeenCalled();
    expect(f.billing.releaseOutput).not.toHaveBeenCalled();
  });
  it('preserves owned output but does not bill when final credits are missing', async () => {
    const f = fixture();
    f.row.terminalReceipt = { status: 'success', credits: null };
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.mediaPersistedAt).toBeInstanceOf(Date);
    expect(f.row.recoveryCode).toBe('CRUN_FINAL_CREDITS_UNAVAILABLE');
    expect(f.ledger.record).not.toHaveBeenCalled();
    expect(f.billing.settleOutput).not.toHaveBeenCalled();
  });
  it('recovers invalid media without marking storage or settlement', async () => {
    const f = fixture();
    await f.service.finalize('org', 'task', {
      ...f.info,
      mediaCount: 2,
      mediaUrls: [],
    });
    expect(f.row.recoveryCode).toBe('CRUN_MEDIA_INVALID');
    expect(f.row.mediaPersistedAt).toBeNull();
    expect(f.billing.settleOutput).not.toHaveBeenCalled();
  });
  it('retains durable media on cost-ledger outage and retries the same receipt', async () => {
    const f = fixture();
    f.ledger.record.mockRejectedValueOnce(new Error('fixture ledger outage'));
    await expect(f.service.finalize('org', 'task', f.info)).rejects.toThrow(
      'fixture ledger outage',
    );
    expect(f.row.mediaPersistedAt).toBeInstanceOf(Date);
    expect(f.row.billingRecordedAt).toBeNull();
    await f.service.finalize('org', 'task', f.info);
    expect(f.media.processMediaForIngredient).toHaveBeenCalledTimes(1);
    expect(f.row.state).toBe('finalized');
  });
  it('queues settlement but waits for real ledger acknowledgement', async () => {
    const f = fixture();
    f.billing.settleOutput.mockImplementation(async () => undefined);
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.billingRecordedAt).toBeNull();
    expect(f.row.state).toBe('provider-success');
    f.hold.status = 'SETTLED';
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.state).toBe('finalized');
  });
  it('records authenticated failed expense before releasing the customer hold', async () => {
    const f = fixture();
    f.row.state = 'provider-failed';
    f.row.terminalReceipt = { status: 'failed', credits: '1.5' };
    await f.service.finalize('org', 'task');
    expect(f.ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({ vendorCostMicros: 1500 }),
    );
    expect(f.billing.releaseOutput).toHaveBeenCalled();
    expect(f.media.processMediaForIngredient).not.toHaveBeenCalled();
    expect(f.row.state).toBe('finalized');
  });
  it('documented refusal releases without inventing an accepted vendor charge', async () => {
    const f = fixture();
    f.row.state = 'provider-failed';
    f.row.providerTaskId = null;
    f.row.terminalReceipt = { isAccepted: false, credits: '0' };
    await f.service.finalize('org', 'task');
    expect(f.ledger.record).not.toHaveBeenCalled();
    expect(f.billing.releaseOutput).toHaveBeenCalled();
    expect(f.row.state).toBe('finalized');
  });
  it('does not infer provider failure from ambiguous acceptance', async () => {
    const f = fixture();
    f.row.state = 'recovery-required';
    await f.service.finalize('org', 'task', f.info);
    expect(f.billing.releaseOutput).not.toHaveBeenCalled();
    expect(f.ledger.record).not.toHaveBeenCalled();
  });
  it('retries media copy at bounded delays and never settles its failure', async () => {
    const f = fixture();
    f.media.processMediaForIngredient.mockRejectedValue(
      new Error('expired URL'),
    );
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.nextPollAt).toBeInstanceOf(Date);
    expect(f.row.copyAttemptCount).toBe(1);
    expect(f.billing.settleOutput).not.toHaveBeenCalled();
    f.row.copyAttemptCount = 3;
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.recoveryCode).toBe('CRUN_MEDIA_COPY_EXHAUSTED');
  });
  it('free hosted output still records actual provider expense with no credit job', async () => {
    const f = fixture();
    f.row.quoteSnapshot = {
      ...f.snapshot,
      credits: 0,
      allocatedCredits: [0],
      pricingProfile: { ...f.snapshot.pricingProfile, isFree: true, cost: 0 },
    };
    f.row.fundingBinding = { kind: 'free' };
    f.row.reservationId = null;
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.state).toBe('finalized');
    expect(f.ledger.record).toHaveBeenCalled();
    expect(f.billing.settleOutput).not.toHaveBeenCalled();
  });
  it('BYOK public bypass retains real usage and requires matching ledger plus recorded receipt', async () => {
    const f = fixture();
    const receipt = {
      amount: 3,
      description: 'usage',
      expiresAt: new Date().toISOString(),
      source: ActivitySource.IMAGE_GENERATION,
      userId: 'user',
      submissionIntentProvider: 'crun',
    };
    f.row.credentialSource = 'byok';
    f.row.reservationId = null;
    f.row.fundingBinding = { kind: 'byok', receipt };
    f.row.quoteSnapshot = {
      ...f.snapshot,
      providerQuote: {
        ...f.snapshot.providerQuote,
        credentialSource: 'byok',
        credentialId: null,
        creditsPerUsd: null,
        acquisitionRateVersion: null,
      },
    };
    f.ingredient.generationBilling = {
      ...receipt,
      kind: 'byok',
      state: 'pending',
    };
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.billingRecordedAt).toBeNull();
    expect(f.ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({ vendorCostMicros: 0, costEvidence: 'byok' }),
    );
    f.prisma.creditTransaction.findFirst.mockResolvedValue({
      id: 'usage-ledger',
    });
    f.ingredient.generationBilling = {
      ...receipt,
      kind: 'byok',
      state: 'recorded',
    };
    await f.service.finalize('org', 'task', f.info);
    expect(f.row.state).toBe('finalized');
    expect(f.prisma.creditTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorUserId: 'user',
          amount: 3,
          source: ActivitySource.IMAGE_GENERATION,
          metadata: { path: ['assetId'], equals: 'image' },
        }),
      }),
    );
  });
  it('alerts on failed overquote expense but releases without extra customer charge', async () => {
    const f = fixture();
    f.row.state = 'provider-failed';
    f.row.terminalReceipt = { status: 'failed', credits: '9' };
    await f.service.finalize('org', 'task');
    expect(f.logger.warn).toHaveBeenCalledWith(
      'Crun failed task expense exceeds frozen quote',
      expect.objectContaining({ taskId: 'task', modelKey: f.row.modelKey }),
    );
    expect(f.billing.releaseOutput).toHaveBeenCalled();
    expect(f.billing.settleOutput).not.toHaveBeenCalled();
    expect(f.row.state).toBe('finalized');
  });
});
