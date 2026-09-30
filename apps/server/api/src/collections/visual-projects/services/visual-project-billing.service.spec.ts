import { VisualProjectBillingService } from '@api/collections/visual-projects/services/visual-project-billing.service';
import type { IVisualCodeQuoteSnapshot } from '@genfeedai/contracts/interfaces';
import type { VisualRevision } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const quote: IVisualCodeQuoteSnapshot = {
  unit: 'credits',
  modelKey: 'openai/test',
  provider: 'openai',
  isByok: false,
  inputCostPerMillion: 1,
  outputCostPerMillion: 2,
  authoringCredits: 3,
  inspectionCredits: 1,
  renderCredits: 2,
  maximumCredits: 6,
  maximumAuthoringCalls: 3,
  maximumInspectionCalls: 3,
  maximumRepairs: 2,
  maximumRenderJobs: 4,
  renderDeadlineSeconds: 120,
  rendererVersion: '4.0.530',
  creditsPerSecond: 1 / 240,
  settings: { width: 640, height: 360, fps: 30, durationFrames: 30 },
  outputRequests: [{ format: 'mp4' }],
};
function fixture() {
  const revision = {
    id: 'revision',
    projectId: 'project',
    organizationId: 'org',
    brandId: 'brand',
    userId: 'user',
    maximumCredits: 6,
    consumedCredits: 2,
    reservationId: 'hold',
    receipts: [],
  } as unknown as VisualRevision;
  const credits = {
    reserveCredits: vi.fn(),
    settleReservation: vi.fn().mockResolvedValue({}),
    releaseReservation: vi.fn().mockResolvedValue({}),
  };
  const renderer = { recoverStopped: vi.fn() };
  const prisma = {
    creditReservation: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'hold',
        status: 'RESERVED',
        amount: 6,
        expiresAt: new Date(Date.now() + 3600000),
      }),
    },
    visualRevision: {
      findFirstOrThrow: vi.fn(async () => revision),
      updateMany: vi.fn(async ({ data }) => {
        Object.assign(revision, data);
        return { count: 1 };
      }),
    },
  };
  const service = new VisualProjectBillingService(
    prisma as never,
    credits as never,
    {} as never,
    {} as never,
    {} as never,
    renderer as never,
  );
  revision.receipts = [service.quoteReceipt(quote)] as never;
  return { service, credits, revision, prisma, renderer };
}
describe('visual revision cost bookkeeping', () => {
  it('rejects a route or price change even when the approved ceiling has spare credits', async () => {
    const { service, revision } = fixture();
    vi.spyOn(service, 'quote').mockResolvedValue({ ...quote, isByok: true });
    await expect(service.validateSnapshot(revision)).rejects.toThrow(
      'quote_changed',
    );
    vi.mocked(service.quote).mockResolvedValue({
      ...quote,
      inputCostPerMillion: 2,
    });
    await expect(service.validateSnapshot(revision)).rejects.toThrow(
      'quote_changed',
    );
  });
  it('settles consumed work once and records the durable marker only after success', async () => {
    const { service, revision, credits } = fixture();
    credits.settleReservation.mockRejectedValueOnce(
      new Error('wallet unavailable'),
    );
    await expect(service.settle(revision)).rejects.toThrow(
      'wallet unavailable',
    );
    expect(JSON.stringify(revision.receipts)).not.toContain('settlement');
    await service.settle(revision);
    await service.settle(revision);
    expect(credits.settleReservation).toHaveBeenCalledTimes(2);
    expect(credits.settleReservation).toHaveBeenLastCalledWith(
      expect.objectContaining({ actualAmount: 2, reservationId: 'hold' }),
    );
  });
  it('does not touch the wallet for zero-cost work and still settles durably', async () => {
    const { service, revision, credits } = fixture();
    revision.receipts = [
      service.quoteReceipt({ ...quote, maximumCredits: 0 }),
    ] as never;
    Object.assign(revision, {
      maximumCredits: 50,
      consumedCredits: 0,
      reservationId: null,
    });
    await expect(service.reserve(revision)).resolves.toBeNull();
    await service.settle(revision);
    await service.settle(revision);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(credits.settleReservation).not.toHaveBeenCalled();
    expect(credits.releaseReservation).not.toHaveBeenCalled();
    expect(JSON.stringify(revision.receipts)).toContain('settlement');
  });
  it('releases an unused hold without a debit', async () => {
    const { service, revision, credits } = fixture();
    revision.consumedCredits = 0;
    await service.settle(revision);
    expect(credits.releaseReservation).toHaveBeenCalledOnce();
    expect(credits.settleReservation).not.toHaveBeenCalled();
  });
});

