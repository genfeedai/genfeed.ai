import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailProductSignalsService } from './email-product-signals.service';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: vi.fn(() => false),
}));

const NOW = new Date('2026-09-09T12:00:00.000Z');
const CHECKPOINT = new Date('2026-09-01T12:00:00.000Z');

function asset(id = 'asset/1', status = 'GENERATED') {
  return {
    id,
    category: 'VIDEO',
    status,
    userId: 'creator-1',
    generationStartedAt: new Date('2026-09-09T11:55:00.000Z'),
    generationCompletedAt: new Date('2026-09-09T11:58:00.000Z'),
    brand: { slug: 'brand name' },
    organization: { slug: 'creator workspace' },
  };
}

function purchase(id = 'purchase-1') {
  return {
    id,
    actorUserId: 'purchaser-1',
    amount: 5000,
    referenceId: 'checkout-1',
    referenceType: 'stripe-checkout-session:organization-payment',
  };
}

function fixture() {
  const prisma = {
    emailSignalCheckpoint: {
      findFirst: vi.fn().mockResolvedValue({ scannedThrough: CHECKPOINT }),
      upsert: vi.fn().mockResolvedValue({ id: 'checkpoint-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ingredient: { findMany: vi.fn().mockResolvedValue([]) },
    organization: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ slug: 'studio', userId: 'owner-1' }),
    },
    creditTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const emails = { queueEmail: vi.fn().mockResolvedValue('delivery-1') };
  const config = { get: vi.fn().mockReturnValue('https://app.example.test') };
  const service = new EmailProductSignalsService(
    prisma as never,
    emails as never,
    config as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, emails };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EmailProductSignalsService generation recovery', () => {
  it('recovers the persisted window after a long outage and advances only after every page is durably queued', async () => {
    const f = fixture();
    f.prisma.ingredient.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => asset(`asset-${index}`)),
      )
      .mockImplementationOnce(async () => {
        expect(f.emails.queueEmail).toHaveBeenCalledTimes(100);
        expect(f.prisma.emailSignalCheckpoint.upsert).not.toHaveBeenCalled();
        expect(
          f.prisma.emailSignalCheckpoint.updateMany,
        ).not.toHaveBeenCalled();
        return [];
      });

    await expect(f.service.generations('org-1')).resolves.toEqual({
      count: 100,
    });
    expect(f.prisma.ingredient.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
          parentId: null,
          generationCompletedAt: { gte: CHECKPOINT, lte: NOW },
        }),
      }),
    );
    expect(f.prisma.ingredient.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: { id: 'asset-99' }, skip: 1 }),
    );
    expect(f.prisma.emailSignalCheckpoint.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        stream: 'generation',
        isDeleted: false,
        scannedThrough: { lt: NOW },
      },
      data: { scannedThrough: NOW },
    });
  });

  it('keeps the old checkpoint when a queue operation fails midway so the window can be replayed', async () => {
    const f = fixture();
    f.prisma.ingredient.findMany.mockResolvedValue([
      asset('asset-1'),
      asset('asset-2'),
    ]);
    f.emails.queueEmail
      .mockResolvedValueOnce('delivery-1')
      .mockRejectedValueOnce(new Error('durable write unavailable'));

    await expect(f.service.generations('org-1')).rejects.toThrow(
      'durable write unavailable',
    );
    expect(f.emails.queueEmail).toHaveBeenCalledTimes(2);
    expect(f.prisma.emailSignalCheckpoint.upsert).not.toHaveBeenCalled();
    expect(f.prisma.emailSignalCheckpoint.updateMany).not.toHaveBeenCalled();
  });

  it('links the exact long-running asset and preserves recipient, tenant and completion evidence for send-time checks', async () => {
    const f = fixture();
    const output = asset();
    f.prisma.ingredient.findMany.mockResolvedValue([
      output,
      {
        ...asset('short-1'),
        generationStartedAt: new Date('2026-09-09T11:57:30Z'),
      },
    ]);

    await expect(f.service.generations('org-1')).resolves.toEqual({ count: 1 });
    expect(f.emails.queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'creator-1',
        topic: 'generation.status',
        templateKey: 'generation-ready',
        destinationUrl:
          'https://app.example.test/creator%20workspace/brand%20name/library/assets?asset=asset%2F1',
        idempotencyKey: 'generation-asset/1-GENERATED-2026-09-09T11:58:00.000Z',
        policyData: {
          assetId: 'asset/1',
          completedAt: '2026-09-09T11:58:00.000Z',
          status: 'GENERATED',
        },
        html: expect.stringContaining('{{emailActionUrl}}'),
      }),
    );
  });

  it('emits the failure template for a long failed generation without pretending the asset is ready', async () => {
    const f = fixture();
    f.prisma.ingredient.findMany.mockResolvedValue([
      asset('failed-1', 'FAILED'),
    ]);
    await f.service.generations('org-1');
    expect(f.emails.queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'generation-failed',
        policyData: expect.objectContaining({ status: 'FAILED' }),
        subject: 'Your generation needs attention',
      }),
    );
  });

  it('limits the first scan to the previous day instead of emailing the entire historical library', async () => {
    const f = fixture();
    f.prisma.emailSignalCheckpoint.findFirst.mockResolvedValue(null);
    await f.service.generations('org-1');
    expect(f.prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          generationCompletedAt: {
            gte: new Date('2026-09-08T12:00:00.000Z'),
            lte: NOW,
          },
        }),
      }),
    );
  });
});

describe('EmailProductSignalsService confirmed purchase receipts', () => {
  it('notifies the confirmed purchase actor, falls back only when actor is absent, and ignores grants or missing payment evidence', async () => {
    const f = fixture();
    f.prisma.creditTransaction.findMany.mockResolvedValue([
      purchase(),
      { ...purchase('purchase-owner'), actorUserId: null },
      { ...purchase('grant-1'), referenceType: 'admin-grant' },
      { ...purchase('missing-evidence'), referenceId: null },
    ]);

    await expect(f.service.receipts('org-1')).resolves.toEqual({ count: 2 });
    expect(f.emails.queueEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'purchaser-1',
        topic: 'billing.receipt',
        templateKey: 'credit-purchase-confirmation',
        idempotencyKey: 'purchase-purchase-1',
        policyData: { transactionId: 'purchase-1' },
      }),
    );
    expect(f.emails.queueEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'owner-1',
        policyData: { transactionId: 'purchase-owner' },
      }),
    );
    expect(f.prisma.creditTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
          amount: { gt: 0 },
          createdAt: { gte: CHECKPOINT, lt: NOW },
        }),
      }),
    );
    expect(f.prisma.emailSignalCheckpoint.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          stream: 'receipt',
        }),
        data: { scannedThrough: NOW },
      }),
    );
    expect(
      f.prisma.emailSignalCheckpoint.updateMany.mock.invocationCallOrder[0],
    ).toBeGreaterThan(f.emails.queueEmail.mock.invocationCallOrder[1]);
  });

  it('leaves the receipt checkpoint unchanged if persisting a receipt fails', async () => {
    const f = fixture();
    f.prisma.creditTransaction.findMany.mockResolvedValue([purchase()]);
    f.emails.queueEmail.mockRejectedValue(new Error('outbox unavailable'));
    await expect(f.service.receipts('org-1')).rejects.toThrow(
      'outbox unavailable',
    );
    expect(f.prisma.emailSignalCheckpoint.upsert).not.toHaveBeenCalled();
    expect(f.prisma.emailSignalCheckpoint.updateMany).not.toHaveBeenCalled();
  });
});