describe('stopped visual work reconciliation', () => {
  it('recovers a hold whose reservation write did not persist before releasing it', async () => {
    const f = fixture();
    f.revision.reservationId = null;
    f.prisma.creditReservation.findFirst.mockResolvedValue({
      id: 'recovered-hold',
    });
    await f.service.reconcileStopped(f.revision);
    expect(f.prisma.creditReservation.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        actorUserId: 'user',
        workloadType: 'visual-code',
        workloadId: 'revision',
        idempotencyKey: 'visual-code-revision',
        isDeleted: false,
      },
    });
    expect(f.credits.releaseReservation).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 'recovered-hold' }),
    );
  });
  it('never marks settled when reservation existence is unknown', async () => {
    const f = fixture();
    f.revision.reservationId = null;
    f.prisma.creditReservation.findFirst.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(f.service.reconcileStopped(f.revision)).rejects.toThrow(
      'database unavailable',
    );
    expect(f.credits.releaseReservation).not.toHaveBeenCalled();
    expect(f.revision.receipts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'settlement' })]),
    );
  });
  it('records crashed provider liability without charging an unconfirmed call', async () => {
    const f = fixture();
    (f.revision.receipts as unknown[]).push({
      id: 'author-1',
      kind: 'author',
      state: 'started',
      credits: 0,
      operatorCredits: 0,
      boundCredits: 3,
      isResultApplied: false,
    });
    await f.service.reconcileStopped(f.revision);
    expect(f.revision.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'author-1',
          state: 'indeterminate',
          credits: 0,
          operatorCredits: 3,
        }),
      ]),
    );
    expect(f.credits.settleReservation).not.toHaveBeenCalled();
  });
  it('settles trusted recovered render compute without submitting a replacement render', async () => {
    const f = fixture();
    (f.revision.receipts as unknown[]).push({
      id: 'render-1',
      kind: 'render',
      state: 'started',
      credits: 0,
      operatorCredits: 0,
      boundCredits: 0.5,
      isResultApplied: false,
    });
    f.renderer.recoverStopped.mockResolvedValue({
      computeSeconds: 120,
      isComputeIndeterminate: false,
    });
    await f.service.reconcileStopped(f.revision);
    expect(f.renderer.recoverStopped).toHaveBeenCalledWith('render-1');
    expect(f.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 0.5 }),
    );
  });
});

it('uses the original idempotent wallet reservation as the uncertain admission barrier', async () => {
  const f = fixture();
  f.revision.reservationId = null;
  (f.revision.receipts as unknown[]).push({
    id: 'admission-1',
    kind: 'admission',
    state: 'started',
    credits: 0,
    operatorCredits: 0,
    boundCredits: 0,
    isResultApplied: false,
  });
  f.credits.reserveCredits.mockResolvedValue({ id: 'barrier-hold' });
  await f.service.reconcileStopped(f.revision);
  expect(f.credits.reserveCredits).toHaveBeenCalledWith(
    expect.objectContaining({
      idempotencyKey: 'visual-code-revision',
      amount: 6,
    }),
  );
  expect(f.prisma.creditReservation.findFirst).toHaveBeenCalledWith({
    where: expect.objectContaining({
      id: 'barrier-hold',
      organizationId: 'org',
      actorUserId: 'user',
    }),
  });
  expect(f.credits.releaseReservation).toHaveBeenCalledWith(
    expect.objectContaining({ reservationId: 'barrier-hold' }),
  );
  expect(f.revision.receipts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'admission-1',
        state: 'confirmed',
        credits: 0,
        operatorCredits: 0,
      }),
    ]),
  );
});

describe('visual paid hold lifetime', () => {
  it.each(['RELEASED', 'EXPIRED', 'SETTLED'])(
    'refuses new paid work with a %s hold',
    async (status) => {
      const f = fixture();
      vi.spyOn(f.service, 'quote').mockResolvedValue(quote);
      f.prisma.creditReservation.findFirst.mockResolvedValue({
        id: 'hold',
        status,
        amount: 6,
        expiresAt: new Date(Date.now() + 10000),
      });
      await expect(f.service.validateSnapshot(f.revision)).rejects.toThrow(
        'visual_reservation_unavailable',
      );
      expect(f.credits.reserveCredits).not.toHaveBeenCalled();
    },
  );
  it('rejects queue delay past expiry and a changed hold amount', async () => {
    const f = fixture();
    vi.spyOn(f.service, 'quote').mockResolvedValue(quote);
    f.prisma.creditReservation.findFirst.mockResolvedValue({
      id: 'hold',
      status: 'RESERVED',
      amount: 6,
      expiresAt: new Date(0),
    });
    await expect(f.service.validateSnapshot(f.revision)).rejects.toThrow(
      'visual_reservation_unavailable',
    );
    f.prisma.creditReservation.findFirst.mockResolvedValue({
      id: 'hold',
      status: 'RESERVED',
      amount: 5,
      expiresAt: new Date(Date.now() + 10000),
    });
    await expect(f.service.validateSnapshot(f.revision)).rejects.toThrow(
      'visual_reservation_unavailable',
    );
  });
  it.each(['RELEASED', 'EXPIRED'])(
    'assigns confirmed work to the operator when a pending call outlives a %s hold',
    async (status) => {
      const f = fixture();
      vi.spyOn(f.service, 'quote').mockResolvedValue(quote);
      await f.service.validateSnapshot(f.revision);
      (f.revision.receipts as unknown[]).push({
        id: 'inspection',
        kind: 'inspection',
        state: 'confirmed',
        credits: 2,
        operatorCredits: 1,
        boundCredits: 2,
        isResultApplied: true,
        providerCost: 0.1,
      });
      f.prisma.creditReservation.findFirst.mockResolvedValue({
        id: 'hold',
        status,
        amount: 6,
        expiresAt: new Date(0),
      });
      await f.service.settle(f.revision);
      await f.service.settle(f.revision);
      expect(f.revision.consumedCredits).toBe(0);
      expect(f.revision.receipts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'inspection',
            credits: 0,
            operatorCredits: 3,
            providerCost: 0.1,
          }),
        ]),
      );
      expect(f.credits.releaseReservation).toHaveBeenCalledOnce();
      expect(f.credits.settleReservation).not.toHaveBeenCalled();
      expect(f.credits.reserveCredits).not.toHaveBeenCalled();
    },
  );
  it('keeps missing paid-hold settlement recoverable without a false marker', async () => {
    const f = fixture();
    f.prisma.creditReservation.findFirst.mockResolvedValue(null);
    await expect(f.service.settle(f.revision)).rejects.toThrow(
      'visual_reservation_unavailable',
    );
    expect(f.credits.settleReservation).not.toHaveBeenCalled();
    expect(f.credits.releaseReservation).not.toHaveBeenCalled();
    expect(f.revision.receipts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'settlement' })]),
    );
  });
  it('preserves already settled user costs during marker recovery', async () => {
    const f = fixture();
    f.prisma.creditReservation.findFirst.mockResolvedValue({
      id: 'hold',
      status: 'SETTLED',
      amount: 6,
      expiresAt: new Date(0),
    });
    await f.service.settle(f.revision);
    expect(f.revision.consumedCredits).toBe(2);
    expect(f.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 2 }),
    );
    expect(f.credits.releaseReservation).not.toHaveBeenCalled();
  });
  it('skips all hold reads for a free quote before stage admission', async () => {
    const f = fixture();
    const free = { ...quote, maximumCredits: 0 };
    f.revision.receipts = [f.service.quoteReceipt(free)] as never;
    vi.spyOn(f.service, 'quote').mockResolvedValue(free);
    await f.service.validateSnapshot(f.revision);
    expect(f.prisma.creditReservation.findFirst).not.toHaveBeenCalled();
  });
});
